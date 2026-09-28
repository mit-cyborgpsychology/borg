<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarDays, Flag, Banknote, Presentation, Plus, X, Check } from '@lucide/svelte';
	import { timelineTemplates, getTimelineTemplate, type TimelineEvent } from '$lib/types/timeline';
	import { timelineTimestamp } from '$lib/utils/timelineDate';
	import FieldRenderer from '../fields/FieldRenderer.svelte';
	import DateTimeField from '../fields/DateTimeField.svelte';
	let {
		onAdd,
		onClose,
		editingEvent,
		onUpdate,
		error = null
	} = $props<{
		onAdd: (type: string, data: Record<string, unknown>) => Promise<void>;
		onClose: () => void;
		editingEvent?: TimelineEvent;
		onUpdate?: (id: string, type: string, data: Record<string, unknown>) => Promise<void>;
		error?: string | null;
	}>();
	let titleInput: HTMLInputElement;
	let selectedType = $state(editingEvent?.templateType || 'event');
	let busy = $state(false);
	let localError = $state('');
	let details = $state(false);
	let title = $state(editingEvent?.title || '');
	let timestamp = $state(editingEvent ? timelineTimestamp(editingEvent) : '');
	let data = $state<Record<string, unknown>>({ ...editingEvent?.eventData });
	const template = $derived(getTimelineTemplate(selectedType));
	const icons = { event: CalendarDays, deadline: Flag, grant: Banknote, conference: Presentation };
	const names: Record<string, string> = {
		event: 'Event',
		deadline: 'Deadline',
		grant: 'Grant',
		conference: 'Conference'
	};
	onMount(() => titleInput?.focus());
	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || !title.trim() || !Number.isFinite(Date.parse(timestamp))) return;
		busy = true;
		localError = '';
		try {
			const next = { ...data, title: title.trim(), timestamp };
			if (editingEvent && onUpdate) await onUpdate(editingEvent.id, selectedType, next);
			else await onAdd(selectedType, next);
		} catch (cause) {
			localError = cause instanceof Error ? cause.message : 'Could not save. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<section
	aria-label={editingEvent ? 'Edit event' : 'New event'}
	class="rounded-lg border border-zinc-200 bg-white text-zinc-800"
>
	<form onsubmit={save} class="space-y-4 p-4">
		<div class="flex items-center justify-between gap-2">
			<span class="font-sans text-xs font-semibold text-zinc-500"
				>{editingEvent ? 'Edit event' : 'Something to look forward to'}</span
			>
			<button
				type="button"
				disabled={busy}
				onclick={onClose}
				aria-label="Close event"
				class="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X class="h-4 w-4" /></button
			>
		</div>
		<input
			bind:this={titleInput}
			bind:value={title}
			aria-label="Event title"
			placeholder="What’s happening?"
			required
			disabled={busy}
			class="w-full border-0 bg-transparent font-sans text-xl font-semibold placeholder:text-zinc-300 focus:outline-none"
		/>
		<div class="flex flex-wrap gap-1.5" aria-label="Event type">
			{#each Object.values(timelineTemplates) as item (item.id)}
				{@const Icon = icons[item.id as keyof typeof icons] || CalendarDays}
				<button
					type="button"
					disabled={busy}
					aria-pressed={selectedType === item.id}
					onclick={() => (selectedType = item.id)}
					class="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors {selectedType ===
					item.id
						? 'border-zinc-400 bg-zinc-100'
						: 'border-zinc-200 hover:bg-zinc-50'}"
					><Icon class="h-3.5 w-3.5" style="color: {item.color}" />{names[item.id]}</button
				>
			{/each}
		</div>
		<DateTimeField
			field={{
				id: 'timestamp',
				label: selectedType === 'deadline' || selectedType === 'grant' ? 'Due' : 'When',
				type: 'datetime'
			}}
			bind:value={timestamp}
			readonly={busy}
			mode="edit"
		/>
		<button
			type="button"
			aria-expanded={details}
			onclick={() => (details = !details)}
			class="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
			><Plus class="h-3 w-3" />Details</button
		>
		{#if details}
			<div class="space-y-4 border-t border-zinc-100 pt-4">
				{#each template.fields.filter((field) => !['title', 'timestamp'].includes(field.id)) as field (field.id)}
					<FieldRenderer {field} bind:value={data[field.id]} readonly={busy} mode="edit" />
				{/each}
			</div>
		{/if}
		{#if error || localError}<p role="alert" class="text-xs text-red-700">
				{error || localError}
			</p>{/if}
		<button
			type="submit"
			disabled={busy || !title.trim() || !Number.isFinite(Date.parse(timestamp))}
			class="flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs text-white hover:bg-zinc-700 disabled:opacity-40"
			><Check class="h-3.5 w-3.5" />{busy
				? 'Saving…'
				: editingEvent
					? 'Save changes'
					: 'Add to timeline'}</button
		>
	</form>
</section>
