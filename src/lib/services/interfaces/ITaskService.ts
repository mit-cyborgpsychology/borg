import type { Task, TaskWithContext, TaskCounts, PersonTaskCount } from '../../types/task';

// Options for task source context
export interface TaskSourceOptions {
	// For project-based tasks
	projectSlug?: string;
	// For Outline doc-based tasks
	outlineDocId?: string;
	outlineDocTitle?: string;
}

export interface TaskPageCursor {
	createdAt: string;
	id: string;
}

export interface TaskPageOptions {
	status: 'active' | 'resolved';
	assignee?: string;
	project?: string;
	cursor?: TaskPageCursor | null;
	pageSize?: number;
}

export interface TaskPage {
	tasks: TaskWithContext[];
	nextCursor: TaskPageCursor | null;
}

export interface ITaskService {
	getTaskPage(options: TaskPageOptions): Promise<TaskPage>;
	getTaskProjectCount(project: string, assignee?: string): Promise<number>;
	getAllTasks(): Promise<TaskWithContext[]>;
	getProjectTasks(projectSlug: string): Promise<TaskWithContext[]>;
	getPersonTasks(personId: string): Promise<TaskWithContext[]>;
	getNodeTasks(nodeId: string, projectSlug?: string): Promise<Task[]>;
	getNodePersonTaskCounts(nodeId: string, projectSlug?: string): Promise<PersonTaskCount[]>;
	addTask(
		nodeId: string,
		task: Omit<Task, 'id' | 'createdAt'>,
		projectSlugOrOptions?: string | TaskSourceOptions
	): Promise<void>;
	updateTask(
		nodeId: string,
		taskId: string,
		updates: Partial<Task>,
		projectSlug?: string
	): Promise<void>;
	deleteTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void>;
	resolveTask(nodeId: string, taskId: string, projectSlug?: string): Promise<void>;
	getActiveTasks(): Promise<TaskWithContext[]>;
	getResolvedTasks(): Promise<TaskWithContext[]>;
	getTaskCounts(projectSlug?: string): Promise<TaskCounts>;
	getPersonResolvedTasksLog(personId: string, daysBack?: number): Promise<TaskWithContext[]>;
	getAllResolvedTasksLog?(daysBack?: number): Promise<TaskWithContext[]>;

	// Real-time subscriptions (Firebase only)
	subscribeToNodeTasks?(
		nodeId: string,
		callback: (tasks: Task[]) => void,
		projectSlug?: string,
		includeResolved?: boolean
	): () => void;
	subscribeToPersonTasks?(
		personId: string,
		callback: (tasks: TaskWithContext[]) => void,
		projectSlug?: string
	): () => void;
	subscribeToProjectTasks?(
		projectSlug: string,
		callback: (tasks: TaskWithContext[]) => void,
		onError?: (error: unknown) => void
	): () => void;
}
