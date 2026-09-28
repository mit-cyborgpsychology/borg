<script lang="ts">
	interface Props {
		data: {
			id: string;
			label: string;
			color: string;
			count: number;
			active: boolean;
			muted: boolean;
			onselect: (id: string) => void;
		};
	}
	let { data }: Props = $props();
</script>

<button
	type="button"
	class="nodrag nopan w-48 cursor-pointer text-center text-[13px] leading-snug font-semibold outline-none hover:underline focus-visible:underline {data.active
		? 'underline underline-offset-4'
		: ''}"
	style:color={data.color}
	style:opacity={data.muted ? 0.3 : 1}
	aria-label={`Filter topic: ${data.label}`}
	aria-pressed={data.active}
	onclick={() => data.onselect(data.id)}
>
	{data.label}<span class="ml-1.5 text-[10px] font-normal opacity-70">{data.count}</span>
</button>
