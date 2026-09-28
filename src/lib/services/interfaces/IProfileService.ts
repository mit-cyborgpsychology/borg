export interface Profile {
	preferredName?: string;
	photoUrl?: string;
	currentPage?: string;
}

export interface IProfileService {
	getProfile(userId: string): Promise<Profile | null>;
	updateProfile(userId: string, fields: Partial<Profile>): Promise<void>;
}
