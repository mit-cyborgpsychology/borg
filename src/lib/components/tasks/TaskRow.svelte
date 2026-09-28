<script lang="ts">
	import PersonAvatar from '../PersonAvatar.svelte';
	import { Loader2, Trash2, CalendarDays } from '@lucide/svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import type { Task } from '$lib/types/task';
	import { getAppServices } from '$lib/app/context';

	let {
		task,
		pending = false,
		disabled = false,
		compact = false,
		card = false,
		onToggle,
		onEdit,
		onDelete
	} = $props<{
		task: Task;
		pending?: boolean;
		disabled?: boolean;
		compact?: boolean;
		card?: boolean;
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
	class="group/task nodrag nopan flex items-start gap-1 rounded py-0.5 {card
		? ''
		: 'hover:bg-zinc-100/60'}"
	aria-busy={pending}
>
	<div class="relative flex h-7 w-7 shrink-0 items-center justify-center {card ? 'z-10' : ''}">
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
			class="block w-full rounded text-left font-sans leading-5 font-semibold text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-400 {compact
				? 'truncate text-xs'
				: 'text-sm break-words'} {card ? 'card-title' : ''} {done
				? 'text-zinc-400 line-through'
				: ''}">{task.title}</button
		>
		{#if !compact && ((!card && person) || date)}
			<div
				class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-zinc-500 {card
					? 'mt-2'
					: 'mt-1.5'}"
			>
				{#if person && !card}
					<span class="inline-flex max-w-full min-w-0 items-center gap-1.5" title={person.name}>
						<PersonAvatar name={person.name || 'Assignee'} photoUrl={person.photoUrl} />
						<span class="truncate"
							>{task.assignee === $authStore.user?.uid ? 'You' : person.name}</span
						>
					</span>
				{/if}
				{#if date}
					<span
						class="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 {overdue
							? 'bg-rose-50 text-rose-600'
							: 'bg-zinc-50 text-zinc-500'}"
						title={task.dueDate}
					>
						<CalendarDays class="h-3 w-3" />{date.toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric'
						})}
					</span>
				{/if}
			</div>
		{/if}
	</div>
	{#if compact && person}
		<div class="flex h-7 shrink-0 items-center pr-1">
			<PersonAvatar name={person.name || 'Assignee'} photoUrl={person.photoUrl} size="tiny" />
		</div>
	{/if}
	{#if onDelete && !compact}
		<button
			type="button"
			onclick={onDelete}
			{disabled}
			aria-label={`Delete ${task.title}`}
			class="{card
				? 'relative z-10'
				: ''} mt-1 rounded p-1 text-zinc-400 opacity-0 group-focus-within/task:opacity-100 group-hover/task:opacity-100 hover:text-red-600 focus-visible:opacity-100"
			><Trash2 class="h-3 w-3" /></button
		>
	{/if}
</div>

<style>
	/* Extend the title's native button hit area to the containing card. */
	.card-title::after {
		position: absolute;
		inset: 0;
		border-radius: 0.5rem;
		content: '';
		cursor: pointer;
	}

	.card-title:focus-visible {
		outline: none;
	}

	.card-title:focus-visible::after {
		outline: 2px solid var(--color-zinc-400);
		outline-offset: 2px;
	}

	.card-title:disabled::after {
		cursor: wait;
	}
</style>
