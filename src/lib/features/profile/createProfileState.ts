import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { IProfileService, Profile } from '../../services/interfaces/IProfileService';
import type { ITaskService } from '../../services/interfaces';
import type { TaskWithContext } from '../../types/task';

export function createProfileState(
	profiles: IProfileService,
	tasks: ITaskService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>
) {
	const profile = createResource<Profile | null>(null);
	const assigned = createResource({
		active: [] as TaskWithContext[],
		resolved: [] as TaskWithContext[]
	});
	const command = createCommand();
	const state = {
		profile,
		command,
		assigned,
		loadProfile: (userId: string) => profile.load(() => profiles.getProfile(userId)),
		loadTasks: (userId: string) =>
			assigned.load(async () => {
				const [active, resolved] = await Promise.all([
					tasks.getPersonTasks(userId),
					tasks.getResolvedTasks()
				]);
				const [joinedActive, joinedResolved] = await Promise.all([
					join(active),
					join(resolved.filter((task) => task.assignee === userId))
				]);
				return { active: joinedActive, resolved: joinedResolved };
			}),
		async save(userId: string, updates: Partial<Profile>) {
			const result = await command.run(() => profiles.updateProfile(userId, updates));
			if (result.ok) await state.loadProfile(userId);
			return result;
		},
		dispose() {
			command.dispose();
			profile.dispose();
			assigned.dispose();
		}
	};
	return state;
}
