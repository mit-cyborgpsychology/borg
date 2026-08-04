<script lang="ts">
	import FieldRenderer from '../../fields/FieldRenderer.svelte';
	import TitleEditor from './TitleEditor.svelte';
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
		<div class="mt-2 space-y-3">
			{#each template.fields as field}
				{@const isVisible = nodeData.fieldVisibility?.[field.id] ?? field.showInDisplay ?? true}
				{#if field.id !== 'status' && isVisible}
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

			{#if nodeData.customFields && Array.isArray(nodeData.customFields)}
				{#each nodeData.customFields as field}
					{@const isVisible = field.showInDisplay ?? true}
					{#if isVisible && field.id !== 'status'}
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
