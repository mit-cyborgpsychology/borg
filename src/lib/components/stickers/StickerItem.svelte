<script lang="ts">
	import { getCanvasActions } from '$lib/features/canvas/context';
	const canvasActions = getCanvasActions();
	import { getAppServices } from '$lib/app/context';
	import type { Sticker } from '../../types/sticker';

	const { stickerService } = getAppServices();
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
		canvasActions.addSticker({
			type: 'sticker',
			stickerUrl: imageUrl,
			category,
			filename: sticker.filename,
			name: sticker.name
		});
	}

	// Drag-and-drop handlers
	function handleDragStart(e: DragEvent) {
		if (!imageUrl || !e.dataTransfer) return;
		e.dataTransfer.effectAllowed = 'copy';
		e.dataTransfer.setData(
			'application/borg-sticker',
			JSON.stringify({
				stickerUrl: imageUrl,
				category,
				filename: sticker.filename,
				name: sticker.name
			})
		);
	}
</script>

<div
	class="sticker-item group relative cursor-grab rounded-lg p-1 transition-colors hover:bg-gray-100"
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
		<div
			class="flex aspect-square w-full items-center justify-center rounded-lg border border-red-200 bg-red-50"
		>
			<span class="text-xs text-red-500">✗</span>
		</div>
	{:else if !imageUrl}
		<!-- Loading URL placeholder -->
		<div
			class="flex aspect-square w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100"
		>
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black"></div>
		</div>
	{:else}
		<!-- Image container with loading overlay -->
		<div class="relative aspect-square w-full">
			<!-- Loading spinner overlay (shown while image loads) -->
			{#if !imageLoaded}
				<div
					class="absolute inset-0 z-10 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-100"
				>
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black"
					></div>
				</div>
			{/if}

			<!-- Sticker image -->
			<img
				src={imageUrl}
				alt=""
				class="h-full w-full rounded-lg object-contain transition-all duration-200 group-hover:scale-105 {imageLoaded
					? 'opacity-100'
					: 'opacity-0'}"
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
