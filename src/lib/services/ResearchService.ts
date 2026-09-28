import type { IResearchService } from './interfaces/IResearchService';
import type { ReadSession } from './interfaces/Session';
import type { ResearchPaper, ResearchMap } from '../types/research';

export class ResearchService implements IResearchService {
	private readSession: ReadSession;
	constructor(readSession: ReadSession) {
		this.readSession = readSession;
	}

	async listPapers(): Promise<ResearchPaper[]> {
		const user = this.readSession().user;
		if (!user) throw new Error('Sign in to view research.');
		const response = await fetch('/api/research', {
			headers: { Authorization: `Bearer ${await user.getIdToken()}` },
			signal: AbortSignal.timeout(30_000)
		});
		if (!response.ok) {
			if (response.status === 401) throw new Error('Your session expired. Please sign in again.');
			if (response.status === 403) throw new Error('Your account needs approval to view research.');
			throw new Error('Research is unavailable right now. Please try again.');
		}
		const { papers }: { papers: ResearchPaper[] } = await response.json();
		return papers;
	}

	async getMap(): Promise<ResearchMap> {
		const user = this.readSession().user;
		if (!user) throw new Error('Sign in to view the research map.');
		const response = await fetch('/api/research/map', {
			headers: { Authorization: `Bearer ${await user.getIdToken()}` },
			signal: AbortSignal.timeout(40_000)
		});
		if (!response.ok)
			throw new Error('The research map is unavailable. You can still browse the papers.');
		return response.json();
	}
}
