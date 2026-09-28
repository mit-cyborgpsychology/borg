<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { CheckCircle, RotateCcw } from '@lucide/svelte';

	let { position, done, onChange, onClose } = $props<{
		position: { x: number; y: number };
		done: boolean;
		onChange: (done: boolean) => Promise<void>;
		onClose: () => void;
	}>();
	let menu: HTMLDivElement;
	let button: HTMLButtonElement;
	let left = $state(0);
	let top = $state(0);
	let ready = $state(false);
	let saving = $state(false);
	let error = $state('');
	let mounted = false;

	onMount(() => {
		mounted = true;
		const previousFocus = document.activeElement as HTMLElement | null;
		left = Math.max(8, Math.min(position.x, window.innerWidth - menu.offsetWidth - 8));
		top = Math.max(8, Math.min(position.y, window.innerHeight - menu.offsetHeight - 8));
		ready = true;
		void tick().then(() => {
			if (mounted) button.focus({ preventScroll: true });
		});
		return () => {
			mounted = false;
			if (menu.contains(document.activeElement)) previousFocus?.focus({ preventScroll: true });
		};
	});

	async function change() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			await onChange(!done);
			if (mounted) onClose();
		} catch (cause) {
			if (!mounted) return;
			error = cause instanceof Error ? cause.message : 'Could not update status. Please try again.';
			await tick();
			if (mounted) top = Math.max(8, Math.min(top, window.innerHeight - menu.offsetHeight - 8));
		} finally {
			saving = false;
		}
	}

	function keydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		} else if (event.key === 'Tab') {
			onClose();
		} else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			event.preventDefault();
			button.focus();
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
	aria-label="Project actions"
	aria-busy={saving}
	tabindex="-1"
	onkeydown={keydown}
	oncontextmenu={(event) => event.preventDefault()}
	class="nodrag nopan nowheel fixed z-[100] max-h-[calc(100vh-1rem)] w-52 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg"
	style:left="{left}px"
	style:top="{top}px"
	style:visibility={ready ? 'visible' : 'hidden'}
>
	<button
		bind:this={button}
		type="button"
		role="menuitem"
		aria-disabled={saving}
		onclick={change}
		class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none aria-disabled:opacity-50"
	>
		{#if done}<RotateCcw class="h-4 w-4" />{:else}<CheckCircle class="h-4 w-4" />{/if}
		{done ? 'Mark as not done' : 'Mark as done'}
	</button>
	{#if error}<p role="alert" class="px-3 py-2 text-xs text-red-700">{error}</p>{/if}
</div>
