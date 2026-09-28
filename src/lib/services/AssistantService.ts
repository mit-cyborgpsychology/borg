import type { IAssistantService } from './interfaces/IAssistantService';
import type { IProjectsService } from './interfaces/IProjectsService';
import type { ReadSession } from './interfaces/Session';
export class AssistantService implements IAssistantService {
	constructor(
		private projects: IProjectsService,
		private readSession: ReadSession
	) {}
	async request(
		projectSlug: string,
		selectedNodeIds: string[],
		body: string,
		signal?: AbortSignal | null
	) {
		const user = this.readSession().user;
		if (!user) throw new Error('Sign in to use the assistant.');
		const project = await this.projects.getProject(projectSlug);
		if (!project) throw new Error('Project not found.');
		const response = await fetch('/api/assistant', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${await user.getIdToken()}`
			},
			body: JSON.stringify({ ...JSON.parse(body), projectId: project.id, selectedNodeIds }),
			signal
		});
		if (!response.ok) {
			const detail = await response.json().catch(() => null);
			throw new Error(detail?.message || 'Unable to reach the assistant.');
		}
		return response;
	}
}
