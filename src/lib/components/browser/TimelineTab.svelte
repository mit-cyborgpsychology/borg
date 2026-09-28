<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		CalendarPlus,
		CalendarDays,
		Flag,
		Banknote,
		Presentation,
		Trash2,
		Check
	} from '@lucide/svelte';
	import { createTimelineState } from '$lib/features/timeline/createTimelineState';
	import { getAppServices } from '$lib/app/context';
	import { getTimelineTemplate, timelineTemplates, type TimelineEvent } from '$lib/types/timeline';
	import { timelineMillis, timelineTimestamp, formatTimelineDate } from '$lib/utils/timelineDate';
	import TimelineEventEditor from './TimelineEventEditor.svelte';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	let { activeTab } = $props<{ activeTab: string }>();
	const feature = createTimelineState(getAppServices().createTimelineService());
	const resource = feature.list;
	const command = feature.command;
	onDestroy(() => feature.dispose());
	let now = $state(Date.now());
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 30000);
		return () => clearInterval(timer);
	});
	let futureOnly = $state(true);
	let typeFilter = $state('all');
	let editing = $state<TimelineEvent | undefined>();
	let creating = $state(false);
	let deleteId = $state<string | null>(null);
	let editor = $state<HTMLDivElement>();
	let newButton: HTMLButtonElement;
	let savedMessage = $state('');
	const icons = { event: CalendarDays, deadline: Flag, grant: Banknote, conference: Presentation };
	const events = $derived(
		$resource.data
			.filter(
				(event) =>
					(!futureOnly || timelineMillis(event) >= now) &&
					(typeFilter === 'all' || event.templateType === typeFilter)
			)
			.sort((a, b) => timelineMillis(a) - timelineMillis(b))
	);
	$effect(() => {
		if (activeTab === 'timeline' && $resource.status === 'idle') void feature.load();
	});
	async function open(event?: TimelineEvent) {
		if ($command.status === 'loading' || $resource.status === 'loading') return;
		editing = event;
		creating = !event;
		savedMessage = '';
		deleteId = null;
		await tick();
		editor?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	function close() {
		editing = undefined;
		creating = false;
		void tick().then(() => newButton?.focus({ preventScroll: true }));
	}
	async function add(type: string, data: Record<string, unknown>) {
		if ((await feature.add(type, data)).ok) {
			savedMessage = `${data.title} added to timeline`;
			close();
		}
	}
	async function update(id: string, type: string, data: Record<string, unknown>) {
		if ((await feature.update(id, type, data)).ok) {
			savedMessage = 'Event updated';
			close();
		}
	}
	async function remove(id: string) {
		if ((await feature.remove(id)).ok) {
			deleteId = null;
			if (editing?.id === id) close();
		}
	}
	function countdown(event: TimelineEvent) {
		const minutes = Math.ceil((timelineMillis(event) - now) / 60000);
		if (minutes <= 0) return 'Past';
		if (minutes < 60) return `${minutes}m left`;
		if (minutes < 1440) return `${Math.floor(minutes / 60)}h left`;
		return `${Math.floor(minutes / 1440)}d left`;
	}
</script>

<StatusOverlay><AsyncStatus state={$resource} onRetry={() => void feature.load()} /></StatusOverlay>
<div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
	<div class="min-h-0 flex-1 overflow-auto p-4">
		<div class="mx-auto max-w-3xl space-y-4">
		<button
			type="button"
			role="switch"
			aria-checked={futureOnly}
			onclick={() => (futureOnly = !futureOnly)}
			class="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs"
		>
			<span
				class="flex h-3.5 w-3.5 items-center justify-center rounded border {futureOnly
					? 'border-zinc-700 bg-zinc-700 text-white'
					: 'border-zinc-300'}"
				>{#if futureOnly}<Check class="h-3 w-3" />{/if}</span
			>Future only
		</button>
			{#if editing}
				<div bind:this={editor}>
					{#key editing?.id ?? 'new'}<TimelineEventEditor
							editingEvent={editing}
							onAdd={add}
							onUpdate={update}
							onClose={close}
							error={$command.error}
						/>{/key}
				</div>
			{/if}
			{#if savedMessage}<p role="status" class="flex items-center gap-2 text-xs text-zinc-600">
					<Check class="h-3.5 w-3.5" />{savedMessage}
				</p>{/if}
			{#if !creating && !editing}<AsyncStatus state={$command} pendingLabel="Saving…" />{/if}
			<div class="flex flex-wrap gap-1.5" aria-label="Filter event type">
				{#each [{ id: 'all', name: 'All' }, ...Object.values(timelineTemplates)] as type (type.id)}
					<button
						type="button"
						aria-pressed={typeFilter === type.id}
						onclick={() => (typeFilter = type.id)}
						class="rounded-full px-2.5 py-1 text-xs {typeFilter === type.id
							? 'bg-zinc-200 text-zinc-900'
							: 'text-zinc-500 hover:bg-zinc-100'}">{type.name}</button
					>
				{/each}
			</div>
			<div class="space-y-2">
				{#each events as event (event.id)}
					{@const template = getTimelineTemplate(event.templateType)}
					{@const Icon = icons[event.templateType as keyof typeof icons] || CalendarDays}
					<div
						class="min-h-16 rounded-lg border border-zinc-200 bg-white {timelineMillis(event) < now
							? 'opacity-60'
							: ''}"
					>
						<div class="flex items-center gap-2 pr-3">
							<button
								type="button"
								onclick={() => void open(event)}
								class="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-3 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-borg-blue"
							>
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
									style="background-color: {template.color}12; color: {template.color}"
									><Icon class="h-4 w-4" /></span
								>
								<span class="min-w-0 flex-1"
									><span class="block truncate font-sans text-sm font-semibold">{event.title}</span
									><span class="mt-0.5 block text-[11px] text-zinc-500"
										>{formatTimelineDate(timelineTimestamp(event))}</span
									></span
								>
								<span class="hidden shrink-0 text-xs text-zinc-500 sm:block"
									>{countdown(event)}</span
								>
							</button>
							<button
								type="button"
								aria-label="Delete {event.title}"
								disabled={$command.status === 'loading'}
								onclick={() => (deleteId = deleteId === event.id ? null : event.id)}
								class="rounded p-1 text-zinc-400 hover:text-red-600"
								><Trash2 class="h-3.5 w-3.5" /></button
							>
						</div>
						{#if deleteId === event.id}<div
								class="flex items-center justify-end gap-3 border-t border-zinc-100 p-3 text-xs"
							>
								<span>Delete event?</span><button
									type="button"
									disabled={$command.status === 'loading'}
									onclick={() => (deleteId = null)}>Keep</button
								><button
									type="button"
									disabled={$command.status === 'loading'}
									onclick={() => void remove(event.id)}
									class="text-red-700">Delete</button
								>
							</div>{/if}
					</div>
				{:else}
					{#if $resource.status === 'ready'}
						<div class="py-12 text-center">
							<CalendarDays class="mx-auto mb-3 h-7 w-7 text-zinc-300" />
							<p class="font-sans text-sm text-zinc-500">
								{futureOnly ? 'Nothing coming up yet' : 'No matching events'}
							</p>
						</div>
					{/if}
				{/each}
				{#if creating}
					<div bind:this={editor}>
						<TimelineEventEditor onAdd={add} onClose={close} error={$command.error} />
					</div>
				{:else}
					<button bind:this={newButton} type="button" onclick={() => void open()} disabled={$command.status === 'loading' || $resource.status === 'loading'}
						class="flex min-h-16 w-full items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-transparent p-3 text-left text-zinc-400 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-borg-blue disabled:opacity-50">
						<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-50"><CalendarPlus class="h-4 w-4" /></span>
						<span class="font-sans text-sm font-medium">New event</span>
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
