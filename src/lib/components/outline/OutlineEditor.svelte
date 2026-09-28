<script lang="ts">
	import { tick } from 'svelte';
	import { ExternalLink, X, RefreshCw } from '@lucide/svelte';
	import type { OutlineDoc } from '$lib/services/interfaces/IOutlineService';
	let { onclose }: { onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let doc = $state<OutlineDoc | null>(null);
	let generation = $state(0);
	export async function open(value: OutlineDoc) {
		doc = value;
		await tick();
		dialog.showModal();
	}
</script>

<dialog
	bind:this={dialog}
	{onclose}
	aria-label="Outline document editor"
	class="fixed inset-0 m-auto h-[90dvh] max-h-none w-[95vw] max-w-none overflow-hidden rounded-lg border border-zinc-300 bg-white p-0 text-zinc-800 backdrop:bg-black/30"
>
	{#if doc}
		<div class="flex h-full flex-col">
			<header
				class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3"
			>
				<h2 class="min-w-0 truncate text-sm font-semibold">{doc.title}</h2>
				<div class="flex items-center gap-3 text-xs">
					<button type="button" onclick={() => generation++} class="flex items-center gap-1"
						><RefreshCw class="h-3 w-3" />Reload</button
					>
					<a
						href={doc.url}
						target="_blank"
						rel="noopener noreferrer"
						class="flex items-center gap-1">Open in Outline<ExternalLink class="h-3 w-3" /></a
					>
					<button type="button" aria-label="Close document editor" onclick={() => dialog.close()}
						><X class="h-4 w-4" /></button
					>
				</div>
			</header>
			<p class="shrink-0 border-b border-zinc-100 px-4 py-2 text-[11px] text-zinc-500">
				Edit here or directly in Outline. If sign-in is needed, open Outline in a new tab, sign in,
				then reload this editor.
			</p>
			{#key generation}<iframe
					title={doc.title}
					src={doc.url}
					class="min-h-0 w-full flex-1 border-0"
					allow="clipboard-write"
				></iframe>{/key}
		</div>
	{/if}
</dialog>
