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

	async open(projectSlug: string) {
		if (this.projectSlug === projectSlug && this.unsubTasks) return;

		this.close();
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
		this.projectSlug = null;
		this.tasks = [];
	}
}
