<script lang="ts">
	import { Sticker, FolderPlus } from '@lucide/svelte';
	import { projectsToolbarItems, projectToolbarItems } from './nodeCreationItems';

	let {
		view = 'projects',
		onCreateNode,
		onShowStickers,
		onCreateProject
	} = $props<{
		onCreateNode: (templateType: string) => void;
		onShowStickers?: () => void;
		onCreateProject?: () => void;
		view: 'projects' | 'project';
	}>();

	// Special items (not templates)
	const specialItems = [
		{ id: 'stickers', icon: Sticker, name: 'Stickers', action: 'showStickers' }
	];

	// Special items for projects view only
	const projectsSpecialItems = [
		{ id: 'newProject', icon: FolderPlus, name: 'New Project', action: 'createProject' }
	];

	function handleItemClick(templateType: string) {
		onCreateNode(templateType);
	}

	function handleSpecialItemClick(action: string) {
		console.log('🎨 Toolbar handleSpecialItemClick called with action:', action);
		if (action === 'showStickers' && onShowStickers) {
			console.log('🎨 Calling onShowStickers...');
			onShowStickers();
		} else if (action === 'createProject' && onCreateProject) {
			console.log('📁 Calling onCreateProject...');
			onCreateProject();
		}
	}

	// Track if the toolbar is being hovered
	let isToolbarHovered = $state(false);
</script>

<div class="absolute top-1/2 left-4 z-20 -translate-y-1/2">
	<div
		class="flex flex-col rounded-lg border border-zinc-200 bg-white p-1.5"
		onmouseenter={() => (isToolbarHovered = true)}
		onmouseleave={() => (isToolbarHovered = false)}
		role="toolbar"
		tabindex="0"
		aria-label="Node creation toolbar"
	>
		<!-- New Project button - only show in projects view -->
		{#if view === 'projects'}
			{#each projectsSpecialItems as item (item.id)}
				<button
					onclick={() => handleSpecialItemClick(item.action)}
					class="group flex h-8 items-center rounded-md transition-all duration-300 ease-in-out hover:bg-zinc-100 {isToolbarHovered
						? 'w-auto justify-start gap-2 pr-3 pl-2'
						: 'w-8 justify-center'}"
					aria-label={item.name}
				>
					<item.icon class="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-zinc-800" />
					<span
						class="text-xs whitespace-nowrap text-zinc-600 transition-all duration-300 ease-in-out group-hover:text-zinc-900 {isToolbarHovered
							? 'max-w-none opacity-100'
							: 'max-w-0 overflow-hidden opacity-0'}"
					>
						{item.name}
					</span>
				</button>
			{/each}
			<div class="my-1 w-full border-t border-zinc-200"></div>
		{/if}

		{#each view === 'projects' ? projectsToolbarItems : projectToolbarItems as item (item.id)}
			<button
				onclick={() => handleItemClick(item.id)}
				class="group flex h-8 items-center rounded-md transition-all duration-300 ease-in-out hover:bg-zinc-100 {isToolbarHovered
					? 'w-auto justify-start gap-2 pr-3 pl-2'
					: 'w-8 justify-center'}"
				aria-label="Create {item.template.name} node"
			>
				<item.icon class="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-zinc-800" />
				<span
					class="text-xs whitespace-nowrap text-zinc-600 transition-all duration-300 ease-in-out group-hover:text-zinc-900 {isToolbarHovered
						? 'max-w-none opacity-100'
						: 'max-w-0 overflow-hidden opacity-0'}"
				>
					{item.template.name}
				</span>
			</button>
		{/each}

		<!-- Special items (like stickers) - show in both project and projects view -->
		<div class="my-1 w-full border-t border-zinc-200"></div>
		{#each specialItems as item (item.id)}
			<button
				onclick={() => handleSpecialItemClick(item.action)}
				class="group flex h-8 items-center rounded-md transition-all duration-300 ease-in-out hover:bg-zinc-100 {isToolbarHovered
					? 'w-auto justify-start gap-2 pr-3 pl-2'
					: 'w-8 justify-center'}"
				aria-label={item.name}
			>
				<item.icon class="h-4 w-4 flex-shrink-0 text-zinc-500 group-hover:text-zinc-800" />
				<span
					class="text-xs whitespace-nowrap text-zinc-600 transition-all duration-300 ease-in-out group-hover:text-zinc-900 {isToolbarHovered
						? 'max-w-none opacity-100'
						: 'max-w-0 overflow-hidden opacity-0'}"
				>
					{item.name}
				</span>
			</button>
		{/each}
	</div>
</div>
