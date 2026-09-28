import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireResearchAccess } from '$lib/server/researchAccess';
import { fetchResearchMap } from '$lib/server/researchMap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	await requireResearchAccess(locals, request);
	if (!env.RESEARCH_MAP_URL || !env.RESEARCH_MAP_TOKEN)
		error(503, 'Research map is not configured.');
	try {
		const map = await fetchResearchMap(env.RESEARCH_MAP_URL, env.RESEARCH_MAP_TOKEN);
		return json(map, { headers: { 'Cache-Control': 'private, no-store' } });
	} catch {
		error(502, 'Unable to load the research map.');
	}
};
