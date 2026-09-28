import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { IProjectsService, ITaskService } from '../../services/interfaces';
import type { Project } from '../../types/project';

export function createProjectsState(projectsService: IProjectsService, taskService: ITaskService) {
	const list = createResource({ projects: [] as Project[] });
	const summaries = createResource({
		counts: {} as Record<string, { todo: number; doing: number; done: number }>,
		taskCounts: {} as Record<string, number>
	});
	const command = createCommand();
	const state = {
		list,
		command,
		summaries,
		load: () => {
			summaries.reset();
			return list.load(async () => ({ projects: await projectsService.getAllProjects() }));
		},
		loadSummaries: (projects: Project[]) =>
			summaries.load(async () => {
				const results = await Promise.all(
					projects
						.filter((project) => project.id !== 'project-canvas')
						.map(async (project) => {
							const [counts, tasks] = await Promise.all([
								projectsService.getProjectStatusCounts(project.slug),
								taskService.getTaskCounts(project.slug)
							]);
							return { slug: project.slug, counts, tasks: tasks.total };
						})
				);
				return {
					counts: Object.fromEntries(results.map((item) => [item.slug, item.counts])),
					taskCounts: Object.fromEntries(results.map((item) => [item.slug, item.tasks]))
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
			summaries.dispose();
		}
	};
	return state;
}
