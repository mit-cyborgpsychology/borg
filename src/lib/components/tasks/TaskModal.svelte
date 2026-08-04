<script lang="ts">
	import { X } from '@lucide/svelte';
	import { peopleService, taskService } from '../../services/instances';
	import type { Task } from '../../types/task';
	import { authStore } from '../../stores/authStore';

	interface Props {
		nodeId: string;
		projectSlug?: string;
		task?: Task | undefined; // If provided, this is edit mode; if not, this is add mode
		onClose: () => void;
		onTaskUpdated?: () => void;
		onTaskAdded?: () => void;
	}

	let { nodeId, projectSlug, task, onClose, onTaskUpdated, onTaskAdded }: Props = $props();
	let people = $state<any[]>([]);

	// Determine if this is edit mode
	const isEditMode = $derived(!!task);
	const modalTitle = $derived(isEditMode ? 'Edit Task' : 'Add Task');
	const submitButtonText = $derived(isEditMode ? 'Save Changes' : 'Add Task');

	// Load people on mount
	$effect(() => {
		(async () => {
			const result = peopleService.getAllPeople();
			people = result instanceof Promise ? await result : result;
		})();
	});

	// Initialize form values
	let title = $state(task?.title || '');
	let assignee = $state(task?.assignee || (!task ? $authStore.user?.uid || '' : ''));
	let dueDate = $state(task?.dueDate || '');
	let notes = $state(task?.notes || '');
	let isLoading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!title.trim()) return;

		isLoading = true;

		try {
			if (isEditMode && task) {
				// Edit mode - update existing task
				const updates: Partial<Task> = {
					title: title.trim(),
					assignee: assignee || '',
					dueDate: dueDate && dueDate.trim() ? dueDate.trim() : '',
					notes: notes && notes.trim() ? notes.trim() : ''
				};

				const result = taskService.updateTask(nodeId, task.id, updates, projectSlug);
				if (result instanceof Promise) await result;
				onTaskUpdated?.();
			} else {
				// Add mode - create new task
				const taskData: Omit<Task, 'id' | 'createdAt'> = {
					title: title.trim(),
					assignee: assignee || '',
					dueDate: dueDate && dueDate.trim() ? dueDate.trim() : '',
					notes: notes && notes.trim() ? notes.trim() : ''
				};

				const result = taskService.addTask(nodeId, taskData, projectSlug);
				if (result instanceof Promise) await result;
				onTaskAdded?.();
			}

			onClose();
		} catch (error) {
			console.error('Error saving task:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
	<div class="w-full max-w-md rounded-lg border border-zinc-200 bg-borg-beige p-6">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold text-black">{modalTitle}</h2>
			<button
				onclick={onClose}
				class="rounded-lg p-1 text-zinc-400 hover:bg-white hover:text-zinc-600"
			>
				<X class="h-5 w-5" />
			</button>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="title" class="mb-1 block text-sm font-medium text-zinc-600">
					Task Description *
				</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Enter task description..."
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-black placeholder-zinc-500 focus:ring-2 focus:ring-borg-blue focus:outline-none"
					disabled={isLoading}
					required
				/>
			</div>

			<div>
				<label for="assignee" class="mb-1 block text-sm font-medium text-zinc-600">
					Assign to
				</label>
				<select
					id="assignee"
					bind:value={assignee}
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-black focus:ring-2 focus:ring-borg-blue focus:outline-none"
					disabled={isLoading}
				>
					<option value="">Unassigned</option>
					{#each people as person}
						<option value={person.id}>{person.name}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="dueDate" class="mb-1 block text-sm font-medium text-zinc-600"> Due Date </label>
				<input
					id="dueDate"
					type="date"
					bind:value={dueDate}
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-black focus:ring-2 focus:ring-borg-blue focus:outline-none"
					disabled={isLoading}
				/>
			</div>

			<div>
				<label for="notes" class="mb-1 block text-sm font-medium text-zinc-600"> Notes </label>
				<textarea
					id="notes"
					bind:value={notes}
					rows="3"
					placeholder="Additional notes..."
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-black placeholder-zinc-500 focus:ring-2 focus:ring-borg-blue focus:outline-none"
					disabled={isLoading}
				></textarea>
			</div>

			<div class="flex gap-3 pt-4">
				<button
					type="button"
					onclick={onClose}
					disabled={isLoading}
					class="flex-1 rounded-lg bg-white px-4 py-2 text-black disabled:cursor-not-allowed disabled:opacity-60"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!title.trim() || isLoading}
					class="flex-1 rounded-lg bg-borg-orange px-4 py-2 text-white hover:bg-borg-orange disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
				>
					{#if isLoading}
						<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
						Saving...
					{:else}
						{submitButtonText}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
