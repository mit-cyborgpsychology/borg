import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { projectsService } from './instances';
import { extractNodeTitle } from '../utils/nodeTitle';
import type { TaskWithContext } from '../types/task';

// Cross-project live-join layer for task display fields (project/node title,
// overdue status) that used to be denormalized onto each task document at
// write time with no update path — a project rename or node retitle left
// every existing task's copy permanently stale. This resolves those fields
// at read time instead, from small in-memory caches shared across the app
// (keyed by ID, populated lazily, never re-fetched for the same ID within a
// session). In-canvas views (an open project's own ProjectStore) resolve
// node titles from their already-live node subscription instead of this
// module's one-shot fetch — this module is for views spanning multiple
// projects (global task lists) where no single project's nodes are loaded.

const projectIdBySlug = new Map<string, string>();
const projectTitleById = new Map<string, string>();
const nodeTitleByKey = new Map<string, string>(); // `${projectId}:${nodeId}` -> title

async function resolveProjectId(projectSlug: string): Promise<string | null> {
	const cached = projectIdBySlug.get(projectSlug);
	if (cached) return cached;

	const result = projectsService.getProject(projectSlug);
	const project = result instanceof Promise ? await result : result;
	if (!project) return null;

	projectIdBySlug.set(projectSlug, project.id);
	projectTitleById.set(project.id, project.title);
	return project.id;
}

export async function resolveProjectTitle(projectSlug: string): Promise<string | null> {
	const projectId = await resolveProjectId(projectSlug);
	if (!projectId) return null;
	return projectTitleById.get(projectId) ?? null;
}

export async function resolveNodeTitle(projectSlug: string, nodeId: string): Promise<string | null> {
	const projectId = await resolveProjectId(projectSlug);
	if (!projectId) return null;

	const key = `${projectId}:${nodeId}`;
	const cached = nodeTitleByKey.get(key);
	if (cached) return cached;

	const nodeSnapshot = await getDoc(doc(db, 'projects', projectId, 'nodes', nodeId));
	if (!nodeSnapshot.exists()) return null;

	const nodeData = nodeSnapshot.data();
	const title = extractNodeTitle(nodeData?.nodeData, nodeData?.templateType);

	nodeTitleByKey.set(key, title);
	return title;
}

/**
 * Resolves live project/node titles for a batch of tasks in one pass —
 * dedupes project/node lookups across the whole array so a list of N tasks
 * against M unique (project, node) pairs does M fetches, not N, and never
 * repeats a fetch for a pair already seen this session.
 */
export async function joinTaskContext(tasks: TaskWithContext[]): Promise<TaskWithContext[]> {
	const uniquePairs = new Map<string, { projectSlug: string; nodeId: string }>();
	for (const task of tasks) {
		if (!task.projectSlug || !task.nodeId) continue;
		uniquePairs.set(`${task.projectSlug}:${task.nodeId}`, {
			projectSlug: task.projectSlug,
			nodeId: task.nodeId
		});
	}

	await Promise.all(
		Array.from(uniquePairs.values()).map(({ projectSlug, nodeId }) =>
			Promise.all([resolveProjectTitle(projectSlug), resolveNodeTitle(projectSlug, nodeId)])
		)
	);

	return tasks.map((task) => {
		if (!task.projectSlug || !task.nodeId) return task;

		const projectId = projectIdBySlug.get(task.projectSlug);
		const liveProjectTitle = projectId ? projectTitleById.get(projectId) : undefined;
		const liveNodeTitle = projectId ? nodeTitleByKey.get(`${projectId}:${task.nodeId}`) : undefined;

		return {
			...task,
			projectTitle: liveProjectTitle ?? task.projectTitle,
			nodeTitle: liveNodeTitle ?? task.nodeTitle
		};
	});
}
