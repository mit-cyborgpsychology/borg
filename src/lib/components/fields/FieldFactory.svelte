<script lang="ts">
	import type { TemplateField } from '../../templates';
	import TextField from './TextField.svelte';
	import TextAreaField from './TextAreaField.svelte';
	import TagsField from './TagsField.svelte';
	import StatusField from './StatusField.svelte';
	import SelectField from './SelectField.svelte';
	import LinkField from './LinkField.svelte';
	import DateField from './DateField.svelte';
	import TimeField from './TimeField.svelte';
	import DateTimeField from './DateTimeField.svelte';
	import ButtonField from './ButtonField.svelte';
	import PeopleSelectorField from './PeopleSelectorField.svelte';
	import TimelineSelectorField from './TimelineSelectorField.svelte';
	import ColorPickerField from './ColorPickerField.svelte';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display',
		nodeData = undefined,
		countdownOnly = false,
		isProjectTitle = false
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
		nodeData?: any;
		countdownOnly?: boolean;
		isProjectTitle?: boolean;
	}>();
</script>

{#if field.type === 'text'}
	<TextField {field} bind:value {readonly} {mode} {isProjectTitle} />
{:else if field.type === 'textarea'}
	<TextAreaField {field} bind:value {readonly} {mode} />
{:else if field.type === 'tags'}
	<TagsField {field} bind:value {readonly} {mode} />
{:else if field.type === 'status'}
	<StatusField {field} bind:value {readonly} {mode} />
{:else if field.type === 'select'}
	<SelectField {field} bind:value {readonly} {mode} />
{:else if field.type === 'link'}
	<LinkField {field} bind:value {readonly} {mode} />
{:else if field.type === 'date'}
	<DateField {field} bind:value {readonly} {mode} />
{:else if field.type === 'time'}
	<TimeField {field} bind:value {readonly} {mode} />
{:else if field.type === 'datetime'}
	<DateTimeField {field} bind:value {readonly} {mode} />
{:else if field.type === 'button'}
	<ButtonField {field} bind:value {readonly} {mode} />
{:else if field.type === 'people-selector'}
	<PeopleSelectorField {field} bind:value {readonly} {mode} />
{:else if field.type === 'timeline-selector'}
	<TimelineSelectorField {field} bind:value {readonly} {mode} {countdownOnly} />
{:else if field.type === 'color-picker'}
	<ColorPickerField {field} bind:value {readonly} {mode} />
{:else}
	<!-- Fallback for unknown field types -->
	<div class="field-container">
		<span class="mb-1 block text-sm font-medium text-zinc-600">
			{field.label}
		</span>
		<div class="py-1 text-zinc-600">Unknown field type: {field.type}</div>
	</div>
{/if}