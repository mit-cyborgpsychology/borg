<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { Handle, Position } from '@xyflow/svelte';
	import { Edit, Lock, Unlock, Trash2, ExternalLink } from '@lucide/svelte';
	import { getTemplate } from '../../templates';

	let { data, id } = $props<{
		data: any;
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});

	// Iframe dimensions with defaults
	let width = $state(400);
	let height = $state(300);

	// Update dimensions when nodeData changes
	$effect(() => {
		width = nodeData.width || 400;
		height = nodeData.height || 300;
	});

	// Resize state
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let justResized = $state(false);

	// Determine opacity based on status
	let nodeOpacity = $derived(nodeData.status === 'Done' ? 0.3 : 1);

	function handleNodeClick() {
		// Iframe nodes don't open edit panel on click - only via edit button
		return;
	}

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		canvasActions.nodeEdit({
			nodeId: id,
			nodeData: nodeData,
			templateType: data.templateType
		});
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		if (confirm('Are you sure you want to delete this iframe node?')) {
			canvasActions.nodeDelete({ nodeId: id });
		}
	}

	function toggleLock(e: MouseEvent) {
		e.stopPropagation();

		const newLockState = !nodeData.locked;
		const updatedNodeData = {
			...nodeData,
			locked: newLockState
		};

		// Update the local data prop immediately
		data.nodeData = updatedNodeData;

		// Dispatch update event
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: updatedNodeData
			}
		});
	}

	function openInNewTab(e: MouseEvent) {
		e.stopPropagation();
		if (nodeData.url) {
			window.open(nodeData.url, '_blank');
		}
	}

	// Handle resize start
	function startResize(event: MouseEvent, handle: string) {
		event.preventDefault();
		event.stopPropagation();

		isResizing = true;
		resizeHandle = handle;

		const startX = event.clientX;
		const startY = event.clientY;
		const startWidth = width;
		const startHeight = height;

		function handleMouseMove(e: MouseEvent) {
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;

			if (handle === 'se') {
				// Southeast handle - free resize
				const newWidth = Math.max(200, startWidth + deltaX);
				const newHeight = Math.max(150, startHeight + deltaY);
				width = newWidth;
				height = newHeight;
			}
		}

		function handleMouseUp() {
			isResizing = false;
			resizeHandle = null;
			updateNodeData();
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);

			// Prevent click events for a short time after resize
			justResized = true;
			setTimeout(() => {
				justResized = false;
			}, 200);
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	// Update node data
	function updateNodeData() {
		const updatedNodeData = {
			...nodeData,
			width,
			height
		};

		// Update the local data prop immediately
		data.nodeData = updatedNodeData;

		// Dispatch update event
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: updatedNodeData
			}
		});
	}

	// Get a clean URL for iframe src
	let iframeSrc = $derived.by(() => {
		if (!nodeData.url) return '';

		let url = nodeData.url.trim();
		if (!url) return '';

		// Add protocol if missing
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'https://' + url;
		}

		return url;
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="group relative">
	<div
		class="iframe-node relative cursor-grab rounded-lg active:cursor-grabbing"
		style="width: {width}px; height: {height}px; opacity: {nodeOpacity};"
		onclick={handleNodeClick}
	>
		{#if nodeData.url && iframeSrc}
			<!-- Display the iframe -->
			<iframe
				src={iframeSrc}
				title={nodeData.title || 'Embedded content'}
				class="h-full w-full rounded-lg border-0"
				style="transform: translateZ(0); backface-visibility: hidden;"
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
				loading="lazy"
			></iframe>
		{:else}
			<!-- Placeholder when no URL is set -->
			<div
				class="flex h-full flex-col items-center justify-center rounded-lg bg-gray-50 text-gray-500"
			>
				<div class="mb-2 text-lg">🌐</div>
				<p class="text-sm font-medium">No URL set</p>
				<p class="mt-1 text-xs">Click edit to add a URL</p>
			</div>
		{/if}

		<!-- Resize handle (bottom-right corner) -->
		<div
			class="nodrag absolute right-0 bottom-0 z-10 h-4 w-4 cursor-se-resize bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
			onmousedown={(e) => startResize(e, 'se')}
			aria-label="Resize iframe"
			role="button"
			tabindex="-1"
		>
			<!-- Resize grip lines -->
			<div class="pointer-events-none absolute right-1 bottom-1 h-2 w-2">
				<div class="absolute right-0 bottom-0 h-0.5 w-2 bg-gray-700"></div>
				<div class="absolute right-0 bottom-1 h-0.5 w-1.5 bg-gray-700"></div>
				<div class="absolute right-0 bottom-2 h-0.5 w-1 bg-gray-700"></div>
			</div>
		</div>

		<!-- Connection handles (hidden by default like stickers) -->
		<Handle type="target" position={Position.Left} class="!pointer-events-none !opacity-0" />
		<Handle type="source" position={Position.Right} class="!pointer-events-none !opacity-0" />
	</div>

	<!-- Action buttons (outside the entire iframe node, positioned relative to outer container) -->
	<div class="absolute -top-5 right-0 flex gap-1">
		{#if nodeData.url}
			<button
				onclick={openInNewTab}
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Open in new tab"
				aria-label="Open in new tab"
			>
				<ExternalLink class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			</button>
		{/if}
		<button
			onclick={handleEdit}
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title="Edit node"
			aria-label="Edit node"
		>
			<Edit class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
		<button
			onclick={toggleLock}
			aria-label={nodeData.locked ? 'Unlock node' : 'Lock node'}
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title={nodeData.locked ? 'Click to unlock node' : 'Click to lock node'}
		>
			{#if nodeData.locked}
				<Lock class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			{:else}
				<Unlock class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			{/if}
		</button>
		<button
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title="Delete iframe node"
			aria-label="Delete iframe node"
			onclick={handleDelete}
		>
			<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
	</div>
</div>

<style>
	.iframe-node {
		user-select: none;
		/* Prevent blurry rendering */
		transform: translateZ(0);
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}

	.iframe-node iframe {
		/* Force hardware acceleration and crisp rendering */
		transform: translate3d(0, 0, 0);
		-webkit-transform: translate3d(0, 0, 0);
		will-change: transform;
		image-rendering: -webkit-optimize-contrast;
		image-rendering: crisp-edges;
	}
</style>
