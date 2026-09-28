<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { ExternalLink, X, RefreshCw, Maximize2 } from '@lucide/svelte';
	import type { OutlineDoc } from '$lib/services/interfaces/IOutlineService';
	let {
		onclose,
		doc,
		controls,
		topControls,
		height = 480,
		resizing = false
	}: {
		onclose: () => void;
		doc: OutlineDoc;
		controls?: Snippet<[boolean]>;
		topControls?: Snippet;
		height?: number;
		resizing?: boolean;
	} = $props();
	let dialog: HTMLDialogElement;
	let expanded = $state(false);
	let generation = $state(0);
	export async function open(value: OutlineDoc) {
		doc = value;
		await tick();
		dialog.close();
		expanded = true;
		dialog.showModal();
	}
	function handleClose() {
		// Switching from a non-modal dialog to a modal queues a close event too.
		if (dialog.open) return;
		expanded = false;
		dialog.show();
		onclose();
	}
</script>

<dialog
	bind:this={dialog}
	open
	onclose={handleClose}
	style:height={expanded ? '90dvh' : `${height}px`}
	aria-label="Wiki document editor"
	class={expanded
		? 'fixed inset-0 m-auto h-[90dvh] max-h-none w-[95vw] max-w-none overflow-hidden rounded-lg border border-zinc-300 bg-white p-0 text-zinc-800 backdrop:bg-black/30'
		: 'relative m-0 max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 text-zinc-800'}
>
	{#if doc}
		<div class="flex h-full flex-col">
			<header
				class="flex h-8 shrink-0 items-center justify-end rounded-t-lg border-b border-zinc-200 bg-zinc-50 px-2"
				class:cursor-grab={!expanded}
				title={expanded ? undefined : 'Drag to move wiki node'}
			>
				<div class="nodrag nopan flex items-center gap-2 text-zinc-500">
					{@render topControls?.()}
				</div>
			</header>
			{#key generation}<iframe
					title={doc.title}
					src={doc.url}
					class="nodrag nopan nowheel min-h-0 w-full flex-1 border-0"
					style:pointer-events={resizing ? 'none' : 'auto'}
					allow="clipboard-write"
				></iframe>{/key}
			<footer
				class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2"
			>
				<div class="nodrag nopan nowheel flex flex-wrap items-center gap-3 text-xs">
					<button type="button" onclick={() => generation++} class="flex items-center gap-1"
						><RefreshCw class="h-3 w-3" />Reload</button
					>
					{#if !expanded}<button
							type="button"
							onclick={() => open(doc)}
							class="flex items-center gap-1"
							aria-label="Expand note"><Maximize2 class="h-3 w-3" />Expand</button
						>{/if}
					<a
						href={doc.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1">Open in Outline<ExternalLink class="h-3 w-3" /></a
					>
				</div>
				<div class="nodrag nopan nowheel flex items-center gap-3 text-xs">
					{@render controls?.(expanded)}
					{#if expanded}<button
							type="button"
							aria-label="Close document editor"
							onclick={() => dialog.close()}><X class="h-4 w-4" /></button
						>{/if}
				</div>
			</footer>
		</div>
	{/if}
</dialog>

<style>
	button:not(:disabled) {
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
	}
</style>
