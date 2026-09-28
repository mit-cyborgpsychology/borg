<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { ChevronDown, ChevronRight } from '@lucide/svelte';
	import { createTaskCommands } from '$lib/features/tasks/createTaskCommands';
	import { getAppServices } from '$lib/app/context';
	import type { Task } from '$lib/types/task';
	import TaskEditor from './TaskEditor.svelte';
	import TaskRow from './TaskRow.svelte';
	import TaskComposer from './TaskComposer.svelte';

	let {
		tasks,
		nodeId,
		projectSlug,
		onTasksUpdated,
		compact = false,
		limit,
		onShowAll,
		onEdit
	} = $props<{
		tasks: Task[];
		nodeId: string;
		projectSlug?: string;
		onTasksUpdated?: () => void | Promise<void>;
		compact?: boolean;
		limit?: number;
		onShowAll?: () => void;
		onEdit?: (task: Task) => void;
	}>();
	const { taskService } = getAppServices();
	const commands = createTaskCommands(taskService, async () => onTasksUpdated?.());
	const command = commands.command;
	let active = $derived(tasks.filter((task: Task) => task.status !== 'resolved'));
	let completed = $derived(tasks.filter((task: Task) => task.status === 'resolved'));
	let visible = $derived(limit ? active.slice(0, limit) : active);
	let showCompleted = $state(false);
	let editingTask = $state<Task | null>(null);
	let pendingId = $state<string | null>(null);
	let lastCompleted = $state<Task | null>(null);
	let undoButton = $state<HTMLButtonElement>();
	let busy = $derived($command.status === 'loading');
	onDestroy(() => commands.dispose());

	async function toggle(task: Task) {
		if (busy) return;
		const focused = document.activeElement;
		const restore = task.status === 'resolved';
		pendingId = task.id;
		const context = { id: task.id, nodeId, projectSlug };
		const result = await (restore ? commands.reactivate(context) : commands.resolve(context));
		pendingId = null;
		if (result.ok) {
			lastCompleted = restore ? null : task;
			await tick();
			if (document.activeElement === focused || document.activeElement === document.body)
				undoButton?.focus({ preventScroll: true });
		}
	}
	async function remove(task: Task) {
		if (busy || !confirm('Delete this task permanently?')) return;
		pendingId = task.id;
		const result = await commands.remove({ id: task.id, nodeId, projectSlug });
		pendingId = null;
		if (result.ok && lastCompleted?.id === task.id) lastCompleted = null;
	}
	function edit(task: Task) {
		if (onEdit) onEdit(task);
		else editingTask = task;
	}
</script>

{#snippet taskCard(task: Task)}
	{#if editingTask?.id === task.id}
		<TaskEditor
			{task}
			{nodeId}
			{projectSlug}
			inline
			onClose={() => (editingTask = null)}
			onTaskUpdated={() => void onTasksUpdated?.()}
		/>
	{:else}
		<TaskRow
			{task}
			{compact}
			pending={pendingId === task.id}
			disabled={busy}
			onToggle={() => void toggle(task)}
			onEdit={() => edit(task)}
			onDelete={() => void remove(task)}
		/>
	{/if}
{/snippet}

<div class="nodrag nopan space-y-1">
	{#each visible as task (task.id)}
		{@render taskCard(task)}
	{/each}
	{#if active.length > visible.length && onShowAll}
		<button
			type="button"
			onclick={onShowAll}
			class="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-800"
			>+{active.length - visible.length} more</button
		>
	{/if}
	<TaskComposer {nodeId} {projectSlug} {onTasksUpdated} />
	{#if $command.error}<p role="alert" class="px-1 text-xs text-red-700">{$command.error}</p>{/if}
	{#if lastCompleted}
		<div
			role="status"
			class="flex items-center justify-between gap-2 px-2 py-1 text-xs text-zinc-500"
		>
			<span class="truncate" title={lastCompleted.title}>Done</span>
			<button
				bind:this={undoButton}
				type="button"
				disabled={busy}
				onclick={() => lastCompleted && void toggle({ ...lastCompleted, status: 'resolved' })}
				class="rounded underline underline-offset-2 hover:text-zinc-800">Undo</button
			>
		</div>
	{/if}
	{#if completed.length > 0}
		<button
			type="button"
			aria-expanded={showCompleted}
			onclick={() => (showCompleted = !showCompleted)}
			class="flex items-center gap-1 rounded px-1 py-1 text-xs text-zinc-400 hover:text-zinc-600"
		>
			{#if showCompleted}<ChevronDown class="h-3 w-3" />{:else}<ChevronRight class="h-3 w-3" />{/if}
			Completed · {completed.length}
		</button>
		{#if showCompleted}
			{#each completed as task (task.id)}
				{@render taskCard(task)}
			{/each}
		{/if}
	{/if}
</div>
