import { createResource } from '../../state/resource.ts';
import type { IResearchService } from '../../services/interfaces/IResearchService';
import type { ResearchPaper, ResearchMap } from '../../types/research';

export function createResearchState(service: IResearchService) {
	const papers = createResource<ResearchPaper[]>([]);
	const map = createResource<ResearchMap | null>(null);
	return {
		papers,
		map,
		load: () =>
			Promise.all([papers.load(() => service.listPapers()), map.load(() => service.getMap())]),
		reloadMap: () => map.load(() => service.getMap()),
		dispose: () => {
			papers.dispose();
			map.dispose();
		}
	};
}
