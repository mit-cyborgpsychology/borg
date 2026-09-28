import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireResearchAccess } from '$lib/server/researchAccess';
import { getResearchStatus } from '$lib/server/researchStatus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request }) => {
	await requireResearchAccess(locals, request);
	return json(await getResearchStatus(env, locals.user!.uid), {
		headers: { 'Cache-Control': 'private, no-store' }
	});
};
