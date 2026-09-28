import { writable, type Readable } from 'svelte/store';
import type { IAuthService, AuthUser } from '../services/interfaces/IAuthService';

export interface AuthState {
	user: AuthUser | null;
	isApproved: boolean;
	userType: 'member' | 'collaborator' | null;
	loading: boolean;
	error: string | null;
}

const initial: AuthState = {
	user: null,
	isApproved: false,
	userType: null,
	loading: true,
	error: null
};

/** Authentication state is application-scoped; the adapter is supplied by composition. */
export function createAuthStore(service: IAuthService) {
	const state = writable<AuthState>(initial);
	let generation = 0;
	let unsubscribe: (() => void) | undefined;

	function fail(error: unknown) {
		generation++;
		state.set({
			...initial,
			loading: false,
			error: error instanceof Error ? error.message : 'Authentication failed'
		});
	}

	return {
		state: { subscribe: state.subscribe } as Readable<AuthState>,
		start() {
			if (unsubscribe) return;
			unsubscribe = service.onAuthStateChange(async (user) => {
				const request = ++generation;
				if (!user) {
					state.set({ ...initial, loading: false });
					return;
				}
				state.set({ ...initial, user });
				try {
					const [isApproved, data] = await Promise.all([
						service.checkUserApproval(user.uid),
						service.getUserData(user.uid)
					]);
					if (request === generation)
						state.set({
							user,
							isApproved,
							userType: data?.userType ?? 'member',
							loading: false,
							error: null
						});
				} catch (error) {
					if (request === generation) fail(error);
				}
			}, fail);
		},
		dispose() {
			generation++;
			unsubscribe?.();
			unsubscribe = undefined;
		}
	};
}
