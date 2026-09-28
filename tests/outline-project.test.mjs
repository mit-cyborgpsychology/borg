import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectOutlineDocument, outlineDocumentId } from '../src/lib/server/outlineProject.ts';
import { OutlineApiError } from '../src/lib/server/outlineApi.ts';
import { OutlineProjectError } from '../src/lib/server/outlineProjectStore.ts';

function fixture() {
	const data = new Map([
		['projects/p', { title: 'Project' }],
		['projects/p/nodes/n', { templateType: 'outline', nodeData: { title: 'Note' } }],
		['projects/p/nodes/m', { templateType: 'outline', nodeData: { title: 'Second' } }]
	]);
	let version = 0;
	const calls = [];
	const docs = new Map();
	let collection = null;
	const store = {
		async get(path) {
			if (!data.has(path)) throw new OutlineProjectError(404, 'Missing');
			return { data: structuredClone(data.get(path)), version: String(version) };
		},
		async patch(path, values, expected) {
			if (expected !== undefined && expected !== String(version))
				throw new OutlineProjectError(412, 'Conflict');
			const item = data.get(path);
			for (const [key, value] of Object.entries(values)) {
				const parts = key.split('.');
				if (parts.length === 2) item[parts[0]][parts[1]] = value;
				else item[key] = value;
			}
			version++;
		}
	};
	const api = {
		async findProjectCollection() {
			return collection;
		},
		async createCollection(_c, name, description) {
			calls.push('collection');
			collection = { id: 'c', name, description };
			return collection;
		},
		async getCollection() {
			return collection;
		},
		async getDocument(_c, id) {
			if (!docs.has(id)) throw new OutlineApiError(404);
			return docs.get(id);
		},
		async createDocument(_c, params) {
			calls.push('doc');
			const doc = { ...params, url: 'https://outline.test/doc/' + params.id };
			docs.set(params.id, doc);
			return doc;
		},
		async listDocuments() {
			return [...docs.values()];
		}
	};
	const run = (action = 'create', nodeId = 'n', documentId) =>
		projectOutlineDocument(
			store,
			{ apiUrl: 'https://outline.test', apiToken: 'secret' },
			{ projectId: 'p', nodeId, action, documentId },
			api
		);
	return { run, calls, data, api, store, docs };
}
test('collection is lazy, reused, and documents retain stable IDs on retry', async () => {
	const f = fixture();
	assert.deepEqual(await f.run('list'), { docs: [] });
	assert.deepEqual(f.calls, []);
	const first = await f.run();
	await f.run();
	await f.run('create', 'm');
	assert.deepEqual(f.calls, ['collection', 'doc', 'doc']);
	assert.equal(first.id, await outlineDocumentId('p', 'n'));
	assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	assert.equal(f.data.get('projects/p/nodes/n').nodeData.outlineDocId, first.id);
});
test('lost create response recovers document by ID; independent title edits refresh in Borg', async () => {
	const f = fixture();
	const create = f.api.createDocument;
	f.api.createDocument = async (...args) => {
		await create(...args);
		throw new Error('lost response');
	};
	const doc = await f.run();
	f.docs.get(doc.id).title = 'Edited in Outline';
	assert.equal((await f.run('read')).title, 'Edited in Outline');
	assert.equal(f.data.get('projects/p/nodes/n').nodeData.title, 'Edited in Outline');
	assert.deepEqual(f.calls, ['collection', 'doc']);
});
test('failed Borg link save reuses existing Outline document on retry', async () => {
	const f = fixture();
	const patch = f.store.patch;
	let fail = true;
	f.store.patch = async (path, values, ...rest) => {
		if (fail && values['nodeData.outlineDocId']) {
			fail = false;
			throw new Error('save failed');
		}
		return patch(path, values, ...rest);
	};
	await assert.rejects(f.run(), /save failed/);
	await f.run();
	assert.deepEqual(f.calls, ['collection', 'doc']);
});
test('uncertain collection create never blindly creates a duplicate', async () => {
	const f = fixture();
	f.api.createCollection = async () => {
		throw new Error('timeout');
	};
	await assert.rejects(f.run(), /timeout/);
	await assert.rejects(f.run(), /earlier collection/);
});
test('missing collection bindings are repaired, but unauthorized projects cannot create', async () => {
	const f = fixture();
	f.data.get('projects/p').outlineCollectionId = 'deleted';
	await f.run();
	assert.deepEqual(f.calls, ['collection', 'doc']);
	f.calls.length = 0;
	f.store.get = async () => {
		throw new OutlineProjectError(403, 'Denied');
	};
	await assert.rejects(f.run(), (e) => e.status === 403);
	assert.deepEqual(f.calls, []);
});
test('linking is scoped to the project collection and never creates a document', async () => {
	const f = fixture();
	await f.run();
	const existing = [...f.docs.values()][0];
	await f.run('link', 'm', existing.id);
	assert.deepEqual(f.calls, ['collection', 'doc']);
	f.docs.set('other', {
		id: 'other',
		url: 'https://outline.test/doc/other',
		title: 'Private',
		collectionId: 'elsewhere'
	});
	await assert.rejects(f.run('link', 'm', 'other'), (e) => e.status === 400);
});
test('concurrent first-document requests are serialized by Firestore preconditions', async () => {
	const f = fixture();
	const results = await Promise.allSettled([f.run(), f.run('create', 'm')]);
	assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
	assert.equal(f.calls.filter((c) => c === 'collection').length, 1);
});

test('unchanged document reads do not write; edits update the cached title', async () => {
	const f = fixture();
	await f.run();
	let writes = 0;
	const patch = f.store.patch;
	f.store.patch = async (...args) => {
		writes++;
		return patch(...args);
	};
	await f.run('read');
	assert.equal(writes, 0);
	const doc = [...f.docs.values()][0];
	doc.title = 'New title';
	await f.run('read');
	assert.equal(writes, 1);
});
test('an expired uncertain collection request can recover instead of staying locked', async () => {
	const f = fixture();
	f.data.get('projects/p').outlineCollectionPending = true;
	f.data.get('projects/p').outlineCollectionPendingSince = Date.now() - 180_000;
	await f.run();
	assert.deepEqual(f.calls, ['collection', 'doc']);
});
test('a late read cannot overwrite a newly linked document', async () => {
	const f = fixture();
	const first = await f.run();
	const get = f.api.getDocument;
	f.api.getDocument = async (...args) => {
		const doc = await get(...args);
		f.data.get('projects/p/nodes/n').nodeData.outlineDocId = 'different';
		return doc;
	};
	await assert.rejects(f.run('read'), (e) => e.status === 409);
	assert.notEqual(f.data.get('projects/p/nodes/n').nodeData.outlineDocId, first.id);
});
