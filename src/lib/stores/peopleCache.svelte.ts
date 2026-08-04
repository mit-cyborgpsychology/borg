import type { Person } from '../types/people';
import { peopleService } from '../services/instances';

// Shared, app-wide, synchronously-readable cache of people/users, keyed by
// person ID. Backs any UI that needs to show a name/avatar for an ID (task
// pills, task lists, collaborator avatars) without each call site issuing
// its own getPerson() fetch — previously every rendered row/pill did its own
// independent fetch, with no cache shared across components.
//
// $state(new Map()) gives Svelte native fine-grained tracking of map
// mutations (set/delete), so components reading getPersonCached(id) inside a
// $derived re-evaluate automatically when that id's entry is filled in.
const cache = $state(new Map<string, Person | null>());
const inFlight = new Map<string, Promise<Person | null>>();

function fetchPerson(personId: string, projectSlug?: string): void {
	if (inFlight.has(personId)) return;

	const promise = (async () => {
		const result = peopleService.getPerson(personId, projectSlug);
		const person = result instanceof Promise ? await result : result;
		cache.set(personId, person);
		inFlight.delete(personId);
		return person;
	})();

	inFlight.set(personId, promise);
}

/**
 * Reactive, synchronous lookup: returns the cached person, or `undefined`
 * if not yet loaded (a fetch is kicked off automatically the first time an
 * id is requested). Call from inside a `$derived`/template expression so the
 * read is tracked and the component updates once the fetch resolves.
 */
export function getPersonCached(personId: string, projectSlug?: string): Person | null | undefined {
	if (!cache.has(personId)) {
		fetchPerson(personId, projectSlug);
		return undefined;
	}
	return cache.get(personId);
}

export function invalidatePersonCache(personId: string): void {
	cache.delete(personId);
}
