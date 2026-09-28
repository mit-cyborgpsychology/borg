import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { listResearch } from '$lib/server/research';
import { requireResearchAccess } from '$lib/server/researchAccess';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	await requireResearchAccess(locals, request);
	if (!env.GRIST_API_URL || !env.GRIST_API_KEY || !env.GRIST_RESEARCH_DOC_ID) {
		error(503, 'Research is not configured.');
	}
	try {
		const papers = await listResearch({
			apiUrl: env.GRIST_API_URL,
			apiKey: env.GRIST_API_KEY,
			docId: env.GRIST_RESEARCH_DOC_ID,
			tableId: env.GRIST_RESEARCH_TABLE_ID || 'Table1'
		});
		return json({ papers }, { headers: { 'Cache-Control': 'private, no-store' } });
	} catch {
		error(502, 'Unable to load research. Please try again.');
	}
};
