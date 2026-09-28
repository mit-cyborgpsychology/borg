<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import {
		Trash2,
		GitBranch,
		FileText,
		Code,
		Calendar,
		StickyNote,
		Link,
		Square,
		CheckCircle,
		Lock,
		Unlock
	} from '@lucide/svelte';
	import { describeLink } from '$lib/features/links/linkNode';
	import type { NodeTemplate } from '../../../templates';

	let { template, templateType, nodeData, id, data, onDelete } = $props<{
		template: NodeTemplate;
		templateType: string;
		nodeData: any;
		id: string;
		data: any;
		onDelete: () => void;
	}>();

	// Determine border color based on status
	let borderColor = $derived.by(() => {
		const status = nodeData.status;
		if (status === 'Done') return '#16a34a'; // green-600
		return '#d4d4d8'; // zinc-300 - default
	});

	// Determine node type icon with status-based color
	let statusIcon = $derived.by(() => {
		const currentTemplateType =
			template.id === 'link' ? describeLink(nodeData.url).kind : templateType || template.id;
		const status = nodeData.status;

		// Hide icon for project nodes
		if (currentTemplateType === 'project') {
			return null;
		}

		// Get icon based on node type
		let component;
		switch (currentTemplateType) {
			case 'subproject':
				component = GitBranch;
				break;
			case 'document':
			case 'paper':
				component = FileText;
				break;
			case 'code':
				component = Code;
				break;
			case 'time':
				component = Calendar;
				break;
			case 'note':
				component = StickyNote;
				break;
			case 'website':
			case 'video':
			case 'design':
			case 'link':
				component = Link;
				break;
			case 'blank':
				component = Square;
				break;
			default:
				component = Square;
				break;
		}

		// Get color based on status
		let color;
		if (status === 'Done')
			color = '#16a34a'; // green-600
		else color = '#71717a'; // gray-700 - default

		return { component, color };
	});

	// Get status styling for project nodes
	function getStatusStyling(status: string) {
		if (status === 'Done') {
			return {
				icon: CheckCircle,
				color: '#16a34a',
				bgColor: 'bg-green-100',
				textColor: 'text-green-800'
			};
		}
		return {
			icon: null,
			color: '#374151',
			bgColor: 'bg-gray-100',
			textColor: 'text-gray-800'
		};
	}

	function handleDelete(event: MouseEvent) {
		event.stopPropagation();

		if (templateType === 'project') {
			alert('Project nodes cannot be deleted as they sync with workspace metadata.');
			return;
		}

		if (confirm('Are you sure you want to delete this node?')) {
			onDelete();
		}
	}

	function toggleLock(event: MouseEvent) {
		event.stopPropagation();

		const newLockState = !nodeData.locked;

		// Update the data prop immediately
		data.nodeData = {
			...nodeData,
			locked: newLockState
		};

		// Dispatch update event to save changes
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					locked: newLockState
				}
			}
		});
	}
</script>

{#if template.id === 'project'}
	<!-- Project header (appears outside the main node box) -->
	<div class="mb-2 flex items-center justify-between">
		<div class="text-xl font-semibold">🏕️ Project</div>
		{#if nodeData.status}
			{@const statusStyle = getStatusStyling(nodeData.status)}
			<div
				class="flex items-center gap-1 rounded border px-1 py-[0.15rem] text-sm font-medium {statusStyle.bgColor} {statusStyle.textColor}"
				style="border-color: {borderColor};"
			>
				{#if statusStyle.icon}
					{@const StatusIcon = statusStyle.icon}
					<StatusIcon class="h-3 w-3" style="color: {statusStyle.color};" />
				{/if}
				<span>{nodeData.status}</span>
			</div>
		{/if}
	</div>
{:else if template.id !== 'note'}
	<!-- Compact window-style metadata and controls. -->
	<div
		class="flex h-7 items-center justify-between gap-3 rounded-t-lg border-b border-zinc-100 bg-zinc-50/70 px-2.5"
	>
		<div class="flex min-w-0 items-center gap-1.5">
			{#if statusIcon}
				{@const StatusIconComponent = statusIcon.component}
				<StatusIconComponent class="h-3 w-3 shrink-0" style="color: {statusIcon.color};" />
			{/if}
			<span class="truncate text-[10px] font-medium text-zinc-500"
				>{template.id === 'link' ? describeLink(nodeData.url).label : template.name}</span
			>
		</div>

		<div class="nodrag flex shrink-0 items-center gap-0.5">
			<button
				onclick={handleDelete}
				aria-label="Delete node"
				class="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400"
			>
				<Trash2 class="h-3 w-3" />
			</button>
			<button
				onclick={toggleLock}
				aria-label={nodeData.locked ? 'Unlock node' : 'Lock node'}
				class="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400"
				title={nodeData.locked ? 'Click to unlock node' : 'Click to lock node'}
			>
				{#if nodeData.locked}
					<Lock class="h-3 w-3" />
				{:else}
					<Unlock class="h-3 w-3" />
				{/if}
			</button>
		</div>
	</div>
{/if}
