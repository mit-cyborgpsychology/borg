<script lang="ts">
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: string;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();

	// Initialize with default value if available
	$effect(() => {
		if (!value && field.defaultValue) {
			value = field.defaultValue;
		}
	});

	// Common time options for quick selection
	const timeOptions = [
		'09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
	];

	let showTimeOptions = $state(false);
	let timeInput: HTMLInputElement = $state()!;

	function selectTime(time: string) {
		value = time;
		showTimeOptions = false;
		timeInput?.focus();
	}
</script>

<div class="field-container">
	{#if mode === 'edit'}
		<label class="mb-1 block text-sm font-medium text-zinc-600" for={field.id}>
			{field.label}
		</label>
		<div class="relative">
			<input
				bind:this={timeInput}
				id={field.id}
				type="time"
				bind:value
				placeholder={field.placeholder}
				disabled={readonly}
				onfocus={() => showTimeOptions = true}
				onblur={() => setTimeout(() => showTimeOptions = false, 150)}
				class="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100"
			/>
			{#if showTimeOptions && !readonly}
				<div class="absolute top-full left-0 right-0 z-10 mt-1 max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white shadow-lg">
					{#each timeOptions as time}
						<button
							type="button"
							onclick={() => selectTime(time)}
							class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 focus:bg-gray-100"
						>
							{time}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{:else if value}
		<div class="flex items-center gap-2">
			<span class="text-sm font-medium text-zinc-600">{field.label}:</span>
			<span class="text-sm text-zinc-900">{value}</span>
		</div>
	{/if}
</div>

<style>
	.field-container {
		width: 100%;
	}
</style>