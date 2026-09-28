<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import { onMount } from 'svelte';
	import OutlineEditor from '../outline/OutlineEditor.svelte';
	import type { OutlineDoc, OutlineDocSummary } from '$lib/services/interfaces/IOutlineService';
	import { Handle, Position } from '@xyflow/svelte';
	import { Edit, Trash2, FileText, ExternalLink } from '@lucide/svelte';

	const { outlineService } = getAppServices();
	let { data, id } = $props<{
		data: {
			nodeData?: { title?: string; outlineDocId?: string; outlineUrl?: string };
			projectSlug?: string;
			templateType: string;
		};
		id: string;
		isBeingEdited?: boolean;
	}>();

	let nodeData = $derived(data.nodeData || {});
	let isCreating = $state(false);
	let failure = $state('');
	let choosing = $state(false);
	let choices = $state<OutlineDocSummary[]>([]);
	let editor: { open: (doc: OutlineDoc) => Promise<void> };
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
		failure = '';
		try {
			choices = await outlineService.listProjectDocs(projectSlug, id);
			choosing = true;
		} catch (error) {
			failure = error instanceof Error ? error.message : 'Unable to list documents.';
		} finally {
			isCreating = false;
		}
	}
	async function linkDocument(documentId: string) {
		isCreating = true;
		failure = '';
		try {
			const doc = await outlineService.linkDoc(projectSlug!, id, documentId);
			applyDoc(doc);
			choosing = false;
			await editor.open(doc);
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
		if (confirm('Remove this node? The document will remain in Outline.')) {
			canvasActions.nodeDelete({ nodeId: id });
		}
	}

	async function handleOpenDoc(e: MouseEvent) {
		e.stopPropagation();
		if (isCreating) return;
		if (!projectSlug) {
			failure = 'Open a project to create an Outline note.';
			return;
		}
		isCreating = true;
		failure = '';
		try {
			const doc = nodeData.outlineDocId
				? await outlineService.getNodeDoc(projectSlug, id)
				: await outlineService.createDoc(projectSlug, id);
			applyDoc(doc);
			await editor.open(doc);
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

<div class="group relative">
	<div
		class="outline-node relative rounded-lg border bg-white p-3 transition-all duration-200"
		style="min-width: 160px; max-width: 220px; border-color: #3b82f6;"
	>
		<!-- Doc icon and title -->
		<div class="flex items-center gap-2">
			<FileText class="h-4 w-4 text-blue-500" />
			<span class="truncate text-sm font-medium text-gray-800">
				{displayTitle}
			</span>
		</div>

		<!-- Open doc button -->
		<button
			class="mt-2 w-full rounded-lg bg-borg-brown/80 p-2 text-xs font-medium transition-colors hover:bg-borg-brown/60 focus:ring-2 focus:ring-borg-blue focus:outline-none disabled:opacity-50"
			onclick={handleOpenDoc}
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

		{#if failure}<p role="alert" class="mt-2 max-w-56 text-xs text-red-700">{failure}</p>{/if}
		<button
			type="button"
			disabled={isCreating}
			onclick={chooseExisting}
			class="nodrag mt-2 text-xs text-zinc-600 underline"
			>{nodeData.outlineDocId ? 'Change linked note' : 'Link existing note'}</button
		>
		{#if choosing}
			<div class="nodrag nowheel mt-2 max-h-48 overflow-y-auto text-xs">
				{#each choices as doc (doc.id)}<button
						type="button"
						disabled={isCreating}
						onclick={() => linkDocument(doc.id)}
						class="block w-full p-2 text-left hover:bg-zinc-100">{doc.title}</button
					>{/each}
				{#if !choices.length}<p>
						No documents in this project collection yet. Create its first note to get started.
					</p>{/if}
				<button type="button" onclick={() => (choosing = false)} class="mt-2 underline"
					>Cancel</button
				>
			</div>
		{/if}

		<!-- Connection handles -->
		<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
		<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
	</div>

	<!-- Action buttons -->
	<div class="absolute -top-5 right-0 flex gap-1">
		{#if nodeData.outlineUrl}
			<button
				onclick={handleOpenInNewTab}
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
			class="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
			title="Delete outline node"
			aria-label="Delete outline node"
			onclick={handleDelete}
		>
			<Trash2 class="h-3 w-3 text-gray-700 hover:text-borg-orange" />
		</button>
	</div>
</div>

<OutlineEditor bind:this={editor} onclose={() => void refreshDoc()} />

<style>
	.outline-node {
		user-select: none;
	}
</style>
