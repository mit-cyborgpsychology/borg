<script lang="ts">
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	let deleteDialog: ConfirmDeleteDialog;
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { Handle, Position } from '@xyflow/svelte';
	import { Trash2, Lock, Unlock } from '@lucide/svelte';

	let {
		data,
		id,
		isBeingEdited = false
	} = $props<{
		data: any;
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});

	// Get sticker dimensions with defaults
	let width = $state(nodeData.width || 100);
	let height = $state(nodeData.height || 100);
	let rotation = $state(nodeData.rotation || 0);

	// Update dimensions when nodeData changes
	$effect(() => {
		width = nodeData.width || 100;
		height = nodeData.height || 100;
		rotation = nodeData.rotation || 0;
	});

	// Sticker data - use derived to react to nodeData changes
	let stickerUrl = $derived(nodeData.stickerUrl || '');
	let category = $derived(nodeData.category || '');
	let filename = $derived(nodeData.filename || '');

	// Determine opacity based on status
	let nodeOpacity = $derived(nodeData.status === 'Done' ? 0.3 : 1);

	// Image loading state
	let imageLoaded = $state(false);
	let imageError = $state(false);

	// Reset loading state when stickerUrl changes
	$effect(() => {
		if (stickerUrl) {
			imageLoaded = false;
			imageError = false;
		}
	});

	// Debug logging
	// $effect(() => {
	// 	console.log('🎨 StickerNode data:', { stickerUrl, category, filename, nodeData });
	// });

	// Resize state
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);

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
		const aspectRatio = startWidth / startHeight;

		function handleMouseMove(e: MouseEvent) {
			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;

			if (handle === 'se') {
				// Southeast handle - maintain aspect ratio
				const newWidth = Math.max(50, startWidth + deltaX);
				const newHeight = newWidth / aspectRatio;
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
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	// Update node data
	function updateNodeData() {
		// Update the data prop immediately - preserve all sticker data
		data.nodeData = {
			...nodeData,
			width,
			height,
			rotation,
			stickerUrl: nodeData.stickerUrl || stickerUrl,
			category: nodeData.category || category,
			filename: nodeData.filename || filename
		};

		// Dispatch update event to save - preserve all sticker data
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					width,
					height,
					rotation,
					stickerUrl: nodeData.stickerUrl || stickerUrl,
					category: nodeData.category || category,
					filename: nodeData.filename || filename
				}
			}
		});
	}

	// Handle delete
	async function handleDelete(event: MouseEvent) {
		event.stopPropagation();

		if (await deleteDialog.open({ message: 'Are you sure you want to delete this sticker?' })) {
			canvasActions.nodeDelete({ nodeId: id });
		}
	}

	// Handle context menu (right-click)
	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
	}

	// Handle image load
	function handleImageLoad() {
		imageLoaded = true;
	}

	// Handle image error
	function handleImageError() {
		imageError = true;
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

<ConfirmDeleteDialog bind:this={deleteDialog} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div>
	<div
		class="sticker-node group relative cursor-grab active:cursor-grabbing"
		style="width: {width}px; height: {height}px; opacity: {nodeOpacity};"
		oncontextmenu={handleContextMenu}
	>
		<!-- Main sticker image -->
		{#if stickerUrl}
			<!-- Loading state -->
			{#if !imageLoaded && !imageError}
				<div class="flex h-full w-full items-center justify-center">
					<div
						class="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-black"
					></div>
				</div>
			{/if}

			<!-- Error state -->
			{#if imageError}
				<div
					class="flex h-full w-full items-center justify-center rounded-lg border border-red-200 bg-red-50"
				>
					<span class="text-red-500">✗</span>
				</div>
			{/if}

			<!-- Sticker image -->
			<img
				src={stickerUrl}
				alt="{category} sticker"
				class="h-full w-full object-contain transition-all duration-200 {imageLoaded
					? 'opacity-100'
					: 'opacity-0'}"
				onload={handleImageLoad}
				onerror={handleImageError}
				draggable="false"
			/>
		{/if}

		<!-- Resize handle (bottom-right corner) -->
		<div
			class="nodrag absolute right-0 bottom-0 z-10 h-4 w-4 cursor-se-resize bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
			onmousedown={(e) => startResize(e, 'se')}
			aria-label="Resize sticker"
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

		<!-- Action buttons (top-right corner) -->
		<div class="absolute top-1 right-1 flex gap-1">
			<button
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Delete sticker"
				aria-label="Delete sticker"
				onclick={handleDelete}
			>
				<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
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
		</div>

		<!-- Connection handles (hidden by default for stickers) -->
		<Handle type="target" position={Position.Left} class="!pointer-events-none !opacity-0" />
		<Handle type="source" position={Position.Right} class="!pointer-events-none !opacity-0" />
	</div>
</div>

<style>
	.sticker-node {
		user-select: none;
	}
</style>
