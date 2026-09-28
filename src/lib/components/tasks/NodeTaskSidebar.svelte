<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import { X, Plus, ChevronDown, ChevronRight } from '@lucide/svelte';
	import type { Task } from '../../types/task';
	import TaskList from './TaskList.svelte';
	import { onDestroy } from 'svelte';
	import { createResource } from '$lib/state/resource';
	import AsyncStatus from '../AsyncStatus.svelte';

	const { taskService } = getAppServices();
	interface Props {
		nodeId: string;
		nodeTitle: string;
		projectSlug?: string;
		tasks: Task[];
		onClose: () => void;
		onTasksUpdated?: () => void;
	}

	let { nodeId, nodeTitle, projectSlug, tasks, onClose, onTasksUpdated }: Props = $props();

	// Active tasks are passed as props
	const activeTasks = $derived(tasks);

	const resolvedResource = createResource<Task[]>([]);
	let resolvedTasks = $derived($resolvedResource.data);
	let showResolved = $state(false);
	onDestroy(() => resolvedResource.dispose());
	async function loadResolvedTasks() {
		const currentNode = nodeId;
		const currentProject = projectSlug;
		await resolvedResource.load(async () =>
			(await taskService.getResolvedTasks()).filter(
				(task) =>
					task.nodeId === currentNode && (!currentProject || task.projectSlug === currentProject)
			)
		);
	}
	$effect(() => {
		tasks;
		void loadResolvedTasks();
	});
</script>

<AsyncStatus state={$resolvedResource} onRetry={() => void loadResolvedTasks()} />

<div class="flex h-[calc(100vh-64px)] w-80 flex-col border-l border-zinc-200 bg-white">
	<!-- Sidebar Header -->
	<div class="border-b border-zinc-200 p-4">
		<div class="flex items-center justify-between">
			<div>
				<h3 class="font-semibold text-black">Node Tasks</h3>
				<p class="text-sm text-zinc-500">{nodeTitle}</p>
			</div>
			<button
				onclick={onClose}
				class="rounded-lg p-1 text-zinc-400 hover:bg-black hover:text-white"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
		<div class="mt-3 flex items-center justify-between">
			<div class="text-sm text-zinc-500">
				{activeTasks.length} active, {resolvedTasks.length} resolved
			</div>
			<button
				onclick={() => {
					canvasActions.addTask({ nodeId });
				}}
				class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-borg-beige px-3 py-1.5 text-xs text-black transition-colors hover:bg-black hover:text-white"
			>
				<Plus class="h-3 w-3" />
				Add Task
			</button>
		</div>
	</div>

	<!-- Task List -->
	<div class="flex-1 overflow-auto p-4">
		{#if activeTasks.length === 0 && resolvedTasks.length === 0}
			<div class="py-8 text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200"
				>
					<Plus class="h-6 w-6 text-zinc-600" />
				</div>
				<h4 class="mb-2 text-lg font-medium text-zinc-700">No tasks yet</h4>
				<p class="mb-4 text-sm text-zinc-500">Add your first task to get started</p>
				<button
					onclick={() => {
						canvasActions.addTask({ nodeId });
					}}
					class="rounded-lg border border-zinc-200 bg-borg-beige px-4 py-2 text-sm text-black transition-colors hover:bg-black hover:text-white"
				>
					Add Task
				</button>
			</div>
		{:else}
			<div class="space-y-4">
				<!-- Active Tasks -->
				{#if activeTasks.length > 0}
					<div>
						<h4 class="mb-2 text-sm font-medium text-zinc-700">Active Tasks</h4>
						<TaskList tasks={activeTasks} {nodeId} {projectSlug} {onTasksUpdated} />
					</div>
				{/if}

				<!-- Resolved Tasks -->
				{#if resolvedTasks.length > 0}
					<div class="border-t border-zinc-200 pt-4">
						<button
							onclick={() => (showResolved = !showResolved)}
							class="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-800"
						>
							{#if showResolved}
								<ChevronDown class="h-4 w-4" />
							{:else}
								<ChevronRight class="h-4 w-4" />
							{/if}
							Resolved Tasks ({resolvedTasks.length})
						</button>

						{#if showResolved}
							<div class="opacity-75">
								<TaskList tasks={resolvedTasks} {nodeId} {projectSlug} {onTasksUpdated} />
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
