import { createResource } from '../../state/resource.ts';
import type { IResearchService } from '../../services/interfaces/IResearchService';
import type { ResearchPaper, ResearchMap, PaperSubmission } from '../../types/research';

export function createResearchState(service: IResearchService) {
	const papers = createResource<ResearchPaper[]>([]);
	const map = createResource<ResearchMap | null>(null);
	const submission = createResource<PaperSubmission | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let mapTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let jobId: string | null = null;
	let generation = 0;
	const load = () =>
		Promise.all([papers.load(() => service.listPapers()), map.load(() => service.getMap())]);
	async function track(job: PaperSubmission | null | undefined, expectedGeneration: number) {
		if (disposed || !job || expectedGeneration !== generation) return;
		jobId = job.id;
		if (['queued', 'processing'].includes(job.status))
			timer = setTimeout(() => void checkSubmission(), 2000);
		else if (['saved', 'already_saved'].includes(job.status)) {
			await load();
			if (!disposed && expectedGeneration === generation)
				mapTimer = setTimeout(() => void map.load(() => service.getMap()), 5000);
		}
	}
	async function checkSubmission() {
		clearTimeout(timer);
		const id = jobId;
		const expectedGeneration = generation;
		if (id) await track(await submission.load(() => service.getSubmission(id)), expectedGeneration);
	}
	return {
		papers,
		map,
		submission,
		submitPaper: async (url: string) => {
			clearTimeout(timer);
			jobId = null;
			const expectedGeneration = ++generation;
			clearTimeout(mapTimer);
			await track(await submission.load(() => service.submitPaper(url)), expectedGeneration);
		},
		checkSubmission,
		load,
		reloadMap: () => map.load(() => service.getMap()),
		dispose: () => {
			disposed = true;
			clearTimeout(timer);
			clearTimeout(mapTimer);
			submission.dispose();
			papers.dispose();
			map.dispose();
		}
	};
}
