import type { Node, Edge } from '@xyflow/svelte';

import type { NodeUpdate } from '../../types/canvas';
export type { NodeUpdate } from '../../types/canvas';

export interface INodesService {
	addNode(templateType: string, position: { x: number; y: number }): Promise<Node>;
	updateNode(nodeId: string, updates: NodeUpdate, userId?: string): Promise<boolean>;
	deleteNode(nodeId: string): Promise<boolean>;
	getNodes(): Promise<Node[]>;
	addEdge(edgeData: Edge): Promise<Edge>;
	deleteEdge(edgeId: string): Promise<boolean>;
	getEdges(): Promise<Edge[]>;
	saveBatch(nodes: Node[], edges: Edge[]): Promise<void>;
	subscribeToNodes(callback: (nodes: Node[]) => void, onError?: (error: Error) => void): () => void;
	subscribeToEdges(callback: (edges: Edge[]) => void, onError?: (error: Error) => void): () => void;
}
