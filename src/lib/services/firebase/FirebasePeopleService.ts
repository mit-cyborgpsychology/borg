import { toIsoString } from '../../utils/firestoreDate';
import {
	collection,
	doc,
	addDoc,
	updateDoc,
	deleteDoc,
	getDocs,
	getDoc,
	query,
	where,
	orderBy,
	onSnapshot,
	increment,
	type Unsubscribe
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { Person, GlobalPerson } from '../../types/people';
import type { IPeopleService } from '../interfaces/IPeopleService';

export class FirebasePeopleService implements IPeopleService {
	constructor(private db: Firestore) {}
	async getProjectPeople(projectSlug: string): Promise<Person[]> {
		try {
			// Get authenticated users from the users collection
			const usersQuery = query(
				collection(this.db, 'users'),
				where('isApproved', '==', true),
				orderBy('name', 'asc')
			);
			const usersSnapshot = await getDocs(usersQuery);

			const authenticatedPeople = usersSnapshot.docs.map((doc) => {
				const userData = doc.data();
				return {
					id: doc.id,
					name: userData.name || userData.email || 'Unknown User',
					email: userData.email,
					photoUrl: userData.photoUrl,
					createdAt: toIsoString(userData.createdAt),
					updatedAt: toIsoString(userData.lastLoginAt || userData.createdAt)
				} as Person;
			});

			return authenticatedPeople;
		} catch (error) {
			console.error('Failed to get project people:', error);
			throw error;
		}
	}

	async getGlobalPeople(): Promise<GlobalPerson[]> {
		try {
			// Get all authenticated users from the users collection
			const usersQuery = query(
				collection(this.db, 'users'),
				where('isApproved', '==', true),
				orderBy('lastLoginAt', 'desc')
			);
			const usersSnapshot = await getDocs(usersQuery);

			const authenticatedPeople = usersSnapshot.docs.map((doc) => {
				const userData = doc.data();
				return {
					id: doc.id,
					name: userData.name || userData.email || 'Unknown User',
					email: userData.email,
					photoUrl: userData.photoUrl,
					createdAt: toIsoString(userData.createdAt),
					updatedAt: toIsoString(userData.lastLoginAt || userData.createdAt),
					lastUsedAt: toIsoString(userData.lastLoginAt || userData.createdAt),
					usageCount: 1 // Could be enhanced to track actual usage
				} as GlobalPerson;
			});

			return authenticatedPeople;
		} catch (error) {
			console.error('Failed to get global people:', error);
			throw error;
		}
	}

	async getPerson(personId: string, projectSlug?: string): Promise<Person | null> {
		// Look in users collection (authenticated users)
		const userDocRef = doc(this.db, 'users', personId);
		const userDocSnap = await getDoc(userDocRef);
		if (userDocSnap.exists()) {
			const userData = userDocSnap.data();
			return {
				id: userDocSnap.id,
				name: userData.name || userData.email || 'Unknown User',
				email: userData.email,
				photoUrl: userData.photoUrl,
				createdAt: toIsoString(userData.createdAt),
				updatedAt: toIsoString(userData.lastLoginAt || userData.createdAt)
			};
		}

		return null;
	}

	async addPersonToProject(
		projectSlug: string,
		data: { name: string; email?: string }
	): Promise<Person> {
		// In Firebase mode, people are managed through authentication
		// This method returns a user if they exist as an authenticated user
		try {
			if (data.email) {
				// Try to find user by email
				const usersQuery = query(
					collection(this.db, 'users'),
					where('email', '==', data.email),
					where('isApproved', '==', true)
				);
				const snapshot = await getDocs(usersQuery);

				if (!snapshot.empty) {
					const userData = snapshot.docs[0].data();
					return {
						id: snapshot.docs[0].id,
						name: userData.name || userData.email || 'Unknown User',
						email: userData.email,
						photoUrl: userData.photoUrl,
						createdAt: toIsoString(userData.createdAt),
						updatedAt: toIsoString(userData.lastLoginAt || userData.createdAt)
					};
				}
			}

			// If no authenticated user found, throw an error
			throw new Error(
				'User must be authenticated and approved to be added to projects. Please invite them to create an account first.'
			);
		} catch (error) {
			console.error('Failed to add person to project:', error);
			throw error;
		}
	}

	async updatePersonInProject(
		projectSlug: string,
		personId: string,
		updates: Partial<Person>
	): Promise<Person | null> {
		try {
			// In Firebase mode, people data comes from the users collection
			// Only allow updating name field, other fields are managed by authentication
			const userDocRef = doc(this.db, 'users', personId);

			// Filter updates to only allow name and photoUrl changes
			const allowedUpdates: any = {};
			if (updates.name !== undefined) {
				allowedUpdates.name = updates.name;
			}
			if (updates.photoUrl !== undefined) {
				allowedUpdates.photoUrl = updates.photoUrl;
			}

			if (Object.keys(allowedUpdates).length > 0) {
				await updateDoc(userDocRef, {
					...allowedUpdates,
					updatedAt: new Date().toISOString()
				});
			}

			// Return updated person
			return this.getPerson(personId);
		} catch (error) {
			console.error('Failed to update person in project:', error);
			throw error;
		}
	}

	async deletePersonFromProject(projectSlug: string, personId: string): Promise<boolean> {
		// In Firebase mode, people cannot be deleted as they are authenticated users
		// This would require deactivating the user account, which is an admin operation
		console.warn(
			'Cannot delete authenticated users from projects. Consider deactivating the user account instead.'
		);
		return false;
	}

	async searchProjectPeople(projectSlug: string, query: string): Promise<Person[]> {
		try {
			// Search authenticated users
			const people = await this.getProjectPeople(projectSlug);
			const lowercaseQuery = query.toLowerCase();

			return people.filter(
				(person) =>
					person.name.toLowerCase().includes(lowercaseQuery) ||
					person.email?.toLowerCase().includes(lowercaseQuery)
			);
		} catch (error) {
			console.error('Failed to search project people:', error);
			throw error;
		}
	}

	async searchGlobalPeople(query: string): Promise<GlobalPerson[]> {
		try {
			// Firestore doesn't support full-text search, so we get all and filter
			const people = await this.getGlobalPeople();
			const lowercaseQuery = query.toLowerCase();

			return people
				.filter(
					(person) =>
						person.name.toLowerCase().includes(lowercaseQuery) ||
						person.email?.toLowerCase().includes(lowercaseQuery)
				)
				.sort((a, b) => b.usageCount - a.usageCount) // Sort by usage
				.slice(0, 10); // Limit results
		} catch (error) {
			console.error('Failed to search global people:', error);
			throw error;
		}
	}

	// Legacy methods for backward compatibility
	async getAllPeople(): Promise<Person[]> {
		try {
			const globalPeople = await this.getGlobalPeople();
			return globalPeople.map((gp) => ({
				id: gp.id,
				name: gp.name,
				email: gp.email,
				photoUrl: gp.photoUrl,
				createdAt: gp.createdAt,
				updatedAt: gp.updatedAt
			}));
		} catch (error) {
			console.error('Failed to get all people:', error);
			throw error;
		}
	}

	async addPerson(data: { name: string; email?: string }): Promise<Person> {
		console.warn('PeopleService.addPerson() is deprecated. Use addPersonToProject() instead.');
		return this.addPersonToProject('global', data);
	}

	async updatePerson(id: string, updates: Partial<Person>): Promise<Person | null> {
		console.warn(
			'PeopleService.updatePerson() is deprecated. Use updatePersonInProject() instead.'
		);
		return this.updatePersonInProject('global', id, updates);
	}

	async deletePerson(id: string): Promise<boolean> {
		console.warn(
			'PeopleService.deletePerson() is deprecated. Use deletePersonFromProject() instead.'
		);
		return this.deletePersonFromProject('global', id);
	}

	async searchPeople(query: string): Promise<Person[]> {
		console.warn(
			'PeopleService.searchPeople() is deprecated. Use searchProjectPeople() or searchGlobalPeople() instead.'
		);
		const globalResults = await this.searchGlobalPeople(query);
		return globalResults.map((gp) => ({
			id: gp.id,
			name: gp.name,
			email: gp.email,
			photoUrl: gp.photoUrl,
			createdAt: gp.createdAt,
			updatedAt: gp.updatedAt
		}));
	}

	subscribeToProjectPeople(projectSlug: string, callback: (people: Person[]) => void): () => void {
		// Subscribe to authenticated users
		const q = query(
			collection(this.db, 'users'),
			where('isApproved', '==', true),
			orderBy('name', 'asc')
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			const people = snapshot.docs.map((doc) => {
				const userData = doc.data();
				return {
					id: doc.id,
					name: userData.name || userData.email || 'Unknown User',
					email: userData.email,
					photoUrl: userData.photoUrl,
					createdAt: toIsoString(userData.createdAt),
					updatedAt: toIsoString(userData.lastLoginAt || userData.createdAt)
				} as Person;
			});
			callback(people);
		});

		return unsubscribe;
	}
}
