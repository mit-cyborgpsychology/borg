export interface Person {
	id: string;
	name: string;
	email?: string;
	photoUrl?: string;
	createdAt: string;
	updatedAt: string;
	// People are backed by `users` documents (FirebasePeopleService reads
	// from `users`, not a separate `people` collection), so userType is
	// available whenever a Person came from a context that fetched it —
	// optional since not every Person-producing call site includes it.
	userType?: 'member' | 'collaborator';
}

export interface GlobalPerson extends Person {
	lastUsedAt: string;
	usageCount: number;
}
