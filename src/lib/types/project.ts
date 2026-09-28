export interface Project {
	id: string;
	slug: string;
	title: string;
	description?: string;
	status: 'active' | 'archived' | 'planning' | 'Done';
	createdAt: string;
	updatedAt: string;
	nodeCount: number;
	collaborators: string[];
	viewportPosition?: {
		x: number;
		y: number;
		zoom: number;
	};
	viewportPositions?: Record<string, { x: number; y: number; zoom: number }>;
	outlineCollectionId?: string;
}
