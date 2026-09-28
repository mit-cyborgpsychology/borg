<script lang="ts">
	import { describeLink } from '$lib/features/links/linkNode';
	import { hasDetailValue } from '$lib/features/canvas/nodeDetails';
	import FieldRenderer from '../../fields/FieldRenderer.svelte';
	import TitleEditor from './TitleEditor.svelte';
	import SecondaryLinks from './SecondaryLinks.svelte';
	import type { NodeTemplate, TemplateField } from '../../../templates';

	let {
		template,
		nodeData,
		templateType,
		isEditingTitle = $bindable(),
		onTitleSave,
		onNodeClick,
		isBeingEdited = false
	} = $props<{
		template: NodeTemplate;
		nodeData: any;
		templateType: string;
		isEditingTitle: boolean;
		onTitleSave: (title: string) => void;
		onNodeClick?: () => void;
		isBeingEdited?: boolean;
	}>();

	// Cards lead with content; the editor keeps URL first for pasting a link.
	let displayFields = $derived(
		template.id === 'link'
			? [
					...template.fields.filter((field: TemplateField) => field.id !== 'url'),
					...template.fields.filter((field: TemplateField) => field.id === 'url')
				]
			: template.fields
	);

	function handleNodeClick() {
		if (onNodeClick) {
			onNodeClick();
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div onclick={handleNodeClick}>
	<!-- Node Content -->
	{#if nodeData.countdownMode && template.id === 'time'}
		<!-- Countdown-only mode: show only event name and countdown -->
		{@const eventField = template.fields.find((f: TemplateField) => f.type === 'timeline-selector')}
		{#if eventField}
			<div class="space-y-3">
				<FieldRenderer
					field={eventField}
					value={nodeData[eventField.id]}
					readonly={true}
					mode="display"
					{nodeData}
					countdownOnly={true}
				/>
			</div>
		{/if}
	{:else}
		<!-- Normal mode: show all fields -->
		<div class={template.id === 'project' ? 'mt-2 space-y-3' : 'space-y-2'}>
			{#each displayFields as field}
				{@const isVisible = nodeData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true}
				{#if field.id !== 'status' && isVisible}
					{#if template.id === 'link' && field.id === 'url'}
						{@const link = describeLink(nodeData.url)}
						{#if link.url}
							<FieldRenderer
								field={{ ...field, label: link.providerName }}
								value={link.url}
								readonly={true}
								mode="display"
								{nodeData}
							/>
						{:else}
							<p class="font-sans text-xs text-zinc-400">
								{nodeData.url ? 'Enter a valid web address' : 'Add a URL in the sidebar'}
							</p>
						{/if}
					{:else if template.id === 'link' && field.id === 'description'}
						{#if typeof nodeData.description === 'string' && nodeData.description.trim()}
							<p class="text-sm whitespace-pre-wrap text-zinc-600">{nodeData.description}</p>
						{/if}
					{:else if field.id === 'title'}
						<TitleEditor
							{nodeData}
							fallbackTitle={template.id === 'link'
								? describeLink(nodeData.url).providerName || 'Add a link'
								: 'Untitled'}
							bind:isEditingTitle
							onSave={onTitleSave}
							isProjectNode={templateType === 'project'}
							{isBeingEdited}
						/>
					{:else}
						<FieldRenderer
							{field}
							value={nodeData[field.id]}
							readonly={true}
							mode="display"
							{nodeData}
							isProjectTitle={templateType === 'project' && field.id === 'title'}
						/>
					{/if}
				{/if}
			{/each}
			{#if template.id === 'link'}
				<SecondaryLinks {nodeData} />
			{/if}

			{#if nodeData.customFields && Array.isArray(nodeData.customFields)}
				{#each nodeData.customFields as field}
					{@const isVisible = field.showInDisplay ?? true}
					{#if isVisible && field.id !== 'status' && !(template.id === 'link' && field.type === 'link') && (field.type === 'button' || hasDetailValue(nodeData[field.id]))}
						{#if field.id === 'title'}
							<TitleEditor
								{nodeData}
								bind:isEditingTitle
								onSave={onTitleSave}
								isProjectNode={templateType === 'project'}
								{isBeingEdited}
							/>
						{:else}
							<FieldRenderer
								{field}
								value={nodeData[field.id]}
								readonly={true}
								mode="display"
								{nodeData}
								isProjectTitle={templateType === 'project' && field.id === 'title'}
							/>
						{/if}
					{/if}
				{/each}
			{/if}
		</div>
	{/if}
</div>
