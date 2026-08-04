<script lang="ts">
	import { X } from '@lucide/svelte';
	import { stickerService } from '../../services/instances';
	import type { StickerCategory } from '../../types/sticker';
	import StickerGrid from './StickerGrid.svelte';

	let { isOpen = $bindable(), onClose } = $props<{
		isOpen: boolean;
		onClose: () => void;
	}>();

	let categories = $state<StickerCategory[]>([]);
	let activeCategory = $state<string>('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	// Load categories when panel opens (with aggressive caching)
	$effect(() => {
		if (isOpen && categories.length === 0) {
			(async () => {
				try {
					console.log('🎨 Loading sticker categories...');
					loading = true;
					error = null;
					
					// The service now has multi-layer caching, so this should be very fast on subsequent calls
					categories = await stickerService.getCategories();
					console.log('🎨 Loaded categories:', categories.length);

					if (categories.length > 0 && !activeCategory) {
						activeCategory = categories[0].slug;
						console.log('🎨 Set active category:', activeCategory);
					}
				} catch (err) {
					console.error('❌ Failed to load sticker categories:', err);
					error = 'Failed to load stickers. Please try again.';
				} finally {
					loading = false;
					console.log(
						'🎨 Loading complete. Categories:',
						categories.length,
						'Active:',
						activeCategory
					);
				}
			})();
		}
	});

	// Get active category data
	let activeCategoryData = $derived(categories.find((cat) => cat.slug === activeCategory));


	function handleCategoryClick(categorySlug: string) {
		if (activeCategory !== categorySlug) {
			activeCategory = categorySlug;
		}
	}

	function handleClose() {
		onClose();
	}

	// Handle escape key to close
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

{#if isOpen}
	<div
		class="flex h-[calc(100vh-64px)] w-80 flex-col overflow-hidden border-l border-zinc-200 bg-white"
		role="dialog"
		aria-modal="true"
		aria-labelledby="sticker-panel-title"
		tabindex="-1"
		onkeydown={handleKeyDown}
	>
		<!-- Header -->
		<div class="border-b border-zinc-200 p-4">
			<div class="flex items-center justify-between">
				<div>
					<h3 class="font-semibold text-black">Stickers</h3>
					<!-- <p class="text-sm text-zinc-500">Add stickers to your canvas</p> -->
				</div>
				<button
					onclick={handleClose}
					class="rounded-lg p-1 text-zinc-400 hover:bg-black hover:text-white"
					aria-label="Close sticker panel"
				>
					<X class="h-5 w-5" />
				</button>
			</div>
		</div>


		<!-- Loading state -->
		{#if loading}
			<div class="flex flex-1 items-center justify-center">
				<div class="flex items-center gap-3 text-black">
					<div
						class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black"
					></div>
					<span>Loading stickers...</span>
				</div>
			</div>
		{:else if error}
			<!-- Error state -->
			<div class="flex flex-1 items-center justify-center p-4">
				<div class="text-center text-red-600">
					<p class="mb-2">⚠️</p>
					<p class="text-sm">{error}</p>
					<button
						onclick={() => stickerService.refreshCatalog()}
						class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-100"
					>
						Retry
					</button>
				</div>
			</div>
		{:else}
			<!-- Category tabs and content -->
			<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
				<!-- Category tabs -->
				<div class="flex flex-shrink-0 overflow-x-auto border-b border-zinc-200">
					{#each categories as category}
						<button
							onclick={() => handleCategoryClick(category.slug)}
							class="flex-shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors {activeCategory ===
							category.slug
								? 'border-zinc-200 bg-borg-beige text-black'
								: 'border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-black'}"
						>
							{category.name}
							<span class="ml-2 text-xs opacity-60">({category.count})</span>
						</button>
					{/each}
				</div>

				<!-- Active category content -->
				{#if activeCategoryData}
					{#key activeCategory}
						<StickerGrid category={activeCategoryData} />
					{/key}
				{:else}
					<div class="flex flex-1 items-center justify-center text-zinc-500">
						<span>No category selected</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
