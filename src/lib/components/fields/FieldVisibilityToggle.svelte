<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';

	let { label, visible, ontoggle } = $props<{
		label: string;
		visible: boolean;
		ontoggle: () => void;
	}>();
</script>

<button
	type="button"
	onclick={ontoggle}
	aria-pressed={visible}
	aria-label={`${visible ? 'Hide' : 'Show'} ${label} on canvas`}
	title={visible ? 'Hide on canvas' : 'Show on canvas'}
	class="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400"
>
	{#if visible}<Eye class="h-3 w-3" />{:else}<EyeOff class="h-3 w-3" />{/if}
</button>
