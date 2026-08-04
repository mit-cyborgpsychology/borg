<script lang="ts">
	import type { Sticker } from '../../types/sticker';
	import { stickerService } from '../../services/instances';

	let { sticker, category } = $props<{
		sticker: Sticker;
		category: string;
	}>();

	let imageUrl = $state<string>('');
	let imageLoaded = $state(false);
	let imageError = $state(false);

	// Load the image URL when component mounts
	$effect(() => {
		(async () => {
			try {
				console.log(`🎨 Loading URL for ${category}/${sticker.filename}`);
				imageUrl = await stickerService.getStickerDownloadUrl(category, sticker.filename);
				console.log(`✅ Got URL for ${sticker.filename}:`, imageUrl);
			} catch (error) {
				console.error(`❌ Failed to get sticker URL for ${sticker.filename}:`, error);
				imageError = true;
			}
		})();
	});

	function handleImageLoad() {
		imageLoaded = true;
	}

	function handleImageError() {
		imageError = true;
		console.error(`Failed to load sticker image: ${sticker.filename}`);
	}

	// Click handler to add sticker to canvas
	function handleClick() {
		if (!imageUrl) return;
		document.dispatchEvent(new CustomEvent('addSticker', {
			detail: { type: 'sticker', stickerUrl: imageUrl, category, filename: sticker.filename, name: sticker.name },
			bubbles: true
		}));
	}

	// Drag-and-drop handlers
	function handleDragStart(e: DragEvent) {
		if (!imageUrl || !e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'copy';
		e.dataTransfer.setData('application/borg-sticker', JSON.stringify({
			stickerUrl: imageUrl,
			category,
			filename: sticker.filename,
			name: sticker.name
		}));
	}
</script>

<div
	class="sticker-item group relative cursor-grab hover:bg-gray-100 rounded-lg p-1 transition-colors"
	role="button"
	tabindex="0"
	aria-label="Add {sticker.name} sticker"
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}}
	draggable={!!imageUrl}
	ondragstart={handleDragStart}
>
	{#if imageError}
		<!-- Error placeholder -->
		<div class="w-16 h-16 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
			<span class="text-xs text-red-500">✗</span>
		</div>
	{:else if !imageUrl}
		<!-- Loading URL placeholder -->
		<div class="w-16 h-16 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center">
			<div class="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
		</div>
	{:else}
		<!-- Image container with loading overlay -->
		<div class="relative w-16 h-16">
			<!-- Loading spinner overlay (shown while image loads) -->
			{#if !imageLoaded}
				<div class="absolute inset-0 bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center z-10">
					<div class="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
				</div>
			{/if}
			
			<!-- Sticker image -->
			<img
				src={imageUrl}
				alt=""
				class="w-16 h-16 object-contain rounded-lg transition-all duration-200 group-hover:scale-105 {imageLoaded ? 'opacity-100' : 'opacity-0'}"
				onload={handleImageLoad}
				onerror={handleImageError}
				draggable="true"
			/>
		</div>
	{/if}
</div>

<style>
	.sticker-item {
		touch-action: none;
	}
</style>