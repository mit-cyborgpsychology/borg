import { SvelteMap } from 'svelte/reactivity';
import type { Person } from '../types/people';
import type { IPeopleService } from '../services/interfaces/IPeopleService';

// Shared, app-wide, synchronously-readable cache of people/users, keyed by
// person ID. Backs any UI that needs to show a name/avatar for an ID (task
// pills, task lists, collaborator avatars) without each call site issuing
// its own getPerson() fetch — previously every rendered row/pill did its own
// independent fetch, with no cache shared across components.
//
// SvelteMap gives Svelte native fine-grained tracking of map mutations
// (set/delete), so components reading getPersonCached(id) inside a
// $derived re-evaluate automatically when that id's entry is filled in.
export function createPeopleCache(peopleService: Pick<IPeopleService, 'getPerson'>) {
	let generation = 0;
	const cache = new SvelteMap<string, Person | null>();
	// Plain bookkeeping, never read reactively — a SvelteMap here would only add
	// overhead with no benefit, but ESLint's rule doesn't know that.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const inFlight = new Map<string, Promise<Person | null>>();

	function fetchPerson(personId: string, projectSlug?: string): void {
		if (inFlight.has(personId)) return;

		const requestGeneration = generation;
		const promise = (async () => {
			try {
				const result = peopleService.getPerson(personId, projectSlug);
				const person = await result;
				if (generation === requestGeneration) cache.set(personId, person);
				return person;
			} catch (error) {
				console.error('Failed to load person:', error);
				return null;
			} finally {
				if (generation === requestGeneration) inFlight.delete(personId);
			}
		})();

		inFlight.set(personId, promise);
	}

	/**
	 * Reactive, synchronous lookup: returns the cached person, or `undefined`
	 * if not yet loaded (a fetch is kicked off automatically the first time an
	 * id is requested). Call from inside a `$derived`/template expression so the
	 * read is tracked and the component updates once the fetch resolves.
	 */
	function getPersonCached(personId: string, projectSlug?: string): Person | null | undefined {
		if (!cache.has(personId)) {
			fetchPerson(personId, projectSlug);
			return undefined;
		}
		return cache.get(personId);
	}

	function invalidatePersonCache(personId: string): void {
		cache.delete(personId);
	}

	return {
		getPersonCached,
		invalidatePersonCache,
		clear() {
			generation++;
			cache.clear();
			inFlight.clear();
		}
	};
}
