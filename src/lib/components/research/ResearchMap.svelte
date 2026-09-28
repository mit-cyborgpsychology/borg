<script lang="ts">
	import { SvelteFlow, Background, Controls, useSvelteFlow, type Node } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { untrack, onMount } from 'svelte';
	import ResearchPoint from './ResearchPoint.svelte';
	import ResearchTopic from './ResearchTopic.svelte';
	import type {
		ResearchPaper,
		ResearchMapPoint,
		ResearchTopic as Topic
	} from '$lib/types/research';
	interface Props {
		papers: ResearchPaper[];
		points: ResearchMapPoint[];
		topics: Topic[];
		selectedTopicId: string;
		ontopicselect: (id: string) => void;
		visibleIds: Set<number>;
		selectedId: number | null;
		onselect: (id: number) => void;
	}
	let {
		papers,
		points,
		topics,
		selectedTopicId,
		ontopicselect,
		visibleIds,
		selectedId,
		onselect
	}: Props = $props();
	const nodeTypes = { research: ResearchPoint, topic: ResearchTopic };
	const flow = useSvelteFlow();
	let mapElement: HTMLDivElement;
	onMount(() => {
		let previousWidth = mapElement.clientWidth;
		let previousHeight = mapElement.clientHeight;
		let frame = 0;
		const observer = new ResizeObserver(() => {
			const { clientWidth: width, clientHeight: height } = mapElement;
			if (!width || !height || (width === previousWidth && height === previousHeight)) return;
			previousWidth = width;
			previousHeight = height;
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				void flow.fitView({ padding: 0.22, duration: 200 });
			});
		});
		observer.observe(mapElement);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	});
	const byUrl = $derived(new Map(points.map((point) => [point.url, point])));
	const topicById = $derived(new Map(topics.map((t) => [t.id, t])));
	const paperNodes = $derived<Node[]>(
		papers.flatMap((paper) => {
			const point = byUrl.get(paper.url);
			if (!point) return [];
			return [
				{
					id: String(paper.id),
					type: 'research',
					position: { x: point.x * 850, y: point.y * 620 },
					width: 32,
					height: 32,
					zIndex: selectedId === paper.id ? 10 : 0,
					draggable: false,
					selectable: false,
					focusable: false,
					data: {
						paperId: paper.id,
						title: paper.title,
						color: topicById.get(point.topicId || '')?.color || '#7c8492',
						active: selectedId === paper.id,
						muted: !visibleIds.has(paper.id),
						onselect
					}
				}
			];
		})
	);
	const labelNodes = $derived.by(() => {
		const placed: { x: number; y: number }[] = [];
		return topics.map((topic) => {
			const center = { x: topic.x * 850 + 16, y: topic.y * 620 + 16 };
			// Keep labels near their group while avoiding dots and other labels.
			const candidates = [0, -55, 55, -110, 110, -165, 165].flatMap((dy) =>
				[0, -120, 120].map((dx) => ({ x: center.x + dx - 96, y: center.y + dy - 18 }))
			);
			const penalty = (p: { x: number; y: number }) =>
				placed.filter((q) => Math.abs(q.x - p.x) < 208 && Math.abs(q.y - p.y) < 56).length * 10000 +
				paperNodes.filter(
					(n) =>
						n.position.x + 16 > p.x - 10 &&
						n.position.x + 16 < p.x + 202 &&
						n.position.y + 16 > p.y - 10 &&
						n.position.y + 16 < p.y + 48
				).length *
					1000 +
				Math.hypot(p.x + 96 - center.x, p.y + 18 - center.y);
			const position = candidates.sort((a, b) => penalty(a) - penalty(b))[0];
			placed.push(position);
			return {
				id: `label-${topic.id}`,
				type: 'topic',
				position,
				width: 192,
				height: 40,
				draggable: false,
				selectable: false,
				focusable: false,
				zIndex: 5,
				data: {
					...topic,
					active: selectedTopicId === topic.id,
					muted: Boolean(selectedTopicId && selectedTopicId !== topic.id),
					onselect: ontopicselect
				}
			};
		});
	});
	const nodes = $derived<Node[]>([...paperNodes, ...labelNodes]);
	$effect(() => {
		const id = selectedId;
		if (id === null) return;
		untrack(() => {
			const node = nodes.find((node) => node.id === String(id));
			if (node)
				void flow.setCenter(node.position.x + 16, node.position.y + 16, {
					zoom: flow.getZoom(),
					duration: 250
				});
		});
	});
</script>

<div
	bind:this={mapElement}
	class="relative h-full min-h-0 w-full"
	aria-label="UMAP paper map"
	role="region"
>
	<SvelteFlow
		{nodes}
		edges={[]}
		{nodeTypes}
		fitView
		fitViewOptions={{ padding: 0.22 }}
		minZoom={0.2}
		maxZoom={3}
		nodesDraggable={false}
		nodesConnectable={false}
		elementsSelectable={false}
		nodesFocusable={false}
		deleteKey={null}
		selectionKey={null}
		proOptions={{ hideAttribution: true }}
	>
		<Background patternColor="#d8d8d5" gap={24} size={1} />
		<Controls showLock={false} />
	</SvelteFlow>
	<div
		class="pointer-events-none absolute right-4 bottom-4 rounded-md bg-white/85 px-2 py-1 text-[10px] text-zinc-400"
	>
		UMAP · {paperNodes.length} mapped · Drag to pan, scroll to zoom
	</div>
</div>
