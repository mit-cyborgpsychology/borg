import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';
import { createResource } from '../src/lib/state/resource.ts';
import { createAuthStore } from '../src/lib/stores/authStore.ts';
import { createTasksState } from '../src/lib/features/tasks/createTasksState.ts';
import { createDocsState } from '../src/lib/features/docs/createDocsState.ts';
import { createNodeService } from '../src/lib/services/NodeService.ts';

const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
};

test('resource uses the latest request and retains the last good data on failure', async () => {
	const resource = createResource([]);
	const old = deferred();
	const first = resource.load(() => old.promise);
	await resource.load(async () => ['new']);
	old.resolve(['old']);
	await first;
	assert.deepEqual(get(resource), { data: ['new'], status: 'ready', error: null });
	await resource.load(async () => {
		throw new Error('offline');
	});
	assert.deepEqual(get(resource), { data: ['new'], status: 'error', error: 'offline' });
});

test('reset and disposal reject late requests and stop live subscriptions', async () => {
	const resource = createResource([]);
	const pending = deferred();
	const loaded = resource.load(() => pending.promise);
	resource.reset();
	pending.resolve(['stale']);
	await loaded;
	assert.equal(get(resource).status, 'idle');
	let stopped = 0;
	let emit;
	resource.connect((next) => {
		emit = next;
		return () => stopped++;
	});
	emit(['live']);
	resource.dispose();
	emit(['late']);
	assert.equal(stopped, 1);
	assert.deepEqual(get(resource).data, ['live']);
});

test('switching from a live source to a query disconnects the old source', async () => {
	const resource = createResource(0);
	let stopped = 0;
	let emit;
	resource.connect((next) => {
		emit = next;
		return () => stopped++;
	});
	await resource.load(async () => 2);
	emit(1);
	assert.equal(get(resource).data, 2);
	assert.equal(stopped, 1);
});

test('auth state cannot restore a signed-out user after approval lookup completes', async () => {
	const approval = deferred();
	let emit;
	let stopped = 0;
	const auth = createAuthStore({
		onAuthStateChange(next) {
			emit = next;
			return () => stopped++;
		},
		checkUserApproval: () => approval.promise,
		getUserData: async () => ({ userType: 'member' })
	});
	auth.start();
	const checking = emit({ uid: 'alice' });
	await emit(null);
	approval.resolve(true);
	await checking;
	assert.equal(get(auth.state).user, null);
	assert.equal(get(auth.state).loading, false);
	auth.dispose();
	assert.equal(stopped, 1);
});

test('task feature filters collaborator scope and joins titles before publishing', async () => {
	const feature = createTasksState(
		{
			getTaskPage: async ({ status }) => ({
				tasks:
					status === 'active'
						? [
								{ id: 'allowed', projectSlug: 'a' },
								{ id: 'hidden', projectSlug: 'b' }
							]
						: [{ id: 'resolved', projectSlug: 'a' }],
				nextCursor: null
			}),
			getTaskProjectCount: async () => 2
		},
		{ getAllProjects: async () => [{ slug: 'a', title: 'Project A' }] },
		async (tasks) => tasks.map((task) => ({ ...task, projectTitle: 'Current title' }))
	);
	await feature.load(true);
	assert.deepEqual(
		get(feature.list).data.active.map((task) => task.id),
		['allowed']
	);
	assert.equal(get(feature.list).data.resolved[0].projectTitle, 'Current title');
	feature.dispose();
});

test('a slow docs search cannot overwrite a newer search', async () => {
	const slow = deferred();
	const feature = createDocsState(
		{ searchDocs: (q) => (q === 'old' ? slow.promise : Promise.resolve([{ id: q }])) },
		{ getAllProjects: async () => [] },
		{}
	);
	const first = feature.load('old');
	await Promise.resolve();
	await feature.load('new');
	slow.resolve([{ id: 'old' }]);
	await first;
	assert.equal(get(feature.list).data.docs[0].id, 'new');
	feature.dispose();
});

test('node application service builds defaults and assigns identity without Firebase', async () => {
	let created;
	const service = createNodeService(
		{
			createNode: async (...args) => {
				created = args;
				return { id: 'new' };
			}
		},
		() => ({ user: { uid: 'alice' } }),
		{},
		{}
	);
	await service.addNode('note', { x: 1, y: 2 });
	assert.equal(created[2].title, '');
	assert.deepEqual(created[1], { x: 1, y: 2 });
	assert.equal(created[3], 'alice');
});

test('failed repository updates do not invalidate application caches', async () => {
	const service = createNodeService(
		{ updateNode: async () => false },
		() => ({}),
		{ invalidateStatusCache: assert.fail },
		{},
		'project'
	);
	assert.equal(await service.updateNode('node', { nodeData: { status: 'Done' } }), false);
});

test('presence transport serializes messages and cancels reconnect on disposal', async (t) => {
	const { createPresenceService } = await import('../src/lib/services/PresenceService.ts');
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const sockets = [];
	const received = [];
	const service = createPresenceService('wss://example.test/party', (url) => {
		const socket = {
			url,
			readyState: 1,
			sent: [],
			send(value) {
				this.sent.push(value);
			},
			close() {
				this.onclose();
			}
		};
		sockets.push(socket);
		return socket;
	});
	const connection = service.connect('room one', { message: (data) => received.push(data) });
	assert.equal(sockets[0].url, 'wss://example.test/party/room%20one');
	connection.send({ type: 'hello' });
	assert.deepEqual(sockets[0].sent, ['{"type":"hello"}']);
	sockets[0].onmessage({ data: '{"type":"update"}' });
	assert.deepEqual(received, [{ type: 'update' }]);
	sockets[0].onclose();
	t.mock.timers.tick(3000);
	assert.equal(sockets.length, 2);
	sockets[1].onclose();
	connection.close();
	t.mock.timers.tick(6000);
	assert.equal(sockets.length, 2);
	sockets[1].onmessage({ data: '{"type":"late"}' });
	assert.equal(received.length, 1);
});

test('commands keep failures visible, reject duplicate submissions, and ignore late success after disposal', async () => {
	const { createCommand } = await import('../src/lib/state/command.ts');
	const command = createCommand();
	assert.deepEqual(await command.run(async () => false), { ok: false });
	assert.equal(get(command).status, 'error');
	const pending = deferred();
	const first = command.run(() => pending.promise);
	assert.deepEqual(await command.run(async () => assert.fail('duplicate executed')), { ok: false });
	command.dispose();
	pending.resolve('saved');
	assert.deepEqual(await first, { ok: false });
});

test('failed approval retains pending users; successful retry refreshes both lists', async () => {
	const { createPeopleState } = await import('../src/lib/features/people/createPeopleState.ts');
	let approved = false;
	let fail = true;
	const user = { id: 'alice', name: 'Alice', createdAt: '2026-01-01', lastLoginAt: '2026-01-01' };
	const feature = createPeopleState({
		getUnapprovedUsers: async () => (approved ? [] : [user]),
		getApprovedUsers: async () => (approved ? [user] : []),
		approveUser: async () => {
			if (fail) throw new Error('offline');
			approved = true;
			return true;
		}
	});
	await feature.loadPending();
	assert.deepEqual(await feature.approve('alice', 'member'), { ok: false });
	assert.equal(get(feature.pending).data.length, 1);
	assert.equal(get(feature.command).error, 'offline');
	fail = false;
	assert.equal((await feature.approve('alice', 'member')).ok, true);
	assert.equal(get(feature.pending).data.length, 0);
	assert.equal(get(feature.list).data[0].name, 'Alice');
	feature.dispose();
});

test('task commands refresh only after a successful mutation', async () => {
	const { createTaskCommands } = await import('../src/lib/features/tasks/createTaskCommands.ts');
	let fail = true;
	let refreshed = 0;
	const commands = createTaskCommands(
		{
			resolveTask: async () => {
				if (fail) throw new Error('permission denied');
			}
		},
		async () => {
			refreshed++;
		}
	);
	const task = { id: 'task', nodeId: 'node', projectSlug: 'project' };
	assert.equal((await commands.resolve(task)).ok, false);
	assert.equal(refreshed, 0);
	fail = false;
	assert.equal((await commands.resolve(task)).ok, true);
	assert.equal(refreshed, 1);
	commands.dispose();
});

test('queued editor commands preserve edits made during an in-flight save', async () => {
	const { createCommand } = await import('../src/lib/state/command.ts');
	const command = createCommand({ queue: true });
	const firstWrite = deferred();
	const writes = [];
	const first = command.run(async () => {
		writes.push('first');
		await firstWrite.promise;
	});
	const second = command.run(async () => {
		writes.push('second');
	});
	await Promise.resolve();
	assert.deepEqual(writes, ['first']);
	firstWrite.resolve();
	assert.equal((await first).ok, true);
	assert.equal((await second).ok, true);
	assert.deepEqual(writes, ['first', 'second']);
	command.dispose();
});
