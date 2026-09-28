import { createResource } from '../../state/resource.ts';
import type { ITaskService } from '../../services/interfaces';
import type { TaskWithContext } from '../../types/task';

export function createTaskLogState(
	tasks: ITaskService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>
) {
	const list = createResource<TaskWithContext[]>([]);
	return {
		list,
		load: (userId: string) =>
			list.load(async () => join(await tasks.getPersonResolvedTasksLog(userId, 30))),
		dispose: () => list.dispose()
	};
}
