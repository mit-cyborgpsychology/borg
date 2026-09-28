<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createTaskFormState } from '../../features/tasks/createTaskFormState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
	import PersonAvatar from '../PersonAvatar.svelte';
	import { X, Check, LoaderCircle } from '@lucide/svelte';
	import type { Task } from '../../types/task';

	const { authStore, peopleService, taskService } = getAppServices();
	let editor: HTMLElement;
	const inputId = $props.id();
	interface Props {
		nodeId: string;
		inline?: boolean;
		projectSlug?: string;
		task?: Task | undefined; // If provided, this is edit mode; if not, this is add mode
		onClose: () => void;
		onTaskUpdated?: () => void;
		onTaskAdded?: () => void;
	}

	let {
		nodeId,
		projectSlug,
		task,
		onClose,
		onTaskUpdated,
		onTaskAdded,
		inline = false
	}: Props = $props();
	const feature = createTaskFormState(peopleService, taskService);
	const peopleResource = feature.people;
	const command = feature.command;
	let people = $derived($peopleResource.data);
	onMount(() => {
		const previous = document.activeElement;
		editor.querySelector('input')?.focus();
		void feature.loadPeople();
		return () => {
			if (
				previous instanceof HTMLElement &&
				previous.isConnected &&
				(document.activeElement === document.body || editor.contains(document.activeElement))
			)
				previous.focus({ preventScroll: true });
		};
	});
	onDestroy(() => feature.dispose());

	// Determine if this is edit mode
	const isEditMode = $derived(!!task);
	const editorTitle = $derived(isEditMode ? 'Edit Task' : 'Add Task');
	const submitButtonText = $derived(isEditMode ? 'Save Changes' : 'Add Task');

	// Initialize form values
	let title = $state(task?.title || '');
	let assignee = $state(task?.assignee || (!task ? $authStore.user?.uid || '' : ''));
	let dueDate = $state(task?.dueDate || '');
	let notes = $state(task?.notes || '');
	let isLoading = $derived($command.status === 'loading');

	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (isLoading || !title.trim()) return;

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

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
	onkeydown={(event) => {
		if (event.key === 'Escape' && !isLoading) {
			event.stopPropagation();
			onClose();
		}
	}}
	bind:this={editor}
	aria-label={editorTitle}
	class="nodrag nopan rounded-lg border border-zinc-200 bg-white {inline ? 'p-3' : 'p-4'}"
>
	<form onsubmit={handleSubmit} class={inline ? 'space-y-3' : 'space-y-4'}>
		<div class="flex items-center justify-between gap-2">
			<span class="font-sans text-xs font-semibold text-zinc-500">{editorTitle}</span>
			<button
				type="button"
				onclick={onClose}
				disabled={isLoading}
				aria-label="Close task"
				class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
				><X class="h-4 w-4" /></button
			>
		</div>
		<input
			id={`${inputId}-title`}
			aria-label="Task"
			type="text"
			bind:value={title}
			placeholder="What needs to be done?"
			disabled={isLoading}
			required
			class="w-full border-0 bg-transparent font-sans {inline
				? 'text-sm'
				: 'text-xl'} font-semibold text-zinc-800 placeholder:text-zinc-300 focus:outline-none"
		/>

		<div class="flex flex-wrap items-start gap-4">
			<div class="min-w-0 flex-[1_1_12rem] space-y-2">
				<span class="block text-xs text-zinc-500">Assign to</span>
				<ChoicePicker
					label="Assign to"
					bind:value={assignee}
					disabled={isLoading}
					options={[
						{ value: '', label: 'Unassigned' },
						...people.map((person) => ({
							value: person.id,
							label: person.name,
							detail: person.email
						}))
					]}
				>
					{#snippet leading(id: string)}
						{@const person = people.find((person) => person.id === id)}
						{#if person}<PersonAvatar
								name={person.name || 'Assignee'}
								photoUrl={person.photoUrl}
							/>{/if}
					{/snippet}
				</ChoicePicker>
				<AsyncStatus state={$peopleResource} onRetry={() => void feature.loadPeople()} />
			</div>
			<div class="min-w-0 flex-[1_1_12rem] space-y-2">
				<label for={`${inputId}-dueDate`} class="block text-xs text-zinc-500">Due date</label>
				<input
					id={`${inputId}-dueDate`}
					type="date"
					bind:value={dueDate}
					disabled={isLoading}
					class="w-full min-w-0 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-700 focus:border-zinc-400 focus:outline-none"
				/>
			</div>
		</div>
		<div class="space-y-2">
			<label for={`${inputId}-notes`} class="block text-xs text-zinc-500">Notes</label>
			<textarea
				id={`${inputId}-notes`}
				bind:value={notes}
				rows="3"
				placeholder="Add a note…"
				disabled={isLoading}
				class="w-full resize-y rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs leading-5 text-zinc-800 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
			></textarea>
		</div>
		{#if $command.error}<p role="alert" class="text-xs text-red-700">{$command.error}</p>{/if}
		<div class="flex items-center gap-3">
			<button
				type="submit"
				disabled={!title.trim() || isLoading}
				class="flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white hover:bg-zinc-700 disabled:opacity-40"
			>
				{#if isLoading}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<Check
						class="h-3.5 w-3.5"
					/>{/if}
				{isLoading ? 'Saving…' : submitButtonText}
			</button>
			<button
				type="button"
				onclick={onClose}
				disabled={isLoading}
				class="rounded px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 disabled:opacity-40"
				>Cancel</button
			>
		</div>
	</form>
</section>
