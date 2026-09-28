<script lang="ts">
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	let deleteDialog: ConfirmDeleteDialog;
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import { Handle, Position } from '@xyflow/svelte';
	import { Upload, X, Edit, Lock, Unlock, Trash2 } from '@lucide/svelte';
	import { getTemplate } from '../../templates';

	const { imageService } = getAppServices();
	let { data, id, isBeingEdited } = $props<{
		data: any;
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});
	let template = $derived(getTemplate(data.templateType || 'image'));
	let isDragOver = $state(false);
	let isUploading = $state(false);

	// Image dimensions with defaults
	let width = $state(nodeData.width || 200);
	let height = $state(nodeData.height || 150);

	// Update dimensions when nodeData changes
	$effect(() => {
		width = nodeData.width || 200;
		height = nodeData.height || 150;
	});

	// Resize state
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let justResized = $state(false);
	let imageAspectRatio = $state(1.33); // Default aspect ratio

	// Image loading state to get natural dimensions
	let imageElement: HTMLImageElement = $state()!;

	// Determine border color based on status
	let borderColor = $derived.by(() => {
		const status = nodeData.status;
		if (status === 'To Do') return '#9333ea'; // purple-600
		if (status === 'Doing') return '#0284c7'; // sky-600
		if (status === 'Done') return '#16a34a'; // green-600
		return '#10b981'; // emerald-600 - default for image nodes
	});

	// Determine opacity based on status
	let nodeOpacity = $derived(nodeData.status === 'Done' ? 0.3 : 1);

	function handleNodeClick() {
		// Image nodes don't open edit panel on click - only via edit button
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

	async function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		if (await deleteDialog.open({ message: 'Are you sure you want to delete this image node?' })) {
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
				// Southeast handle - maintain image aspect ratio
				const newWidth = Math.max(100, startWidth + deltaX);
				const newHeight = newWidth / imageAspectRatio;
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

	function handleImageLoad() {
		if (imageElement) {
			imageAspectRatio = imageElement.naturalWidth / imageElement.naturalHeight;

			// If this is the first time loading the image, adjust the container to match
			if (!nodeData.width && !nodeData.height) {
				const newHeight = width / imageAspectRatio;
				height = newHeight;
				updateNodeData();
			}
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragOver = false;

		const files = e.dataTransfer?.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		if (!file.type.startsWith('image/')) {
			alert('Please drop an image file');
			return;
		}

		await uploadImage(file);
	}

	async function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		const file = files[0];
		if (!file.type.startsWith('image/')) {
			alert('Please select an image file');
			return;
		}

		await uploadImage(file);
		// Reset the input
		target.value = '';
	}

	async function uploadImage(file: File) {
		try {
			isUploading = true;

			const downloadURL = await imageService.uploadImage(id, file);

			// Update the node data with the image URL (don't auto-set title from filename)
			const updatedNodeData = {
				...nodeData,
				imageUrl: downloadURL
			};

			// Update the local data prop immediately for real-time UI updates
			data.nodeData = updatedNodeData;

			// Dispatch update event
			canvasActions.nodeUpdate({
				nodeId: id,
				data: {
					nodeData: updatedNodeData
				}
			});
		} catch (error) {
			console.error('Error uploading image:', error);
			alert('Failed to upload image. Please try again.');
		} finally {
			isUploading = false;
		}
	}

	function removeImage(e: MouseEvent) {
		e.stopPropagation();
		const updatedNodeData = {
			...nodeData,
			imageUrl: ''
		};

		// Update the local data prop immediately for real-time UI updates
		data.nodeData = updatedNodeData;

		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: updatedNodeData
			}
		});
	}
</script>

<ConfirmDeleteDialog bind:this={deleteDialog} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="group relative">
	<div
		class="image-node relative cursor-grab active:cursor-grabbing"
		style="width: {width}px; height: {height}px; opacity: {nodeOpacity};"
		onclick={handleNodeClick}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
	>
		{#if nodeData.imageUrl}
			<!-- Display the uploaded image -->
			<img
				bind:this={imageElement}
				src={nodeData.imageUrl}
				alt={nodeData.title || 'Uploaded image'}
				class="h-full w-full rounded-lg object-cover"
				draggable="false"
				onload={handleImageLoad}
			/>
		{:else}
			<!-- Upload area -->
			<div
				class="border- flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-zinc-600 transition-colors"
				class:border-emerald-400={isDragOver}
				class:bg-emerald-50={isDragOver}
			>
				{#if isUploading}
					<div class="flex flex-col items-center">
						<div class="mb-2 text-sm text-zinc-600">Uploading...</div>
						<div class="h-2 w-20 rounded-full bg-gray-200">
							<div
								class="h-2 animate-pulse rounded-full bg-emerald-600 transition-all duration-300"
							></div>
						</div>
					</div>
				{:else}
					<Upload class="mb-2 h-8 w-8 text-zinc-400" />
					<p class="text-sm font-medium text-zinc-600">Drop image here</p>
					<p class="mt-1 text-xs text-zinc-500">or click to browse</p>
				{/if}

				<!-- Hidden file input -->
				{#if !isUploading}
					<input
						type="file"
						accept="image/*"
						onchange={handleFileInput}
						class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
					/>
				{/if}
			</div>
		{/if}

		<!-- Resize handle (bottom-right corner) -->
		<div
			class="nodrag absolute right-0 bottom-0 z-10 h-4 w-4 cursor-se-resize bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
			onmousedown={(e) => startResize(e, 'se')}
			aria-label="Resize image"
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

	<!-- Action buttons (outside the entire image node, positioned relative to outer container) -->
	<div class="absolute -top-5 right-0 flex gap-1">
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
			title="Delete image node"
			aria-label="Delete image node"
			onclick={handleDelete}
		>
			<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
	</div>
</div>

<style>
	.image-node {
		user-select: none;
	}
</style>
