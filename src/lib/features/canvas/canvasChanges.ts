import type { Node, Edge } from '@xyflow/svelte';

export function snapshotCanvas(nodes: Node[], edges: Edge[]) {
	return {
		nodes: nodes.map((node) => ({ ...node, position: { ...node.position } })),
		edges: edges.map((edge) => ({ ...edge }))
	};
}

/** Compare persisted fields only; selection and other UI state never trigger writes. */
export function getCanvasChanges(
	nodes: Node[],
	edges: Edge[],
	previousNodes: Node[],
	previousEdges: Edge[]
) {
	const oldNodes = new Map(previousNodes.map((node) => [node.id, node]));
	const oldEdges = new Map(previousEdges.map((edge) => [edge.id, edge]));
	return {
		nodes: nodes.filter((node) => {
			const old = oldNodes.get(node.id);
			return !old || node.position.x !== old.position.x || node.position.y !== old.position.y;
		}),
		edges: edges.filter((edge) => {
			const old = oldEdges.get(edge.id);
			return (
				!old ||
				edge.source !== old.source ||
				edge.target !== old.target ||
				edge.type !== old.type ||
				edge.style !== old.style
			);
		})
	};
}
