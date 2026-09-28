<script lang="ts">
	import { untrack, onDestroy } from 'svelte';
	import { createTimelineState } from '$lib/features/timeline/createTimelineState';
	import type { TimelineEvent } from '$lib/types/timeline';
	import { timelineMillis, timelineTimestamp, formatTimelineDate } from '$lib/utils/timelineDate';
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import type { TemplateField } from '../../templates';
	import TimelineEventEditor from '../browser/TimelineEventEditor.svelte';
	import { Plus, CalendarDays, Flag, Banknote, Presentation } from '@lucide/svelte';
	const typeIcons = { event: CalendarDays, deadline: Flag, grant: Banknote, conference: Presentation };
	import { getTimelineTemplate } from '$lib/types/timeline';

	const { createTimelineService } = getAppServices();
	let {
		field,
		value = $bindable(''),
		readonly = false,
		mode = 'display',
		countdownOnly = false
	} = $props<{
		field: TemplateField;
		value: string;
		readonly?: boolean;
		mode?: 'display' | 'edit';
		countdownOnly?: boolean;
	}>();

	const feature = createTimelineState(createTimelineService());
	const resource = feature.list;
	const command = feature.command;
	const allEvents = $derived($resource.data);
	const eventsMap = $derived(new Map(allEvents.map((event) => [event.id, event])));
	let showEventEditor = $state(false);
	let futureOnly = $state(true);
	let now = $state(Date.now());
	const choices = $derived(
		allEvents
			.filter((event) => event.id === value || !futureOnly || timelineMillis(event) >= now)
			.sort((a, b) => timelineMillis(a) - timelineMillis(b))
			.map((event) => ({
				value: event.id,
				label: event.title,
				detail: formatTimelineDate(timelineTimestamp(event))
			}))
	);
	$effect(() => {
		const selectedId = value;
		untrack(() => {
			if ($resource.status === 'idle' || (selectedId && !eventsMap.has(selectedId)))
				void feature.load();
		});
	});
	onDestroy(() => feature.dispose());
	function createEventDateTime(event: TimelineEvent) {
		return new Date(timelineMillis(event));
	}
	function formatEventDateTime(event: TimelineEvent) {
		return formatTimelineDate(timelineTimestamp(event));
	}

	// Countdown calculation function
	function calculateCountdown(event: TimelineEvent): {
		days: number;
		hours: number;
		minutes: number;
		isOverdue: boolean;
	} {
		const now = new Date();
		const target = createEventDateTime(event);
		const diffMs = target.getTime() - now.getTime();

		if (diffMs <= 0) {
			return { days: 0, hours: 0, minutes: 0, isOverdue: true };
		}

		const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

		return { days, hours, minutes, isOverdue: false };
	}

	// Update countdown every 30 seconds for live updates
	let countdownRefreshKey = $state(0);
	let countdownInterval: ReturnType<typeof setInterval>;

	$effect(() => {
		// Start interval when component mounts
		countdownInterval = setInterval(() => {
			countdownRefreshKey++;
			now = Date.now();
		}, 30000); // Update every 30 seconds

		// Cleanup interval on unmount
		return () => {
			if (countdownInterval) {
				clearInterval(countdownInterval);
			}
		};
	});

	async function handleAddEvent(templateType: string, eventData: Record<string, unknown>) {
		const result = await feature.add(templateType, eventData);
		if (result.ok) {
			value = result.value.id;
			showEventEditor = false;
		}
	}

	function closeEditor() {
		showEventEditor = false;
	}
</script>

<div class="field-container">
	{#if !(countdownOnly && mode === 'display')}
		<span class="mb-1 block text-sm font-medium text-zinc-600">
			{field.label}
		</span>
	{/if}

	{#if mode === 'display'}
		{#if value}
			{@const event = eventsMap.get(value)}
			{#if event}
				{#if countdownOnly}
					<!-- Countdown-only mode: large, centered display -->
					{@const countdown = (() => {
						countdownRefreshKey;
						return calculateCountdown(event);
					})()}
					<div class="py-2 text-center">
						<div class="mb-3 font-sans text-lg font-semibold text-black">{event.title}</div>
						{#if countdown.isOverdue}
							<div class=" text-2xl font-bold text-indigo-600">🏁 ENDED!</div>
						{:else if countdown.days < 1}
							<!-- Less than 1 day: show hours and minutes only -->
							<div class="flex justify-center gap-4">
								<div class="flex flex-col items-center">
									<div class=" text-3xl font-bold text-orange-500">
										{countdown.hours.toString().padStart(2, '0')}
									</div>
									<div class="text-sm font-medium text-zinc-600">
										Hr{countdown.hours !== 1 ? 's' : ''}
									</div>
								</div>
								<div class="flex flex-col items-center">
									<div class=" text-3xl font-bold text-orange-500">
										{countdown.minutes.toString().padStart(2, '0')}
									</div>
									<div class="text-sm font-medium text-zinc-600">
										Min{countdown.minutes !== 1 ? 's' : ''}
									</div>
								</div>
							</div>
						{:else}
							<!-- More than 1 day: show days, hours, minutes -->
							<div class="flex justify-center gap-4">
								{#if countdown.days > 0}
									<div class="flex flex-col items-center">
										<div class=" text-3xl font-bold text-borg-blue">
											{countdown.days.toString().padStart(2, '0')}
										</div>
										<div class="text-sm font-medium text-zinc-600">
											Day{countdown.days !== 1 ? 's' : ''}
										</div>
									</div>
								{/if}
								{#if countdown.days > 0 || countdown.hours > 0}
									<div class="flex flex-col items-center">
										<div class=" text-3xl font-bold text-borg-blue">
											{countdown.hours.toString().padStart(2, '0')}
										</div>
										<div class="text-sm font-medium text-zinc-600">
											Hr{countdown.hours !== 1 ? 's' : ''}
										</div>
									</div>
								{/if}
								<div class="flex flex-col items-center">
									<div class=" text-3xl font-bold text-borg-blue">
										{countdown.minutes.toString().padStart(2, '0')}
									</div>
									<div class="text-sm font-medium text-zinc-600">
										Min{countdown.minutes !== 1 ? 's' : ''}
									</div>
								</div>
							</div>
						{/if}
						<div class="mt-3 text-center text-xs text-zinc-500">
							{formatEventDateTime(event)}
						</div>
					</div>
				{:else}
					<!-- Normal mode: standard display -->
					<div class="py-1 text-black">
						<div class="font-medium">{event.title}</div>
						<div class="text-sm text-zinc-600">
							{formatEventDateTime(event)} • {event.templateType || 'Event'}
						</div>
					</div>
				{/if}
			{:else}
				<div class="py-1 text-zinc-600">Event not found</div>
			{/if}
		{:else}
			<div class="py-1 text-zinc-600">No event selected</div>
		{/if}
	{:else}
		<AsyncStatus state={$resource} onRetry={() => void feature.load()} />
		<div class="space-y-2">
			<ChoicePicker
				label={field.label || 'Timeline event'}
				placeholder="Choose an event…"
				bind:value
				options={[{ value: '', label: 'No event' }, ...choices]}
				disabled={readonly}
			>
				{#snippet leading(id: string)}
					{@const event = eventsMap.get(id)}
					{#if event}
						{@const Icon = typeIcons[event.templateType as keyof typeof typeIcons] || CalendarDays}
						<Icon class="h-4 w-4 shrink-0" style="color: {getTimelineTemplate(event.templateType).color}" />
					{/if}
				{/snippet}
				<label
					class="flex items-center gap-2 border-b border-zinc-200 px-2 pb-3 text-xs text-zinc-600"
				>
					<input type="checkbox" role="switch" bind:checked={futureOnly} />Future only
				</label>
			</ChoicePicker>
			<button
				type="button"
				disabled={readonly}
				onclick={() => (showEventEditor = !showEventEditor)}
				aria-expanded={showEventEditor}
				class="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
				><Plus class="h-3.5 w-3.5" />New event</button
			>
		</div>
	{/if}
</div>

{#if showEventEditor}
	<div class="mt-3">
		<TimelineEventEditor error={$command.error} onAdd={handleAddEvent} onClose={closeEditor} />
	</div>
{/if}
