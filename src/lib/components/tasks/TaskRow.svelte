<script lang="ts">
	import { Loader2, Trash2 } from '@lucide/svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import type { Task } from '$lib/types/task';
	import { getAppServices } from '$lib/app/context';

	let {
		task,
		pending = false,
		disabled = false,
		compact = false,
		onToggle,
		onEdit,
		onDelete
	} = $props<{
		task: Task;
		pending?: boolean;
		disabled?: boolean;
		compact?: boolean;
		onToggle: () => void;
		onEdit: () => void;
		onDelete?: () => void;
	}>();
	const { getPersonCached } = getAppServices().peopleCache;
	const { authStore } = getAppServices();
	let done = $derived(task.status === 'resolved');
	let person = $derived(task.assignee ? getPersonCached(task.assignee) : null);
	// Date-only task deadlines are local calendar days, not UTC timestamps.
	let date = $derived(task.dueDate ? new SvelteDate(`${task.dueDate}T00:00:00`) : null);
	let overdue = $derived(
		date && !done && date < new SvelteDate(new SvelteDate().setHours(0, 0, 0, 0))
	);
</script>

<div
	class="group/task nodrag nopan flex items-start gap-1 rounded py-0.5 hover:bg-zinc-100/60"
	aria-busy={pending}
>
	<div class="relative flex h-7 w-7 shrink-0 items-center justify-center">
		<input
			type="checkbox"
			checked={done}
			{disabled}
			onchange={(event) => {
				event.currentTarget.checked = done;
				onToggle();
			}}
			onkeydown={(event) => event.stopPropagation()}
			aria-label={`Mark ${task.title} as ${done ? 'not done' : 'done'}`}
			class="h-3.5 w-3.5 cursor-pointer accent-zinc-600 disabled:cursor-wait {pending
				? 'opacity-0'
				: ''}"
		/>
		{#if pending}<Loader2
				class="pointer-events-none absolute h-3.5 w-3.5 animate-spin text-zinc-400"
			/>{/if}
	</div>
	<div class="min-w-0 flex-1 py-1">
		<button
			type="button"
			onclick={onEdit}
			{disabled}
			aria-label={`Edit ${task.title}`}
			title={task.title}
			class="block w-full rounded text-left text-xs leading-5 text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-400 {compact
				? 'truncate'
				: 'break-words'} {done ? 'text-zinc-400 line-through' : ''}">{task.title}</button
		>
		{#if !compact && (person || date)}
			<div class="flex items-center gap-x-2 text-[11px] text-zinc-400">
				{#if person}<span class="truncate" title={person.name}
						>{task.assignee === $authStore.user?.uid ? 'You' : person.name?.split(' ')[0]}</span
					>{/if}
				{#if date}<span class="shrink-0" class:text-red-600={overdue} title={task.dueDate}
						>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span
					>{/if}
			</div>
		{/if}
	</div>
	{#if onDelete && !compact}
		<button
			type="button"
			onclick={onDelete}
			{disabled}
			aria-label={`Delete ${task.title}`}
			class="mt-1 rounded p-1 text-zinc-400 opacity-0 group-focus-within/task:opacity-100 group-hover/task:opacity-100 hover:text-red-600 focus-visible:opacity-100"
			><Trash2 class="h-3 w-3" /></button
		>
	{/if}
</div>
