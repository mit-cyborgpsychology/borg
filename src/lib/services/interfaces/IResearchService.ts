import type { ResearchPaper, ResearchMap, PaperSubmission } from '../../types/research';

export interface IResearchService {
	listPapers(): Promise<ResearchPaper[]>;
	getMap(): Promise<ResearchMap>;
	submitPaper(url: string): Promise<PaperSubmission>;
	getSubmission(id: string): Promise<PaperSubmission>;
}
