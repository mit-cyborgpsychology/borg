/** Authentication data available to application services, independent of a UI store. */
export interface Session {
	user: { uid: string; getIdToken(): Promise<string> } | null;
	userType: 'member' | 'collaborator' | null;
}

export type ReadSession = () => Session;
