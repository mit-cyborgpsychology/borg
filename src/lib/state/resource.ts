export interface ResourceState<T> {
	data: T;
	status: 'idle' | 'loading' | 'ready' | 'error';
	error: string | null;
}

type Listener<T> = (state: ResourceState<T>) => void;
type Source<T> = (next: (data: T) => void, error: (error: unknown) => void) => () => void;

/** A Svelte-compatible readable store; services and repositories never own UI state. */
export function createResource<T>(initial: T) {
	let state: ResourceState<T> = { data: initial, status: 'idle', error: null };
	let generation = 0;
	let disposed = false;
	let disconnect: (() => void) | undefined;
	const listeners = new Set<Listener<T>>();

	function publish(next: ResourceState<T>) {
		state = next;
		for (const listener of listeners) listener(state);
	}

	function cancel() {
		generation++;
		disconnect?.();
		disconnect = undefined;
	}

	function fail(error: unknown) {
		publish({
			...state,
			status: 'error',
			error: error instanceof Error ? error.message : 'Unable to load data'
		});
	}

	return {
		subscribe(listener: Listener<T>) {
			listeners.add(listener);
			listener(state);
			return () => {
				listeners.delete(listener);
			};
		},
		async load(loader: () => Promise<T>): Promise<T | undefined> {
			if (disposed) return;
			cancel();
			const request = generation;
			publish({ ...state, status: 'loading', error: null });
			try {
				const data = await loader();
				if (disposed || generation !== request) return;
				publish({ data, status: 'ready', error: null });
				return data;
			} catch (error) {
				if (!disposed && generation === request) fail(error);
			}
		},
		connect(source: Source<T>) {
			if (disposed) return;
			cancel();
			const request = generation;
			publish({ ...state, status: 'loading', error: null });
			try {
				const unsubscribe = source(
					(data) => {
						if (!disposed && generation === request)
							publish({ data, status: 'ready', error: null });
					},
					(error) => {
						if (!disposed && generation === request) fail(error);
					}
				);
				if (disposed || generation !== request) unsubscribe();
				else disconnect = unsubscribe;
			} catch (error) {
				if (!disposed && generation === request) fail(error);
			}
		},
		reset() {
			cancel();
			if (!disposed) publish({ data: initial, status: 'idle', error: null });
		},
		dispose() {
			disposed = true;
			cancel();
			listeners.clear();
		}
	};
}
