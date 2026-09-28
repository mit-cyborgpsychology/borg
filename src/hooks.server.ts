import type { Handle } from '@sveltejs/kit';
import { verifyFirebaseIdToken } from '$lib/server/firebaseAuth';
import { verifyEmulatorIdToken } from '$lib/server/emulatorAuth';
import { dev } from '$app/environment';

const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'borg-2edc0';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const authHeader = event.request.headers.get('authorization');
	if (authHeader?.startsWith('Bearer ')) {
		const idToken = authHeader.slice('Bearer '.length);
		try {
			const user =
				dev && FIREBASE_PROJECT_ID.startsWith('demo-')
					? await verifyEmulatorIdToken(idToken, FIREBASE_PROJECT_ID)
					: await verifyFirebaseIdToken(idToken, FIREBASE_PROJECT_ID);
			event.locals.user = user;
		} catch (err) {
			// Invalid/expired token — leave locals.user as null, let routes decide
			// whether auth is required.
			console.warn('[hooks.server] ID token verification failed:', (err as Error).message);
		}
	}

	return resolve(event);
};
