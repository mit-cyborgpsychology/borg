<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getAppServices } from '$lib/app/context';
	import { createResource } from '$lib/state/resource';
	import type { StickerCategory } from '../../types/sticker';
	import StickerGrid from './StickerGrid.svelte';
	import AsyncStatus from '../AsyncStatus.svelte';

	let { onClose } = $props<{ onClose: () => void }>();
	const { stickerService } = getAppServices();
	const catalog = createResource<StickerCategory[]>([]);
	let activeCategory = $state('');
	let picker = $state<HTMLElement>();
	let categories = $derived($catalog.data);
	let activeCategoryData = $derived(
		categories.find((category) => category.slug === activeCategory) ?? categories[0]
	);

	async function load(refresh = false) {
		await catalog.load(async () =>
			refresh ? (await stickerService.refreshCatalog()).categories : stickerService.getCategories()
		);
	}
	onMount(() => {
		void load();
	});
	onDestroy(() => catalog.dispose());
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && picker?.contains(document.activeElement)) {
			event.stopPropagation();
			onClose();
		}
	}}
/>

<section
	bind:this={picker}
	aria-label="Sticker picker"
	class="flex min-h-0 w-full flex-1 flex-col overflow-hidden"
>
	<AsyncStatus state={$catalog} pendingLabel="Loading stickers…" onRetry={() => void load(true)} />
	{#if categories.length > 0}
		<div class="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-100 px-3 py-2">
			{#each categories as category (category.slug)}
				<button
					type="button"
					onclick={() => (activeCategory = category.slug)}
					aria-pressed={activeCategoryData?.slug === category.slug}
					class="shrink-0 rounded px-2 py-1.5 text-xs transition-colors {activeCategoryData?.slug ===
					category.slug
						? 'bg-zinc-100 text-zinc-900'
						: 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'}"
				>
					{category.name}
					<span class="ml-1 text-zinc-400">{category.count}</span>
				</button>
			{/each}
		</div>
		{#if activeCategoryData}
			{#key activeCategoryData.slug}<StickerGrid category={activeCategoryData} />{/key}
		{/if}
	{:else if $catalog.status === 'ready'}
		<p class="p-4 text-xs text-zinc-400">No stickers yet</p>
	{/if}
</section>
