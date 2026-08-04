<script lang="ts">
	import { StickyNote, Edit, Trash2 } from '@lucide/svelte';
	import type { Task } from '../../types/task';
	import { peopleService, taskService } from '../../services/instances';
	import TaskModal from './TaskModal.svelte';

	interface Props {
		tasks: Task[];
		nodeId: string;
		projectSlug?: string;
		onTasksUpdated?: () => void;
	}

	let { tasks, nodeId, projectSlug, onTasksUpdated }: Props = $props();

	let editingTask = $state<Task | null>(null);
	let allPeople = $state<any[]>([]);

	// Load all people once for efficient lookup
	$effect(() => {
		(async () => {
			const result = peopleService.getAllPeople();
			allPeople = result instanceof Promise ? await result : result;
		})();
	});

	async function handleResolveTask(taskId: string) {
		try {
			console.log('TaskList: Starting to resolve task', { taskId, nodeId, projectSlug });
			const result = taskService.resolveTask(nodeId, taskId, projectSlug);
			if (result instanceof Promise) await result;
			console.log('TaskList: Task resolved successfully, calling onTasksUpdated');
			onTasksUpdated?.();
			console.log('TaskList: onTasksUpdated called');
		} catch (error) {
			console.error('Failed to resolve task:', error);
			alert('Failed to resolve task. Please try again.');
		}
	}

	async function handleReactivateTask(taskId: string) {
		try {
			const result = taskService.updateTask(
				nodeId,
				taskId,
				{ status: 'active' } as Partial<Task>,
				projectSlug
			);
			if (result instanceof Promise) await result;
			onTasksUpdated?.();
		} catch (error) {
			console.error('Failed to reactivate task:', error);
			alert('Failed to reactivate task. Please try again.');
		}
	}

	async function handleDeleteTask(taskId: string) {
		if (confirm('Are you sure you want to permanently delete this task?')) {
			try {
				const result = taskService.deleteTask(nodeId, taskId, projectSlug);
				if (result instanceof Promise) await result;
				onTasksUpdated?.();
			} catch (error) {
				console.error('Failed to delete task:', error);
				alert('Failed to delete task. Please try again.');
			}
		}
	}

	function handleEditTask(task: Task) {
		editingTask = task;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString();
	}

	function isOverdue(dueDate: string) {
		return new Date(dueDate) < new Date();
	}
</script>

<div class="space-y-3">
	{#each tasks as task}
		{@const person = allPeople.find((p) => p.id === task.assignee)}
		{@const overdue = task.dueDate && isOverdue(task.dueDate)}
		{@const isResolved = task.status === 'resolved'}
		
		<div class="group flex items-start gap-3 rounded-md py-2 {isResolved ? 'opacity-75' : ''}">
			<!-- Checkbox -->
			<div class="flex items-center pt-0.5">
				{#if isResolved}
					<button
						onclick={() => handleReactivateTask(task.id)}
						class="h-4 w-4 rounded border border-zinc-300 bg-green-500 hover:border-orange-500 hover:bg-orange-50 transition-colors"
						title="Reactivate task"
						aria-label="Reactivate task"
					></button>
				{:else}
					<button
						onclick={() => handleResolveTask(task.id)}
						class="h-4 w-4 rounded border border-zinc-300 hover:border-green-500 hover:bg-green-50 transition-colors"
						title="Mark as resolved"
						aria-label="Mark as resolved"
					></button>
				{/if}
			</div>

			<!-- Task content -->
			<div class="min-w-0 flex-1">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-sm text-zinc-900 text-balance {isResolved ? 'line-through opacity-60' : ''}">
						{task.title}
					</span>
					<!-- Action buttons -->
					<div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
						<button
							onclick={() => handleEditTask(task)}
							class="rounded p-1 text-zinc-400 hover:text-zinc-600"
							title="Edit task"
							aria-label="Edit task"
						>
							<Edit class="h-3 w-3" />
						</button>
						<button
							onclick={() => handleDeleteTask(task.id)}
							class="rounded p-1 text-zinc-400 hover:text-rose-500"
							title="Delete task"
							aria-label="Delete task"
						>
							<Trash2 class="h-3 w-3" />
						</button>
					</div>
				</div>

				<!-- Task meta info -->
				<div class="space-y-1 text-xs text-zinc-500">
					{#if task.dueDate}
						<div class="{overdue ? 'text-rose-500' : ''}">
							Due {formatDate(task.dueDate)}
							{#if overdue && !isResolved}
								<span class="text-rose-500">(Overdue)</span>
							{/if}
						</div>
					{/if}
					{#if task.notes}
						<div class="text-xs text-zinc-600 italic">"{task.notes}"</div>
					{/if}
					{#if person}
						<div class="flex items-center gap-1">
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
					{#if isResolved}
						<div class="text-green-600">Resolved</div>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>

<!-- Task Modal -->
{#if editingTask}
	<TaskModal
		task={editingTask}
		{nodeId}
		{projectSlug}
		onClose={() => (editingTask = null)}
		onTaskUpdated={() => {
			editingTask = null;
			onTasksUpdated?.();
		}}
	/>
{/if}
