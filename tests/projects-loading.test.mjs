import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectsState } from '../src/lib/features/projects/createProjectsState.ts';

function fixture() {
	let countCalls = 0,
		finish;
	const pending = new Promise((resolve) => {
		finish = resolve;
	});
	const projects = [
		{ id: 'p1', slug: 'one' },
		{ id: 'project-canvas', slug: 'project-canvas' }
	];
	const state = createProjectsState(
		{
			getAllProjects: async () => projects,
			getProjectStatusCounts: async () => {
				countCalls++;
				return pending;
			}
		},
		{
			getTaskCounts: async () => {
				countCalls++;
				return { total: 4 };
			}
		}
	);
	let list, summaries;
	state.list.subscribe((value) => {
		list = value;
	});
	state.summaries.subscribe((value) => {
		summaries = value;
	});
	return {
		state,
		projects,
		finish,
		get list() {
			return list;
		},
		get summaries() {
			return summaries;
		},
		get calls() {
			return countCalls;
		}
	};
}

test('projects render without fetching counts; optional slow summaries do not block cards', async () => {
	const f = fixture();
	await f.state.load();
	assert.equal(f.calls, 0);
	assert.equal(f.list.status, 'ready');
	assert.deepEqual(f.list.data.projects, f.projects);
	const loading = f.state.loadSummaries(f.projects);
	assert.equal(f.calls, 2); // Synthetic canvas excluded.
	assert.equal(f.list.status, 'ready');
	assert.equal(f.summaries.status, 'loading');
	f.finish({ todo: 1, doing: 2, done: 3 });
	await loading;
	assert.equal(f.summaries.data.taskCounts.one, 4);
	assert.equal(f.summaries.data.counts.one.doing, 2);
	f.state.dispose();
});

test('refresh invalidates in-flight summaries without overwriting the new project load', async () => {
	const f = fixture();
	await f.state.load();
	const loading = f.state.loadSummaries(f.projects);
	await f.state.load();
	f.finish({ todo: 1, doing: 2, done: 3 });
	await loading;
	assert.equal(f.summaries.status, 'idle');
	assert.deepEqual(f.summaries.data.counts, {});
	assert.equal(f.list.status, 'ready');
	f.state.dispose();
});

test('summary failures keep projects visible and can be retried separately', async () => {
	let fail = true;
	let list, summaries;
	const state = createProjectsState(
		{
			getAllProjects: async () => [{ id: 'p', slug: 'p' }],
			getProjectStatusCounts: async () => {
				if (fail) throw Error('Count unavailable');
				return { todo: 0, doing: 0, done: 0 };
			}
		},
		{ getTaskCounts: async () => ({ total: 0 }) }
	);
	state.list.subscribe((value) => {
		list = value;
	});
	state.summaries.subscribe((value) => {
		summaries = value;
	});
	await state.load();
	await state.loadSummaries(list.data.projects);
	assert.equal(list.status, 'ready');
	assert.equal(summaries.status, 'error');
	fail = false;
	await state.loadSummaries(list.data.projects);
	assert.equal(summaries.status, 'ready');
	state.dispose();
});
