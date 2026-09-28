<script lang="ts">
	let { data } = $props<{
		data: {
			paperId: number;
			title: string;
			color: string;
			active: boolean;
			muted: boolean;
			onselect: (id: number) => void;
		};
	}>();
</script>

<button
	type="button"
	class="nodrag nopan group relative flex h-8 w-8 items-center justify-center rounded-full outline-none"
	aria-label={`Select paper: ${data.title}`}
	aria-pressed={data.active}
	disabled={data.muted}
	style:opacity={data.muted ? 0.12 : 1}
	onclick={() => data.onselect(data.paperId)}
	title={data.title}
>
	<span
		class="block h-3.5 w-3.5 rounded-full transition-transform group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-zinc-800 {data.active
			? 'scale-125 ring-2 ring-zinc-800'
			: ''}"
		style:background-color={data.color}
	></span>
	<span
		aria-hidden="true"
		class="pointer-events-none absolute top-9 left-1/2 z-20 w-max max-w-56 -translate-x-1/2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-center text-[11px] leading-snug text-zinc-800 {data.active
			? 'block'
			: 'hidden group-hover:block group-focus-visible:block'}">{data.title}</span
	>
</button>
