<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Handle, Position, useSvelteFlow } from '@xyflow/svelte';
	import { Lock, Unlock, Trash2 } from '@lucide/svelte';
	import { getCanvasActions } from '$lib/features/canvas/context';
	import { describeLink } from '$lib/features/links/linkNode';

	let { data, id } = $props<{ data: any; id: string; isBeingEdited?: boolean }>();
	const actions = getCanvasActions();
	const { getViewport } = useSvelteFlow();
	let nodeData = $derived(data.nodeData || {});
	let link = $derived(describeLink(nodeData.url));
	let width = $state(400);
	let height = $state(300);
	let resizing = $state(false);
	let stopResize = () => {};

	$effect(() => {
		width = Number(nodeData.width) || 400;
		height = Number(nodeData.height) || 300;
	});
	onDestroy(() => stopResize());

	function update(changes: Record<string, unknown>) {
		const updated = { ...nodeData, ...changes };
		data.nodeData = updated;
		actions.nodeUpdate({ nodeId: id, data: { nodeData: updated } });
	}

	function edit() {
		actions.nodeEdit({ nodeId: id, nodeData, templateType: 'link' });
	}

	function remove() {
		if (confirm('Are you sure you want to delete this link node?')) {
			actions.nodeDelete({ nodeId: id });
		}
	}

	function startResize(event: MouseEvent) {
		if (event.button !== 0 || nodeData.locked) return;
		event.preventDefault();
		event.stopPropagation();
		stopResize();
		resizing = true;
		const start = { x: event.clientX, y: event.clientY, width, height, zoom: getViewport().zoom };
		const move = (event: MouseEvent) => {
			width = Math.max(200, start.width + (event.clientX - start.x) / start.zoom);
			height = Math.max(150, start.height + (event.clientY - start.y) / start.zoom);
		};
		const finish = () => {
			stopResize();
			update({ width, height });
		};
		stopResize = () => {
			resizing = false;
			window.removeEventListener('mousemove', move);
			window.removeEventListener('mouseup', finish);
		};
		window.addEventListener('mousemove', move);
		window.addEventListener('mouseup', finish);
	}

	function resizeWithKeyboard(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		width = Math.max(
			200,
			width + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0)
		);
		height = Math.max(
			150,
			height + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0)
		);
		update({ width, height });
	}
</script>

<div
	class="group relative rounded-lg border border-zinc-200 bg-white"
	style:width={`${width}px`}
	style:opacity={nodeData.status === 'Done' ? 0.3 : 1}
>
	<div class="iframe-node relative" style:width={`${width}px`} style:height={`${height}px`}>
		{#if link.url}
			<iframe
				src={link.url}
				title={nodeData.title || `${link.label}: ${link.hostname}`}
				class="nodrag nowheel h-full w-full rounded-t-lg border-0 bg-white"
				style:pointer-events={resizing ? 'none' : 'auto'}
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
				loading="lazy"
			></iframe>
		{:else}
			<button
				onclick={edit}
				class="nodrag flex h-full w-full flex-col items-center justify-center gap-1 rounded-t-lg bg-zinc-50 font-sans text-zinc-500"
			>
				<span class="text-sm">{nodeData.url ? 'Invalid web address' : 'Add a URL'}</span>
				<span class="text-xs">Edit link properties</span>
			</button>
		{/if}
		{#if !nodeData.locked}
			<button
				aria-label="Resize embedded link"
				title="Drag to resize, or use arrow keys"
				onmousedown={startResize}
				onkeydown={resizeWithKeyboard}
				class="nodrag absolute right-0 bottom-0 h-4 w-4 cursor-se-resize rounded-tl bg-white/90 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 focus:opacity-100"
				>↘</button
			>
		{/if}
	</div>
	<div
		class="flex items-center justify-between gap-3 border-t border-zinc-200 px-2 py-2 font-sans text-xs text-zinc-500"
	>
		<span class="min-w-0 truncate" title={nodeData.title || link.hostname}
			>{nodeData.title || link.hostname || 'Link'}
			<span class="font-mono text-[10px] text-zinc-400">· {link.label}</span></span
		>
		<div class="nodrag flex shrink-0 items-center gap-3">
			{#if link.url}<a
					href={link.url}
					target="_blank"
					rel="noopener noreferrer"
					class="hover:text-zinc-900">Open link ↗</a
				>{/if}
			<button onclick={edit} class="hover:text-zinc-900">Edit</button>
			<button
				onclick={() => update({ locked: !nodeData.locked })}
				aria-label={nodeData.locked ? 'Unlock node' : 'Lock node'}
				class="hover:text-zinc-900"
			>
				{#if nodeData.locked}<Lock class="h-3 w-3" />{:else}<Unlock class="h-3 w-3" />{/if}
			</button>
			<button onclick={remove} aria-label="Delete link node" class="hover:text-red-600"
				><Trash2 class="h-3 w-3" /></button
			>
		</div>
	</div>
	<Handle type="target" position={Position.Left} class="!h-2 !w-2 !bg-zinc-600" />
	<Handle type="source" position={Position.Right} class="!h-2 !w-2 !bg-zinc-600" />
</div>
