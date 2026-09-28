export interface User {
	id: string;
	name: string;
	email: string;
	photoUrl: string;
	isApproved: boolean;
	userType: 'member' | 'collaborator';
	createdAt: string;
	lastLoginAt: string;
}

export interface IUserService {
	getAllUsers(): Promise<User[]>;
	getApprovedUsers(): Promise<User[]>;
	getUnapprovedUsers(): Promise<User[]>;
	getCollaboratorUsers(): Promise<User[]>; // For project invitation dropdown
	approveUser(userId: string, userType: 'member' | 'collaborator'): Promise<boolean>;
	updateUserType(userId: string, userType: 'member' | 'collaborator'): Promise<boolean>;
	getUser(userId: string): Promise<User | null>;
}
