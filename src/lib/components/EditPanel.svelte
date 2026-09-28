<script lang="ts">
	import {
		getTemplate,
		type NodeTemplate,
		type TemplateField,
		type CustomField
	} from '../templates';
	import FieldRenderer from './fields/FieldRenderer.svelte';
	import NodeDetails from './fields/NodeDetails.svelte';
	import FieldVisibilityToggle from './fields/FieldVisibilityToggle.svelte';
	import LinkSettings from './fields/LinkSettings.svelte';
	import InspectorTitle from './fields/InspectorTitle.svelte';
	import { describeLink } from '$lib/features/links/linkNode';
	import { Lock, Unlock, Trash2 } from '@lucide/svelte';

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

	function toggleFieldVisibility(field: TemplateField) {
		const visible = editableData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true;
		editableData = {
			...editableData,
			fieldVisibility: { ...editableData.fieldVisibility, [field.id]: !visible }
		};
	}

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
	let titleField = $derived(
		template.fields.find(
			(field: TemplateField) =>
				(field.id === 'title' || field.id === 'name') && field.type === 'text'
		)
	);
	let doneField = $derived(
		template.fields.find(
			(field: TemplateField) =>
				field.id === 'status' &&
				field.type === 'status' &&
				field.options?.length === 1 &&
				field.options[0] === 'Done'
		)
	);
	let isDone = $derived(editableData.status === 'Done');
	let genericFields = $derived(
		template.fields.filter(
			(field: TemplateField) =>
				field.id !== titleField?.id &&
				field.id !== doneField?.id &&
				(template.id !== 'link' || !['url', 'description', 'viewMode'].includes(field.id))
		)
	);
	let fieldGroups = $derived(
		[
			{
				title: 'Content',
				fields: genericFields.filter(
					(field) =>
						!appearanceIds.has(field.id) &&
						!['status', 'select', 'people-selector', 'tags'].includes(field.type)
				)
			},
			{
				title: 'Properties',
				fields: genericFields.filter(
					(field) =>
						!appearanceIds.has(field.id) &&
						['status', 'select', 'people-selector', 'tags'].includes(field.type)
				)
			},
			{
				title: 'Appearance',
				fields: genericFields.filter((field) => appearanceIds.has(field.id))
			}
		].filter((group) => group.fields.length > 0)
	);
</script>

{#snippet fieldVisibility(field: TemplateField)}
	<FieldVisibilityToggle
		label={field.label}
		visible={editableData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true}
		ontoggle={() => toggleFieldVisibility(field)}
	/>
{/snippet}

<header class="shrink-0 border-b border-zinc-200 px-4 py-3">
	{#if titleField && (template.id !== 'link' || editableData.title || describeLink(editableData.url).url)}
		<div class="mb-2 flex items-start gap-2">
			<div class="min-w-0 flex-1">
				{#key nodeId}
					<InspectorTitle
						bind:value={editableData[titleField.id]}
						fallback={template.id === 'link'
							? describeLink(editableData.url).providerName || 'Link'
							: template.name}
						automatic={template.id === 'link'}
					/>
				{/key}
			</div>
			<div class="pt-1">{@render fieldVisibility(titleField)}</div>
		</div>
	{/if}
	<div class="flex items-center justify-between gap-3">
		<span class=" flex items-center gap-2 text-xs font-medium text-zinc-500">
			<span class="h-2 w-2 rounded-sm" style:background-color={template.color}></span>
			{template.name}
		</span>
		<div class="flex shrink-0 items-center gap-2">
			{#if isSaving && !error}
				<span role="status" class=" text-[11px] text-zinc-400">Saving…</span>
			{/if}
			{#if doneField}
				<button
					type="button"
					role="switch"
					aria-label="Done"
					aria-checked={isDone}
					title={isDone ? 'Mark as not done' : 'Mark as done'}
					onclick={() => (editableData.status = isDone ? '' : 'Done')}
					class="flex items-center gap-1.5 rounded py-1 text-xs text-zinc-500 focus-visible:outline-2 focus-visible:outline-zinc-400"
				>
					<span>Done</span>
					<span
						aria-hidden="true"
						class="inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors {isDone
							? 'bg-zinc-700'
							: 'bg-zinc-200'}"
					>
						<span
							class="h-3 w-3 rounded-full bg-white shadow-sm transition-transform {isDone
								? 'translate-x-3'
								: 'translate-x-0'}"
						></span>
					</span>
				</button>
			{/if}
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
	</div>
</header>

{#if error}<p role="alert" class="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
		{error}
	</p>{/if}

<div class="inspector-fields min-h-0 flex-1 overflow-y-auto overscroll-contain text-xs">
	{#if template.id === 'link'}
		{#key nodeId}
			<LinkSettings bind:value={editableData} bind:fields={customFields}>
				{#snippet fieldActions(id: string)}
					{@const field = template.fields.find((field: TemplateField) => field.id === id)}
					{#if field}{@render fieldVisibility(field)}{/if}
				{/snippet}
			</LinkSettings>
		{/key}
	{/if}
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
					>
						{#snippet actions()}
							{#if field.id !== 'status' && !appearanceIds.has(field.id)}
								{@render fieldVisibility(field)}
							{/if}
						{/snippet}
					</FieldRenderer>
				{/each}
			</div>
		</section>
	{/each}

	{#if templateType === 'time'}
		<section class="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-4">
			<div>
				<h3 class="font-sans text-xs font-semibold text-zinc-900">Countdown</h3>
			</div>
			<input
				type="checkbox"
				aria-label="Countdown mode"
				title="Show the event name and time remaining"
				bind:checked={editableData.countdownMode}
				class="h-4 w-4 accent-blue-600"
			/>
		</section>
	{/if}

	{#key nodeId}
		<NodeDetails
			bind:fields={customFields}
			bind:data={editableData}
			templateFields={template.fields}
			hideLinks={template.id === 'link'}
		/>
	{/key}
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
