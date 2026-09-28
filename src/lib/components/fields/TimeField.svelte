<script lang="ts">
	import type { TemplateField } from '../../templates';
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
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
	const times = [
		'00:00',
		'09:00',
		'10:00',
		'11:00',
		'12:00',
		'13:00',
		'14:00',
		'15:00',
		'16:00',
		'17:00',
		'18:00',
		'23:59'
	];
</script>

<div class="w-full space-y-2">
	<span class="block text-xs text-zinc-500">{field.label}</span>
	{#if mode === 'edit'}
		<input
			type="text"
			aria-label={field.label}
			bind:value
			placeholder="HH:MM"
			pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
			disabled={readonly}
			class="w-full rounded-md border border-zinc-200 px-2.5 py-2 text-xs"
		/>
		<ChoicePicker
			label="Quick times"
			bind:value
			options={times.map((time) => ({ value: time, label: time }))}
			disabled={readonly}
		/>
	{:else if value}<span class="text-xs">{value}</span>{/if}
</div>
