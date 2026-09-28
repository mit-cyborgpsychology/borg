import {
	collection,
	doc,
	getDocs,
	getDoc,
	updateDoc,
	query,
	where,
	orderBy
} from 'firebase/firestore';
import { readUserDocument } from './userDocument';
import type { Firestore } from 'firebase/firestore';
import type { User, IUserService } from '../interfaces/IUserService';

export class FirebaseUserService implements IUserService {
	constructor(private db: Firestore) {}
	async getAllUsers(): Promise<User[]> {
		const q = query(collection(this.db, 'users'), orderBy('createdAt', 'desc'));
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => readUserDocument(doc.id, doc.data()));
	}

	async getApprovedUsers(): Promise<User[]> {
		const q = query(
			collection(this.db, 'users'),
			where('isApproved', '==', true),
			orderBy('name', 'asc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => readUserDocument(doc.id, doc.data()));
	}

	async getUnapprovedUsers(): Promise<User[]> {
		const q = query(
			collection(this.db, 'users'),
			where('isApproved', '==', false),
			orderBy('createdAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => readUserDocument(doc.id, doc.data()));
	}

	async getCollaboratorUsers(): Promise<User[]> {
		const q = query(
			collection(this.db, 'users'),
			where('isApproved', '==', true),
			where('userType', '==', 'collaborator'),
			orderBy('name', 'asc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => readUserDocument(doc.id, doc.data()));
	}

	async approveUser(userId: string, userType: 'member' | 'collaborator'): Promise<boolean> {
		try {
			const userRef = doc(this.db, 'users', userId);
			await updateDoc(userRef, {
				isApproved: true,
				userType: userType,
				approvedAt: new Date()
			});
			return true;
		} catch (error) {
			console.error('Failed to approve user:', error);
			return false;
		}
	}

	async updateUserType(userId: string, userType: 'member' | 'collaborator'): Promise<boolean> {
		try {
			const userRef = doc(this.db, 'users', userId);
			await updateDoc(userRef, {
				userType: userType,
				updatedAt: new Date()
			});
			return true;
		} catch (error) {
			console.error('Failed to update user type:', error);
			return false;
		}
	}

	async getUser(userId: string): Promise<User | null> {
		try {
			const userRef = doc(this.db, 'users', userId);
			const userDoc = await getDoc(userRef);
			return userDoc.exists() ? readUserDocument(userDoc.id, userDoc.data()) : null;
		} catch (error) {
			console.error('Failed to get user:', error);
			throw error;
		}
	}
}
