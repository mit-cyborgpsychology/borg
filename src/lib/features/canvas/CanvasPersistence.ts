import type { Node, Edge } from '@xyflow/svelte';
import { getCanvasChanges, snapshotCanvas } from './canvasChanges.ts';

/** Serializes geometry writes and keeps unacknowledged edits available for retry. */
export class CanvasPersistence {
	private nodes: Node[] = [];
	private edges: Edge[] = [];
	private pendingNodes = new Map<string, Node>();
	private pendingEdges = new Map<string, Edge>();
	private inFlight: Promise<void> | null = null;
	private disposed = false;
	private write: (nodes: Node[], edges: Edge[]) => Promise<void>;

	constructor(write: (nodes: Node[], edges: Edge[]) => Promise<void>) {
		this.write = write;
	}

	receiveNodes(nodes: Node[]): Node[] {
		this.nodes = snapshotCanvas(nodes, []).nodes;
		// A remote deletion wins over an unsaved position; never recreate the node.
		const ids = new Set(nodes.map((node) => node.id));
		for (const id of this.pendingNodes.keys()) if (!ids.has(id)) this.pendingNodes.delete(id);
		return nodes.map((node) => {
			const pending = this.pendingNodes.get(node.id);
			return pending ? { ...node, position: { ...pending.position } } : node;
		});
	}

	receiveEdges(edges: Edge[]): Edge[] {
		this.edges = snapshotCanvas([], edges).edges;
		const ids = new Set(edges.map((edge) => edge.id));
		for (const id of this.pendingEdges.keys()) if (!ids.has(id)) this.pendingEdges.delete(id);
		return edges.map((edge) => {
			const pending = this.pendingEdges.get(edge.id);
			return pending
				? {
						...edge,
						source: pending.source,
						target: pending.target,
						type: pending.type,
						style: pending.style
					}
				: edge;
		});
	}

	stage(nodes: Node[], edges: Edge[]): boolean {
		if (this.disposed) return false;
		const baselineNodes = this.nodes.map((node) => this.pendingNodes.get(node.id) ?? node);
		const baselineEdges = this.edges.map((edge) => this.pendingEdges.get(edge.id) ?? edge);
		const nodeIds = new Set(this.nodes.map((node) => node.id));
		const edgeIds = new Set(this.edges.map((edge) => edge.id));
		// Creation/deletion has its own repository commands. Geometry saves only
		// touch records received from the server, never transient UI identifiers.
		const changes = getCanvasChanges(
			nodes.filter((node) => nodeIds.has(node.id)),
			edges.filter((edge) => edgeIds.has(edge.id)),
			baselineNodes,
			baselineEdges
		);
		const snapshot = snapshotCanvas(changes.nodes, changes.edges);
		for (const node of snapshot.nodes) this.pendingNodes.set(node.id, node);
		for (const edge of snapshot.edges) this.pendingEdges.set(edge.id, edge);
		return snapshot.nodes.length > 0 || snapshot.edges.length > 0;
	}

	flush(): Promise<void> {
		if (this.inFlight) return this.inFlight;
		this.inFlight = this.drain().finally(() => {
			this.inFlight = null;
		});
		return this.inFlight;
	}

	private async drain(): Promise<void> {
		while (!this.disposed && (this.pendingNodes.size || this.pendingEdges.size)) {
			const nodes = [...this.pendingNodes.values()];
			const edges = [...this.pendingEdges.values()];
			await this.write(nodes, edges);
			// Edits made while awaiting the write stay queued for the next batch.
			for (const node of nodes) {
				this.nodes = this.nodes.map((old) =>
					old.id === node.id ? { ...old, position: node.position } : old
				);
				if (this.pendingNodes.get(node.id) === node) this.pendingNodes.delete(node.id);
			}
			for (const edge of edges) {
				this.edges = this.edges.map((old) =>
					old.id === edge.id
						? {
								...old,
								source: edge.source,
								target: edge.target,
								type: edge.type,
								style: edge.style
							}
						: old
				);
				if (this.pendingEdges.get(edge.id) === edge) this.pendingEdges.delete(edge.id);
			}
		}
	}

	dispose() {
		this.disposed = true;
		this.pendingNodes.clear();
		this.pendingEdges.clear();
	}
}
