import { createResource } from '../../state/resource.ts';
import type { IProjectsService } from '../../services/interfaces/IProjectsService';
import type { Project } from '../../types/project';

export function createProjectState(service: IProjectsService) {
	const project = createResource<Project | null>(null);
	return {
		project,
		load: (slug: string) => project.load(() => service.getProject(slug)),
		dispose: () => project.dispose()
	};
}
