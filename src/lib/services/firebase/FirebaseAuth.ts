import {
	GoogleAuthProvider,
	signOut as firebaseSignOut,
	onAuthStateChanged,
	signInWithPopup,
	type Auth,
	type User
} from 'firebase/auth';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { IAuthService, AuthUser } from '../interfaces/IAuthService';

export class FirebaseAuth implements IAuthService {
	constructor(
		private auth: Auth,
		private db: Firestore,
		private isEmulator: boolean
	) {}

	async signInWithGoogle(): Promise<{ user: User; isApproved: boolean }> {
		const provider = new GoogleAuthProvider();
		const result = await signInWithPopup(this.auth, provider);

		// Check if user is approved
		const isApproved = await this.checkUserApproval(result.user.uid);

		return { user: result.user, isApproved };
	}

	async signOut(): Promise<void> {
		await firebaseSignOut(this.auth);
	}

	private async createUserDocument(user: User): Promise<void> {
		const userRef = doc(this.db, 'users', user.uid);
		const userDoc = await getDoc(userRef);

		if (!userDoc.exists()) {
			await setDoc(userRef, {
				name: user.displayName || '',
				email: user.email || '',
				photoUrl: user.photoURL || '',
				createdAt: new Date(),
				isApproved: this.isEmulator ? user.email?.startsWith('admin') : false, // Must be manually approved
				userType: 'member', // Default to member for new users
				lastLoginAt: new Date()
			});
		} else {
			// Update last login and sync photoUrl if it has changed
			const userData = userDoc.data();
			const updateData: any = { lastLoginAt: new Date() };

			// Only update photoUrl if it has changed
			if (userData?.photoUrl !== user.photoURL) {
				updateData.photoUrl = user.photoURL || '';
			}

			// Migration: Add userType to existing users who don't have it
			if (userData && !userData.userType) {
				// If user is already approved, they should be a member (existing behavior)
				updateData.userType = userData.isApproved ? 'member' : 'member';
			}

			await setDoc(userRef, updateData, { merge: true });
		}
	}

	async checkUserApproval(userId: string): Promise<boolean> {
		const userRef = doc(this.db, 'users', userId);
		const userDoc = await getDoc(userRef);
		return userDoc.exists() ? userDoc.data()?.isApproved === true : false;
	}

	async getUserData(userId: string): Promise<any> {
		const userRef = doc(this.db, 'users', userId);
		const userDoc = await getDoc(userRef);
		return userDoc.exists() ? userDoc.data() : null;
	}

	onAuthStateChange(
		callback: (user: AuthUser | null) => void,
		onError?: (error: unknown) => void
	): () => void {
		let disposed = false;
		let generation = 0;
		const unsubscribe = onAuthStateChanged(this.auth, async (user) => {
			const request = ++generation;
			try {
				if (user) await this.createUserDocument(user);
				if (!disposed && request === generation) callback(user);
			} catch (error) {
				if (!disposed && request === generation) onError?.(error);
			}
		});
		return () => {
			disposed = true;
			generation++;
			unsubscribe();
		};
	}
}
