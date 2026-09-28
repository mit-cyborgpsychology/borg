import { createTaskPages } from '../tasks/createTaskPages.ts';
import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { IProfileService, Profile } from '../../services/interfaces/IProfileService';
import type { ITaskService, IProjectsService } from '../../services/interfaces';
import type { TaskWithContext } from '../../types/task';

export function createProfileState(
	profiles: IProfileService,
	tasks: ITaskService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>,
	projects: IProjectsService
) {
	const profile = createResource<Profile | null>(null);
	const pages = createTaskPages(tasks, join, projects);
	const assigned = pages.list;
	const command = createCommand();
	const state = {
		profile,
		command,
		assigned,
		directory: pages.directory,
		loadProfile: (userId: string) => profile.load(() => profiles.getProfile(userId)),
		loadTasks: (userId: string) => pages.load(userId),
		changePage: pages.changePage,
		selectProject: pages.selectProject,
		async save(userId: string, updates: Partial<Profile>) {
			const result = await command.run(() => profiles.updateProfile(userId, updates));
			if (result.ok) await state.loadProfile(userId);
			return result;
		},
		dispose() {
			command.dispose();
			profile.dispose();
			pages.dispose();
		}
	};
	return state;
}
