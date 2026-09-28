<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createTaskFormState } from '../../features/tasks/createTaskFormState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import { X } from '@lucide/svelte';
	import type { Task } from '../../types/task';

	const { authStore, peopleService, taskService } = getAppServices();
	interface Props {
		nodeId: string;
		projectSlug?: string;
		task?: Task | undefined; // If provided, this is edit mode; if not, this is add mode
		onClose: () => void;
		onTaskUpdated?: () => void;
		onTaskAdded?: () => void;
	}

	let { nodeId, projectSlug, task, onClose, onTaskUpdated, onTaskAdded }: Props = $props();
	const feature = createTaskFormState(peopleService, taskService);
	const peopleResource = feature.people;
	const command = feature.command;
	let people = $derived($peopleResource.data);
	onMount(() => {
		void feature.loadPeople();
	});
	onDestroy(() => feature.dispose());

	// Determine if this is edit mode
	const isEditMode = $derived(!!task);
	const modalTitle = $derived(isEditMode ? 'Edit Task' : 'Add Task');
	const submitButtonText = $derived(isEditMode ? 'Save Changes' : 'Add Task');

	// Initialize form values
	let title = $state(task?.title || '');
	let assignee = $state(task?.assignee || (!task ? $authStore.user?.uid || '' : ''));
	let dueDate = $state(task?.dueDate || '');
	let notes = $state(task?.notes || '');
	let isLoading = $derived($command.status === 'loading');

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!title.trim()) return;

		const result = await feature.save(
			nodeId,
			projectSlug,
			{
				title: title.trim(),
				assignee: assignee || '',
				dueDate: dueDate.trim(),
				notes: notes.trim()
			},
			task?.id
		);
		if (result.ok) {
			if (task) onTaskUpdated?.();
			else onTaskAdded?.();
			onClose();
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

		<AsyncStatus state={$peopleResource} onRetry={() => void feature.loadPeople()} />
		<AsyncStatus state={$command} pendingLabel="Saving…" />
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
					class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-borg-orange px-4 py-2 text-white hover:bg-borg-orange disabled:cursor-not-allowed disabled:opacity-60"
				>
					{#if isLoading}
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
						Saving...
					{:else}
						{submitButtonText}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
