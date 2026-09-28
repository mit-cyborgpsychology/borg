import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { IProjectsService, ITaskService } from '../../services/interfaces';
import type { Project } from '../../types/project';

export function createProjectsState(projectsService: IProjectsService, taskService: ITaskService) {
	const list = createResource({
		projects: [] as Project[],
		counts: {} as Record<string, { todo: number; doing: number; done: number }>,
		taskCounts: {} as Record<string, number>
	});
	const command = createCommand();
	const state = {
		list,
		command,
		load: () =>
			list.load(async () => {
				const projects = await projectsService.getAllProjects();
				const summaries = await Promise.all(
					projects.map(async (project) => {
						const [counts, tasks] = await Promise.all([
							projectsService.getProjectStatusCounts(project.slug),
							taskService.getTaskCounts(project.slug)
						]);
						return { slug: project.slug, counts, tasks: tasks.total };
					})
				);
				return {
					projects,
					counts: Object.fromEntries(summaries.map((item) => [item.slug, item.counts])),
					taskCounts: Object.fromEntries(summaries.map((item) => [item.slug, item.tasks]))
				};
			}),
		async create(data: Parameters<IProjectsService['createProject']>[0]) {
			const result = await command.run(() => projectsService.createProject(data));
			if (result.ok) await state.load();
			return result;
		},
		async remove(slug: string) {
			const result = await command.run(() => projectsService.deleteProject(slug));
			if (result.ok) await state.load();
			return result;
		},
		dispose() {
			command.dispose();
			list.dispose();
		}
	};
	return state;
}
