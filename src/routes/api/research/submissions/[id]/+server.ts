import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireResearchAccess } from '$lib/server/researchAccess';
import { requestPaperSubmission, SubmissionNotFoundError } from '$lib/server/paperSubmission';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, request, params }) => {
	await requireResearchAccess(locals, request);
	if (!/^[a-f0-9]{64}$/.test(params.id)) error(404, 'Submission not found.');
	if (!env.RESEARCH_INGEST_URL || !env.RESEARCH_INGEST_TOKEN)
		error(503, 'Paper submission is not configured.');
	try {
		const job = await requestPaperSubmission(env.RESEARCH_INGEST_URL, env.RESEARCH_INGEST_TOKEN, {
			owner: locals.user!.uid,
			action: 'status',
			id: params.id
		});
		return json(job, { headers: { 'Cache-Control': 'private, no-store' } });
	} catch (e) {
		if (e instanceof SubmissionNotFoundError) error(404, e.message);
		error(502, e instanceof Error ? e.message : 'Unable to check paper status.');
	}
};
