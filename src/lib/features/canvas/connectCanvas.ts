import type { Node, Edge } from '@xyflow/svelte';
import type { INodesService } from '../../services/interfaces/INodesService';

type CanvasSource = Pick<INodesService, 'subscribeToNodes' | 'subscribeToEdges'>;

interface CanvasObserver {
	nodes: (nodes: Node[]) => void;
	edges: (edges: Edge[]) => void;
	error: (error: unknown) => void;
}

/** Owns both subscriptions, including initialization that finishes after unmount. */
export function connectCanvas(
	load: () => Promise<CanvasSource>,
	observer: CanvasObserver
): () => void {
	let disposed = false;
	const subscriptions: Array<() => void> = [];

	function dispose() {
		disposed = true;
		for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
	}

	function reportError(error: unknown) {
		if (!disposed) observer.error(error);
	}

	void (async () => {
		try {
			const source = await load();
			if (disposed) return;
			subscriptions.push(
				source.subscribeToNodes((nodes) => {
					if (!disposed) observer.nodes(nodes);
				}, reportError)
			);
			subscriptions.push(
				source.subscribeToEdges((edges) => {
					if (!disposed) observer.edges(edges);
				}, reportError)
			);
		} catch (error) {
			reportError(error);
			dispose();
		}
	})();

	return dispose;
}
