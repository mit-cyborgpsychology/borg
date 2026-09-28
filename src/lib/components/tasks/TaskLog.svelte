<script lang="ts">
	import { getAppServices } from '$lib/app/context';
	import { onMount, onDestroy } from 'svelte';
	import { createTaskLogState } from '../../features/tasks/createTaskLogState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { Clock } from '@lucide/svelte';
	import type { TaskWithContext } from '../../types/task';
	import HierarchicalTaskView from './HierarchicalTaskView.svelte';

	const { taskService, authStore } = getAppServices();
	const { joinTaskContext } = getAppServices().taskContext;

	const featureState = createTaskLogState(taskService, joinTaskContext);
	const resource = featureState.list;
	onDestroy(() => featureState.dispose());
	let logTasks = $derived($resource.data);
	let filteredLogTasks = $derived(logTasks);
	let dataLoaded = $derived($resource.status !== 'idle');
	let viewMode = $state<'grouped' | 'all'>('all');

	onMount(() => {
		loadLogTasks();
	});

	async function loadLogTasks() {
		const user = $authStore.user;
		if (user) await featureState.load(user.uid);
	}

	async function handleReactivateTask(task: TaskWithContext) {
		const result = taskService.updateTask(
			task.nodeId,
			task.id,
			{ status: 'active' } as any,
			task.projectSlug
		);
		await result;
		await loadLogTasks(); // Reload tasks
	}

	async function handleDeleteTask(task: TaskWithContext) {
		if (confirm('Are you sure you want to delete this task permanently?')) {
			const result = taskService.deleteTask(task.nodeId, task.id, task.projectSlug);
			await result;
			await loadLogTasks(); // Reload tasks
		}
	}
</script>

<AsyncStatus state={$resource} onRetry={() => void loadLogTasks()} />

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
