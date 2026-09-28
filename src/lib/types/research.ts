export interface ResearchPaper {
	id: number;
	title: string;
	url: string;
	authors: string;
	summary: string;
	sharedBy: string;
	chatName: string;
	driveUrl: string;
	savedAt: string | null;
}

export interface ResearchMapPoint {
	url: string;
	x: number;
	y: number;
	topicId?: string;
}

export interface ResearchTopic {
	id: string;
	label: string;
	color: string;
	count: number;
	x: number;
	y: number;
	labelSource: 'llm' | 'fallback';
}

export interface ResearchMap {
	method: 'umap' | 'insufficient-data';
	generatedAt: string;
	points: ResearchMapPoint[];
	topics: ResearchTopic[];
}

export interface PaperSubmission {
	id: string;
	url: string;
	status: 'queued' | 'processing' | 'saved' | 'already_saved' | 'not_paper' | 'failed';
	message: string;
	title: string;
	updatedAt: string;
}

export interface ResearchHealthCheck {
	updatedAt?: string;
	id: string;
	name: string;
	status: 'ok' | 'error' | 'unconfigured';
	message: string;
}
export interface ResearchStatus {
	checkedAt: string;
	checks: ResearchHealthCheck[];
	submissions: PaperSubmission[];
}
