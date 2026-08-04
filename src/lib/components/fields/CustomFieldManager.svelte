<script lang="ts">
	import { Plus, X } from '@lucide/svelte';
	import type { TemplateField, CustomField } from '../../templates';

	let { customFields = $bindable(), nodeData = $bindable() } = $props<{
		customFields: (TemplateField | CustomField)[];
		nodeData: Record<string, any>;
	}>();

	let showAddField = $state(false);
	let newFieldLabel = $state('');
	let newFieldType = $state<TemplateField['type']>('text');

	const fieldTypes = [
		{ value: 'text', label: 'Text' },
		{ value: 'textarea', label: 'Long Text' },
		{ value: 'date', label: 'Date' },
		{ value: 'link', label: 'Link' },
		{ value: 'tags', label: 'Tags' },
		{ value: 'status', label: 'Status' }
	] as const;

	function addCustomField() {
		if (!newFieldLabel.trim()) return;

		const fieldId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

		const newField: TemplateField = {
			id: fieldId,
			label: newFieldLabel.trim(),
			type: newFieldType,
			placeholder: `Enter ${newFieldLabel.toLowerCase()}...`,
			showInDisplay: true // Default to visible in display mode
		};

		// Add status options for status fields
		if (newFieldType === 'status') {
			newField.options = ['Not Started', 'In Progress', 'Completed'];
		}

		customFields = [...customFields, newField];

		// Initialize the field value in nodeData
		if (newFieldType === 'tags') {
			nodeData[fieldId] = [];
		} else {
			nodeData[fieldId] = '';
		}

		// Reset form
		newFieldLabel = '';
		newFieldType = 'text';
		showAddField = false;
	}

	function removeCustomField(fieldId: string) {
		customFields = customFields.filter((f: TemplateField | CustomField) => f.id !== fieldId);
		// Remove the field data
		delete nodeData[fieldId];
		nodeData = { ...nodeData }; // Trigger reactivity
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && newFieldLabel.trim()) {
			addCustomField();
		} else if (event.key === 'Escape') {
			showAddField = false;
			newFieldLabel = '';
			newFieldType = 'text';
		}
	}
</script>

<div class="mt-3 border-t border-zinc-100 pt-3">
	<div class="mb-2 flex items-center justify-between">
		<h4 class="text-xs font-medium text-zinc-600">Custom Fields</h4>
		<button
			onclick={() => (showAddField = !showAddField)}
			class="flex items-center gap-1 text-xs text-zinc-600 transition-colors hover:text-borg-blue"
		>
			<Plus class="h-3 w-3" />
			Add Field
		</button>
	</div>

	{#if showAddField}
		<div class="mb-3 rounded-lg border border-zinc-200 bg-borg-brown p-3">
			<div class="space-y-3">
				<div>
					<label class="mb-1 block text-xs font-medium text-zinc-300" for="custom-field-label">
						Field Label
					</label>
					<input
						id="custom-field-label"
						bind:value={newFieldLabel}
						type="text"
						placeholder="Enter field name..."
						onkeydown={handleKeyDown}
						class="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-black placeholder-zinc-500 focus:border-borg-blue focus:outline-none"
						autofocus
					/>
				</div>

				<div>
					<label class="mb-1 block text-xs font-medium text-black" for="custom-field-type">
						Field Type
					</label>
					<select
						id="custom-field-type"
						bind:value={newFieldType}
						class="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-black focus:border-borg-blue focus:outline-none"
					>
						{#each fieldTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
				</div>

				<div class="flex gap-2">
					<button
						onclick={addCustomField}
						disabled={!newFieldLabel.trim()}
						class="flex-1 rounded bg-black px-3 py-1 text-xs text-white transition-colors hover:bg-borg-blue disabled:cursor-not-allowed disabled:bg-zinc-600"
					>
						Add Field
					</button>
					<button
						onclick={() => {
							showAddField = false;
							newFieldLabel = '';
							newFieldType = 'text';
						}}
						class="rounded bg-zinc-600 px-3 py-1 text-xs text-white transition-colors hover:bg-zinc-500"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if customFields.length > 0}
		<div class="space-y-2">
			{#each customFields as field}
				<div
					class="box-shadow-black flex items-center justify-between rounded border border-zinc-200 bg-white px-2 py-1"
				>
					<span class="text-sm text-black">{field.label}</span>
					<div class="flex items-center gap-2">
						<span class="text-xs text-zinc-500 capitalize">{field.type}</span>
						<button
							onclick={() => removeCustomField(field.id)}
							class="text-zinc-500 transition-colors hover:text-red-400"
							aria-label="Remove field"
						>
							<X class="h-3 w-3" />
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
