<script lang="ts">
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	let deleteDialog: ConfirmDeleteDialog;
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { Handle, Position } from '@xyflow/svelte';
	import { Trash2, Pencil, Bold, Lock, Unlock, CheckCheck } from '@lucide/svelte';

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

	// Get note dimensions with defaults
	let width = $state(nodeData.width || 128); // Default 128px (w-32)
	let height = $state(nodeData.height || 128); // Default 128px (h-32)

	// Update dimensions when nodeData changes
	$effect(() => {
		width = nodeData.width || 128;
		height = nodeData.height || 128;
	});

	// Get font weight with default (normal)
	let fontWeight = $state(nodeData.fontWeight || 'normal');

	// Update font weight when nodeData changes
	$effect(() => {
		fontWeight = nodeData.fontWeight || 'normal';
	});

	// Get text size with default (Small)
	let textSizeClass = $derived.by(() => {
		const textSize = nodeData.textSize || 'Small';
		switch (textSize) {
			case 'Small':
				return 'text-sm';
			case 'Medium':
				return 'text-lg';
			case 'Large':
				return 'text-xl';
			case 'Extra Large':
				return 'text-3xl';
			default:
				return 'text-sm';
		}
	});

	// Get font weight class
	let fontWeightClass = $derived(fontWeight === 'bold' ? 'font-semibold' : 'font-normal');

	// Get note style setting with default (Post-It)
	let noteStyle = $derived(nodeData.style || 'Post-It');

	// Determine opacity based on status
	let nodeOpacity = $derived(nodeData.status === 'Done' ? 0.3 : 1);

	function toggleDone(event: MouseEvent) {
		event.stopPropagation();

		const updatedNodeData = { ...nodeData } as any;
		if (nodeData.status === 'Done') {
			delete updatedNodeData.status;
		} else {
			updatedNodeData.status = 'Done';
		}

		data.nodeData = updatedNodeData;

		canvasActions.nodeUpdate({
			nodeId: id,
			data: { nodeData: updatedNodeData }
		});
	}

	// Get background style based on selection and note style
	let backgroundStyle = $derived.by(() => {
		// Text Only style has no background
		if (noteStyle === 'Text Only') {
			return 'background: transparent';
		}

		const bgValue = nodeData.backgroundColor || '#fef08a';

		if (bgValue.startsWith('linear-gradient')) {
			return `background: ${bgValue}`;
		} else {
			return `background-color: ${bgValue}`;
		}
	});

	// Resize state
	let isResizing = $state(false);

	// Post-it inline editing state
	let isEditingNote = $state(false);
	let noteContent = $state('');
	let textarea = $state<HTMLTextAreaElement>();

	function handleNodeClick() {
		// Don't allow inline editing if the edit panel is open for this node or if node is locked
		if (!isBeingEdited && !nodeData.locked) {
			startInlineEdit();
		}
	}

	function startInlineEdit() {
		// Extra safety check - don't start editing if locked
		if (isBeingEdited || nodeData.locked) return;

		isEditingNote = true;
		noteContent = nodeData.content || '';

		// Focus the textarea after it's rendered
		setTimeout(() => {
			if (textarea) {
				textarea.focus();
			}
		}, 0);
	}

	function handleNoteInput() {
		// No auto-save interval - only save on unfocus
	}

	function saveNoteContent() {
		// Update the data prop immediately to reflect changes
		data.nodeData = {
			...nodeData,
			content: noteContent
		};

		// Dispatch update event to save the content to service
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					content: noteContent
				}
			}
		});
	}

	function handleNoteBlur() {
		// Save immediately when losing focus
		saveNoteContent();
		isEditingNote = false;
	}

	function handleNoteKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			// Save and exit on Enter (Shift+Enter for new line)
			event.preventDefault();
			handleNoteBlur();
		} else if (event.key === 'Escape') {
			// Cancel editing on Escape
			event.preventDefault();
			noteContent = nodeData.content || '';
			isEditingNote = false;
		}
	}

	function handleSettingsClick(event: MouseEvent) {
		event.stopPropagation();

		// Dispatch edit event for settings panel
		canvasActions.nodeEdit({
			nodeId: id,
			nodeData: nodeData,
			templateType: data.templateType
		});
	}

	async function handleDelete(event: MouseEvent) {
		event.stopPropagation(); // Prevent triggering the node click

		if (await deleteDialog.open({ message: 'Are you sure you want to delete this note?' })) {
			// Dispatch a custom event to parent
			canvasActions.nodeDelete({ nodeId: id });
		}
	}

	function toggleFontWeight(event: MouseEvent) {
		event.stopPropagation();

		const newFontWeight = fontWeight === 'bold' ? 'normal' : 'bold';
		fontWeight = newFontWeight;

		// Update the data prop immediately
		data.nodeData = {
			...nodeData,
			fontWeight: newFontWeight
		};

		// Dispatch update event to save the font weight
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					fontWeight: newFontWeight
				}
			}
		});
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

	function startResize(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Save any unsaved text content before starting resize
		if (isEditingNote) {
			saveNoteContent();
			isEditingNote = false;
		}

		isResizing = true;

		const startX = event.clientX;
		const startY = event.clientY;
		const startWidth = width;
		const startHeight = height;

		function handleMouseMove(e: MouseEvent) {
			if (!isResizing) return;

			const deltaX = e.clientX - startX;
			const deltaY = e.clientY - startY;

			const newWidth = Math.max(80, startWidth + deltaX);
			const newHeight = Math.max(60, startHeight + deltaY);

			width = newWidth;
			height = newHeight;
		}

		function handleMouseUp() {
			isResizing = false;
			updateNodeData();
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		}

		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
	}

	// Update node data helper function
	function updateNodeData() {
		// Update the data prop immediately
		data.nodeData = {
			...nodeData,
			width,
			height
		};

		// Dispatch update event to save dimensions
		canvasActions.nodeUpdate({
			nodeId: id,
			data: {
				nodeData: {
					...nodeData,
					width,
					height
				}
			}
		});
	}
</script>

<ConfirmDeleteDialog bind:this={deleteDialog} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="group relative">
	<div
		class="relative cursor-pointer rounded-lg p-1 {isResizing || isEditingNote
			? ''
			: 'transition-all duration-200'} {isEditingNote ? 'border-2 shadow-lg' : ''} {noteStyle ===
		'Text Only'
			? ''
			: 'border border-zinc-300'}"
		style="{backgroundStyle}; width: {width}px; height: {height}px; opacity: {nodeOpacity}; transition: opacity 0.2s;"
		onclick={handleNodeClick}
	>
		<!-- Post-it note content -->
		{#if isEditingNote}
			<textarea
				bind:this={textarea}
				bind:value={noteContent}
				oninput={handleNoteInput}
				onblur={handleNoteBlur}
				onkeydown={handleNoteKeydown}
				onmousedown={(e) => e.stopPropagation()}
				ondragstart={(e) => e.preventDefault()}
				class="nodrag h-full w-full resize-none border-none bg-transparent p-1 {textSizeClass} {fontWeightClass} leading-relaxed break-words text-gray-800 outline-none placeholder:text-gray-500"
				placeholder="Type your note..."
				style="font-family: inherit;"
			></textarea>
		{:else}
			<div
				class="flex h-full w-full items-start overflow-hidden p-1 {textSizeClass} {fontWeightClass} leading-relaxed text-balance break-words whitespace-pre-wrap text-gray-800"
			>
				{nodeData.content || 'Click to edit...'}
			</div>
		{/if}

		<!-- Resize handle -->
		<div
			class="nodrag absolute right-0 bottom-0 z-10 h-4 w-4 cursor-se-resize bg-transparent opacity-0 transition-opacity group-hover:opacity-100"
			onmousedown={startResize}
			onclick={(e) => e.stopPropagation()}
			aria-label="Resize note"
			role="button"
			tabindex="-1"
		>
			<!-- Resize grip lines -->
			<div class="pointer-events-none absolute right-1 bottom-1 h-2 w-2">
				<div class="absolute right-0 bottom-0 h-0.5 w-2 bg-gray-500"></div>
				<div class="absolute right-0 bottom-1 h-0.5 w-1.5 bg-gray-500"></div>
				<div class="absolute right-0 bottom-2 h-0.5 w-1 bg-gray-500"></div>
			</div>
		</div>

		<!-- Settings and Delete buttons for note nodes -->
		<div class="absolute top-1 right-1 flex gap-1">
			<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				<button
					onclick={toggleFontWeight}
					aria-label="Toggle font weight"
					class="rounded p-1 text-gray-600 hover:bg-white/50 hover:text-gray-800 {fontWeight ===
					'bold'
						? 'bg-white/50 text-gray-800'
						: ''}"
				>
					<Bold class="h-3 w-3" />
				</button>
				<button
					onclick={handleSettingsClick}
					aria-label="Edit settings"
					class="rounded p-1 text-gray-600 hover:bg-white/50 hover:text-blue-600"
				>
					<Pencil class="h-3 w-3" />
				</button>
				<button
					onclick={(event) => {
						event.stopPropagation();
						handleDelete(event);
					}}
					aria-label="Delete note"
					class="rounded p-1 text-gray-600 hover:bg-white/50 hover:text-red-600"
				>
					<Trash2 class="h-3 w-3" />
				</button>
			</div>
			<button
				onclick={toggleLock}
				aria-label={nodeData.locked ? 'Unlock node' : 'Lock node'}
				class="rounded p-0.5 {nodeData.locked
					? 'text-zinc-600 hover:bg-white/50 hover:text-blue-600'
					: 'text-gray-500 hover:bg-white/50 hover:text-amber-700'}"
				title={nodeData.locked ? 'Click to unlock node' : 'Click to lock node'}
			>
				{#if nodeData.locked}
					<Lock class="h-3 w-3" />
				{:else}
					<Unlock class="h-3 w-3" />
				{/if}
			</button>
		</div>

		<!-- Connection Handles -->
		<Handle type="target" position={Position.Left} class="!bg-zinc-600" />
		<Handle type="source" position={Position.Right} class="!bg-zinc-600" />
	</div>
</div>
