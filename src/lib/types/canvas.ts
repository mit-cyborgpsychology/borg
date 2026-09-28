export interface CanvasNode {
	id: string;
	type?: string;
	position: { x: number; y: number };
	data: Record<string, unknown>;
	createdAt?: unknown;
	updatedAt?: unknown;
}

export interface CanvasEdge {
	id: string;
	source: string;
	target: string;
	type?: string;
	style?: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
}

export interface NodeUpdate {
	position?: { x: number; y: number };
	nodeData?: Record<string, unknown>;
	data?: { templateType?: string; nodeData?: Record<string, unknown>; projectSlug?: string };
}
