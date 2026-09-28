<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<!-- Status feedback stays visible without changing the view's dimensions. -->
<div
	class="pointer-events-none absolute top-2 right-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-1 [&_button]:pointer-events-auto [&>*]:rounded-md [&>*]:bg-white/95 [&>*]:shadow-sm"
>
	{@render children()}
</div>
