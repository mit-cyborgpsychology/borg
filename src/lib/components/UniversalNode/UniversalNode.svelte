<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { Handle, Position } from '@xyflow/svelte';
	import { getTemplate, type NodeTemplate } from '../../templates';
	import NoteNode from './NoteNode.svelte';
	import StickerNode from './StickerNode.svelte';
	import ImageNode from './ImageNode.svelte';
	import LinkEmbed from './LinkEmbed.svelte';
	import OutlineNode from './OutlineNode.svelte';
	import NodeHeader from './components/NodeHeader.svelte';
	import NodeContent from './components/NodeContent.svelte';
	import NodeTasks from './components/NodeTasks.svelte';
	import { getProjectStoreContext } from '../../stores/projectStoreContext';
	import { Lock } from '@lucide/svelte';

	let { data, id } = $props<{ data: any; id: string }>();

	let isBeingEdited = $derived(data.isBeingEdited || false);

	let template: NodeTemplate = $derived(getTemplate(data.templateType || 'blank'));
	let nodeData = $derived(data.nodeData || {});

	// Get note size setting with default (current = Small)
	let size = $derived(nodeData.size || 'Small');

	// Node size classes for post-it notes
	let nodeSizeClass = $derived.by(() => {
		if (template.id !== 'note') return '';
		switch (size) {
			case 'Small':
				return 'max-h-32 min-h-24 max-w-32 min-w-24';
			case 'Medium':
				return 'max-h-40 min-h-32 max-w-40 min-w-32';
			case 'Large':
				return 'max-h-48 min-h-40 max-w-48 min-w-40';
			default:
				return 'max-h-32 min-h-24 max-w-32 min-w-24';
		}
	});

	// Title inline editing state
	let isEditingTitle = $state(false);

	// Tasks for this node, read from the ancestor Canvas/ProjectsCanvas's
	// single project-level task subscription instead of opening a listener
	// per node (previously: one Firestore subscription per rendered node).
	const projectStore = getProjectStoreContext();
	let tasks = $derived(projectStore.tasksByNode.get(id) ?? []);
	let hasTasks = $derived(tasks.length > 0);

	// Determine border color based on status
	let borderColor = $derived.by(() => {
		const status = nodeData.status;
		if (status === 'Done') return '#16a34a'; // green-600
		return '#d4d4d8'; // zinc-300 - default
	});

	// Determine opacity based on status
	let nodeOpacity = $derived(nodeData.status === 'Done' ? 0.3 : 1);

	function handleNodeClick() {
		// Dispatch the edit event
		canvasActions.nodeEdit({
			nodeId: id,
			nodeData: nodeData,
			templateType: data.templateType
		});
	}

	function handleTitleSave(title: string) {
		// Update the data prop immediately to reflect changes
		data.nodeData = {
			...nodeData,
			title: title
		};

		// Dispatch update event to save the title to service
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					title: title
				}
			}
		});
	}

	function handleDelete() {
		// Dispatch a custom event to parent
		canvasActions.nodeDelete({ nodeId: id });
	}

	function handleTaskPillClick() {
		// Dispatch event to open task sidebar at Canvas level
		canvasActions.nodeTasksOpen({
			nodeId: id,
			nodeTitle: nodeData.title || 'Untitled',
			tasks: tasks
		});
	}
</script>

{#if template.id === 'note'}
	<!-- Delegate entirely to NoteNode for note types -->
	<NoteNode {data} {id} {isBeingEdited} />
{:else if template.id === 'sticker'}
	<!-- Delegate entirely to StickerNode for sticker types -->
	<StickerNode {data} {id} {isBeingEdited} />
{:else if template.id === 'image'}
	<!-- Delegate entirely to ImageNode for image types -->
	<ImageNode {data} {id} {isBeingEdited} />
{:else if template.id === 'link' && nodeData.viewMode === 'Iframe'}
	<!-- Link nodes share data across their card and embedded views. -->
	<LinkEmbed {data} {id} {isBeingEdited} />
{:else if template.id === 'outline'}
	<!-- Delegate entirely to OutlineNode for outline doc types -->
	<OutlineNode {data} {id} {isBeingEdited} />
{:else}
	<div>
		<!-- Project Node Header (outside the main node box) -->
		{#if template.id === 'project'}
			<NodeHeader
				{template}
				templateType={data.templateType}
				{nodeData}
				{id}
				{data}
				onDelete={handleDelete}
			/>
		{/if}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			onclick={handleNodeClick}
			class="group relative cursor-pointer border transition-all duration-200 {template.id ===
			'note'
				? `aspect-square ${nodeSizeClass} rounded-lg p-1`
				: 'max-w-64 min-w-48'} {hasTasks ? 'rounded-t-lg' : 'rounded-lg'}"
			style="box-shadow: {template.id === 'note'
				? '0;'
				: '0;'}; border-color: {borderColor}; background-color: {template.id === 'note' &&
			nodeData.backgroundColor
				? nodeData.backgroundColor
				: template.id === 'note'
					? '#fef08a'
					: 'white'}; opacity: {nodeOpacity};"
		>
			<!-- Non-Project Node Header (inside the node box) -->
			{#if template.id !== 'note' && template.id !== 'project'}
				<NodeHeader
					{template}
					templateType={data.templateType}
					{nodeData}
					{id}
					{data}
					onDelete={handleDelete}
				/>
			{/if}

			<div class={template.id === 'note' ? '' : template.id === 'project' ? 'p-3' : 'px-3 py-2.5'}>
				<!-- Node Content -->
				<NodeContent
					{template}
					{nodeData}
					templateType={data.templateType}
					bind:isEditingTitle
					onTitleSave={handleTitleSave}
					onNodeClick={handleNodeClick}
					{isBeingEdited}
				/>

				<!-- Connection Handles -->
				<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
				<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
			</div>
		</div>

		<!-- Tasks Management (outside/below the main node) -->
		{#if template.id !== 'note'}
			<NodeTasks
				{tasks}
				{borderColor}
				onTaskClick={handleTaskPillClick}
				onAddTaskClick={handleTaskPillClick}
			/>
		{/if}
	</div>
{/if}
