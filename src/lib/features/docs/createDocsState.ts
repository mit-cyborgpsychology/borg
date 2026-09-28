import { createResource } from '../../state/resource.ts';
import type {
	IOutlineService,
	IProjectsService,
	ITaskService,
	OutlineDocSummary
} from '../../services/interfaces';
import type { Project } from '../../types/project';
import type { TaskWithContext } from '../../types/task';

export function createDocsState(
	outline: IOutlineService,
	projects: IProjectsService,
	tasks: ITaskService
) {
	const list = createResource({
		docs: [] as OutlineDocSummary[],
		projects: new Map<string, Project>()
	});
	const activity = createResource<TaskWithContext[]>([]);
	return {
		list,
		activity,
		load: (query = '') =>
			list.load(async () => {
				const allProjects = await projects.getAllProjects();
				const byCollection = new Map<string, Project>();
				for (const project of allProjects)
					if (project.outlineCollectionId) byCollection.set(project.outlineCollectionId, project);
				const docs = query
					? await outline.searchDocs(query)
					: await outline.listDocs([...byCollection.keys()]);
				return { docs, projects: byCollection };
			}),
		loadActivity: () =>
			activity.load(async () =>
				(await tasks.getAllTasks())
					.filter((task) => task.sourceType === 'outline')
					.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
					.slice(0, 20)
			),
		dispose() {
			list.dispose();
			activity.dispose();
		}
	};
}
