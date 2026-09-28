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
	writeBatch,
	type Unsubscribe
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type { Project } from '../../types/project';
import type { IProjectsService } from '../interfaces';

import type { ReadSession } from '../interfaces/Session';
export class FirebaseProjectsService implements IProjectsService {
	constructor(
		private db: Firestore,
		private readSession: ReadSession
	) {}
	async getAllProjects(): Promise<Project[]> {
		// Only get active projects (not in recycle bin)
		const q = query(collection(this.db, 'projects'), orderBy('updatedAt', 'desc'));
		const snapshot = await getDocs(q);
		const allProjects = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }) as Project);

		// Filter projects based on user type
		const authState = this.readSession();
		if (authState.userType === 'collaborator' && authState.user) {
			// Collaborators only see projects they're added to
			return allProjects.filter((project) => project.collaborators?.includes(authState.user!.uid));
		}

		// Members see all projects
		return allProjects;
	}

	async getProject(slug: string): Promise<Project | null> {
		const q = query(collection(this.db, 'projects'), where('slug', '==', slug));
		const snapshot = await getDocs(q);

		if (snapshot.empty) return null;

		const doc = snapshot.docs[0];
		return { ...doc.data(), id: doc.id } as Project;
	}

	async getProjectById(id: string): Promise<Project | null> {
		const docRef = doc(this.db, 'projects', id);
		const docSnap = await getDoc(docRef);

		console.log('docSnap', docSnap);

		if (!docSnap.exists()) return null;

		return { ...docSnap.data(), id: docSnap.id } as Project;
	}

	async createProject(data: {
		title: string;
		description?: string;
		status?: string;
		createdBy?: string;
	}): Promise<Project> {
		const slug = await this.generateSlug(data.title);

		const projectData = {
			title: data.title,
			...(data.description !== undefined && { description: data.description }),
			status: (data.status as Project['status']) || 'active',
			slug,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			nodeCount: 0,
			collaborators: [],
			createdBy: data.createdBy || 'unknown'
		};

		const docRef = await addDoc(collection(this.db, 'projects'), projectData);
		return { ...projectData, id: docRef.id } as Project;
	}

	async updateProject(slugOrId: string, updates: Partial<Project>): Promise<Project | null> {
		// First try to find by slug
		let projectDoc = await this.getProjectDoc(slugOrId);

		if (!projectDoc) {
			// Try by ID
			projectDoc = doc(this.db, 'projects', slugOrId);
			const docSnap = await getDoc(projectDoc);
			if (!docSnap.exists()) return null;
		}

		// Filter out undefined values
		const filteredUpdates = Object.fromEntries(
			Object.entries(updates).filter(([_, value]) => value !== undefined)
		);

		await updateDoc(projectDoc, {
			...filteredUpdates,
			updatedAt: new Date().toISOString()
		});

		const updatedDoc = await getDoc(projectDoc);
		return updatedDoc.exists() ? ({ ...updatedDoc.data(), id: updatedDoc.id } as Project) : null;
	}

	async deleteProject(slugOrId: string): Promise<boolean> {
		try {
			let projectDoc = await this.getProjectDoc(slugOrId);
			let projectData: any;

			if (!projectDoc) {
				// Try by ID
				projectDoc = doc(this.db, 'projects', slugOrId);
				const docSnap = await getDoc(projectDoc);
				if (!docSnap.exists()) return false;
				projectData = { ...docSnap.data(), id: docSnap.id };
			} else {
				const docSnap = await getDoc(projectDoc);
				projectData = { ...docSnap.data(), id: docSnap.id };
			}

			// Move to recycle-bin collection instead of deleting
			await addDoc(collection(this.db, 'recycle-bin'), {
				...projectData,
				originalCollection: 'projects',
				deletedAt: new Date().toISOString(),
				deletedBy: 'user' // You could pass this as a parameter if needed
			});

			// Copy subcollections to recycle-bin project
			await this.moveProjectSubcollections(projectDoc.id, projectData.id);

			// Delete from original location
			await this.deleteProjectSubcollections(projectDoc.id);
			await deleteDoc(projectDoc);
			return true;
		} catch (error) {
			console.error('Failed to move project to recycle bin:', error);
			return false;
		}
	}

	async updateNodeCount(slug: string, count: number): Promise<void> {
		await this.updateProject(slug, { nodeCount: count });
	}

	invalidateStatusCache(slug: string): void {
		this.statusCountsCache.delete(slug);
		console.log(`FirebaseProjectsService: Invalidated status cache for ${slug}`);
	}

	invalidateAllStatusCaches(): void {
		this.statusCountsCache.clear();
		console.log('FirebaseProjectsService: Cleared all status caches');
	}

	async getGlobalStatusCounts(): Promise<{ todo: number; doing: number; done: number }> {
		const projects = await this.getAllProjects();
		const counts = { todo: 0, doing: 0, done: 0 };

		// Process projects in parallel to avoid blocking
		const projectCountPromises = projects.map((project) =>
			this.getProjectStatusCounts(project.slug)
		);
		const allProjectCounts = await Promise.all(projectCountPromises);

		allProjectCounts.forEach((projectCounts) => {
			counts.todo += projectCounts.todo;
			counts.doing += projectCounts.doing;
			counts.done += projectCounts.done;
		});

		return counts;
	}

	// Cache for status counts to avoid repeated expensive queries
	private statusCountsCache = new Map<
		string,
		{ counts: { todo: number; doing: number; done: number }; timestamp: number }
	>();
	private projectIdCache = new Map<string, { id: string; timestamp: number }>();
	private readonly CACHE_DURATION = 30000; // 30 seconds

	async getProjectStatusCounts(
		slug: string
	): Promise<{ todo: number; doing: number; done: number }> {
		try {
			// Check cache first
			const cached = this.statusCountsCache.get(slug);
			if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
				console.log(`FirebaseProjectsService: Using cached status counts for ${slug}`);
				return cached.counts;
			}

			// Get project ID (with caching to avoid repeated lookups)
			let projectId: string;
			const cachedId = this.projectIdCache.get(slug);
			if (cachedId && Date.now() - cachedId.timestamp < this.CACHE_DURATION) {
				projectId = cachedId.id;
			} else {
				const project = await this.getProject(slug);
				if (!project) return { todo: 0, doing: 0, done: 0 };
				projectId = project.id;
				this.projectIdCache.set(slug, { id: projectId, timestamp: Date.now() });
			}

			// Query nodes with status denormalized field
			const nodesQuery = query(collection(this.db, 'projects', projectId, 'nodes'));
			const snapshot = await getDocs(nodesQuery);

			const counts = { todo: 0, doing: 0, done: 0 };

			snapshot.docs.forEach((doc) => {
				const status = doc.data().status;
				if (status === 'To Do') {
					counts.todo++;
				} else if (status === 'Doing') {
					counts.doing++;
				} else if (status === 'Done') {
					counts.done++;
				}
			});

			// Cache the result
			this.statusCountsCache.set(slug, { counts, timestamp: Date.now() });
			console.log(`FirebaseProjectsService: Cached status counts for ${slug}:`, counts);

			return counts;
		} catch (error) {
			console.error('Failed to get project status counts:', error);
			throw error;
		}
	}

	subscribeToProjects(callback: (projects: Project[]) => void): Unsubscribe {
		const q = query(collection(this.db, 'projects'), orderBy('updatedAt', 'desc'));

		return onSnapshot(q, (snapshot) => {
			const allProjects = snapshot.docs.map(
				(doc) =>
					({
						...doc.data(),
						id: doc.id
					}) as Project
			);

			// Filter projects based on user type
			const authState = this.readSession();
			if (authState.userType === 'collaborator' && authState.user) {
				// Collaborators only see projects they're added to
				const filteredProjects = allProjects.filter((project) =>
					project.collaborators?.includes(authState.user!.uid)
				);
				callback(filteredProjects);
			} else {
				// Members see all projects
				callback(allProjects);
			}
		});
	}

	subscribeToProject(slug: string, callback: (project: Project | null) => void): Unsubscribe {
		const q = query(collection(this.db, 'projects'), where('slug', '==', slug));

		return onSnapshot(q, (snapshot) => {
			if (snapshot.empty) {
				callback(null);
				return;
			}

			const doc = snapshot.docs[0];
			callback({ ...doc.data(), id: doc.id } as Project);
		});
	}

	private async getProjectDoc(slug: string) {
		const q = query(collection(this.db, 'projects'), where('slug', '==', slug));
		const snapshot = await getDocs(q);
		return snapshot.empty ? null : snapshot.docs[0].ref;
	}

	private async generateSlug(title: string): Promise<string> {
		// Generate base slug
		const baseSlug = title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim()
			.substring(0, 50);

		// Check for uniqueness and append number if needed
		return await this.ensureUniqueSlug(baseSlug);
	}

	private async ensureUniqueSlug(baseSlug: string): Promise<string> {
		let slug = baseSlug;
		let counter = 1;

		while (await this.slugExists(slug)) {
			slug = `${baseSlug}-${counter}`;
			counter++;

			// Prevent infinite loops
			if (counter > 1000) {
				slug = `${baseSlug}-${Date.now()}`;
				break;
			}
		}

		return slug;
	}

	private async slugExists(slug: string): Promise<boolean> {
		const q = query(collection(this.db, 'projects'), where('slug', '==', slug));
		const snapshot = await getDocs(q);
		return !snapshot.empty;
	}

	private async moveProjectSubcollections(
		fromProjectId: string,
		toProjectId: string
	): Promise<void> {
		const subcollections = ['nodes', 'edges', 'people', 'timeline'];

		for (const subcollectionName of subcollections) {
			const fromRef = collection(this.db, 'projects', fromProjectId, subcollectionName);
			const snapshot = await getDocs(fromRef);

			const batch = writeBatch(this.db);
			snapshot.docs.forEach((docSnapshot) => {
				const toRef = doc(this.db, 'recycle-bin', toProjectId, subcollectionName, docSnapshot.id);
				batch.set(toRef, docSnapshot.data());
			});

			if (!snapshot.empty) {
				await batch.commit();
			}
		}
	}

	private async deleteProjectSubcollections(projectId: string): Promise<void> {
		const batch = writeBatch(this.db);
		const subcollections = ['nodes', 'edges', 'people', 'timeline'];

		for (const subcollectionName of subcollections) {
			const subcollectionRef = collection(this.db, 'projects', projectId, subcollectionName);
			const snapshot = await getDocs(subcollectionRef);

			snapshot.docs.forEach((docSnapshot) => {
				batch.delete(docSnapshot.ref);
			});
		}

		// Check if there are any operations in the batch
		await batch.commit();
	}

	// Collaborator management methods
	async addCollaboratorToProject(projectSlug: string, userId: string): Promise<boolean> {
		try {
			const project = await this.getProject(projectSlug);
			if (!project) return false;

			// Check if user is already a collaborator
			if (project.collaborators?.includes(userId)) {
				return true; // Already a collaborator
			}

			const collaborators = project.collaborators || [];
			collaborators.push(userId);

			const updated = await this.updateProject(projectSlug, { collaborators });
			return !!updated;
		} catch (error) {
			console.error('Failed to add collaborator to project:', error);
			return false;
		}
	}

	async removeCollaboratorFromProject(projectSlug: string, userId: string): Promise<boolean> {
		try {
			const project = await this.getProject(projectSlug);
			if (!project) return false;

			const collaborators = project.collaborators?.filter((id) => id !== userId) || [];
			const updated = await this.updateProject(projectSlug, { collaborators });
			return !!updated;
		} catch (error) {
			console.error('Failed to remove collaborator from project:', error);
			return false;
		}
	}

	async getProjectCollaborators(projectSlug: string): Promise<
		Array<{
			id: string;
			email: string;
			name: string;
			userType: 'member' | 'collaborator';
		}>
	> {
		try {
			const project = await this.getProject(projectSlug);
			if (!project || !project.collaborators) return [];

			// Get user details for each collaborator
			const collaboratorDetails = await Promise.all(
				project.collaborators.map(async (userId) => {
					const userDoc = await getDoc(doc(this.db, 'users', userId));
					if (userDoc.exists()) {
						const userData = userDoc.data();
						return {
							id: userId,
							email: userData.email || '',
							name: userData.name || '',
							userType: userData.userType || 'member'
						};
					}
					return null;
				})
			);

			return collaboratorDetails.filter((collab) => collab !== null) as Array<{
				id: string;
				email: string;
				name: string;
				userType: 'member' | 'collaborator';
			}>;
		} catch (error) {
			console.error('Failed to get project collaborators:', error);
			throw error;
		}
	}
}
