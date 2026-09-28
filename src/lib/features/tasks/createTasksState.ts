import { createTaskPages } from './createTaskPages.ts';
import type { ITaskService, IProjectsService } from '../../services/interfaces';
import type { TaskWithContext } from '../../types/task';

export function createTasksState(
	tasks: ITaskService,
	projects: IProjectsService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>
) {
	const pages = createTaskPages(tasks, join, projects);
	return {
		list: pages.list,
		directory: pages.directory,
		load(collaborator: boolean) {
			return pages.load(
				undefined,
				async () => {
					// Keep project access filtering consistent for every fetched batch.
					const allowed = collaborator
						? new Set((await projects.getAllProjects()).map((project) => project.slug))
						: null;
					return (task) => !allowed || (!!task.projectSlug && allowed.has(task.projectSlug));
				},
				!collaborator
			);
		},
		changePage: pages.changePage,
		selectProject: pages.selectProject,
		dispose: pages.dispose
	};
}
