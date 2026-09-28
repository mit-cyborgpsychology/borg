export interface AuthUser {
	uid: string;
	email: string | null;
	displayName: string | null;
	photoURL: string | null;
	getIdToken(): Promise<string>;
}

export interface IAuthService {
	signInWithGoogle(): Promise<{ user: AuthUser; isApproved: boolean }>;
	signOut(): Promise<void>;
	checkUserApproval(userId: string): Promise<boolean>;
	getUserData(userId: string): Promise<{ userType?: 'member' | 'collaborator' } | null>;
	onAuthStateChange(
		callback: (user: AuthUser | null) => void,
		onError?: (error: unknown) => void
	): () => void;
}
