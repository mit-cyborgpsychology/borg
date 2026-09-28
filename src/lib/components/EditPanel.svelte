<script lang="ts">
	import {
		getTemplate,
		getSuggestedFields,
		type NodeTemplate,
		type TemplateField,
		type CustomField
	} from '../templates';
	import FieldRenderer from './fields/FieldRenderer.svelte';
	import CustomFieldManager from './fields/CustomFieldManager.svelte';
	import FieldVisibilityManager from './fields/FieldVisibilityManager.svelte';
	import { Lock, Unlock } from '@lucide/svelte';

	let {
		nodeId,
		nodeData,
		templateType,
		onSave,
		onDelete,
		error = null
	} = $props<{
		nodeId: string;
		nodeData: any;
		templateType: string;
		onSave: (nodeId: string, data: any) => Promise<void>;
		onDelete: (nodeId: string) => void;
		error?: string | null;
	}>();

	let template: NodeTemplate = $derived(getTemplate(templateType || 'blank'));
	let editableData = $state({ ...nodeData });
	let customFields = $state<(TemplateField | CustomField)[]>([]);
	let isProjectMetadata = $derived(templateType === 'project');
	let suggestedFields = $derived(getSuggestedFields(templateType || 'blank'));

	// Reset data when node changes
	$effect(() => {
		if (nodeId && nodeData) {
			editableData = { ...nodeData };
			// Load custom fields from node data
			customFields = nodeData.customFields || [];
		}
	});

	// Autosave when data changes (excluding initial load)
	let hasInitialized = false;
	$effect(() => {
		// Track changes to editableData and customFields by JSON serializing them
		const dataSnapshot = JSON.stringify({ editableData, customFields });
		if (hasInitialized) {
			autoSave();
		} else if (editableData && customFields) {
			hasInitialized = true;
		}
	});

	async function handleSave() {
		// Include custom fields in the saved data
		const dataToSave = {
			...editableData,
			customFields: customFields
		};
		await onSave(nodeId, { nodeData: dataToSave });
	}

	function autoSave() {
		// Debounced autosave to avoid excessive saves
		if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
		isSaving = true;
		autoSaveTimeout = setTimeout(async () => {
			try {
				await handleSave();
			} finally {
				isSaving = false;
			}
		}, 800); // 800ms gives enough time to see the indicator
	}

	let autoSaveTimeout: ReturnType<typeof setTimeout>;
	let isSaving = $state(false);

	function handleDelete() {
		// Additional safety check for project nodes
		if (templateType === 'project') {
			alert('Project nodes cannot be deleted as they sync with workspace metadata.');
			return;
		}

		if (confirm('Are you sure you want to delete this node?')) {
			onDelete(nodeId);
		}
	}

	function addSuggestedField(suggestedField: TemplateField) {
		// Check if field already exists in custom fields
		const existsInCustom = customFields.some((field) => field.id === suggestedField.id);
		if (existsInCustom) return;

		// Check if field already exists in template fields
		const existsInTemplate = template.fields.some((field) => field.id === suggestedField.id);
		if (existsInTemplate) return;

		// Add the suggested field to custom fields
		customFields = [...customFields, { ...suggestedField, isCustom: true }];
	}

	// Get available suggested fields (not already added)
	let availableSuggestedFields = $derived(
		suggestedFields.filter((suggestedField) => {
			const existsInCustom = customFields.some((field) => field.id === suggestedField.id);
			const existsInTemplate = template.fields.some((field) => field.id === suggestedField.id);
			return !existsInCustom && !existsInTemplate;
		})
	);
</script>

{#if error}<p role="alert" class="px-4 py-2 text-sm text-red-700">{error}</p>{/if}

<!-- Header -->
<div class="border-b border-zinc-200 px-3 py-2">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span
				class="rounded border bg-white px-2 py-0.5 text-xs font-medium"
				style="border-color: {template.color};"
			>
				{template.name}
			</span>
			{#if isSaving}
				<span class="animate-pulse text-xs text-zinc-500">Saving...</span>
			{/if}
		</div>
		<button
			onclick={() => {
				editableData.locked = !editableData.locked;
			}}
			aria-label={editableData.locked ? 'Unlock node' : 'Lock node'}
			class="rounded p-1 transition-colors {editableData.locked
				? 'text-red-600 hover:bg-red-50'
				: 'text-zinc-400 hover:bg-zinc-100'}"
		>
			{#if editableData.locked}
				<Lock class="h-4 w-4" />
			{:else}
				<Unlock class="h-4 w-4" />
			{/if}
		</button>
	</div>
</div>

<!-- Content -->
<div
	class="flex-1 overflow-y-auto p-3 text-xs [&_input]:text-xs [&_label]:text-xs [&_select]:text-xs [&_textarea]:text-xs"
>
	<div class="space-y-3">
		{#each template.fields as field}
			<div>
				<FieldRenderer
					{field}
					bind:value={editableData[field.id]}
					readonly={false}
					mode="edit"
					nodeData={editableData}
				/>
				{#if isProjectMetadata && (field.id === 'title' || field.id === 'status')}
					<p class="mt-1 text-xs text-zinc-400">Syncs with project metadata</p>
				{/if}
			</div>
		{/each}

		<!-- Lock toggle for all nodes -->
		<div class="border-y border-zinc-100 py-3">
			<div class="flex items-center justify-between">
				<span class="text-xs font-medium text-zinc-600">Lock Position</span>
				<button
					type="button"
					class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none {editableData.locked
						? 'bg-red-500'
						: 'bg-gray-200'}"
					onclick={() => {
						editableData.locked = !editableData.locked;
					}}
				>
					<span class="sr-only">Toggle node lock</span>
					<span
						class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {editableData.locked
							? 'translate-x-4'
							: 'translate-x-0'}"
					></span>
				</button>
			</div>
		</div>

		<!-- Countdown toggle for timeline event nodes -->
		{#if templateType === 'time'}
			<div class="border-b border-zinc-100 pb-3">
				<div class="flex items-center justify-between">
					<div>
						<span class="text-xs font-medium text-zinc-600">Countdown Mode</span>
						<p class="text-xs text-zinc-400">Show name and countdown timer only</p>
					</div>
					<button
						type="button"
						class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none {editableData.countdownMode
							? 'bg-blue-500'
							: 'bg-gray-200'}"
						onclick={() => {
							editableData.countdownMode = !editableData.countdownMode;
						}}
					>
						<span class="sr-only">Toggle countdown mode</span>
						<span
							class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {editableData.countdownMode
								? 'translate-x-4'
								: 'translate-x-0'}"
						></span>
					</button>
				</div>
			</div>
		{/if}

		{#each customFields as field}
			<FieldRenderer
				{field}
				bind:value={editableData[field.id]}
				readonly={false}
				mode="edit"
				nodeData={editableData}
			/>
		{/each}

		<!-- Suggested Fields -->
		{#if availableSuggestedFields.length > 0}
			<div class="border-t border-zinc-100 pt-3">
				<h4 class="mb-2 text-xs font-medium text-zinc-500">Suggested Fields</h4>
				<div class="flex flex-wrap gap-1.5">
					{#each availableSuggestedFields as suggestedField}
						<button
							type="button"
							onclick={() => addSuggestedField(suggestedField)}
							class="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
						>
							<span>+</span>
							{suggestedField.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<CustomFieldManager bind:customFields bind:nodeData={editableData} />

		<FieldVisibilityManager
			templateFields={template.fields}
			bind:customFields
			bind:nodeData={editableData}
		/>
	</div>
</div>

<!-- Footer -->
{#if templateType !== 'project'}
	<div class="border-t border-zinc-100 p-3">
		<button
			onclick={handleDelete}
			class="w-full rounded border border-borg-orange px-3 py-1.5 text-xs font-medium text-borg-orange transition-colors hover:bg-borg-orange hover:text-white"
		>
			Delete Node
		</button>
	</div>
{/if}
