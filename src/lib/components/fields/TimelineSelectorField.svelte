<script lang="ts">
	import { getAppServices } from '$lib/app/context';
	import type { TemplateField } from '../../templates';
	import AddTimelineEventModal from '../browser/AddTimelineEventModal.svelte';
	import { Plus } from '@lucide/svelte';

	const { createTimelineService } = getAppServices();
	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display',
		countdownOnly = false
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
		countdownOnly?: boolean;
	}>();

	// Services for synced data
	const timelineService = createTimelineService();

	// State for timeline data
	let allEvents = $state<any[]>([]);
	let eventsMap = $state<Map<string, any>>(new Map());
	let showAddModal = $state(false);

	// Helper function to create a proper Date object from timestamp
	function createEventDateTime(event: any): Date {
		if (event.timestamp) {
			return new Date(event.timestamp);
		}
		// Fallback for old events that might still have separate date/time fields
		if (event.date) {
			const dateOnly = new Date(event.date);
			if (event.time) {
				const [hours, minutes] = event.time.split(':').map(Number);
				dateOnly.setHours(hours, minutes, 0, 0);
			} else {
				dateOnly.setHours(23, 59, 59, 999);
			}
			return dateOnly;
		}
		return new Date();
	}

	// Helper function to format event datetime for display
	function formatEventDateTime(event: any): string {
		if (!event.timestamp && !event.date) return 'No date';

		// Extract timezone from timestamp if available
		if (event.timestamp && event.timestamp.includes('T')) {
			const timezoneMatch = event.timestamp.match(/([+-]\d{1,2}):\d{2}$/);
			const offset = timezoneMatch?.[1];
			const timezone =
				offset === '-5'
					? 'EST'
					: offset === '-4'
						? 'EDT'
						: offset === '-12'
							? 'AOE'
							: offset === '+0'
								? 'UTC'
								: `UTC${offset}`;

			// Parse the timestamp and format it directly to preserve the original timezone time
			const datePart = event.timestamp.split('T')[0];
			const timePart = event.timestamp.split('T')[1];
			const timeOnly = timePart.split(/[+-]/)[0];
			const timeComponents = timeOnly.split(':');
			const timeStr = `${timeComponents[0]}:${timeComponents[1]}`;

			// Parse the date components manually to avoid timezone conversion issues
			const [year, month, day] = datePart.split('-').map(Number);
			const dateStr = new Date(year, month - 1, day).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});

			return `${dateStr}, ${timeStr} (${timezone})`;
		}

		// Fallback for legacy events
		const eventDateTime = createEventDateTime(event);
		const dateStr = eventDateTime.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		const timeStr = eventDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

		return `${dateStr} at ${timeStr}`;
	}

	// Countdown calculation function
	function calculateCountdown(event: any): {
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
		}, 30000); // Update every 30 seconds

		// Cleanup interval on unmount
		return () => {
			if (countdownInterval) {
				clearInterval(countdownInterval);
			}
		};
	});

	// Load timeline data reactively
	$effect(() => {
		loadEvents();
	});

	async function loadEvents() {
		if (timelineService.getEventsSortedByDate) {
			const result = timelineService.getEventsSortedByDate();
			const events = await result;
			allEvents = events;

			// Create a map for quick lookup
			const map = new Map();
			events.forEach((event) => map.set(event.id, event));
			eventsMap = map;
		}
	}

	async function handleAddEvent(templateType: string, eventData: Record<string, any>) {
		const result = timelineService.addEvent(templateType, eventData);
		await result;
		await loadEvents(); // Reload events to get the new one
		showAddModal = false;

		// If this was successful, find the newly created event and select it
		const updatedResult = timelineService.getEventsSortedByDate();
		const updatedEvents = await updatedResult;
		const newEvent = updatedEvents.find(
			(e) =>
				e.title === eventData.title &&
				(e.timestamp === eventData.timestamp || (e as any).date === eventData.date)
		);
		if (newEvent) {
			value = newEvent.id;
		}
	}

	function handleCloseModal() {
		showAddModal = false;
	}
</script>

<div class="field-container">
	{#if !(countdownOnly && mode === 'display')}
		<label for="timeline-select-{field.id}" class="mb-1 block text-sm font-medium text-zinc-600">
			{field.label}
		</label>
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
						<div class="font-sanss mb-3 text-lg font-semibold text-black">{event.title}</div>
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
		<div class="flex gap-2">
			<select
				id="timeline-select-{field.id}"
				bind:value
				class="min-w-0 flex-1 rounded border border-zinc-700 bg-white px-3 py-2 text-black focus:border-borg-blue focus:outline-none"
			>
				<option value="">Select timeline event...</option>
				{#each allEvents as event}
					<option value={event.id}>
						{event.title} ({formatEventDateTime(event)}) - {event.templateType || 'Event'}
					</option>
				{/each}
			</select>
			<button
				type="button"
				onclick={() => (showAddModal = true)}
				class="flex flex-shrink-0 items-center gap-1 rounded border border-borg-blue bg-borg-blue px-2 py-2 text-white transition-colors hover:bg-blue-600"
				title="Add New Event"
			>
				<Plus class="h-4 w-4" />
				<span class="hidden text-sm lg:inline">New</span>
			</button>
		</div>
	{/if}
</div>

{#if showAddModal}
	<AddTimelineEventModal onAdd={handleAddEvent} onClose={handleCloseModal} />
{/if}
