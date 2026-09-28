import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { IProfileService, Profile } from '../interfaces/IProfileService';

export class FirebaseProfileService implements IProfileService {
	constructor(private db: Firestore) {}

	async getProfile(userId: string): Promise<Profile | null> {
		const snapshot = await getDoc(doc(this.db, 'users', userId));
		if (!snapshot.exists()) return null;
		const data = snapshot.data();
		return {
			preferredName: data.preferredName,
			photoUrl: data.photoUrl,
			currentPage: data.currentPage
		};
	}

	async updateProfile(userId: string, fields: Partial<Profile>): Promise<void> {
		await setDoc(
			doc(this.db, 'users', userId),
			{ ...fields, updatedAt: new Date() },
			{ merge: true }
		);
	}
}
