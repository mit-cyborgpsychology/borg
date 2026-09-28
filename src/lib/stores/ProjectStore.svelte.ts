import { createResource } from '../state/resource';
import { SvelteMap } from 'svelte/reactivity';
import type { TaskWithContext } from '../types/task';
import type { ITaskService } from '../services/interfaces/ITaskService';

export class ProjectStore {
	constructor(
		private taskService: Pick<ITaskService, 'getProjectTasks' | 'subscribeToProjectTasks'>
	) {}

	projectSlug: string | null = $state(null);

	tasks = $state.raw<TaskWithContext[]>([]);

	tasksByNode = $derived.by(() => {
		const map = new SvelteMap<string, TaskWithContext[]>();
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

	readonly resource = createResource<TaskWithContext[]>([]);
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	error = $state<string | null>(null);
	private stopObserving: (() => void) | null = null;

	// Plain (non-reactive) fields for reentrancy bookkeeping — these must NOT
	// be $state, or reading them inside open()/close() (which callers invoke
	// from inside a Svelte $effect) makes that effect depend on them, and the
	// write later in the same call re-triggers the effect: an infinite loop.
	private currentSlug: string | null = null;

	open(projectSlug: string) {
		if (this.currentSlug === projectSlug) return;
		this.close();
		this.currentSlug = projectSlug;
		this.projectSlug = projectSlug;
		this.stopObserving = this.resource.subscribe((state) => {
			this.tasks = state.data;
			this.status = state.status;
			this.error = state.error;
		});
		if (this.taskService.subscribeToProjectTasks) {
			this.resource.connect((next, error) =>
				this.taskService.subscribeToProjectTasks!(projectSlug, next, error)
			);
		} else {
			void this.resource.load(() => this.taskService.getProjectTasks(projectSlug));
		}
	}

	retry() {
		const slug = this.currentSlug;
		if (!slug) return;
		this.close();
		this.open(slug);
	}

	close() {
		this.resource.reset();
		this.stopObserving?.();
		this.stopObserving = null;
		this.currentSlug = null;
		this.projectSlug = null;
		this.tasks = [];
	}
}
