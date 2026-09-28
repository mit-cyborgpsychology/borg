import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createTaskPages } from '../src/lib/features/tasks/createTaskPages.ts';
import { createTaskContext } from '../src/lib/services/taskContext.ts';
const deferred = () => {
	let resolve;
	const promise = new Promise((r) => (resolve = r));
	return { promise, resolve };
};
test('slow directory counts do not block tasks or pagination', async () => {
	const counts = deferred();
	const feature = createTaskPages(
		{
			getTaskPage: async ({ status }) => ({ tasks: [{ id: status }], nextCursor: null }),
			getTaskProjectCount: () => counts.promise
		},
		async (tasks) => tasks,
		{ getAllProjects: async () => [{ slug: 'p', title: 'Project' }] }
	);
	await feature.load();
	assert.equal(get(feature.list).status, 'ready');
	assert.equal(get(feature.list).data.active[0].id, 'active');
	assert.equal(get(feature.directory).status, 'loading');
	await feature.selectProject('project:p');
	counts.resolve(3);
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(get(feature.list).data.selectedProject, 'project:p');
	assert.equal(get(feature.list).data.projects[0].count, 3);
	feature.dispose();
});
test('stale directory results cannot overwrite a newer person selection', async () => {
	const old = deferred();
	const feature = createTaskPages(
		{
			getTaskPage: async () => ({ tasks: [], nextCursor: null }),
			getTaskProjectCount: async (_, person) => (person === 'old' ? old.promise : 2)
		},
		async (tasks) => tasks,
		{ getAllProjects: async () => [{ slug: 'p', title: 'Project' }] }
	);
	await feature.load('old');
	await feature.load('new');
	await new Promise((r) => setTimeout(r, 0));
	old.resolve(99);
	await new Promise((r) => setTimeout(r, 0));
	assert.ok(get(feature.list).data.projects.every((p) => p.count === 2));
	feature.dispose();
});
test('concurrent task title joins share project and node requests', async () => {
	let projects = 0,
		nodes = 0;
	const context = createTaskContext(
		{
			getProject: async () => {
				projects++;
				return { id: 'p', title: 'Project' };
			}
		},
		async () => {
			nodes++;
			return { templateType: 'note', nodeData: { title: 'Note' } };
		}
	);
	const tasks = Array.from({ length: 24 }, (_, i) => ({
		id: String(i),
		projectSlug: 'p',
		nodeId: 'n'
	}));
	const [result] = await Promise.all([
		context.joinTaskContext(tasks),
		context.joinTaskContext(tasks)
	]);
	assert.equal(projects, 1);
	assert.equal(nodes, 1);
	assert.equal(result[0].projectTitle, 'Project');
	context.clear();
	await context.joinTaskContext(tasks);
	assert.equal(projects, 2);
	assert.equal(nodes, 2);
});
