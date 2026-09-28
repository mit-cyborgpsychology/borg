import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listResearch } from '../src/lib/server/research.ts';
import { fetchResearchMap } from '../src/lib/server/researchMap.ts';
import { createResearchMapHandler } from '../deploy/research-map/handler.mjs';
import { createResearchState } from '../src/lib/features/research/createResearchState.ts';
import { get } from 'svelte/store';

const map = {
	method: 'umap',
	topics: [],
	generatedAt: '2026-09-27T00:00:00Z',
	points: [{ url: 'https://example.com/paper', x: 0.2, y: 0.5 }]
};
test('map proxy validates coordinates and only returns public fields', async () => {
	const result = await fetchResearchMap('https://map.test', 'secret', async (url, options) => {
		assert.equal(options.headers.Authorization, 'Bearer secret');
		assert.equal(options.redirect, 'error');
		return Response.json({
			...map,
			fingerprint: 'private',
			points: [
				...map.points,
				...map.points,
				{ url: 'javascript:bad', x: 0, y: 0 },
				{ url: 'https://example.com/bad', x: 2, y: 0 }
			]
		});
	});
	assert.deepEqual(result, map);
	await assert.rejects(
		fetchResearchMap(
			'https://map.test',
			'secret',
			async () => new Response('private', { status: 500 })
		),
		/source unavailable/
	);
	await assert.rejects(
		fetchResearchMap('https://map.test', 'secret', async () => Response.json({ points: [] })),
		/Invalid research map/
	);
});
function response() {
	return {
		status: null,
		headers: {},
		body: null,
		setHeader(k, v) {
			this.headers[k] = v;
		},
		writeHead(status, headers = {}) {
			this.status = status;
			Object.assign(this.headers, headers);
			return this;
		},
		end(body) {
			this.body = body;
			return this;
		}
	};
}
test('saved map handler authenticates before reading and never exposes internal fingerprint', async () => {
	let reads = 0;
	const handler = createResearchMapHandler(
		async () => {
			reads++;
			return JSON.stringify({ ...map, fingerprint: 'private' });
		},
		() => 'secret'
	);
	for (const authorization of [undefined, 'Bearer wrong']) {
		const res = response();
		await handler({ headers: { authorization } }, res);
		assert.equal(res.status, 401);
	}
	assert.equal(reads, 0);
	const res = response();
	await handler({ headers: { authorization: 'Bearer secret' } }, res);
	assert.equal(res.status, 200);
	assert.deepEqual(JSON.parse(res.body), map);
	assert.equal(res.headers['Cache-Control'], 'private, no-store');
	const missing = response();
	await createResearchMapHandler(
		async () => {
			throw new Error('secret path');
		},
		() => 'secret'
	)({ headers: { authorization: 'Bearer secret' } }, missing);
	assert.equal(missing.status, 503);
	assert.equal(missing.body, 'Map is unavailable');
});
test('map errors do not prevent paper browsing and retries are independent', async () => {
	let fail = true;
	let paperLoads = 0;
	const state = createResearchState({
		listPapers: async () => {
			paperLoads++;
			return [{ id: 1 }];
		},
		getMap: async () => {
			if (fail) throw new Error('offline');
			return map;
		}
	});
	await state.load();
	assert.equal(get(state.papers).data.length, 1);
	assert.equal(get(state.map).status, 'error');
	fail = false;
	await state.reloadMap();
	assert.deepEqual(get(state.map).data, map);
	assert.equal(paperLoads, 1);
	state.dispose();
});

// Both sources normalize URLs before the map joins them to paper records.
test('Grist and map URLs use the same normalization for exact matching', async () => {
	const url = 'HTTPS://Example.COM';
	const papers = await listResearch(
		{ apiUrl: 'https://grist.test/api', apiKey: 'secret', docId: 'doc', tableId: 'Table1' },
		async () => Response.json({ records: [{ id: 1, fields: { URL: url } }] })
	);
	const projected = await fetchResearchMap('https://map.test', 'secret', async () =>
		Response.json({ ...map, points: [{ url, x: 0, y: 0 }] })
	);
	assert.equal(projected.points[0].url, papers[0].url);
	assert.equal(projected.points[0].url, 'https://example.com/');
});

test('topic proxy validates labels, colors and membership and hides internal fields', async () => {
	const topic = {
		id: 'topic-1',
		label: 'AI companions',
		color: '#5877ba',
		count: 999,
		x: 0.3,
		y: 0.4,
		labelSource: 'llm',
		members: ['private'],
		labelKey: 'private'
	};
	const result = await fetchResearchMap('https://map.test', 'secret', async () =>
		Response.json({
			...map,
			topics: [
				topic,
				topic,
				{ ...topic, id: 'topic-2', color: 'url(secret)' },
				{ ...topic, id: 'topic-3', label: '' }
			],
			points: [
				{ ...map.points[0], topicId: 'topic-1' },
				{ url: 'https://example.com/unknown', x: 0, y: 0, topicId: 'bad' }
			]
		})
	);
	assert.equal(result.topics.length, 1);
	assert.equal(result.topics[0].count, 1);
	assert.equal(result.points[0].topicId, 'topic-1');
	assert.equal(result.points[1].topicId, undefined);
	assert.ok(!JSON.stringify(result).includes('private'));
	const res = response();
	await createResearchMapHandler(
		async () => JSON.stringify({ ...map, topics: [topic] }),
		() => 'secret'
	)({ headers: { authorization: 'Bearer secret' } }, res);
	assert.ok(!res.body.includes('private'));
});
