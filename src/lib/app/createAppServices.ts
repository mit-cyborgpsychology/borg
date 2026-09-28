import { createNodeService } from '../services/NodeService';
import { createPresenceService } from '../services/PresenceService';
import { auth, db, storage, isEmulator } from '../firebase/config';
import { FirebaseProjectsService } from '../services/firebase/FirebaseProjectsService';
import { FirebaseTaskService } from '../services/firebase/FirebaseTaskService';
import { FirebasePeopleService } from '../services/firebase/FirebasePeopleService';
import { FirebaseStickerService } from '../services/firebase/FirebaseStickerService';
import { FirebaseUserService } from '../services/firebase/FirebaseUserService';
import { FirebaseNodesRepository } from '../services/firebase/FirebaseNodesRepository';
import { FirebaseTimelineService } from '../services/firebase/FirebaseTimelineService';
import { FirebaseProfileService } from '../services/firebase/FirebaseProfileService';
import { FirebaseImageService } from '../services/firebase/FirebaseImageService';
import { createNodeLookup } from '../services/firebase/FirebaseNodeLookup';
import { OutlineService } from '../services/OutlineService';
import { createTaskContext } from '../services/taskContext';
import { createPeopleCache } from '../stores/peopleCache.svelte';
import { compressImageFile } from '../utils/resizeImage';
import { get } from 'svelte/store';
import { createAuthStore } from '../stores/authStore';
import { FirebaseAuth } from '../services/firebase/FirebaseAuth';
import type { AppServices } from './types';

/** The only application composition point: concrete adapters are wired here. */
export function createAppServices(): AppServices {
	const authService = new FirebaseAuth(auth, db, isEmulator);
	const authState = createAuthStore(authService);
	const readSession = () => get(authState.state);
	const projectsService = new FirebaseProjectsService(db, readSession);
	const taskService = new FirebaseTaskService(db, readSession);
	const peopleService = new FirebasePeopleService(db);
	return {
		presenceService: createPresenceService('wss://borg-cursors.chayapatr.partykit.dev/party'),
		authService,
		authStore: authState.state,
		start: () => authState.start(),
		dispose: () => authState.dispose(),
		projectsService,
		taskService,
		peopleService,
		userService: new FirebaseUserService(db),
		stickerService: new FirebaseStickerService(storage),
		outlineService: new OutlineService(projectsService, readSession),
		profileService: new FirebaseProfileService(db),
		imageService: new FirebaseImageService(storage, compressImageFile),
		peopleCache: createPeopleCache(peopleService),
		taskContext: createTaskContext(projectsService, createNodeLookup(db)),
		createNodesService: (projectId, slug) =>
			createNodeService(
				new FirebaseNodesRepository(db, projectId, slug),
				readSession,
				projectsService,
				taskService,
				slug
			),
		createTimelineService: (projectId) => new FirebaseTimelineService(db, readSession, projectId)
	};
}
