<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { TemplateField } from '../../templates';
	import FieldFactory from './FieldFactory.svelte';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display',
		nodeData = undefined,
		countdownOnly = false,
		isProjectTitle = false,
		actions
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
		nodeData?: any;
		countdownOnly?: boolean;
		isProjectTitle?: boolean;
		actions?: Snippet;
	}>();
</script>

{#snippet input()}
	<FieldFactory {field} bind:value {readonly} {mode} {nodeData} {countdownOnly} {isProjectTitle} />
{/snippet}

{#if mode === 'edit' && actions}
	<div class="field-with-actions relative">
		{@render input()}
		<div class="absolute top-0 right-0 flex items-center gap-1">{@render actions()}</div>
	</div>
{:else}
	{@render input()}
{/if}

<style>
	.field-with-actions :global(.field-container > label),
	.field-with-actions :global(.field-container > span:first-child) {
		min-height: 20px;
		padding-right: 3rem;
	}
</style>
