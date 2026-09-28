import { createResource } from '../../state/resource.ts';
import type { ITaskService, IProjectsService } from '../../services/interfaces';
import type { TaskWithContext } from '../../types/task';

export function createTasksState(
	tasks: ITaskService,
	projects: IProjectsService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>
) {
	const list = createResource({
		active: [] as TaskWithContext[],
		resolved: [] as TaskWithContext[]
	});
	const state = {
		list,
		load: (collaborator: boolean) =>
			list.load(async () => {
				let [active, resolved] = await Promise.all([
					tasks.getActiveTasks(),
					tasks.getResolvedTasks()
				]);
				if (collaborator) {
					const allowed = new Set((await projects.getAllProjects()).map((project) => project.slug));
					const visible = (task: TaskWithContext) =>
						!!task.projectSlug && allowed.has(task.projectSlug);
					active = active.filter(visible);
					resolved = resolved.filter(visible);
				}
				[active, resolved] = await Promise.all([join(active), join(resolved)]);
				return { active, resolved };
			}),
		dispose() {
			list.dispose();
		}
	};
	return state;
}
