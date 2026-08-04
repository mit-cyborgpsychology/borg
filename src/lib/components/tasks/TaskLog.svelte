<script lang="ts">
	import { onMount } from 'svelte';
	import { Clock } from '@lucide/svelte';
	import type { ITaskService } from '../../services/interfaces/ITaskService';
	import type { TaskWithContext } from '../../types/task';
	import { authStore } from '../../stores/authStore';
	import HierarchicalTaskView from './HierarchicalTaskView.svelte';
	import { joinTaskContext } from '../../services/taskContext';

	let { taskService } = $props<{
		taskService: ITaskService;
	}>();

	let logTasks = $state<TaskWithContext[]>([]);
	let filteredLogTasks = $state<TaskWithContext[]>([]);
	let dataLoaded = $state(false);
	let viewMode = $state<'grouped' | 'all'>('all');

	onMount(() => {
		loadLogTasks();
	});

	async function loadLogTasks() {
		const currentUser = $authStore.user;
		if (!currentUser) return;

		try {
			let personId = currentUser.uid || currentUser.email || '';

			// Use the efficient method if available, otherwise fall back to filtering all resolved tasks
			let userResolvedTasks: TaskWithContext[];

			if (taskService.getPersonResolvedTasksLog) {
				const result = taskService.getPersonResolvedTasksLog(personId, 30);
				userResolvedTasks = result instanceof Promise ? await result : result;
			} else {
				// Fallback for services that don't implement the new method
				const result = taskService.getResolvedTasks();
				const allResolvedTasks = result instanceof Promise ? await result : result;

				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

				userResolvedTasks = allResolvedTasks.filter((task: TaskWithContext) => {
					if (task.assignee !== personId || task.status !== 'resolved') return false;

					const taskDate = task.updatedAt ? new Date(task.updatedAt) : new Date(task.createdAt);
					return taskDate >= thirtyDaysAgo;
				});

				userResolvedTasks.sort((a: TaskWithContext, b: TaskWithContext) => {
					const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(a.createdAt);
					const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(b.createdAt);
					return dateB.getTime() - dateA.getTime();
				});
			}

			logTasks = userResolvedTasks;
			filteredLogTasks = userResolvedTasks;
			dataLoaded = true;

			joinTaskContext(userResolvedTasks).then((joined) => {
				logTasks = joined;
				filteredLogTasks = joined;
			});
		} catch (error) {
			console.error('Failed to load task log:', error);
			logTasks = [];
			filteredLogTasks = [];
			dataLoaded = true;
		}
	}

	async function handleReactivateTask(task: TaskWithContext) {
		const result = taskService.updateTask(
			task.nodeId,
			task.id,
			{ status: 'active' } as any,
			task.projectSlug
		);
		if (result instanceof Promise) await result;
		await loadLogTasks(); // Reload tasks
	}

	async function handleDeleteTask(task: TaskWithContext) {
		if (confirm('Are you sure you want to delete this task permanently?')) {
			const result = taskService.deleteTask(task.nodeId, task.id, task.projectSlug);
			if (result instanceof Promise) await result;
			await loadLogTasks(); // Reload tasks
		}
	}
</script>

<div class="flex h-full flex-col">
	<div class="mb-4 flex items-center justify-between">
		<!-- <div class="flex items-center gap-3">
			<Clock class="h-6 w-6 text-zinc-600" />
			<h3 class="text-xl font-semibold text-black">Task Log</h3>
			<span class="text-sm text-zinc-500">(Last 30 days)</span>
		</div> -->

		<!-- View Mode Toggle -->
		<div class="mb-2 flex overflow-hidden rounded-lg border border-black">
			<button
				onclick={() => (viewMode = 'all')}
				class=" px-3 py-1 text-sm font-medium transition-colors {viewMode === 'all'
					? 'bg-borg-blue text-white'
					: 'bg-white text-zinc-600 hover:text-zinc-800'}"
			>
				All
			</button>
			<button
				onclick={() => (viewMode = 'grouped')}
				class="border-l border-black px-3 py-1 text-sm font-medium transition-colors {viewMode ===
				'grouped'
					? 'bg-borg-blue text-white'
					: 'bg-white text-zinc-600 hover:text-zinc-800'}"
			>
				By Project
			</button>
		</div>
	</div>

	{#if !dataLoaded}
		<div class="flex items-center justify-center py-8">
			<div
				class="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent"
			></div>
			<span class="ml-2 text-sm text-gray-600">Loading...</span>
		</div>
	{:else if filteredLogTasks.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<Clock class="mb-4 h-12 w-12 text-zinc-300" />
			<p class="mb-2 text-lg font-medium text-zinc-500">No resolved tasks found</p>
			<p class="text-sm text-zinc-400">Tasks you complete will appear here for the last 30 days</p>
		</div>
	{:else}
		<!-- <div class="mb-4 flex items-center justify-between">
			<p class="text-sm text-zinc-600">{filteredLogTasks.length} resolved tasks</p>
		</div> -->

		<div class="flex-1 overflow-auto">
			<HierarchicalTaskView
				tasks={filteredLogTasks}
				showActions={true}
				isResolved={true}
				onReactivateTask={handleReactivateTask}
				onDeleteTask={handleDeleteTask}
				groupByProject={viewMode === 'grouped'}
			/>
		</div>
	{/if}
</div>
