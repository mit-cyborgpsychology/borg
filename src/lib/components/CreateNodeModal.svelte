<script lang="ts">
	import { nodeTemplates } from '../templates';
	import { FolderOpen, GitBranch, Calendar, StickyNote, Link, Square, Image } from '@lucide/svelte';

	let {
		position,
		onCreate,
		onClose,
		error = null
	} = $props<{
		position: { x: number; y: number };
		onCreate: (templateType: string) => Promise<void>;
		error?: string | null;
		onClose: () => void;
	}>();

	let isCreating = $state(false);

	async function handleCreateNode(templateType: string) {
		if (isCreating) return;
		isCreating = true;
		try {
			await onCreate(templateType);
		} finally {
			isCreating = false;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	function getIconComponent(templateId: string) {
		switch (templateId) {
			case 'project':
				return FolderOpen;
			case 'subproject':
				return GitBranch;
			case 'time':
				return Calendar;
			case 'note':
				return StickyNote;
			case 'link':
				return Link;
			case 'blank':
				return Square;
			case 'image':
				return Image;
			default:
				return Square;
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
	onclick={handleBackdropClick}
>
	<div class="box-shadow-black w-96 rounded-lg border border-zinc-200 bg-borg-beige p-6 shadow-xl">
		<h2 class="mb-4 text-lg font-semibold text-black">Create New Node</h2>

		<div class="grid grid-cols-2 gap-3">
			{#each Object.values(nodeTemplates).filter((template) => template.id !== 'project' && template.id !== 'event') as template}
				{@const IconComponent = getIconComponent(template.id)}
				<button
					onclick={() => handleCreateNode(template.id)}
					disabled={isCreating}
					class="flex items-center space-x-3 rounded-lg border border-zinc-200 bg-white p-4 text-left transition-all hover:bg-borg-brown focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<IconComponent class="h-5 w-5 flex-shrink-0 text-black" />
					<span class="font-medium text-black">{template.name}</span>
				</button>
			{/each}
		</div>

		{#if error}<p role="alert" class="py-2 text-sm text-red-700">{error}</p>{/if}
		<div class="mt-6 flex items-center justify-between">
			<div class="text-xs text-zinc-600">
				Press <kbd class="rounded border border-zinc-200 bg-zinc-100 px-2 py-1 text-black"
					>Escape</kbd
				>
				to cancel
			</div>
			<button
				onclick={onClose}
				class="rounded border border-zinc-200 bg-borg-brown px-4 py-2 text-black transition-colors hover:bg-zinc-300"
			>
				Cancel
			</button>
		</div>
	</div>
</div>
