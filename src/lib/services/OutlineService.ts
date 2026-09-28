import type { IOutlineService, OutlineDoc, OutlineDocSummary } from './interfaces/IOutlineService';
import type { IProjectsService } from './interfaces/IProjectsService';
import type { ReadSession } from './interfaces/Session';

export class OutlineService implements IOutlineService {
	constructor(
		private projectsService: IProjectsService,
		private readSession: ReadSession
	) {}

	private async authHeader(): Promise<Record<string, string>> {
		const user = this.readSession().user;
		if (!user) throw new Error('Must be signed in to use the Outline integration');
		return { Authorization: `Bearer ${await user.getIdToken()}` };
	}

	private async nodeRequest(
		projectSlug: string,
		nodeId: string,
		action: string,
		documentId?: string
	) {
		const headers = await this.authHeader();
		const project = await this.projectsService.getProject(projectSlug);
		if (!project) throw new Error('Project not found.');
		const response = await fetch('/api/outline/docs', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify({ projectId: project.id, nodeId, action, documentId }),
			signal: AbortSignal.timeout(100_000)
		});
		const result = await response.json().catch(() => null);
		if (!response.ok)
			throw new Error(result?.message || 'Unable to connect to Outline. Please retry.');
		return result;
	}
	async createDoc(projectSlug: string, nodeId: string): Promise<OutlineDoc> {
		return this.nodeRequest(projectSlug, nodeId, 'create');
	}
	async getNodeDoc(projectSlug: string, nodeId: string): Promise<OutlineDoc> {
		return this.nodeRequest(projectSlug, nodeId, 'read');
	}
	async linkDoc(projectSlug: string, nodeId: string, documentId: string): Promise<OutlineDoc> {
		return this.nodeRequest(projectSlug, nodeId, 'link', documentId);
	}
	async listProjectDocs(projectSlug: string, nodeId: string): Promise<OutlineDocSummary[]> {
		return (await this.nodeRequest(projectSlug, nodeId, 'list')).docs;
	}

	async searchDocs(query: string): Promise<OutlineDocSummary[]> {
		const headers = await this.authHeader();
		const res = await fetch(`/api/outline/search?q=${encodeURIComponent(query)}`, { headers });
		if (!res.ok) {
			throw new Error(`Failed to search Outline docs: ${await res.text()}`);
		}
		const { docs } = await res.json();
		return docs;
	}

	async listDocs(collectionIds: string[]): Promise<OutlineDocSummary[]> {
		if (collectionIds.length === 0) return [];
		const headers = await this.authHeader();
		const params = new URLSearchParams();
		for (const id of collectionIds) params.append('collectionId', id);
		const res = await fetch(`/api/outline/search?${params.toString()}`, { headers });
		if (!res.ok) {
			throw new Error(`Failed to list Outline docs: ${await res.text()}`);
		}
		const { docs } = await res.json();
		return docs;
	}
}
