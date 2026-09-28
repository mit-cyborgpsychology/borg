// Live model integration check. Use a local demo-borg server and Firebase emulators.
import assert from 'node:assert/strict';
const base = process.env.BORG_TEST_URL || 'http://127.0.0.1:5182';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
	throw new Error('Use an isolated local server configured for demo-borg.');
const db = 'http://127.0.0.1:8080/v1/projects/demo-borg/databases/(default)/documents';
const id = 'assistant-test-' + Date.now();
let uid;
let tasks = [];
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const fields = (o) =>
	Object.fromEntries(
		Object.entries(o).map(([k, v]) => [
			k,
			typeof v === 'boolean'
				? { booleanValue: v }
				: typeof v === 'object'
					? { mapValue: { fields: fields(v) } }
					: { stringValue: v }
		])
	);
async function put(path, data) {
	const r = await fetch(db + '/' + path, {
		method: 'PATCH',
		headers: owner,
		body: JSON.stringify({ fields: fields(data) })
	});
	assert.equal(r.status, 200);
}
try {
	const signup = await fetch(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: id + '@example.test',
				password: 'TestOnly123!',
				returnSecureToken: true
			})
		}
	);
	const auth = await signup.json();
	assert.equal(signup.status, 200);
	uid = auth.localId;
	await put('users/' + uid, { isApproved: true, userType: 'member', name: 'Assistant Test' });
	await put('projects/' + id, { slug: id, title: 'Temporary assistant test' });
	await put(`projects/${id}/nodes/n1`, {
		templateType: 'note',
		nodeData: { title: 'Paper review', content: 'Review the memory paper' }
	});
	const body = {
		projectId: id,
		selectedNodeIds: ['n1'],
		messages: [
			{
				id: 'test-turn-1',
				role: 'user',
				parts: [
					{
						type: 'text',
						text: 'Create exactly two new note nodes named Plan and Results with short text, connect Plan to Results, and create one task named "Read the memory paper" on Plan assigned to me. No due date.'
					}
				]
			}
		]
	};
	const unauth = await fetch(base + '/api/assistant', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	assert.equal(unauth.status, 401);
	const r = await fetch(base + '/api/assistant', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.idToken },
		body: JSON.stringify(body)
	});
	const stream = await r.text();
	assert.equal(r.status, 200, stream.slice(0, 300));
	assert.ok(stream.includes('tool-output-available'), stream.slice(-1500));
	assert.ok(!stream.includes('"type":"error"'), stream.slice(-1500));
	const query = await fetch(db + ':runQuery', {
		method: 'POST',
		headers: owner,
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'tasks' }],
				where: {
					fieldFilter: {
						field: { fieldPath: 'projectId' },
						op: 'EQUAL',
						value: { stringValue: id }
					}
				}
			}
		})
	});
	const results = await query.json();
	tasks = results.filter((x) => x.document).map((x) => x.document);
	assert.equal(tasks.length, 1);
	assert.equal(tasks[0].fields.assignee.stringValue, uid);
	assert.equal(tasks[0].fields.title.stringValue, 'Read the memory paper');
	const nodes = (await (await fetch(`${db}/projects/${id}/nodes`, { headers: owner })).json())
		.documents;
	const edges = (await (await fetch(`${db}/projects/${id}/edges`, { headers: owner })).json())
		.documents;
	assert.equal(nodes.length, 3);
	assert.equal(edges.length, 1);
	const plan = nodes.find((n) => n.fields.nodeData.mapValue.fields.title?.stringValue === 'Plan');
	const result = nodes.find(
		(n) => n.fields.nodeData.mapValue.fields.title?.stringValue === 'Results'
	);
	assert.ok(plan && result);
	assert.equal(edges[0].fields.source.stringValue, plan.name.split('/').at(-1));
	assert.equal(edges[0].fields.target.stringValue, result.name.split('/').at(-1));
	assert.equal(tasks[0].fields.nodeId.stringValue, plan.name.split('/').at(-1));
	assert.notEqual(
		plan.fields.position.mapValue.fields.x.doubleValue,
		result.fields.position.mapValue.fields.x.doubleValue
	);

	console.log(
		'PASS: live GPT-6 Luna streamed tool results and created two nodes, connected them, and assigned a task to the new node; unauthenticated request rejected.'
	);
} finally {
	// Query cleanup independently even if the stream failed after a successful write.
	const q = await fetch(db + ':runQuery', {
		method: 'POST',
		headers: owner,
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId: 'tasks' }],
				where: {
					fieldFilter: {
						field: { fieldPath: 'projectId' },
						op: 'EQUAL',
						value: { stringValue: id }
					}
				}
			}
		})
	});
	const found = await q.json();
	for (const t of found.filter((x) => x.document))
		await fetch('http://127.0.0.1:8080/v1/' + t.document.name, {
			method: 'DELETE',
			headers: owner
		});
	for (const collection of ['edges', 'nodes']) {
		const response = await fetch(`${db}/projects/${id}/${collection}`, { headers: owner });
		const records = await response.json();
		for (const doc of records.documents || [])
			await fetch('http://127.0.0.1:8080/v1/' + doc.name, { method: 'DELETE', headers: owner });
	}

	for (const path of [
		`projects/${id}/nodes/n1`,
		'projects/' + id,
		...(uid ? ['users/' + uid] : [])
	])
		await fetch(db + '/' + path, { method: 'DELETE', headers: owner });
}
