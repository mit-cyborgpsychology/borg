<script lang="ts">
	import { describeLink } from '$lib/features/links/linkNode';
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
	import { Lock, Unlock, Trash2, Plus } from '@lucide/svelte';

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
		await onSave(nodeId, { nodeData: dataToSave, data: { templateType: template.id } });
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
	const appearanceIds = new Set([
		'style',
		'backgroundColor',
		'textSize',
		'size',
		'width',
		'height',
		'rotation',
		'viewMode'
	]);
	let fieldGroups = $derived(
		[
			{
				title: 'Content',
				fields: template.fields.filter(
					(field) =>
						!appearanceIds.has(field.id) &&
						!['status', 'select', 'people-selector', 'tags'].includes(field.type)
				)
			},
			{
				title: 'Properties',
				fields: template.fields.filter(
					(field) =>
						!appearanceIds.has(field.id) &&
						['status', 'select', 'people-selector', 'tags'].includes(field.type)
				)
			},
			{
				title: 'Appearance',
				fields: template.fields.filter((field) => appearanceIds.has(field.id))
			}
		].filter((group) => group.fields.length > 0)
	);
</script>

<header class="shrink-0 border-b border-zinc-200 px-4 py-3">
	<div class="mb-2 flex items-center justify-between gap-3">
		<span class="flex items-center gap-2 font-mono text-xs font-medium text-zinc-500">
			<span class="h-2 w-2 rounded-sm" style:background-color={template.color}></span>
			{template.id === 'link' ? `Link · ${describeLink(editableData.url).label}` : template.name}
		</span>
		<button
			onclick={() => {
				editableData.locked = !editableData.locked;
			}}
			aria-label={editableData.locked ? 'Unlock node' : 'Lock node'}
			aria-pressed={!!editableData.locked}
			title={editableData.locked ? 'Unlock position' : 'Lock position'}
			class="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-500"
		>
			{#if editableData.locked}<Lock class="h-3.5 w-3.5" />{:else}<Unlock
					class="h-3.5 w-3.5"
				/>{/if}
		</button>
	</div>
	<div class="flex items-center justify-between gap-3">
		<h2 class="min-w-0 truncate font-sans text-sm font-semibold text-zinc-900">
			{editableData.title ||
				editableData.name ||
				(template.id === 'link' && describeLink(editableData.url).hostname) ||
				template.name}
		</h2>
		{#if isSaving && !error}
			<span role="status" class="shrink-0 font-mono text-[11px] text-zinc-400">Saving…</span>
		{/if}
	</div>
</header>

{#if error}<p role="alert" class="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
		{error}
	</p>{/if}

<div class="inspector-fields min-h-0 flex-1 overflow-y-auto overscroll-contain text-xs">
	{#each fieldGroups as group (group.title)}
		<section class="border-b border-zinc-200 px-4 py-4" aria-label={group.title}>
			<h3 class="mb-2 font-sans text-xs font-semibold text-zinc-900">{group.title}</h3>
			<div class="space-y-2.5">
				{#each group.fields as field (field.id)}
					<FieldRenderer
						{field}
						bind:value={editableData[field.id]}
						readonly={false}
						mode="edit"
						nodeData={editableData}
					/>
				{/each}
				{#if template.id === 'link' && group.title === 'Content' && editableData.url && !describeLink(editableData.url).url}
					<p role="status" class="text-xs text-amber-700">
						Enter a valid http or https web address.
					</p>
				{/if}
				{#if template.id === 'link' && group.title === 'Appearance' && editableData.viewMode === 'Iframe'}
					<p class="text-[11px] leading-relaxed text-zinc-500">
						Some websites block embedding. You can always open the link in a new tab.
					</p>
				{/if}
			</div>
			{#if isProjectMetadata && group.title === 'Content'}
				<p class="mt-3 text-[11px] leading-relaxed text-zinc-400">
					Changes are shared with the project.
				</p>
			{/if}
		</section>
	{/each}

	{#if templateType === 'time'}
		<section class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4">
			<div>
				<h3 class="font-sans text-xs font-semibold text-zinc-900">Countdown</h3>
				<p class="mt-1 text-[11px] text-zinc-400">Show the event name and time remaining</p>
			</div>
			<input
				type="checkbox"
				aria-label="Countdown mode"
				bind:checked={editableData.countdownMode}
				class="h-4 w-4 accent-blue-600"
			/>
		</section>
	{/if}

	{#if customFields.length > 0}
		<section class="border-b border-zinc-200 px-4 py-4" aria-label="Custom properties">
			<h3 class="mb-2 font-sans text-xs font-semibold text-zinc-900">Custom properties</h3>
			<div class="space-y-2.5">
				{#each customFields as field (field.id)}
					<FieldRenderer
						{field}
						bind:value={editableData[field.id]}
						readonly={false}
						mode="edit"
						nodeData={editableData}
					/>
				{/each}
			</div>
		</section>
	{/if}

	<section class="border-b border-zinc-200 px-4 py-4" aria-label="Add properties">
		{#if availableSuggestedFields.length > 0}
			<h3 class="mb-2 font-sans text-xs font-semibold text-zinc-900">Add properties</h3>
			<div class="mb-2.5 flex flex-wrap gap-1.5">
				{#each availableSuggestedFields as field (field.id)}
					<button
						onclick={() => addSuggestedField(field)}
						class="flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
						><Plus class="h-3 w-3" />{field.label}</button
					>
				{/each}
			</div>
		{/if}
		<div class="[&_h4]:font-sans [&>div]:mt-0 [&>div]:border-0 [&>div]:pt-0">
			<CustomFieldManager bind:customFields bind:nodeData={editableData} />
		</div>
	</section>
	<section class="border-b border-zinc-200 px-4 py-4" aria-label="Visible on canvas">
		<div class="[&_h4]:font-sans [&>div]:mt-0 [&>div]:border-0 [&>div]:pt-0">
			<FieldVisibilityManager
				templateFields={template.fields}
				bind:customFields
				bind:nodeData={editableData}
			/>
		</div>
	</section>
</div>

{#if templateType !== 'project'}
	<footer class="shrink-0 border-t border-zinc-200 px-4 py-2">
		<button
			onclick={handleDelete}
			class="flex items-center gap-2 rounded py-1.5 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600"
			><Trash2 class="h-3.5 w-3.5" />Delete node</button
		>
	</footer>
{/if}

<style>
	.inspector-fields :global(label),
	.inspector-fields :global(.field-container > span:first-child) {
		font-size: 11px;
		font-weight: 500;
		color: #71717a;
		margin-bottom: 4px;
	}
	.inspector-fields :global(input:not([type='checkbox'])),
	.inspector-fields :global(select),
	.inspector-fields :global(textarea) {
		font-size: 12px;
		padding: 6px 8px;
		border-color: #e4e4e7;
		border-radius: 6px;
		background-color: #fafafa;
	}
	.inspector-fields :global(input:focus),
	.inspector-fields :global(select:focus),
	.inspector-fields :global(textarea:focus) {
		border-color: #3b82f6;
		background-color: white;
	}
</style>
