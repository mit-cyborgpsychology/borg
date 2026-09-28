import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { isResearchUserApproved } from './research';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'borg-2edc0';

export async function requireResearchAccess(locals: App.Locals, request: Request) {
	if (!locals.user) error(401, 'Sign in to view research.');
	let approved;
	try {
		approved = await isResearchUserApproved(
			projectId,
			locals.user.uid,
			request.headers.get('authorization') || '',
			dev && projectId.startsWith('demo-')
		);
	} catch {
		error(503, 'Unable to check account access. Please try again.');
	}
	if (!approved) error(403, 'Your account needs approval to view research.');
}
