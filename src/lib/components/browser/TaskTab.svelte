<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTaskCommands } from '../../features/tasks/createTaskCommands';
	import { createTasksState } from '../../features/tasks/createTasksState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import { onMount } from 'svelte';
	import { CheckSquare } from '@lucide/svelte';
	import type { Task, TaskWithContext } from '../../types/task';
	import { goto } from '$app/navigation';
	import HierarchicalTaskView from '../tasks/HierarchicalTaskView.svelte';

	const { taskService, authStore, projectsService } = getAppServices();
	const { getPersonCached } = getAppServices().peopleCache;
	const { joinTaskContext } = getAppServices().taskContext;

	const featureState = createTasksState(taskService, projectsService, joinTaskContext);
	const resource = featureState.list;
	const taskCommands = createTaskCommands(taskService, () => loadTasks(true));
	const taskCommand = taskCommands.command;
	onDestroy(() => {
		featureState.dispose();
		taskCommands.dispose();
	});

	let { activeTab: currentTab } = $props<{
		activeTab: string;
	}>();

	let activeTasks = $derived($resource.data.active);
	let resolvedTasks = $derived($resource.data.resolved);
	let filteredActiveTasks = $state<TaskWithContext[]>([]);
	let filteredResolvedTasks = $state<TaskWithContext[]>([]);
	let viewTab = $state<'active' | 'resolved'>('active');
	let searchQuery = $state('');
	let dataLoaded = $derived($resource.status !== 'idle');

	// Lazy load data when tab becomes active
	$effect(() => {
		if (currentTab === 'tasks' && !dataLoaded) {
			loadTasks();
		}
	});

	async function loadTasks(force = false) {
		if (dataLoaded && !force) return;
		await featureState.load($authStore.userType === 'collaborator');
	}

	function applyFilters() {
		applyFiltersToTasks(activeTasks, 'active');
		applyFiltersToTasks(resolvedTasks, 'resolved');
	}

	function applyFiltersToTasks(tasks: TaskWithContext[], type: 'active' | 'resolved') {
		let filtered = tasks;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			const matchingTasks = [];

			for (const task of filtered) {
				const titleMatch = task.title.toLowerCase().includes(query);
				const nodeMatch = task.nodeTitle?.toLowerCase().includes(query) || false;
				const projectMatch = task.projectTitle?.toLowerCase().includes(query);

				let personMatch = false;
				if (task.assignee) {
					const person = getPersonCached(task.assignee);
					personMatch = person?.name.toLowerCase().includes(query) || false;
				}

				if (titleMatch || nodeMatch || projectMatch || personMatch) {
					matchingTasks.push(task);
				}
			}

			filtered = matchingTasks;
		}

		if (type === 'active') {
			filteredActiveTasks = filtered;
		} else {
			filteredResolvedTasks = filtered;
		}
	}

	$effect(() => {
		applyFilters();
	});

	async function handleDeleteTask(task: TaskWithContext) {
		if (confirm('Are you sure you want to delete this task permanently?'))
			await taskCommands.remove(task);
	}
	async function handleResolveTask(task: TaskWithContext) {
		await taskCommands.resolve(task);
	}
	async function handleReactivateTask(task: TaskWithContext) {
		await taskCommands.reactivate(task);
	}

	// Get task stats
	let taskStats = $derived({
		active: activeTasks.length,
		resolved: resolvedTasks.length,
		overdue: activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length
	});
</script>

<StatusOverlay>
	<AsyncStatus state={$taskCommand} pendingLabel="Saving…" />

	<AsyncStatus state={$resource} onRetry={() => void loadTasks(true)} />
</StatusOverlay>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Header -->
	<!-- <div class="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-xl font-semibold text-zinc-100">Tasks</h1>
				<p class="mt-1 text-sm text-zinc-400">All tasks across projects</p>
			</div>
			
			Stats
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-1">
					<span class="text-xs text-zinc-400">Total</span>
					<span class="rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-400">{taskStats.total}</span>
				</div>
				{#if taskStats.overdue > 0}
					<div class="flex items-center gap-1">
						<span class="text-xs text-zinc-400">Overdue</span>
						<span class="rounded-full bg-rose-500/20 px-2 py-1 text-xs text-rose-400">{taskStats.overdue}</span>
					</div>
				{/if}
			</div>
		</div>

		Search
		<div class="mt-4">
			<input
				type="text"
				placeholder="Search tasks..."
				bind:value={searchQuery}
				class="w-full  bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
		</div>
	</div> -->

	<!-- Sticky toolbar + tabs in one row -->
	<div
		class="flex w-full flex-shrink-0 items-center gap-2 border-b border-borg-brown bg-borg-beige px-4 py-2"
	>
		<input
			type="text"
			placeholder="Search tasks..."
			bind:value={searchQuery}
			class="w-44 rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
		/>
		<div class="flex rounded border border-zinc-300 bg-white p-0.5">
			<button
				onclick={() => (viewTab = 'active')}
				class="rounded px-2.5 py-1 text-sm font-medium transition-colors {viewTab === 'active'
					? 'bg-zinc-100 text-zinc-800'
					: 'text-zinc-500 hover:text-zinc-700'}">Active ({taskStats.active})</button
			>
			<button
				onclick={() => (viewTab = 'resolved')}
				class="rounded px-2.5 py-1 text-sm font-medium transition-colors {viewTab === 'resolved'
					? 'bg-zinc-100 text-zinc-800'
					: 'text-zinc-500 hover:text-zinc-700'}">Resolved ({taskStats.resolved})</button
			>
		</div>
		{#if taskStats.overdue > 0}
			<span class="text-xs text-red-500">{taskStats.overdue} overdue</span>
		{/if}
	</div>

	<!-- Content -->
	<div class="min-h-0 flex-1 overflow-hidden p-4">
		{#if viewTab === 'active'}
			<HierarchicalTaskView
				tasks={filteredActiveTasks}
				showActions={true}
				isResolved={false}
				onResolveTask={handleResolveTask}
				onDeleteTask={handleDeleteTask}
			/>
		{:else}
			<HierarchicalTaskView
				tasks={filteredResolvedTasks}
				showActions={true}
				isResolved={true}
				onReactivateTask={handleReactivateTask}
				onDeleteTask={handleDeleteTask}
			/>
		{/if}
	</div>
</div>
