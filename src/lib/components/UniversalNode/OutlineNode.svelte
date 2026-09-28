<script lang="ts">
	import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
	let deleteDialog: ConfirmDeleteDialog;
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import { onMount } from 'svelte';
	import OutlineEditor from '../outline/OutlineEditor.svelte';
	import type { OutlineDoc, OutlineDocSummary } from '$lib/services/interfaces/IOutlineService';
	import { Handle, Position, useSvelteFlow } from '@xyflow/svelte';
	import {
		Edit,
		Trash2,
		FileText,
		ExternalLink,
		Search,
		X,
		Check,
		LoaderCircle
	} from '@lucide/svelte';

	const { outlineService } = getAppServices();
	const { getViewport } = useSvelteFlow();
	let { data, id } = $props<{
		data: {
			nodeData?: {
				title?: string;
				outlineDocId?: string;
				outlineUrl?: string;
				width?: number;
				height?: number;
			};
			projectSlug?: string;
			templateType: string;
		};
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});
	let width = $state(640);
	let height = $state(480);
	let resizing = $state(false);
	$effect(() => {
		width = Math.max(360, Number(nodeData.width) || 640);
		height = Math.max(240, Number(nodeData.height) || 480);
	});
	function saveSize() {
		data.nodeData = { ...nodeData, width, height };
		canvasActions.nodeUpdate({ nodeId: id, data: { nodeData: data.nodeData } });
	}
	function startResize(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget as HTMLButtonElement;
		const start = { x: event.clientX, y: event.clientY, width, height, zoom: getViewport().zoom };
		target.setPointerCapture(event.pointerId);
		resizing = true;
		target.onpointermove = (move) => {
			width = Math.max(360, start.width + (move.clientX - start.x) / start.zoom);
			height = Math.max(240, start.height + (move.clientY - start.y) / start.zoom);
		};
		target.onlostpointercapture = () => {
			resizing = false;
			target.onpointermove = null;
			target.onlostpointercapture = null;
			saveSize();
		};
	}
	function resizeWithKeyboard(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		width = Math.max(
			360,
			width + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0)
		);
		height = Math.max(
			240,
			height + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)
		);
		saveSize();
	}
	let isCreating = $state(false);
	let failure = $state('');
	let choosing = $state(false);
	let picker: HTMLDialogElement;
	let search = $state('');
	let loadingChoices = $state(false);
	let choices = $state<OutlineDocSummary[]>([]);
	let filteredChoices = $derived(
		choices.filter((doc) => doc.title.toLowerCase().includes(search.trim().toLowerCase()))
	);

	function applyDoc(doc: OutlineDoc) {
		data.nodeData = { ...nodeData, title: doc.title, outlineDocId: doc.id, outlineUrl: doc.url };
	}
	async function refreshDoc() {
		if (!projectSlug || !nodeData.outlineDocId || isCreating) return;
		try {
			applyDoc(await outlineService.getNodeDoc(projectSlug, id));
			failure = '';
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Unable to refresh document.';
		}
	}
	onMount(() => {
		void refreshDoc();
		const refreshVisible = () => {
			if (!document.hidden) void refreshDoc();
		};
		document.addEventListener('visibilitychange', refreshVisible);
		return () => document.removeEventListener('visibilitychange', refreshVisible);
	});
	async function chooseExisting() {
		if (!projectSlug) return;
		isCreating = true;
		loadingChoices = true;
		failure = '';
		search = '';
		choosing = true;
		picker.showModal();
		try {
			choices = await outlineService.listProjectDocs(projectSlug, id);
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Unable to list documents.';
		} finally {
			isCreating = false;
			loadingChoices = false;
		}
	}
	async function linkDocument(documentId: string) {
		isCreating = true;
		failure = '';
		try {
			const doc = await outlineService.linkDoc(projectSlug!, id, documentId);
			applyDoc(doc);
			picker.close();
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Unable to link document.';
		} finally {
			isCreating = false;
		}
	}

	// Same projectSlug derivation pattern as UniversalNode.svelte
	let projectSlug = $derived(
		data.projectSlug ||
			(() => {
				if (typeof window !== 'undefined') {
					const pathParts = window.location.pathname.split('/');
					return pathParts[2]; // /project/[slug]/...
				}
				return null;
			})()
	);

	let displayTitle = $derived(nodeData.title || 'Untitled Doc');
	let embeddedDoc = $derived.by(() => {
		if (!nodeData.outlineDocId || !nodeData.outlineUrl) return null;
		try {
			const url = new URL(nodeData.outlineUrl);
			if (!['https:', 'http:'].includes(url.protocol)) return null;
			return { id: nodeData.outlineDocId, title: displayTitle, url: url.href };
		} catch {
			return null;
		}
	});

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
		if (
			await deleteDialog.open({ message: 'Remove this node? The document will remain in Outline.' })
		) {
			canvasActions.nodeDelete({ nodeId: id });
		}
	}

	async function handleOpenDoc(e: MouseEvent) {
		e.stopPropagation();
		if (isCreating) return;
		if (!projectSlug) {
			failure = 'Open a project to create a wiki note.';
			return;
		}
		isCreating = true;
		failure = '';
		try {
			const doc = nodeData.outlineDocId
				? await outlineService.getNodeDoc(projectSlug, id)
				: await outlineService.createDoc(projectSlug, id);
			applyDoc(doc);
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Unable to open Outline.';
		} finally {
			isCreating = false;
		}
	}

	function handleOpenInNewTab(e: MouseEvent) {
		e.stopPropagation();
		if (nodeData.outlineUrl) {
			try {
				const url = new URL(nodeData.outlineUrl);
				if (!['https:', 'http:'].includes(url.protocol)) return;
				window.open(url.href, '_blank', 'noopener,noreferrer');
			} catch {
				failure = 'Invalid document link. Reopen or change the linked note.';
			}
		}
	}
</script>

<ConfirmDeleteDialog bind:this={deleteDialog} />

<div class="group relative">
	<div
		class="outline-node relative rounded-lg border bg-white transition-all duration-200"
		class:p-3={!embeddedDoc}
		style:width={embeddedDoc ? `${width}px` : '220px'}
		style="border-color: #3b82f6;"
	>
		{#if !embeddedDoc}
			<!-- Doc icon and title -->
			<div class="flex items-center gap-2">
				<FileText class="h-4 w-4 text-blue-500" />
				<span class="truncate text-sm font-medium text-gray-800">
					{displayTitle}
				</span>
			</div>
		{/if}

		{#if embeddedDoc}
			<div class="overflow-hidden rounded-lg" style:height={`${height}px`}>
				<OutlineEditor {height} {resizing} doc={embeddedDoc} onclose={() => void refreshDoc()}>
					{#snippet controls(expanded)}
						<button
							type="button"
							disabled={isCreating}
							onclick={chooseExisting}
							title="Change linked note"
							aria-label="Change linked note"><FileText class="h-3 w-3" /></button
						>
						<button type="button" onclick={handleEdit} title="Edit node" aria-label="Edit node"
							><Edit class="h-3 w-3" /></button
						>
						<button
							type="button"
							onclick={handleDelete}
							title="Delete wiki node"
							aria-label="Delete wiki node"><Trash2 class="h-3 w-3" /></button
						>
						{#if !expanded}<button
								type="button"
								aria-label="Resize wiki note"
								title="Drag to resize, or use arrow keys"
								onpointerdown={startResize}
								onkeydown={resizeWithKeyboard}
								class="nodrag nopan cursor-se-resize touch-none px-1">↘</button
							>{/if}
					{/snippet}
				</OutlineEditor>
			</div>
		{:else}
			<!-- Open doc button -->
			<button
				class="mt-2 w-full rounded-lg bg-borg-brown/80 p-2 text-xs font-medium transition-colors hover:bg-borg-brown/60 focus:ring-2 focus:ring-borg-blue focus:outline-none disabled:opacity-50"
				onclick={(event) => handleOpenDoc(event)}
				disabled={isCreating}
			>
				{#if nodeData.outlineUrl}
					Open note
				{:else if isCreating}
					Creating...
				{:else}
					Create note
				{/if}
			</button>
		{/if}

		{#if failure && !choosing}<p role="alert" class="mt-2 max-w-56 text-xs text-red-700">
				{failure}
			</p>{/if}
		{#if !embeddedDoc}<button
				type="button"
				disabled={isCreating}
				onclick={chooseExisting}
				class="nodrag mt-2 text-xs text-zinc-600 underline"
				>{nodeData.outlineDocId ? 'Change linked note' : 'Link existing note'}</button
			>{/if}

		<!-- Connection handles -->
		<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
		<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
	</div>

	{#if !embeddedDoc}
		<!-- Action buttons -->
		<div class="absolute -top-5 right-0 flex gap-1">
			<button
				onclick={handleOpenInNewTab}
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Open in new tab"
				aria-label="Open in new tab"
			>
				<ExternalLink class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			</button>
			<button
				onclick={handleEdit}
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Edit node"
				aria-label="Edit node"
			>
				<Edit class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			</button>
			<button
				class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
				title="Delete wiki node"
				aria-label="Delete wiki node"
				onclick={handleDelete}
			>
				<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
			</button>
		</div>
	{/if}
</div>

<dialog
	bind:this={picker}
	onclose={() => (choosing = false)}
	aria-label="Choose wiki document"
	class="nodrag nopan nowheel fixed inset-0 m-auto w-[440px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-zinc-300 bg-white p-0 font-sans text-zinc-800 backdrop:bg-black/20"
>
	<header class="flex items-center justify-between px-4 pt-4 pb-3">
		<h2 class="text-sm font-medium">
			{nodeData.outlineDocId ? 'Change document' : 'Link a document'}
		</h2>
		<button
			type="button"
			onclick={() => picker.close()}
			aria-label="Close document picker"
			class="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
			><X class="h-4 w-4" /></button
		>
	</header>
	<div
		class="mx-4 mb-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 focus-within:border-zinc-400"
	>
		<Search class="h-4 w-4 shrink-0 text-zinc-400" />
		<input
			bind:value={search}
			aria-label="Search project documents"
			placeholder="Search documents…"
			class="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
		/>
	</div>
	<div
		class="max-h-[min(360px,50dvh)] min-h-24 overflow-y-auto border-t border-zinc-100 p-2"
		aria-busy={isCreating}
	>
		{#if loadingChoices}
			<div role="status" class="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
				<LoaderCircle class="h-4 w-4 animate-spin" />Loading documents…
			</div>
		{:else}
			{#each filteredChoices as doc (doc.id)}
				<button
					type="button"
					disabled={isCreating}
					onclick={() => (doc.id === nodeData.outlineDocId ? picker.close() : linkDocument(doc.id))}
					aria-label={doc.title}
					aria-pressed={doc.id === nodeData.outlineDocId}
					class="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-400 disabled:opacity-50"
					class:bg-zinc-50={doc.id === nodeData.outlineDocId}
				>
					<FileText class="h-4 w-4 shrink-0 text-zinc-400" />
					<span class="min-w-0 flex-1 break-words">{doc.title || 'Untitled document'}</span>
					{#if doc.id === nodeData.outlineDocId}<span
							class="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500"
							><Check class="h-3 w-3" />Current</span
						>{/if}
				</button>
			{:else}
				<p class="px-4 py-8 text-center text-sm text-zinc-500">
					{search.trim() ? 'No matching documents.' : 'No documents in this project yet.'}
				</p>
			{/each}
		{/if}
	</div>
	{#if failure}<p role="alert" class="border-t border-zinc-100 px-4 py-3 text-xs text-red-700">
			{failure}
		</p>{/if}
	<footer
		class="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500"
	>
		<span>{isCreating && !loadingChoices ? 'Linking document…' : 'Project documents'}</span>
		<button
			type="button"
			onclick={() => picker.close()}
			class="rounded-md border border-zinc-200 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
			>Cancel</button
		>
	</footer>
</dialog>

<style>
	button:not(:disabled) {
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
	}
	button[aria-label='Resize wiki note'] {
		cursor: se-resize;
	}

	.outline-node {
		user-select: none;
	}
</style>
