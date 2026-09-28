<script lang="ts">
	import { onMount } from 'svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import type { TemplateField } from '../../templates';
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
	import { easternOffset, formatTimelineDate, localDateString } from '$lib/utils/timelineDate';
	let {
		field,
		value = $bindable(''),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: string;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();
	let dateValue = $state(value?.slice(0, 10) || dayFromToday(1));
	let timeValue = $state(value?.includes('T') ? value.slice(11, 16) : '09:00');
	let timezone = $state(value?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || 'ET');
	const offsets = $derived([
		{ value: 'ET', label: 'Eastern time', detail: 'Adjusts for daylight saving' },
		{ value: '-12:00', label: 'Anywhere on Earth (AOE)' },
		{ value: 'Z', label: 'UTC' },
		...(!['ET', '-12:00', 'Z'].includes(timezone)
			? [{ value: timezone, label: `UTC${timezone}` }]
			: [])
	]);
	function update() {
		if (!dateValue || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeValue)) {
			value = '';
			return;
		}
		value = `${dateValue}T${timeValue}${timezone === 'ET' ? easternOffset(dateValue, timeValue) : timezone}`;
	}
	function dayFromToday(days: number) {
		const date = new SvelteDate();
		date.setDate(date.getDate() + days);
		return localDateString(date);
	}
	function quickDate(days: number) {
		dateValue = dayFromToday(days);
		update();
	}

	onMount(() => {
		if (!value && mode === 'edit' && !readonly) update();
	});
</script>

<div class="w-full space-y-2">
	{#if mode === 'edit'}
		<span class="block text-xs text-zinc-500">{field.label}</span>
		<div class="flex flex-wrap gap-1.5">
			{#each [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'Next week', days: 7 }] as day (day.days)}
				<button
					type="button"
					disabled={readonly}
					onclick={() => quickDate(day.days)}
					aria-pressed={dateValue === dayFromToday(day.days)}
					class="rounded-full border border-zinc-200 px-2.5 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 {dateValue ===
					dayFromToday(day.days)
						? 'bg-zinc-100'
						: ''}">{day.label}</button
				>
			{/each}
		</div>
		<div class="flex flex-wrap gap-2">
			<input
				type="date"
				aria-label={field.label}
				value={dateValue}
				oninput={(event) => {
					dateValue = event.currentTarget.value;
					update();
				}}
				disabled={readonly}
				required
				class="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs"
			/>
			<input
				type="text"
				inputmode="numeric"
				aria-label="Time (24-hour)"
				placeholder="09:00"
				pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
				value={timeValue}
				oninput={(event) => {
					timeValue = event.currentTarget.value;
					update();
				}}
				disabled={readonly}
				required
				class="w-20 rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs"
			/>
		</div>
		<div class="flex flex-wrap gap-1">
			{#each ['09:00', '12:00', '17:00', '23:59'] as time (time)}
				<button
					type="button"
					disabled={readonly}
					aria-pressed={timeValue === time}
					onclick={() => {
						timeValue = time;
						update();
					}}
					class="rounded px-2 py-1 text-[11px] hover:bg-zinc-100 {timeValue === time
						? 'bg-zinc-100 text-zinc-900'
						: 'text-zinc-500'}">{time}</button
				>
			{/each}
		</div>
		<ChoicePicker
			label="Timezone"
			value={timezone}
			options={offsets}
			disabled={readonly}
			onchange={(next) => {
				timezone = next;
				update();
			}}
		/>
	{:else if value}<p class="text-xs text-zinc-600">{formatTimelineDate(value)}</p>{/if}
</div>
