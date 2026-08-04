import type { TaskWithContext } from '../types/task';
import { taskService } from '../services/instances';

export class ProjectStore {
	projectSlug: string | null = $state(null);

	tasks = $state.raw<TaskWithContext[]>([]);

	tasksByNode = $derived.by(() => {
		const map = new Map<string, TaskWithContext[]>();
		for (const task of this.tasks) {
			if (!task.nodeId) continue;
			const existing = map.get(task.nodeId);
			if (existing) {
				existing.push(task);
			} else {
				map.set(task.nodeId, [task]);
			}
		}
		return map;
	});

	taskCounts = $derived.by(() => ({ total: this.tasks.length }));

	private unsubTasks: (() => void) | null = null;

	// Plain (non-reactive) fields for reentrancy bookkeeping — these must NOT
	// be $state, or reading them inside open()/close() (which callers invoke
	// from inside a Svelte $effect) makes that effect depend on them, and the
	// write later in the same call re-triggers the effect: an infinite loop.
	private currentSlug: string | null = null;

	async open(projectSlug: string) {
		if (this.currentSlug === projectSlug && this.unsubTasks) return;

		this.close();
		this.currentSlug = projectSlug;
		this.projectSlug = projectSlug;

		if (taskService.subscribeToProjectTasks) {
			this.unsubTasks = taskService.subscribeToProjectTasks(projectSlug, (tasks) => {
				this.tasks = tasks;
			});
		} else {
			const result = taskService.getProjectTasks(projectSlug);
			this.tasks = result instanceof Promise ? await result : result;
		}
	}

	close() {
		if (this.unsubTasks) {
			this.unsubTasks();
			this.unsubTasks = null;
		}
		this.currentSlug = null;
		this.projectSlug = null;
		this.tasks = [];
	}
}
