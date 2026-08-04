<script lang="ts">
	import { X } from '@lucide/svelte';
	import { peopleService, taskService } from '../../services/instances';
	import type { TaskWithContext } from '../../types/task';

	interface Props {
		projectSlug: string;
		projectTasks: TaskWithContext[];
		onClose: () => void;
		onTasksUpdated?: () => void;
	}

	let { projectSlug, projectTasks, onClose, onTasksUpdated }: Props = $props();

	async function handleCompleteTask(task: TaskWithContext) {
		try {
			console.log('TaskSidebar: Starting to resolve task', { 
				taskId: task.id, 
				nodeId: task.nodeId, 
				projectSlug: task.projectSlug 
			});
			const result = taskService.resolveTask(task.nodeId, task.id, task.projectSlug);
			if (result instanceof Promise) await result;
			console.log('TaskSidebar: Task resolved successfully, calling onTasksUpdated');
			onTasksUpdated?.();
		} catch (error) {
			console.error('Failed to complete task:', error);
			alert('Failed to complete task. Please try again.');
		}
	}
	let allPeople = $state<any[]>([]);

	// Load all people once for efficient lookup
	$effect(() => {
		(async () => {
			const result = peopleService.getAllPeople();
			allPeople = result instanceof Promise ? await result : result;
		})();
	});
</script>

<div class="flex h-[calc(100vh-64px)] w-80 flex-col border-l border-zinc-200 bg-white">
	<!-- Sidebar Header -->
	<div class="border-b border-zinc-200 p-4">
		<div class="flex items-center justify-between">
			<h3 class="font-semibold text-black">Project Tasks</h3>
			<button
				onclick={onClose}
				class="rounded-lg p-1 text-zinc-400 hover:bg-black hover:text-white"
			>
				<X class="h-5 w-5" />
			</button>
		</div>
		{#if projectTasks}
			{@const activeTasks = projectTasks.filter((t) => (t.status || 'active') === 'active')}
			{@const resolvedTasks = projectTasks.filter((t) => t.status === 'resolved')}
			<p class="mt-1 text-sm text-zinc-500">
				{activeTasks.length} active, {resolvedTasks.length} resolved
			</p>
		{/if}
	</div>

	<!-- Task List -->
	<div class="flex-1 overflow-auto p-5">
		{#if projectTasks && projectTasks.length > 0}
			{@const activeTasks = projectTasks.filter((t) => (t.status || 'active') === 'active')}
			{@const tasksByNode = activeTasks.reduce(
				(acc, task) => {
					if (!acc[task.nodeId]) {
						acc[task.nodeId] = {
							nodeTitle: task.nodeTitle,
							nodeType: task.nodeType,
							tasks: []
						};
					}
					acc[task.nodeId].tasks.push(task);
					return acc;
				},
				{} as Record<string, { nodeTitle: string; nodeType: string; tasks: typeof activeTasks }>
			)}

			{#if activeTasks.length === 0}
				<div class="py-8 text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-borg-beige"
					>
						<X class="h-6 w-6 text-zinc-600" />
					</div>
					<h4 class="mb-2 text-lg font-medium text-black">No active tasks</h4>
					<p class="text-sm text-zinc-500">Add tasks to nodes to track progress</p>
				</div>
			{:else}
				<div class="space-y-6">
					{#each Object.entries(tasksByNode) as [, nodeData]}
						<div>
							<div class="mb-2 flex items-center gap-2">
								<h4 class="text-sm font-medium text-black">{nodeData.nodeTitle}</h4>
								<span
									class="rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-xs font-medium text-black"
								>
									{nodeData.nodeType}
								</span>
							</div>

							<div class="space-y-1">
								{#each nodeData.tasks as task}
									{@const person = allPeople.find((p) => p.id === task.assignee)}
									<div class="group flex items-start gap-3 rounded-md py-2">
										<!-- Checkbox -->
										<div class="flex items-center pt-0.5">
											<button
												onclick={(e) => {
													e.stopPropagation();
													handleCompleteTask(task);
												}}
												class="h-4 w-4 rounded border border-zinc-300 transition-colors hover:border-green-500 hover:bg-green-50"
												aria-label="Mark task as complete"
											></button>
										</div>

										<!-- Task content -->
										<div class="min-w-0 flex-1">
											<div class="mb-1">
												<h3 class="w-full text-sm text-balance text-zinc-900">
													{task.title}
												</h3>
											</div>

											<!-- Task meta info -->
											<div class="space-y-1 text-xs text-zinc-500">
												{#if task.dueDate}
													<div>Due {new Date(task.dueDate).toLocaleDateString()}</div>
												{/if}
												{#if task.notes}
													<div class="text-xs text-zinc-600 italic">"{task.notes}"</div>
												{/if}
												{#if person}
													<div class="mt-2 flex items-center gap-1">
														<span>{person.name?.split(' ')[0] || 'Unknown'}</span>
														{#if person.photoUrl}
															<img
																src={person.photoUrl}
																alt={person.name || 'Assignee'}
																class="h-3 w-3 rounded-full"
																title={person.name || 'Unassigned'}
																referrerpolicy="no-referrer"
															/>
														{/if}
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="py-8 text-center">
				<div
					class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-borg-beige"
				>
					<X class="h-6 w-6 text-zinc-600" />
				</div>
				<h4 class="mb-2 text-lg font-medium text-black">No tasks yet</h4>
				<p class="text-sm text-zinc-500">Add tasks to nodes to track progress</p>
			</div>
		{/if}
	</div>
</div>
