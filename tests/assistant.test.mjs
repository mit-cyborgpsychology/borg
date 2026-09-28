import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantTools, taskInput } from '../src/lib/server/assistant/tools.ts';
import { createAssistantStore } from '../src/lib/server/assistant/store.ts';
function fixture() {
	const records = new Map([
		['users/u1', { id: 'u1', data: { isApproved: true, name: 'Test user' } }],
		['projects/p1', { id: 'p1', data: { slug: 'test-project', title: 'Test project' } }],
		[
			'projects/p1/nodes/n1',
			{ id: 'n1', data: { templateType: 'note', nodeData: { title: 'Research note' } } }
		]
	]);
	const saved = new Map();
	const store = {
		async createCanvasRecord(projectId, collection, id, data) {
			const path = `projects/${projectId}/${collection}/${id}`;
			if (!records.has(path)) records.set(path, { id, data });
		},
		async get(path) {
			if (!records.has(path)) throw new Error('Access denied');
			return records.get(path);
		},
		async list(path) {
			return [...records].filter(([key]) => key.startsWith(path + '/')).map(([, v]) => v);
		},
		async query() {
			return [];
		},
		async createTask(id, value) {
			if (!saved.has(id)) saved.set(id, value);
		}
	};
	return { store, records, saved, tools: createAssistantTools(store, 'p1', 'u1', 'turn1', ['n1']) };
}
const input = { nodeId: 'n1', title: 'Read the paper', assignee: 'me', notes: '', dueDate: '' };
test('assistant creates canonical task and repeated same-turn calls are idempotent', async () => {
	const f = fixture();
	const a = await f.tools.createTask.execute(input);
	const b = await f.tools.createTask.execute(input);
	assert.equal(a.id, b.id);
	assert.equal(f.saved.size, 1);
	const task = f.saved.get(a.id);
	assert.equal(task.projectSlug, 'test-project');
	assert.equal(task.assignee, 'u1');
	assert.equal(task.createdBy, 'u1');
	assert.equal(task.status, 'active');
	assert.equal(task.nodeType, 'note');
});
test('assistant rejects unapproved users and nodes outside its project', async () => {
	const f = fixture();
	await assert.rejects(() => f.tools.createTask.execute({ ...input, nodeId: 'other-node' }));
	f.records.get('users/u1').data.isApproved = false;
	await assert.rejects(() => f.tools.getProjectContext.execute({}));
	await assert.rejects(() => f.tools.createTask.execute(input));
	assert.equal(f.saved.size, 0);
});
test('assistant validates inputs, assignees and limits writes', async () => {
	assert.equal(taskInput.safeParse({ ...input, nodeId: '../../other' }).success, false);
	const f = fixture();
	await assert.rejects(() => f.tools.createTask.execute({ ...input, assignee: 'missing' }));
	await assert.rejects(() => f.tools.createTask.execute({ ...input, dueDate: '2026-02-31' }));
	for (let i = 0; i < 5; i++) await f.tools.createTask.execute({ ...input, title: 'Task ' + i });
	await assert.rejects(() => f.tools.createTask.execute(input), /five tasks/);
});
test('context includes selection but not user email or auth fields', async () => {
	const f = fixture();
	f.records.get('users/u1').data.email = 'private@example.test';
	const c = await f.tools.getProjectContext.execute({});
	assert.equal(c.nodes[0].selected, true);
	assert.deepEqual(c.people, [{ id: 'u1', name: 'Test user' }]);
});
test('REST writes use the caller token and create-only preconditions', async () => {
	const requests = [];
	const store = createAssistantStore('demo-borg', 'Bearer caller', true, async (url, init) => {
		requests.push({ url, init });
		return new Response('{}', { status: 200 });
	});
	await store.createTask('task1', { id: 'task1', title: 'Task' });
	assert.equal(requests[0].init.headers.Authorization, 'Bearer caller');
	const body = JSON.parse(requests[0].init.body);
	assert.deepEqual(body.writes[0].currentDocument, { exists: false });
	assert.match(body.writes[0].update.name, /documents\/tasks\/task1$/);
});

test('REST conflict only succeeds when the intended task actually exists', async () => {
	const make = (title) =>
		createAssistantStore('demo-borg', 'Bearer caller', true, async (url) =>
			url.endsWith(':commit')
				? new Response('{}', { status: 409 })
				: new Response(
						JSON.stringify({
							name: 'projects/demo-borg/databases/(default)/documents/tasks/t1',
							fields: { id: { stringValue: 't1' }, title: { stringValue: title } }
						})
					)
		);
	await make('Task').createTask('t1', { id: 't1', title: 'Task' });
	await assert.rejects(
		() => make('Different task').createTask('t1', { id: 't1', title: 'Task' }),
		/could not be saved/
	);
});

test('assistant creates spaced canonical nodes, retries safely, and connects them', async () => {
	const f = fixture();
	const input = { type: 'note', title: 'Idea A', content: 'First idea', url: '' };
	const a = await f.tools.createNode.execute(input);
	const retry = await f.tools.createNode.execute(input);
	assert.equal(a.nodeId, retry.nodeId);
	const b = await f.tools.createNode.execute({ ...input, title: 'Idea B' });
	const na = f.records.get(`projects/p1/nodes/${a.nodeId}`),
		nb = f.records.get(`projects/p1/nodes/${b.nodeId}`);
	assert.equal(na.data.type, 'universal');
	assert.equal(na.data.nodeData.content, 'First idea');
	assert.ok(nb.data.position.x > na.data.position.x + 256);
	const edge = await f.tools.connectNodes.execute({ source: a.nodeId, target: b.nodeId });
	const edge2 = await f.tools.connectNodes.execute({ source: a.nodeId, target: b.nodeId });
	assert.equal(edge.id, edge2.id);
	await f.tools.createTask.execute({
		nodeId: a.nodeId,
		title: 'Follow up',
		assignee: 'me',
		notes: '',
		dueDate: ''
	});
	assert.equal(f.saved.size, 1);
});
test('assistant rejects unsafe links, self edges, inaccessible nodes, and excess node writes', async () => {
	const f = fixture();
	await assert.rejects(() =>
		f.tools.createNode.execute({
			type: 'link',
			title: 'Unsafe',
			content: '',
			url: 'javascript:alert(1)'
		})
	);
	await assert.rejects(() => f.tools.connectNodes.execute({ source: 'n1', target: 'n1' }));
	await assert.rejects(() => f.tools.connectNodes.execute({ source: 'n1', target: 'foreign' }));
	for (let i = 0; i < 5; i++)
		await f.tools.createNode.execute({ type: 'blank', title: 'Idea ' + i, content: '', url: '' });
	await assert.rejects(
		() => f.tools.createNode.execute({ type: 'blank', title: 'Extra', content: '', url: '' }),
		/five nodes/
	);
	f.records.get('users/u1').data.isApproved = false;
	await assert.rejects(() =>
		f.tools.createNode.execute({ type: 'note', title: 'No', content: '', url: '' })
	);
});
test('canvas adapter serializes nested geometry and uses create-only caller-authorized writes', async () => {
	let write;
	const store = createAssistantStore('demo-borg', 'Bearer caller', true, async (url, init) => {
		write = { url, init };
		return new Response('{}');
	});
	await store.createCanvasRecord('p1', 'nodes', 'n1', {
		position: { x: 10, y: 20 },
		nodeData: { title: 'Note' },
		createdBy: 'u1',
		assistantOperation: 'n1'
	});
	const body = JSON.parse(write.init.body);
	const doc = body.writes[0];
	assert.equal(write.init.headers.Authorization, 'Bearer caller');
	assert.equal(doc.update.fields.position.mapValue.fields.x.doubleValue, 10);
	assert.ok(doc.update.fields.createdAt.timestampValue);
	assert.deepEqual(doc.currentDocument, { exists: false });
});

test('assistant places batches near selection in compact rows, including negative canvas coordinates', async () => {
	const f = fixture();
	f.records.get('projects/p1/nodes/n1').data = {
		position: { x: -1500, y: -900 },
		nodeData: { width: 600, height: 500 }
	};
	const positions = [];
	for (let i = 0; i < 5; i++) {
		const result = await f.tools.createNode.execute({
			type: 'note',
			title: 'Batch ' + i,
			content: '',
			url: ''
		});
		positions.push(f.records.get(`projects/p1/nodes/${result.nodeId}`).data.position);
	}
	assert.ok(positions[0].x > -900 && positions[0].x < 0);
	assert.equal(positions[0].y, -900);
	assert.equal(positions[2].y, positions[0].y);
	assert.equal(positions[3].x, positions[0].x);
	assert.ok(positions[3].y > positions[0].y + 180);
	assert.equal(new Set(positions.map(JSON.stringify)).size, 5);
});

test('assistant placement avoids large resized obstacles and handles an empty canvas', async () => {
	const { freePosition, placementOrigin } = await import(
		'../src/lib/server/assistant/placement.ts'
	);
	assert.deepEqual(freePosition([], placementOrigin([], [])), { x: 0, y: 0 });
	const obstacle = {
		id: 'large',
		data: { position: { x: 0, y: 0 }, nodeData: { width: 3000, height: 5000 } }
	};
	const position = freePosition([obstacle], { x: 0, y: 0 });
	assert.ok(position.y >= 5064);
	const below = placementOrigin([obstacle], []);
	assert.ok(below.y > 5000);
});
