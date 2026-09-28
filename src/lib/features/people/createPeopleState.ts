import { createCommand } from '../../state/command.ts';
import { createResource } from '../../state/resource.ts';
import type { IUserService } from '../../services/interfaces';
import type { Person } from '../../types/people';

export function createPeopleState(users: IUserService) {
	const list = createResource<Person[]>([]);
	const pending = createResource<Awaited<ReturnType<IUserService['getUnapprovedUsers']>>>([]);
	const command = createCommand();
	const state = {
		list,
		pending,
		command,
		loadPending: () => pending.load(() => users.getUnapprovedUsers()),
		load: () =>
			list.load(async () =>
				(await users.getApprovedUsers()).map((user) => ({
					id: user.id,
					name: user.name,
					email: user.email,
					photoUrl: user.photoUrl,
					userType: user.userType,
					createdAt: user.createdAt,
					updatedAt: user.lastLoginAt
				}))
			),
		async approve(userId: string, userType: 'member' | 'collaborator') {
			const result = await command.run(() => users.approveUser(userId, userType));
			if (result.ok) await Promise.all([state.load(), state.loadPending()]);
			return result;
		},
		dispose() {
			list.dispose();
			pending.dispose();
			command.dispose();
		}
	};
	return state;
}
