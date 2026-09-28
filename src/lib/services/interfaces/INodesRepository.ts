import type { CanvasNode, CanvasEdge, NodeUpdate } from '../../types/canvas';

export interface INodesRepository {
	createNode(
		template: string,
		position: CanvasNode['position'],
		fields: Record<string, unknown>,
		createdBy: string
	): Promise<CanvasNode>;
	updateNode(id: string, updates: NodeUpdate, userId?: string): Promise<boolean>;
	deleteNode(id: string): Promise<boolean>;
	getNodes(): Promise<CanvasNode[]>;
	addEdge(edge: CanvasEdge): Promise<CanvasEdge>;
	deleteEdge(id: string): Promise<boolean>;
	getEdges(): Promise<CanvasEdge[]>;
	saveBatch(nodes: CanvasNode[], edges: CanvasEdge[]): Promise<void>;
	subscribeToNodes(next: (nodes: CanvasNode[]) => void, error?: (error: Error) => void): () => void;
	subscribeToEdges(next: (edges: CanvasEdge[]) => void, error?: (error: Error) => void): () => void;
}
