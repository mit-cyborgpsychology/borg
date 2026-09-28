import { toIsoString } from '../../utils/firestoreDate.ts';
import type { User } from '../interfaces/IUserService';

/** SDK timestamps must not escape the persistence boundary as application dates. */
export function readUserDocument(id: string, data: Record<string, unknown>): User {
	return {
		...data,
		id,
		createdAt: toIsoString(data.createdAt),
		lastLoginAt: toIsoString(data.lastLoginAt)
	} as User;
}
