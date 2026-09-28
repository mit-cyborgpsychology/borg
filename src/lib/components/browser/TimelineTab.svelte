<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTimelineState } from '../../features/timeline/createTimelineState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import type { TimelineEvent } from '$lib/types/timeline';
	import AddTimelineEventModal from './AddTimelineEventModal.svelte';
	import { CalendarPlus, Calendar, DollarSign, Clock, Fish } from '@lucide/svelte';
	const timelineService = getAppServices().createTimelineService();

	const featureState = createTimelineState(timelineService);
	const resource = featureState.list;
	const command = featureState.command;
	onDestroy(() => featureState.dispose());

	let { activeTab } = $props<{
		activeTab: string;
	}>();

	let events = $derived($resource.data);
	let upcomingEvents = $state<TimelineEvent[]>([]);
	let pastEvents = $state<TimelineEvent[]>([]);
	let filteredUpcomingEvents = $state<TimelineEvent[]>([]);
	let filteredPastEvents = $state<TimelineEvent[]>([]);
	let showAddModal = $state(false);
	let editingEvent = $state<TimelineEvent | undefined>(undefined);
	let dataLoaded = $derived($resource.status !== 'idle');
	let selectedTab = $state<'upcoming' | 'past'>('upcoming');
	let selectedTypeFilter = $state<string>('all');

	// Lazy load data when tab becomes active
	$effect(() => {
		if (activeTab === 'timeline' && !dataLoaded) {
			loadEvents();
		}
	});

	async function loadEvents(force = false) {
		if (dataLoaded && !force) return; // Prevent duplicate loading unless forced

		await featureState.load();
	}

	$effect(() => {
		const allEvents = events;
		const now = new Date();

		// Split events into upcoming and past
		const upcoming: TimelineEvent[] = [];
		const past: TimelineEvent[] = [];

		allEvents.forEach((event: TimelineEvent) => {
			const eventDate = event.timestamp
				? new Date(event.timestamp)
				: (event as any).date
					? new Date((event as any).date)
					: new Date(0);
			if (eventDate >= now) {
				upcoming.push(event);
			} else {
				past.push(event);
			}
		});

		// Sort upcoming events by deadline (soonest first)
		upcomingEvents = upcoming.sort((a, b) => {
			const dateA = a.timestamp
				? new Date(a.timestamp)
				: (a as any).date
					? new Date((a as any).date)
					: new Date(0);
			const dateB = b.timestamp
				? new Date(b.timestamp)
				: (b as any).date
					? new Date((b as any).date)
					: new Date(0);
			return dateA.getTime() - dateB.getTime();
		});

		// Sort past events by deadline (most recent first)
		pastEvents = past.sort((a, b) => {
			const dateA = a.timestamp
				? new Date(a.timestamp)
				: (a as any).date
					? new Date((a as any).date)
					: new Date(0);
			const dateB = b.timestamp
				? new Date(b.timestamp)
				: (b as any).date
					? new Date((b as any).date)
					: new Date(0);
			return dateB.getTime() - dateA.getTime();
		});
	});

	// Apply type filter to events
	function applyTypeFilter() {
		if (selectedTypeFilter === 'all') {
			filteredUpcomingEvents = upcomingEvents;
			filteredPastEvents = pastEvents;
		} else {
			filteredUpcomingEvents = upcomingEvents.filter(
				(event) => event.templateType === selectedTypeFilter
			);
			filteredPastEvents = pastEvents.filter((event) => event.templateType === selectedTypeFilter);
		}
	}

	// React to filter changes
	$effect(() => {
		applyTypeFilter();
	});

	// Get unique template types from all events
	let availableTypes = $derived.by(() => {
		const types = new Set<string>();
		events.forEach((event) => types.add(event.templateType));
		return Array.from(types).map((type) => ({
			value: type,
			label: getTemplateInfo(type).name
		}));
	});

	async function handleAddEvent(templateType: string, eventData: Record<string, unknown>) {
		if ((await featureState.add(templateType, eventData)).ok) showAddModal = false;
	}

	async function handleUpdateEvent(
		id: string,
		templateType: string,
		eventData: Record<string, unknown>
	) {
		if ((await featureState.update(id, templateType, eventData)).ok) {
			showAddModal = false;
			editingEvent = undefined;
		}
	}

	function handleEditEvent(event: TimelineEvent) {
		editingEvent = event;
		showAddModal = true;
	}

	function handleCloseModal() {
		showAddModal = false;
		editingEvent = undefined;
	}

	async function handleDeleteEvent(id: string) {
		if (confirm('Are you sure you want to delete this event?')) {
			await featureState.remove(id);
		}
	}

	function formatDateTime(event: TimelineEvent) {
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
				day: 'numeric',
				year: 'numeric'
			});

			return `${dateStr} at ${timeStr} ${timezone}`;
		}

		// Fallback for legacy events
		const timestamp = event.timestamp || (event as any).date;
		if (timestamp && typeof timestamp === 'string' && timestamp.includes('T')) {
			// Handle ISO timestamps in fallback case
			const datePart = timestamp.split('T')[0];
			const [year, month, day] = datePart.split('-').map(Number);
			const date = new Date(year, month - 1, day);
			const dateStr = date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});

			// For time, we can use the original timestamp since time zones are handled correctly
			const originalDate = new Date(timestamp);
			const timeStr = originalDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

			return `${dateStr} at ${timeStr}`;
		} else {
			// Handle other date formats or create new date
			const date = timestamp ? new Date(timestamp) : new Date();
			const dateStr = date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
			const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

			return `${dateStr} at ${timeStr}`;
		}
	}

	function isUpcoming(event: TimelineEvent) {
		const eventDate = event.timestamp
			? new Date(event.timestamp)
			: (event as any).date
				? new Date((event as any).date)
				: new Date();
		return eventDate >= new Date();
	}

	function getTemplateInfo(templateType: string) {
		const template = timelineService.getTemplate(templateType);
		return {
			name: template.name,
			color: template.color,
			icon: template.icon
		};
	}

	function getTimeLeft(event: TimelineEvent): {
		days: number;
		hours: number;
		minutes: number;
		isOverdue: boolean;
		displayText: string;
	} {
		const now = new Date();
		const target = event.timestamp
			? new Date(event.timestamp)
			: (event as any).date
				? new Date((event as any).date)
				: new Date();

		const diffMs = target.getTime() - now.getTime();

		if (diffMs <= 0) {
			return { days: 0, hours: 0, minutes: 0, isOverdue: true, displayText: 'Past' };
		}

		const totalMinutes = Math.floor(diffMs / (1000 * 60));
		const days = Math.floor(totalMinutes / (24 * 60));
		const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
		const minutes = totalMinutes % 60;

		let displayText: string;
		if (days >= 1) {
			displayText = `${days} day${days !== 1 ? 's' : ''} left`;
		} else if (hours > 0) {
			displayText = `${hours}h ${minutes}m left`;
		} else {
			displayText = `${minutes}m left`;
		}

		return { days, hours, minutes, isOverdue: false, displayText };
	}

	function getTimeLeftColor(timeLeft: { days: number; hours: number; isOverdue: boolean }): string {
		if (timeLeft.isOverdue) return 'text-rose-500';
		if (timeLeft.days === 0) return 'text-rose-400'; // Same day - urgent
		if (timeLeft.days === 1) return 'text-orange-600'; // Tomorrow - warning
		if (timeLeft.days <= 7) return 'text-amber-500'; // Within a week - caution
		return 'text-borg-blue'; // More than a week - normal
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$command} pendingLabel="Saving…" />
	<AsyncStatus state={$resource} onRetry={() => void loadEvents(true)} />
</StatusOverlay>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Sticky single toolbar row -->
	<div
		class="flex w-full flex-shrink-0 items-center gap-2 border-b border-borg-brown bg-borg-beige px-4 py-2"
	>
		<div class="flex rounded border border-zinc-300 bg-white p-0.5">
			<button
				onclick={() => (selectedTab = 'upcoming')}
				class="rounded px-2.5 py-1 text-sm font-medium transition-colors {selectedTab === 'upcoming'
					? 'bg-zinc-100 text-zinc-800'
					: 'text-zinc-500 hover:text-zinc-700'}">Upcoming ({filteredUpcomingEvents.length})</button
			>
			<button
				onclick={() => (selectedTab = 'past')}
				class="rounded px-2.5 py-1 text-sm font-medium transition-colors {selectedTab === 'past'
					? 'bg-zinc-100 text-zinc-800'
					: 'text-zinc-500 hover:text-zinc-700'}">Past ({filteredPastEvents.length})</button
			>
		</div>
		<div class="flex-1"></div>
		<select
			bind:value={selectedTypeFilter}
			class="rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-600 focus:outline-none"
		>
			<option value="all">All Types</option>
			{#each availableTypes as type}
				<option value={type.value}>{type.label}</option>
			{/each}
		</select>
		<button
			onclick={() => (showAddModal = true)}
			class="flex items-center gap-1.5 rounded border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
		>
			<CalendarPlus class="h-3.5 w-3.5" />
			New Event
		</button>
	</div>

	<!-- Timeline Events -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if selectedTab === 'upcoming'}
			{@const currentEvents = filteredUpcomingEvents}
			{#if currentEvents.length === 0}
				<div class="flex h-64 flex-col items-center justify-center text-center">
					<Fish class="mb-4 h-8 w-8" />
					<h3 class="mb-2 text-lg font-medium text-black">No upcoming events</h3>
					<p class="mb-4 text-sm text-zinc-500">Add your first conference, deadline, or event</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each currentEvents as event}
						{@const template = getTemplateInfo(event.templateType)}
						{@const timeLeft = getTimeLeft(event)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 transition-colors hover:bg-borg-beige"
							onclick={() => handleEditEvent(event)}
						>
							<!-- Colored icon box -->
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded"
								style="background-color: {template.color}18; border: 1px solid {template.color}40;"
							>
								<svg
									class="h-4 w-4"
									style="color: {template.color}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									{#if template.icon === 'clock'}
										<Clock />
									{:else if template.icon === 'dollar-sign'}
										<DollarSign />
									{:else}
										<Calendar />
									{/if}
								</svg>
							</div>
							<!-- Content -->
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-zinc-800">{event.title}</p>
								<p class="text-xs text-zinc-400">{formatDateTime(event)}</p>
							</div>
							<!-- Right: type + countdown + delete -->
							<div class="flex flex-shrink-0 items-center gap-2">
								<span class="text-xs text-zinc-400">{template.name}</span>
								{#if !timeLeft.isOverdue}
									<span
										class="rounded px-1.5 py-0.5 text-xs font-medium {getTimeLeftColor(
											timeLeft
										)} bg-zinc-50">{timeLeft.displayText}</span
									>
								{/if}
								<button
									onclick={(e) => {
										e.stopPropagation();
										handleDeleteEvent(event.id);
									}}
									class="rounded p-1 text-zinc-300 transition-colors hover:text-red-400"
									aria-label="Delete event"
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			{@const currentEvents = filteredPastEvents}
			{#if currentEvents.length === 0}
				<div class="flex h-64 flex-col items-center justify-center text-center">
					<Fish class="mb-4 h-8 w-8" />
					<h3 class="mb-2 text-lg font-medium text-black">No past events</h3>
					<p class="mb-4 text-sm text-zinc-500">Past events will appear here</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each currentEvents as event}
						{@const template = getTemplateInfo(event.templateType)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-3 opacity-60 transition-colors hover:bg-borg-beige hover:opacity-100"
							onclick={() => handleEditEvent(event)}
						>
							<!-- Greyed icon box for past events -->
							<div
								class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50"
							>
								<svg
									class="h-4 w-4 text-zinc-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									{#if template.icon === 'clock'}
										<Clock />
									{:else if template.icon === 'dollar-sign'}
										<DollarSign />
									{:else}
										<Calendar />
									{/if}
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-zinc-600">{event.title}</p>
								<p class="text-xs text-zinc-400">{formatDateTime(event)}</p>
							</div>
							<div class="flex flex-shrink-0 items-center gap-2">
								<span class="text-xs text-zinc-400">{template.name}</span>
								<button
									onclick={(e) => {
										e.stopPropagation();
										handleDeleteEvent(event.id);
									}}
									class="rounded p-1 text-zinc-300 transition-colors hover:text-red-400"
									aria-label="Delete event"
								>
									<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if showAddModal}
	<AddTimelineEventModal
		error={$command.error}
		onAdd={handleAddEvent}
		onUpdate={handleUpdateEvent}
		onClose={handleCloseModal}
		{editingEvent}
	/>
{/if}
