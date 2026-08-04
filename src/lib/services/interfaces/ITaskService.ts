import type { Task, TaskWithContext, TaskCounts, PersonTaskCount } from '../../types/task';

// Options for task source context
export interface TaskSourceOptions {
	// For project-based tasks
	projectSlug?: string;
	// For Outline doc-based tasks
	outlineDocId?: string;
	outlineDocTitle?: string;
}

export interface ITaskService {
	getAllTasks(): Promise<TaskWithContext[]> | TaskWithContext[];
	getProjectTasks(projectSlug: string): Promise<TaskWithContext[]> | TaskWithContext[];
	getPersonTasks(personId: string): Promise<TaskWithContext[]> | TaskWithContext[];
	getNodeTasks(nodeId: string, projectSlug?: string): Promise<Task[]> | Task[];
	getNodePersonTaskCounts(nodeId: string, projectSlug?: string): Promise<PersonTaskCount[]> | PersonTaskCount[];
	addTask(nodeId: string, task: Omit<Task, 'id' | 'createdAt'>, projectSlugOrOptions?: string | TaskSourceOptions): Promise<void> | void;
	updateTask(nodeId: string, taskId: string, updates: Partial<Task>, projectSlug?: string): Promise<void> | void;
	deleteTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void> | void;
	resolveTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void> | void;
	getActiveTasks(): Promise<TaskWithContext[]> | TaskWithContext[];
	getResolvedTasks(): Promise<TaskWithContext[]> | TaskWithContext[];
	getTaskCounts(projectSlug?: string): Promise<TaskCounts> | TaskCounts;
	getPersonResolvedTasksLog?(personId: string, daysBack?: number): Promise<TaskWithContext[]> | TaskWithContext[];
	getAllResolvedTasksLog?(daysBack?: number): Promise<TaskWithContext[]> | TaskWithContext[];

	// Real-time subscriptions (Firebase only)
	subscribeToNodeTasks?(nodeId: string, callback: (tasks: Task[]) => void, projectSlug?: string, includeResolved?: boolean): () => void;
	subscribeToPersonTasks?(personId: string, callback: (tasks: TaskWithContext[]) => void, projectSlug?: string): () => void;
	subscribeToProjectTasks?(projectSlug: string, callback: (tasks: TaskWithContext[]) => void): () => void;
}