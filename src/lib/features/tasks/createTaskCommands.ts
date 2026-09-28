import { createCommand } from '../../state/command.ts';
import type { ITaskService } from '../../services/interfaces/ITaskService';
import type { Task, TaskWithContext } from '../../types/task';

export function createTaskCommands(tasks: ITaskService, refresh: () => Promise<unknown>) {
	const command = createCommand();
	async function run(operation: () => Promise<void>) {
		const result = await command.run(operation);
		if (result.ok) await refresh();
		return result;
	}
	return {
		command,
		add: (
			context: Pick<TaskWithContext, 'nodeId' | 'projectSlug'>,
			fields: Omit<Task, 'id' | 'createdAt'>
		) => run(() => tasks.addTask(context.nodeId, fields, context.projectSlug)),
		remove: (task: Pick<TaskWithContext, 'id' | 'nodeId' | 'projectSlug'>) =>
			run(() => tasks.deleteTask(task.nodeId, task.id, task.projectSlug)),
		resolve: (task: Pick<TaskWithContext, 'id' | 'nodeId' | 'projectSlug'>) =>
			run(() => tasks.resolveTask(task.nodeId, task.id, task.projectSlug)),
		reactivate: (task: Pick<TaskWithContext, 'id' | 'nodeId' | 'projectSlug'>) =>
			run(() => tasks.updateTask(task.nodeId, task.id, { status: 'active' }, task.projectSlug)),
		dispose: () => command.dispose()
	};
}
