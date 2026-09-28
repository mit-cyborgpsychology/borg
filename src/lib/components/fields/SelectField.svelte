<script lang="ts">
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();

	// Initialize with default value if available
	$effect(() => {
		if (!value && field.defaultValue) {
			value = field.defaultValue;
		}
	});

	// Helper function to format timezone display names
	function formatTimezone(timezone: string): string {
		if (!timezone) return '';

		// The timezone is already in the format "-5 (Boston)" so just return as-is
		return timezone;
	}

	// Check if this field is for timezone selection (has timezone options)
	const isTimezoneField =
		field.id === 'timezone' ||
		field.label?.toLowerCase().includes('timezone') ||
		field.label?.toLowerCase().includes('tz');
</script>

<div class="field-container">
	<span class="mb-1 block text-sm font-medium text-zinc-600">
		{field.label}
	</span>

	<div class="space-y-2">
		{#if readonly || mode === 'display'}
			{#if value}
				<span
					class="inline-flex items-center rounded-full bg-black px-3 py-1 text-xs font-medium text-white"
				>
					{isTimezoneField ? formatTimezone(value) : value}
				</span>
			{:else}
				<div class="py-1 text-black">-</div>
			{/if}
		{:else if isTimezoneField}
			<!-- Dropdown for timezone selection -->
			<ChoicePicker
				label={field.label}
				bind:value
				options={(field.options || []).map((option: string) => ({
					value: option,
					label: formatTimezone(option)
				}))}
				disabled={readonly}
				placeholder="Choose timezone…"
			/>
		{:else}
			<!-- Button toggles for other select fields -->
			<div class="flex flex-wrap gap-2">
				{#each field.options || [] as option}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							value = value === option ? '' : option;
						}}
						class="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium transition-colors {value ===
						option
							? 'bg-black text-white'
							: 'bg-white text-black hover:bg-gray-100'}"
					>
						{option}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
