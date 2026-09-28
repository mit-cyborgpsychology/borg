import type { IResearchService } from './interfaces/IResearchService';
import type { ReadSession } from './interfaces/Session';
import type {
	ResearchPaper,
	ResearchMap,
	PaperSubmission,
	ResearchStatus
} from '../types/research';

export class ResearchService implements IResearchService {
	private readSession: ReadSession;
	constructor(readSession: ReadSession) {
		this.readSession = readSession;
	}

	async getStatus(): Promise<ResearchStatus> {
		const user = this.readSession().user;
		if (!user) throw new Error('Sign in to view service status.');
		const response = await fetch('/api/research/status', {
			headers: { Authorization: `Bearer ${await user.getIdToken()}` },
			signal: AbortSignal.timeout(35_000)
		});
		if (!response.ok)
			throw new Error('Unable to check status. Check your connection and try again.');
		return response.json();
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
	async submitPaper(url: string): Promise<PaperSubmission> {
		return this.submissionRequest('/api/research/submissions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url })
		});
	}
	async getSubmission(id: string): Promise<PaperSubmission> {
		return this.submissionRequest(`/api/research/submissions/${encodeURIComponent(id)}`);
	}
	private async submissionRequest(
		url: string,
		options: RequestInit = {}
	): Promise<PaperSubmission> {
		const user = this.readSession().user;
		if (!user) throw new Error('Sign in to add papers.');
		const response = await fetch(url, {
			...options,
			headers: { ...options.headers, Authorization: `Bearer ${await user.getIdToken()}` },
			signal: AbortSignal.timeout(20_000)
		});
		if (!response.ok) {
			if (response.status === 401) throw new Error('Your session expired. Please sign in again.');
			if (response.status === 403) throw new Error('Your account needs approval to add papers.');
			const body = await response.json().catch(() => null);
			throw new Error(
				typeof body?.message === 'string'
					? body.message
					: 'Unable to submit paper. Please try again.'
			);
		}
		return response.json();
	}
}
