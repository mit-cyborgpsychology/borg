import { FirebaseProjectsService } from './firebase/FirebaseProjectsService';
import { FirebaseTaskService } from './firebase/FirebaseTaskService';
import { FirebasePeopleService } from './firebase/FirebasePeopleService';
import { FirebaseStickerService } from './firebase/FirebaseStickerService';
import { FirebaseUserService } from './firebase/FirebaseUserService';
import { OutlineService } from './OutlineService';
import type {
	IProjectsService,
	ITaskService,
	IPeopleService,
	IStickerService,
	IUserService,
	IOutlineService
} from './interfaces';

export const projectsService: IProjectsService = new FirebaseProjectsService();
export const taskService: ITaskService = new FirebaseTaskService();
export const peopleService: IPeopleService = new FirebasePeopleService();
export const stickerService: IStickerService = new FirebaseStickerService();
export const userService: IUserService = new FirebaseUserService();
export const outlineService: IOutlineService = new OutlineService();
