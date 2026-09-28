import { createResource } from '../../state/resource.ts';
import { createCommand } from '../../state/command.ts';
import type { IPeopleService, ITaskService } from '../../services/interfaces';
import type { Person } from '../../types/people';
import type { Task } from '../../types/task';

export function createTaskFormState(peopleService: IPeopleService, tasks: ITaskService) {
	const people = createResource<Person[]>([]);
	const command = createCommand();
	return {
		people,
		command,
		loadPeople: () => people.load(() => peopleService.getAllPeople()),
		save: (
			nodeId: string,
			projectSlug: string | undefined,
			fields: Omit<Task, 'id' | 'createdAt'>,
			taskId?: string
		) =>
			command.run(() =>
				taskId
					? tasks.updateTask(nodeId, taskId, fields, projectSlug)
					: tasks.addTask(nodeId, fields, projectSlug)
			),
		dispose() {
			people.dispose();
			command.dispose();
		}
	};
}
