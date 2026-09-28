import type { Project } from '../../types/project';

export interface IProjectsService {
	getAllProjects(): Promise<Project[]>;
	getProject(slug: string): Promise<Project | null>;
	getProjectById?(id: string): Promise<Project | null>;
	createProject(data: {
		title: string;
		description?: string;
		status?: string;
		createdBy?: string;
	}): Promise<Project>;
	updateProject(slugOrId: string, updates: Partial<Project>): Promise<Project | null>;
	deleteProject(slugOrId: string): Promise<boolean>;
	updateNodeCount(slug: string, count: number): Promise<void>;
	invalidateStatusCache(slug: string): void;
	invalidateAllStatusCaches(): void;
	getGlobalStatusCounts(): Promise<{ todo: number; doing: number; done: number }>;
	getProjectStatusCounts(slug: string): Promise<{ todo: number; doing: number; done: number }>;

	// Collaborator management
	addCollaboratorToProject?(projectSlug: string, userId: string): Promise<boolean>;
	removeCollaboratorFromProject?(projectSlug: string, userId: string): Promise<boolean>;
	getProjectCollaborators?(projectSlug: string): Promise<
		Array<{
			id: string;
			email: string;
			name: string;
			userType: 'member' | 'collaborator';
		}>
	>;

	// Real-time subscriptions (Firebase only)
	subscribeToProjects?(callback: (projects: Project[]) => void): () => void;
	subscribeToProject?(slug: string, callback: (project: Project | null) => void): () => void;
}
