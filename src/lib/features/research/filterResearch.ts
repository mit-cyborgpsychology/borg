import type { ResearchPaper } from '../../types/research';

export type ResearchSort = 'newest' | 'oldest' | 'title';

export function researchSource(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

export function filterResearch(
	papers: ResearchPaper[],
	query: string,
	source: string,
	sort: ResearchSort
): ResearchPaper[] {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return papers
		.filter((paper) => {
			if (source && researchSource(paper.url) !== source) return false;
			const text = [
				paper.title,
				paper.authors,
				paper.summary,
				paper.sharedBy,
				paper.chatName,
				paper.url
			]
				.join(' ')
				.toLocaleLowerCase();
			return terms.every((term) => text.includes(term));
		})
		.sort((a, b) => {
			if (sort === 'title') return a.title.localeCompare(b.title) || a.id - b.id;
			// Missing saved dates stay at the end in both chronological orders.
			if (!a.savedAt && b.savedAt) return 1;
			if (a.savedAt && !b.savedAt) return -1;
			const difference =
				(a.savedAt ? Date.parse(a.savedAt) : 0) - (b.savedAt ? Date.parse(b.savedAt) : 0);
			return (sort === 'oldest' ? difference : -difference) || a.id - b.id;
		});
}
