import type { ResearchPaper, ResearchMap } from '../../types/research';

export interface IResearchService {
	listPapers(): Promise<ResearchPaper[]>;
	getMap(): Promise<ResearchMap>;
}
