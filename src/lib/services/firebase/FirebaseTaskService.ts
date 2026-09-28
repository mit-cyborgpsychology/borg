import {
	collection,
	setDoc,
	deleteDoc,
	getDocs,
	getDoc,
	query,
	where,
	orderBy,
	onSnapshot,
	updateDoc,
	doc,
	writeBatch,
	type Unsubscribe
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import type {
	Task,
	TaskWithContext,
	TaskCounts,
	PersonTaskCount,
	TaskSourceType
} from '../../types/task';
import type { ITaskService, TaskSourceOptions } from '../interfaces';

export interface StoredTask {
	id: string;
	title: string;
	assignee: string;
	dueDate: string;
	notes: string;
	createdAt: string;
	updatedAt?: string;
	status?: 'active' | 'resolved';
	// Source type: 'project' or 'outline'
	sourceType: TaskSourceType;
	// Project source fields
	projectId: string;
	projectSlug: string;
	nodeId: string;
	nodeType: string;
	// projectTitle/nodeTitle/isOverdue used to be written here but had no
	// update path (a project rename or node retitle left every existing
	// task's copy permanently stale) — display now resolves these live via
	// ProjectStore (in-canvas) or taskContext.ts (cross-project views)
	// instead of trusting a stored copy. Kept optional, read-only, for
	// backward compat with existing documents that still have them.
	projectTitle?: string;
	nodeTitle?: string;
	isOverdue?: boolean;
	// Outline doc source fields
	outlineDocId?: string;
	outlineDocTitle?: string;
	// Id of the Outline comment that originated this task, used to thread
	// echo replies (task updates/resolves/deletes) back into that comment.
	outlineCommentId?: string;
	// Common fields
	createdBy: string;
}

// Builds the Outline echo message for an updateTask() call. Returns null
// for updates that shouldn't produce an echo (e.g. isOverdue recalculation
// alone, with no user-visible field changed).
function describeUpdateForOutline(updates: Partial<Task>): string | null {
	if (updates.status === 'resolved') return '✅ Task marked done in Borg.';
	if (updates.status === 'active') return '↩️ Task reopened in Borg.';

	const changedFields = Object.keys(updates).filter((k) => k !== 'status');
	if (changedFields.length === 0) return null;

	if (changedFields.length === 1 && changedFields[0] === 'assignee') {
		return '✏️ Task reassigned in Borg.';
	}
	if (changedFields.length === 1 && changedFields[0] === 'title') {
		return '✏️ Task retitled in Borg.';
	}
	if (changedFields.length === 1 && changedFields[0] === 'dueDate') {
		return '✏️ Task due date updated in Borg.';
	}
	return '✏️ Task details updated in Borg.';
}

import type { ReadSession } from '../interfaces/Session';
export class FirebaseTaskService implements ITaskService {
	constructor(
		private db: Firestore,
		private readSession: ReadSession
	) {}
	async getAllTasks(): Promise<TaskWithContext[]> {
		const q = query(
			collection(this.db, 'tasks'),
			where('status', 'in', ['active', null]),
			orderBy('createdAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) =>
			this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
		);
	}

	async getProjectTasks(projectSlug: string): Promise<TaskWithContext[]> {
		const q = query(
			collection(this.db, 'tasks'),
			where('projectSlug', '==', projectSlug),
			where('status', 'in', ['active', null]),
			orderBy('createdAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) =>
			this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
		);
	}

	async getPersonTasks(personId: string): Promise<TaskWithContext[]> {
		const q = query(
			collection(this.db, 'tasks'),
			where('assignee', '==', personId),
			where('status', 'in', ['active', null]),
			orderBy('createdAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) =>
			this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
		);
	}

	async getNodeTasks(nodeId: string, projectSlug?: string): Promise<Task[]> {
		let q;
		if (projectSlug) {
			q = query(
				collection(this.db, 'tasks'),
				where('projectSlug', '==', projectSlug),
				where('nodeId', '==', nodeId),
				where('status', 'in', ['active', null]),
				orderBy('createdAt', 'desc')
			);
		} else {
			q = query(
				collection(this.db, 'tasks'),
				where('nodeId', '==', nodeId),
				where('status', 'in', ['active', null]),
				orderBy('createdAt', 'desc')
			);
		}

		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => {
			const data = doc.data() as StoredTask;
			return {
				id: doc.id,
				title: data.title,
				assignee: data.assignee,
				dueDate: data.dueDate,
				notes: data.notes,
				createdAt: data.createdAt,
				status: data.status || 'active'
			};
		});
	}

	async getNodePersonTaskCounts(nodeId: string, projectSlug?: string): Promise<PersonTaskCount[]> {
		const tasks = await this.getNodeTasks(nodeId, projectSlug);
		const counts = new Map<string, number>();

		tasks.forEach((task) => {
			counts.set(task.assignee, (counts.get(task.assignee) || 0) + 1);
		});

		return Array.from(counts.entries()).map(([personId, count]) => ({
			personId,
			count
		}));
	}

	async addTask(
		nodeId: string,
		task: Omit<Task, 'id' | 'createdAt'>,
		projectSlugOrOptions?: string | TaskSourceOptions
	): Promise<void> {
		// Parse options - support both old string format and new options format
		let options: TaskSourceOptions = {};
		if (typeof projectSlugOrOptions === 'string') {
			options = { projectSlug: projectSlugOrOptions };
		} else if (projectSlugOrOptions) {
			options = projectSlugOrOptions;
		}

		const now = new Date();

		// Handle Outline doc-based tasks. Unlike project-sourced tasks,
		// nodeTitle here is NOT a denormalized copy of data that lives
		// elsewhere in Firestore — the Outline doc lives in an external
		// system, so this is the only place its title is available to join
		// against, and must keep being written.
		if (options.outlineDocId) {
			const storedTask: Omit<StoredTask, 'id'> = {
				title: task.title,
				assignee: task.assignee,
				dueDate: task.dueDate || '',
				notes: task.notes || '',
				createdAt: now.toISOString(),
				status: task.status || 'active',
				sourceType: 'outline',
				// Empty project fields for outline-doc tasks
				projectId: '',
				projectSlug: '',
				nodeId: nodeId, // This will be the outlineDocId
				nodeTitle: options.outlineDocTitle || 'Untitled Doc',
				nodeType: 'outline',
				// Outline doc-specific fields
				outlineDocId: options.outlineDocId,
				outlineDocTitle: options.outlineDocTitle || 'Untitled Doc',
				createdBy: this.readSession().user?.uid || 'anonymous'
			};

			const docRef = doc(collection(this.db, 'tasks'));
			await setDoc(docRef, { ...storedTask, id: docRef.id });
			return;
		}

		// Handle project-based tasks (original logic)
		const projectSlug = options.projectSlug;
		if (!projectSlug) {
			throw new Error('Project slug or Outline doc ID is required for task creation');
		}

		// We'll need project and node context - this would typically come from the calling component
		// For now, we'll need to fetch project info
		const projectQuery = query(collection(this.db, 'projects'), where('slug', '==', projectSlug));
		const projectSnapshot = await getDocs(projectQuery);

		if (projectSnapshot.empty) {
			throw new Error(`Project not found: ${projectSlug}`);
		}

		const projectData = projectSnapshot.docs[0].data();
		const project = {
			id: projectSnapshot.docs[0].id,
			title: projectData.title || 'Untitled Project',
			...projectData
		};

		// Get node info - use document ID directly instead of querying by field
		let nodeData = null;
		try {
			const nodeDocRef = doc(this.db, 'projects', project.id, 'nodes', nodeId);
			const nodeSnapshot = await getDoc(nodeDocRef);
			nodeData = nodeSnapshot.exists() ? nodeSnapshot.data() : null;
		} catch (error) {
			console.warn('FirebaseTaskService.addTask: Error getting node:', error);
			nodeData = null;
		}

		const nodeType = nodeData?.templateType || 'unknown';

		// projectTitle/nodeTitle are intentionally NOT stored here — both are
		// display copies of data that lives on the project/node documents
		// themselves and is resolved live at read time (ProjectStore for
		// in-canvas views, taskContext.ts for cross-project views) instead of
		// a stored snapshot that would go stale on rename with no update path.
		const storedTask: Omit<StoredTask, 'id'> = {
			title: task.title,
			assignee: task.assignee,
			dueDate: task.dueDate || '',
			notes: task.notes || '',
			createdAt: now.toISOString(),
			status: task.status || 'active',
			sourceType: 'project',
			projectId: project.id,
			projectSlug: projectSlug,
			nodeId: nodeId,
			nodeType: nodeType,
			createdBy: this.readSession().user?.uid || 'anonymous'
		};

		// Publish a complete task in one write so live views can act on it immediately.
		const docRef = doc(collection(this.db, 'tasks'));
		await setDoc(docRef, { ...storedTask, id: docRef.id });
	}

	async updateTask(
		nodeId: string,
		taskId: string,
		updates: Partial<Task>,
		projectSlug?: string
	): Promise<void> {
		const q = query(collection(this.db, 'tasks'), where('id', '==', taskId));
		const snapshot = await getDocs(q);

		if (snapshot.empty) {
			throw new Error(`Task not found: ${taskId}`);
		}

		const taskDoc = snapshot.docs[0];
		const now = new Date();
		const currentData = taskDoc.data() as StoredTask;

		await updateDoc(taskDoc.ref, {
			...updates,
			updatedAt: now.toISOString()
		});

		this.notifyOutline(currentData, describeUpdateForOutline(updates));
	}

	async deleteTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void> {
		if (!taskId) {
			throw new Error('Task ID is required for deletion');
		}
		if (!nodeId) {
			throw new Error('Node ID is required for deletion');
		}

		const q = query(
			collection(this.db, 'tasks'),
			where('id', '==', taskId),
			where('nodeId', '==', nodeId)
		);

		const snapshot = await getDocs(q);

		for (const docSnap of snapshot.docs) {
			const storedTask = docSnap.data() as StoredTask;
			await deleteDoc(docSnap.ref);
			this.notifyOutline(storedTask, '🗑️ Task deleted in Borg.');
		}
	}

	// Fire-and-forget echo of a task mutation back into the originating
	// Outline comment thread. Never awaited by callers, never throws —
	// a failed echo must not surface as a failed task mutation.
	private notifyOutline(storedTask: StoredTask, message: string | null): void {
		if (storedTask.sourceType !== 'outline' || !storedTask.outlineDocId || !message) return;

		(async () => {
			try {
				const user = this.readSession().user;
				const idToken = await user?.getIdToken();
				await fetch('/api/outline/task-events', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...(idToken && { Authorization: `Bearer ${idToken}` })
					},
					body: JSON.stringify({
						outlineDocId: storedTask.outlineDocId,
						commentId: storedTask.outlineCommentId,
						message
					})
				});
			} catch (err) {
				console.error('Failed to echo task update to Outline:', err);
			}
		})();
	}

	async resolveTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void> {
		await this.updateTask(nodeId, taskId, { status: 'resolved' }, projectSlug);
	}

	async getActiveTasks(): Promise<TaskWithContext[]> {
		return this.getAllTasks(); // Already filters for active tasks
	}

	async getResolvedTasks(): Promise<TaskWithContext[]> {
		const q = query(
			collection(this.db, 'tasks'),
			where('status', '==', 'resolved'),
			orderBy('createdAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) =>
			this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
		);
	}

	async getPersonResolvedTasksLog(
		personId: string,
		daysBack: number = 30
	): Promise<TaskWithContext[]> {
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysBack);

		const q = query(
			collection(this.db, 'tasks'),
			where('assignee', '==', personId),
			where('status', '==', 'resolved'),
			where('updatedAt', '>=', cutoffDate.toISOString()),
			orderBy('updatedAt', 'desc')
		);
		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) =>
			this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
		);
	}

	// Cache for task counts to avoid repeated expensive queries
	private taskCountsCache = new Map<string, { counts: TaskCounts; timestamp: number }>();
	private readonly TASK_CACHE_DURATION = 30000; // 30 seconds

	async getTaskCounts(projectSlug?: string): Promise<TaskCounts> {
		const cacheKey = projectSlug || 'global';

		// Check cache first
		const cached = this.taskCountsCache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.TASK_CACHE_DURATION) {
			console.log(`FirebaseTaskService: Using cached task counts for ${cacheKey}`);
			return cached.counts;
		}

		const tasks = projectSlug ? await this.getProjectTasks(projectSlug) : await this.getAllTasks();
		const counts = {
			total: tasks.length
		};

		// Cache the result
		this.taskCountsCache.set(cacheKey, { counts, timestamp: Date.now() });
		console.log(`FirebaseTaskService: Cached task counts for ${cacheKey}:`, counts);

		return counts;
	}

	subscribeToNodeTasks(
		nodeId: string,
		callback: (tasks: Task[]) => void,
		projectSlug?: string,
		includeResolved?: boolean
	): Unsubscribe {
		let q;
		if (includeResolved) {
			// For outline-doc-linked tasks, include all tasks regardless of status
			q = query(
				collection(this.db, 'tasks'),
				where('nodeId', '==', nodeId),
				orderBy('createdAt', 'desc')
			);
		} else if (projectSlug) {
			q = query(
				collection(this.db, 'tasks'),
				where('projectSlug', '==', projectSlug),
				where('nodeId', '==', nodeId),
				where('status', 'in', ['active', null]),
				orderBy('createdAt', 'desc')
			);
		} else {
			q = query(
				collection(this.db, 'tasks'),
				where('nodeId', '==', nodeId),
				where('status', 'in', ['active', null]),
				orderBy('createdAt', 'desc')
			);
		}

		return onSnapshot(q, (snapshot) => {
			const tasks = snapshot.docs.map((doc) => {
				const data = doc.data() as StoredTask;
				return {
					id: doc.id,
					title: data.title,
					assignee: data.assignee,
					dueDate: data.dueDate,
					notes: data.notes,
					createdAt: data.createdAt,
					status: data.status || 'active'
				};
			});
			callback(tasks);
		});
	}

	subscribeToPersonTasks(
		personId: string,
		callback: (tasks: TaskWithContext[]) => void,
		projectSlug?: string
	): Unsubscribe {
		let q;
		if (projectSlug) {
			q = query(
				collection(this.db, 'tasks'),
				where('projectSlug', '==', projectSlug),
				where('assignee', '==', personId),
				orderBy('createdAt', 'desc')
			);
		} else {
			q = query(
				collection(this.db, 'tasks'),
				where('assignee', '==', personId),
				orderBy('createdAt', 'desc')
			);
		}

		return onSnapshot(q, (snapshot) => {
			const tasks = snapshot.docs.map((doc) =>
				this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
			);
			callback(tasks);
		});
	}

	subscribeToProjectTasks(
		projectSlug: string,
		callback: (tasks: TaskWithContext[]) => void,
		onError?: (error: unknown) => void
	): Unsubscribe {
		const q = query(
			collection(this.db, 'tasks'),
			where('projectSlug', '==', projectSlug),
			orderBy('createdAt', 'desc')
		);

		return onSnapshot(
			q,
			(snapshot) => {
				const tasks = snapshot.docs.map((doc) =>
					this.toTaskWithContext({ ...doc.data(), id: doc.id } as StoredTask)
				);
				callback(tasks);
			},
			onError
		);
	}

	private toTaskWithContext(storedTask: StoredTask): TaskWithContext {
		return {
			id: storedTask.id,
			title: storedTask.title,
			assignee: storedTask.assignee,
			dueDate: storedTask.dueDate,
			notes: storedTask.notes,
			createdAt: storedTask.createdAt,
			updatedAt: storedTask.updatedAt,
			status: storedTask.status || 'active',
			sourceType: storedTask.sourceType || 'project',
			projectSlug: storedTask.projectSlug,
			projectTitle: storedTask.projectTitle,
			nodeId: storedTask.nodeId,
			nodeTitle: storedTask.nodeTitle,
			nodeType: storedTask.nodeType,
			outlineDocId: storedTask.outlineDocId,
			outlineDocTitle: storedTask.outlineDocTitle,
			outlineCommentId: storedTask.outlineCommentId
		};
	}
}
