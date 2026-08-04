export interface Task {
	id: string;
	title: string;
	assignee: string; // person ID from PeopleService
	dueDate?: string; // ISO date string
	notes?: string;
	createdAt: string; // timestamp
	status?: 'active' | 'resolved'; // Default to 'active' for backward compatibility
}

// Source type for tasks - can be from a project node or an Outline doc
export type TaskSourceType = 'project' | 'outline';

export interface TaskWithContext extends Task {
	// Source information
	sourceType?: TaskSourceType; // 'project' or 'outline', defaults to 'project' for backward compat

	// Project source fields (used when sourceType is 'project')
	projectSlug?: string;
	// projectTitle/nodeTitle are resolved live at read time (see
	// ProjectStore.svelte.ts for in-canvas views, taskContext.ts for
	// cross-project views) rather than trusted as a stored snapshot, so
	// they may be absent until a caller has joined them in.
	projectTitle?: string;
	nodeId: string;
	nodeTitle?: string;
	nodeType: string;

	// Outline doc source fields (used when sourceType is 'outline')
	outlineDocId?: string;
	outlineDocTitle?: string;
	outlineCommentId?: string;

	updatedAt?: string;
}

export interface TaskCounts {
	total: number;
}

export interface PersonTaskCount {
	personId: string;
	count: number;
}