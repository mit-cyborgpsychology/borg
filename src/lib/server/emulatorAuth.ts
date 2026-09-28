import { decodeJwt } from 'jose';

/** Called only in Vite development with an explicit demo-* Firebase project. */
export async function verifyEmulatorIdToken(idToken: string, projectId: string, request = fetch) {
	const claims = decodeJwt(idToken);
	if (
		!projectId.startsWith('demo-') ||
		claims.aud !== projectId ||
		claims.iss !== `https://securetoken.google.com/${projectId}` ||
		!claims.sub ||
		typeof claims.exp !== 'number' ||
		claims.exp <= Date.now() / 1000
	) {
		throw new Error('Invalid emulator token');
	}
	const response = await request(
		'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-key',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ idToken }),
			signal: AbortSignal.timeout(5000)
		}
	);
	if (!response.ok) throw new Error('Emulator account lookup failed');
	const data = (await response.json()) as {
		users?: Array<{ localId: string; email?: string; disabled?: boolean }>;
	};
	const user = data.users?.find((user) => user.localId === claims.sub && !user.disabled);
	if (!user) throw new Error('Emulator account not found');
	return { uid: user.localId, email: user.email };
}
