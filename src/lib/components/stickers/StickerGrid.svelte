<script lang="ts">
	import type { StickerCategory } from '../../types/sticker';
	import StickerItem from './StickerItem.svelte';

	let { category } = $props<{
		category: StickerCategory;
	}>();
</script>

<div class="sticker-grid-container flex h-full min-h-0 flex-col">
	<!-- Stickers grid with scroll -->
	<div class="min-h-0 flex-1 overflow-y-auto p-3">
		<div class="grid grid-cols-4 gap-2">
			{#each category.stickers as sticker (sticker.filename)}
				<StickerItem {sticker} category={category.name} />
			{/each}
		</div>

		<!-- Empty state -->
		{#if category.stickers.length === 0}
			<div class="flex h-32 items-center justify-center text-zinc-500">
				<span>No stickers in this category</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.sticker-grid-container {
		min-height: 0; /* Allow flex child to shrink */
	}
</style>
