<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { FolderPlus } from '@lucide/svelte';
	import { useSvelteFlow } from '@xyflow/svelte';
	import { projectsToolbarItems, projectToolbarItems } from './nodeCreationItems';

	let { position, view, onCreate, onClose, onCreateProject } = $props<{
		position: { x: number; y: number };
		view: 'project' | 'projects';
		onCreate: (type: string, position: { x: number; y: number }) => Promise<boolean>;
		onClose: () => void;
		onCreateProject?: () => void;
	}>();
	const { screenToFlowPosition } = useSvelteFlow();
	let menu: HTMLDivElement;
	let left = $state(0);
	let top = $state(0);
	let ready = $state(false);
	let saving = $state(false);
	let error = $state('');
	const items = $derived(view === 'projects' ? projectsToolbarItems : projectToolbarItems);
	onMount(() => {
		left = Math.max(8, Math.min(position.x, window.innerWidth - menu.offsetWidth - 8));
		top = Math.max(8, Math.min(position.y, window.innerHeight - menu.offsetHeight - 8));
		ready = true;
		void tick().then(() => menu?.querySelector('button')?.focus());
	});
	async function create(type: string) {
		if (saving) return;
		saving = true;
		error = '';
		try {
			if (await onCreate(type, screenToFlowPosition(position))) onClose();
			else error = 'Could not create node. Please try again.';
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Could not create node. Please try again.';
		} finally {
			saving = false;
		}
	}
	function keydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape' || event.key === 'Tab') {
			onClose();
			return;
		}
		const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
		const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
		if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			const next =
				event.key === 'Home'
					? 0
					: event.key === 'End'
						? buttons.length - 1
						: (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
			buttons[next]?.focus();
		}
	}
</script>

<svelte:window
	onpointerdown={(event) => {
		if (!menu?.contains(event.target as Node)) onClose();
	}}
	onresize={onClose}
/>
<div
	bind:this={menu}
	role="menu"
	aria-label="Create node"
	tabindex="-1"
	onkeydown={keydown}
	oncontextmenu={(event) => event.preventDefault()}
	class="nodrag nopan nowheel fixed z-[100] max-h-[calc(100vh-1rem)] w-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={ready ? 'visible' : 'hidden'}
>
	<div class="px-3 py-1.5 text-xs font-medium text-zinc-400">Create node</div>
	{#if view === 'projects' && onCreateProject}
		<button
			role="menuitem"
			disabled={saving}
			onclick={() => {
				onCreateProject?.();
				onClose();
			}}
			class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:opacity-50"
		>
			<FolderPlus class="h-4 w-4" />New Project
		</button>
		<div role="separator" class="my-1 border-t border-zinc-100"></div>
	{/if}
	{#each items as item (item.id)}
		<button
			role="menuitem"
			disabled={saving}
			onclick={() => create(item.id)}
			class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:opacity-50"
		>
			<item.icon class="h-4 w-4" />{item.template.name}
		</button>
	{/each}
	{#if error}<p role="alert" class="px-3 py-2 text-xs text-red-700">{error}</p>{/if}
</div>
