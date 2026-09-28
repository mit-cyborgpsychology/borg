import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { OutlineApiError } from '$lib/server/outlineApi';
import { projectOutlineDocument } from '$lib/server/outlineProject';
import { createOutlineProjectStore, OutlineProjectError } from '$lib/server/outlineProjectStore';
import type { RequestHandler } from './$types';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'borg-2edc0';
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, 'Sign in to use Outline.');
	if (!env.OUTLINE_API_URL || !env.OUTLINE_API_TOKEN)
		error(503, 'Outline integration is not configured.');
	const input = await request.json().catch(() => null);
	if (
		!input ||
		!['create', 'read', 'link', 'list'].includes(input.action) ||
		![input.projectId, input.nodeId].every(
			(value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
		)
	)
		error(400, 'A project and note are required.');
	if (
		input.action === 'link' &&
		(typeof input.documentId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(input.documentId))
	)
		error(400, 'Choose an Outline document.');
	const store = createOutlineProjectStore(
		projectId,
		request.headers.get('authorization') || '',
		dev && projectId.startsWith('demo-')
	);
	try {
		return json(
			await projectOutlineDocument(
				store,
				{ apiUrl: env.OUTLINE_API_URL, apiToken: env.OUTLINE_API_TOKEN },
				input
			),
			{ headers: { 'Cache-Control': 'private, no-store' } }
		);
	} catch (cause) {
		if (cause instanceof OutlineProjectError) error(cause.status, cause.message);
		if (cause instanceof OutlineApiError) {
			console.error('[outline]', {
				action: input.action,
				endpoint: cause.endpoint,
				status: cause.status
			});
			if ([401, 403].includes(cause.status))
				error(
					502,
					'The Outline integration does not have permission for this document or collection.'
				);
			if (cause.status === 404) error(404, 'The linked Outline document was not found.');
		}
		console.error(
			'[outline] document operation failed',
			cause instanceof Error ? cause.name : 'Unknown error'
		);
		error(502, 'Outline could not complete this request. Your note is kept; please retry.');
	}
};
