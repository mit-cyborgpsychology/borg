<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import type { TemplateField, CustomField } from '../../templates';

	let {
		templateFields,
		customFields = $bindable(),
		nodeData = $bindable()
	} = $props<{
		templateFields: TemplateField[];
		customFields: (TemplateField | CustomField)[];
		nodeData: Record<string, any>;
	}>();

	function toggleFieldVisibility(fieldId: string, isCustom: boolean = false) {
		if (isCustom) {
			// Update custom field visibility
			const fieldIndex = customFields.findIndex((f: TemplateField | CustomField) => f.id === fieldId);
			if (fieldIndex !== -1) {
				const currentVisibility = customFields[fieldIndex].showInDisplay ?? true;
				customFields[fieldIndex].showInDisplay = !currentVisibility;
				customFields = [...customFields]; // Trigger reactivity
			}
		} else {
			// For template fields, store visibility in nodeData
			if (!nodeData.fieldVisibility) {
				nodeData.fieldVisibility = {};
			}
			// Get the template field to check its default
			const templateField = templateFields.find((f: TemplateField) => f.id === fieldId);
			const currentVisibility =
				nodeData.fieldVisibility[fieldId] ?? templateField?.showInDisplay ?? true;
			nodeData.fieldVisibility[fieldId] = !currentVisibility;
			nodeData = { ...nodeData }; // Trigger reactivity
		}
	}

	function getFieldVisibility(field: TemplateField, isCustom: boolean = false): boolean {
		if (isCustom) {
			// Custom fields: default to true if not explicitly set
			return field.showInDisplay ?? true;
		} else {
			// Template fields: check nodeData first, then field default, then true (except for title which is always true)
			return nodeData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true;
		}
	}

	let allFields = $derived([
		...templateFields
			.filter((f: TemplateField) => f.id !== 'status')
			.map((f: TemplateField) => ({ ...f, isCustom: false })),
		...customFields
			.filter((f: TemplateField | CustomField) => f.id !== 'status')
			.map((f: TemplateField | CustomField) => ({ ...f, isCustom: true }))
	]);
</script>

<div class="mt-4 border-t border-zinc-100 pt-3">
	<div class="mb-2 flex items-center justify-between">
		<h4 class="text-xs font-medium text-zinc-600">Field Visibility</h4>
	</div>

	{#if allFields.length > 0}
		<div class="space-y-1">
			{#each allFields as field}
				{@const isVisible = getFieldVisibility(field, field.isCustom)}
				<div
					class="flex items-center justify-between rounded border border-zinc-100 bg-white px-2 py-1"
				>
					<div class="flex items-center gap-2">
						<span class="text-xs text-zinc-700">{field.label}</span>
						{#if field.isCustom}
							<span class="rounded bg-borg-brown px-1 text-xs text-black">custom</span>
						{/if}
					</div>
					<button
						onclick={() => toggleFieldVisibility(field.id, field.isCustom)}
						class="flex items-center gap-1 text-xs transition-colors {isVisible
							? 'text-borg-green hover:text-borg-orange'
							: 'text-zinc-500 hover:text-zinc-400'}"
						aria-label={isVisible ? 'Hide field' : 'Show field'}
					>
						{#if isVisible}
							<Eye class="h-3 w-3" />
							<span>Visible</span>
						{:else}
							<EyeOff class="h-3 w-3" />
							<span>Hidden</span>
						{/if}
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
