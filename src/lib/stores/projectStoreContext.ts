import { getContext, setContext } from 'svelte';
import type { ProjectStore } from './ProjectStore.svelte';

const KEY = Symbol('project-store');

export function setProjectStoreContext(store: ProjectStore) {
	setContext(KEY, store);
}

export function getProjectStoreContext(): ProjectStore {
	const store = getContext<ProjectStore>(KEY);
	if (!store) {
		throw new Error(
			'ProjectStore context not found — must be set by an ancestor Canvas/ProjectsCanvas component'
		);
	}
	return store;
}
