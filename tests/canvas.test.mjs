import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectCanvas } from '../src/lib/features/canvas/connectCanvas.ts';
import { CanvasPersistence } from '../src/lib/features/canvas/CanvasPersistence.ts';
import { buildNodeUpdate } from '../src/lib/services/firebase/nodeUpdates.ts';
import { getCanvasChanges, snapshotCanvas } from '../src/lib/features/canvas/canvasChanges.ts';

const node = (x = 0) => ({ id: 'node-1', position: { x, y: 0 }, data: {} });
const edge = (style = 'stroke: black') => ({ id: 'edge-1', source: 'a', target: 'b', style });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('both editor payload shapes keep the stored status consistent, including clearing Done', () => {
	assert.deepEqual(buildNodeUpdate({ nodeData: { status: 'Done' } }), {
		nodeData: { status: 'Done' },
		status: 'Done'
	});
	assert.deepEqual(buildNodeUpdate({ data: { nodeData: { title: 'No status' } } }), {
		nodeData: { title: 'No status' },
		status: null
	});
	assert.deepEqual(buildNodeUpdate({ position: { x: 1, y: 2 } }), { position: { x: 1, y: 2 } });
});

test('node updates remove undefined fields without corrupting dates or nested arrays', () => {
	const date = new Date('2026-01-01');
	assert.deepEqual(
		buildNodeUpdate({
			nodeData: { date, unused: undefined, items: [{ unused: undefined, title: 'A' }] }
		}),
		{
			nodeData: { date, items: [{ title: 'A' }] },
			status: null
		}
	);
});
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

test('unmount before initialization prevents subscriptions', async () => {
	const ready = deferred();
	const dispose = connectCanvas(() => ready.promise, {
		nodes: assert.fail,
		edges: assert.fail,
		error: assert.fail
	});
	dispose();
	ready.resolve({ subscribeToNodes: assert.fail, subscribeToEdges: assert.fail });
	await tick();
});

test('both subscriptions stop once and late callbacks are ignored', async () => {
	let stopped = 0;
	let emitNodes;
	const dispose = connectCanvas(
		async () => ({
			subscribeToNodes(callback) {
				emitNodes = callback;
				return () => stopped++;
			},
			subscribeToEdges() {
				return () => stopped++;
			}
		}),
		{ nodes: assert.fail, edges: assert.fail, error: assert.fail }
	);
	await tick();
	dispose();
	dispose();
	emitNodes([node()]);
	assert.equal(stopped, 2);
});

test('partial subscription failure cleans up the already-open listener', async () => {
	let stopped = 0;
	const errors = [];
	const failure = new Error('subscribe failed');
	connectCanvas(
		async () => ({
			subscribeToNodes() {
				return () => stopped++;
			},
			subscribeToEdges() {
				throw failure;
			}
		}),
		{ nodes: assert.fail, edges: assert.fail, error: (error) => errors.push(error) }
	);
	await tick();
	assert.deepEqual(errors, [failure]);
	assert.equal(stopped, 1);
});

test('geometry snapshots detect in-place moves and style edits, but ignore selection', () => {
	const nodes = [node()];
	const edges = [edge()];
	const before = snapshotCanvas(nodes, edges);
	nodes[0].selected = true;
	assert.deepEqual(getCanvasChanges(nodes, edges, before.nodes, before.edges), {
		nodes: [],
		edges: []
	});
	nodes[0].position.x = 15;
	edges[0].style = 'stroke: red';
	assert.equal(getCanvasChanges(nodes, edges, before.nodes, before.edges).nodes.length, 1);
	assert.equal(getCanvasChanges(nodes, edges, before.nodes, before.edges).edges.length, 1);
	assert.equal(before.nodes[0].position.x, 0);
});

test('failed writes retain geometry across remote rollback and can be retried', async () => {
	const writes = [];
	const persistence = new CanvasPersistence(async (nodes) => {
		writes.push(nodes[0].position.x);
		if (writes.length === 1) throw new Error('offline');
	});
	persistence.receiveNodes([node()]);
	persistence.stage([node(12)], []);
	await assert.rejects(persistence.flush(), /offline/);
	const remote = { ...node(), data: { title: 'Someone else edited this' } };
	const merged = persistence.receiveNodes([remote]);
	assert.equal(merged[0].position.x, 12);
	assert.equal(merged[0].data.title, remote.data.title);
	await persistence.flush();
	assert.deepEqual(writes, [12, 12]);
	assert.equal(persistence.stage([node(12)], []), false);
});

test('an edit during a save is written afterward, including undo to the old position', async () => {
	const first = deferred();
	const writes = [];
	const persistence = new CanvasPersistence(async (nodes) => {
		writes.push(nodes[0].position.x);
		if (writes.length === 1) await first.promise;
	});
	persistence.receiveNodes([node()]);
	persistence.stage([node(10)], []);
	const saved = persistence.flush();
	persistence.stage([node(0)], []);
	assert.equal(persistence.flush(), saved);
	assert.deepEqual(writes, [10]);
	first.resolve();
	await saved;
	assert.deepEqual(writes, [10, 0]);
});

test('remote deletion removes a queued move rather than recreating the node', async () => {
	const persistence = new CanvasPersistence(assert.fail);
	persistence.receiveNodes([node()]);
	persistence.stage([node(10)], []);
	assert.deepEqual(persistence.receiveNodes([]), []);
	assert.equal(persistence.stage([node(10)], []), false);
	await persistence.flush();
});

test('transient UI node and edge identifiers are not written before server creation', async () => {
	const persistence = new CanvasPersistence(assert.fail);
	assert.equal(persistence.stage([node()], [edge()]), false);
	persistence.receiveNodes([node()]);
	persistence.receiveEdges([edge()]);
	assert.equal(persistence.stage([node()], [edge()]), false);
	await persistence.flush();
});

test('disposal prevents queued follow-up writes after an in-flight write', async () => {
	const first = deferred();
	let writes = 0;
	const persistence = new CanvasPersistence(async () => {
		writes++;
		await first.promise;
	});
	persistence.receiveNodes([node()]);
	persistence.stage([node(10)], []);
	const saved = persistence.flush();
	persistence.stage([node(20)], []);
	persistence.dispose();
	first.resolve();
	await saved;
	assert.equal(writes, 1);
	assert.equal(persistence.stage([node(30)], []), false);
});
