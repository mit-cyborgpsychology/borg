import type {
	ResearchPaper,
	ResearchMap,
	PaperSubmission,
	ResearchStatus
} from '../../types/research';

export interface IResearchService {
	getStatus(): Promise<ResearchStatus>;
	listPapers(): Promise<ResearchPaper[]>;
	getMap(): Promise<ResearchMap>;
	submitPaper(url: string): Promise<PaperSubmission>;
	getSubmission(id: string): Promise<PaperSubmission>;
}
