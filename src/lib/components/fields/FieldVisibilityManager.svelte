<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import type { TemplateField } from '../../templates';

	let { templateFields, nodeData = $bindable() } = $props<{
		templateFields: TemplateField[];
		nodeData: Record<string, any>;
	}>();

	function getFieldVisibility(field: TemplateField): boolean {
		return nodeData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true;
	}

	function toggleFieldVisibility(field: TemplateField) {
		nodeData = {
			...nodeData,
			fieldVisibility: { ...nodeData.fieldVisibility, [field.id]: !getFieldVisibility(field) }
		};
	}

	let displayFields = $derived(
		templateFields.filter((field: TemplateField) => !['status', 'viewMode'].includes(field.id))
	);
</script>

<div class="mt-4 border-t border-zinc-100 pt-3">
	<div class="mb-2 flex items-center justify-between">
		<h4 class="text-xs font-medium text-zinc-600">On canvas</h4>
	</div>

	{#if displayFields.length > 0}
		<div class="space-y-1">
			{#each displayFields as field}
				{@const isVisible = getFieldVisibility(field)}
				<div
					class="flex items-center justify-between rounded border border-zinc-100 bg-white px-2 py-1"
				>
					<div class="flex items-center gap-2">
						<span class="text-xs text-zinc-700">{field.label}</span>
					</div>
					<button
						onclick={() => toggleFieldVisibility(field)}
						class="rounded p-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400 {isVisible
							? 'text-zinc-600 hover:text-zinc-900'
							: 'text-zinc-500 hover:text-zinc-400'}"
						aria-pressed={isVisible}
						aria-label={`${isVisible ? 'Hide' : 'Show'} ${field.label} on canvas`}
						title={isVisible ? 'Hide on canvas' : 'Show on canvas'}
					>
						{#if isVisible}
							<Eye class="h-3 w-3" />
						{:else}
							<EyeOff class="h-3 w-3" />
						{/if}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
