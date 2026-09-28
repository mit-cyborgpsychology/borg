import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireResearchAccess } from '$lib/server/researchAccess';
import { requestPaperSubmission } from '$lib/server/paperSubmission';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	await requireResearchAccess(locals, request);
	if (!env.RESEARCH_INGEST_URL || !env.RESEARCH_INGEST_TOKEN)
		error(503, 'Paper submission is not configured.');
	if (Number(request.headers.get('content-length')) > 4096) error(413, 'Request too large.');
	const reader = request.body?.getReader();
	if (!reader) error(400, 'Enter a paper URL.');
	const chunks: Uint8Array[] = [];
	let length = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		length += value.byteLength;
		if (length > 4096) {
			await reader.cancel();
			error(413, 'Request too large.');
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	let value;
	try {
		value = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		error(400, 'Enter a paper URL.');
	}
	if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.url !== 'string')
		error(400, 'Enter a paper URL.');
	let url: URL;
	try {
		url = new URL(value.url);
		if (
			value.url.length > 2048 ||
			!['http:', 'https:'].includes(url.protocol) ||
			url.username ||
			url.password
		)
			throw new Error();
	} catch {
		error(400, 'Enter an HTTP or HTTPS paper URL.');
	}
	try {
		const job = await requestPaperSubmission(env.RESEARCH_INGEST_URL, env.RESEARCH_INGEST_TOKEN, {
			owner: locals.user!.uid,
			sharedBy: locals.user!.email || 'Web',
			url: url.href
		});
		return json(job, { status: 202, headers: { 'Cache-Control': 'private, no-store' } });
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Unable to submit paper.');
	}
};
