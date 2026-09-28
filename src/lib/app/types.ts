import type { Readable } from 'svelte/store';
import type { AuthState } from '../stores/authStore';
import type { IAuthService } from '../services/interfaces/IAuthService';
import type { IPresenceService } from '../services/interfaces/IPresenceService';
import type {
	IProjectsService,
	ITaskService,
	IPeopleService,
	IUserService,
	IStickerService,
	IOutlineService,
	INodesService,
	ITimelineService
} from '../services/interfaces';
import type { IImageService } from '../services/interfaces/IImageService';
import type { IProfileService } from '../services/interfaces/IProfileService';
import type { createPeopleCache } from '../stores/peopleCache.svelte';
import type { createTaskContext } from '../services/taskContext';
import type { IResearchService } from '../services/interfaces/IResearchService';

export interface AppServices {
	presenceService: IPresenceService;
	authService: IAuthService;
	authStore: Readable<AuthState>;
	start(): void;
	dispose(): void;
	projectsService: IProjectsService;
	taskService: ITaskService;
	peopleService: IPeopleService;
	userService: IUserService;
	stickerService: IStickerService;
	outlineService: IOutlineService;
	researchService: IResearchService;
	profileService: IProfileService;
	imageService: IImageService;
	peopleCache: ReturnType<typeof createPeopleCache>;
	taskContext: ReturnType<typeof createTaskContext>;
	createNodesService(projectId: string, slug?: string): INodesService;
	createTimelineService(projectId?: string): ITimelineService;
}
