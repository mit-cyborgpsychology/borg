<script lang="ts">
	import { onMount } from 'svelte';
	import { CheckSquare } from '@lucide/svelte';
	import type { ITaskService } from '../../services/interfaces/ITaskService';
	import type { IPeopleService } from '../../services/interfaces/IPeopleService';
	import type { Task, TaskWithContext } from '../../types/task';
	import { goto } from '$app/navigation';
	import HierarchicalTaskView from '../tasks/HierarchicalTaskView.svelte';
	import { authStore } from '../../stores/authStore';
	import { projectsService } from '../../services/instances';

	let {
		taskService,
		peopleService,
		activeTab: currentTab
	} = $props<{
		taskService: ITaskService;
		peopleService: IPeopleService;
		activeTab: string;
	}>();

	let activeTasks = $state<TaskWithContext[]>([]);
	let resolvedTasks = $state<TaskWithContext[]>([]);
	let filteredActiveTasks = $state<TaskWithContext[]>([]);
	let filteredResolvedTasks = $state<TaskWithContext[]>([]);
	let viewTab = $state<'active' | 'resolved'>('active');
	let searchQuery = $state('');
	let dataLoaded = $state(false);

	// Lazy load data when tab becomes active
	$effect(() => {
		if (currentTab === 'tasks' && !dataLoaded) {
			loadTasks();
		}
	});

	async function loadTasks(force = false) {
		if (dataLoaded && !force) return; // Prevent duplicate loading unless forced

		const activeResult = taskService.getActiveTasks();
		let allActiveTasks = activeResult instanceof Promise ? await activeResult : activeResult;

		const resolvedResult = taskService.getResolvedTasks();
		let allResolvedTasks = resolvedResult instanceof Promise ? await resolvedResult : resolvedResult;

		// Filter tasks for collaborators - only show tasks from projects they're invited to
		if ($authStore.userType === 'collaborator') {
			const userProjects = await projectsService.getAllProjects(); // This already filters for collaborators
			const projectSlugs = userProjects.map(p => p.slug);
			
			allActiveTasks = allActiveTasks.filter(task => 
				task.projectSlug && projectSlugs.includes(task.projectSlug)
			);
			
			allResolvedTasks = allResolvedTasks.filter(task => 
				task.projectSlug && projectSlugs.includes(task.projectSlug)
			);
		}

		activeTasks = allActiveTasks;
		resolvedTasks = allResolvedTasks;

		applyFilters();
		dataLoaded = true;
	}

	async function applyFilters() {
		await applyFiltersToTasks(activeTasks, 'active');
		await applyFiltersToTasks(resolvedTasks, 'resolved');
	}

	async function applyFiltersToTasks(tasks: TaskWithContext[], type: 'active' | 'resolved') {
		let filtered = tasks;

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			const matchingTasks = [];

			for (const task of filtered) {
				const titleMatch = task.title.toLowerCase().includes(query);
				const nodeMatch = task.nodeTitle.toLowerCase().includes(query);
				const projectMatch = task.projectTitle?.toLowerCase().includes(query);

				let personMatch = false;
				if (task.assignee) {
					const result = peopleService.getPerson(task.assignee);
					const person = result instanceof Promise ? await result : result;
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
		if (confirm('Are you sure you want to delete this task permanently?')) {
			const result = taskService.deleteTask(task.nodeId, task.id, task.projectSlug);
			if (result instanceof Promise) await result;
			await loadTasks(true); // Force reload
		}
	}

	async function handleResolveTask(task: TaskWithContext) {
		const result = taskService.resolveTask(task.nodeId, task.id, task.projectSlug);
		if (result instanceof Promise) await result;
		await loadTasks(true); // Force reload
	}

	async function handleReactivateTask(task: TaskWithContext) {
		const result = taskService.updateTask(
			task.nodeId,
			task.id,
			{ status: 'active' } as Partial<Task>,
			task.projectSlug
		);
		if (result instanceof Promise) await result;
		await loadTasks(true); // Force reload
	}

	// Get task stats
	let taskStats = $derived({
		active: activeTasks.length,
		resolved: resolvedTasks.length,
		overdue: activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length
	});
</script>

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
	<div class="flex w-full flex-shrink-0 items-center gap-2 border-b border-borg-brown bg-borg-beige px-4 py-2">
		<input
			type="text"
			placeholder="Search tasks..."
			bind:value={searchQuery}
			class="w-44 rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
		/>
		<div class="flex rounded border border-zinc-300 bg-white p-0.5">
			<button onclick={() => (viewTab = 'active')} class="rounded px-2.5 py-1 text-sm font-medium transition-colors {viewTab === 'active' ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-500 hover:text-zinc-700'}">Active ({taskStats.active})</button>
			<button onclick={() => (viewTab = 'resolved')} class="rounded px-2.5 py-1 text-sm font-medium transition-colors {viewTab === 'resolved' ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-500 hover:text-zinc-700'}">Resolved ({taskStats.resolved})</button>
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
				{peopleService}
				showActions={true}
				isResolved={false}
				onResolveTask={handleResolveTask}
				onDeleteTask={handleDeleteTask}
			/>
		{:else}
			<HierarchicalTaskView
				tasks={filteredResolvedTasks}
				{peopleService}
				showActions={true}
				isResolved={true}
				onReactivateTask={handleReactivateTask}
				onDeleteTask={handleDeleteTask}
			/>
		{/if}
	</div>
</div>
