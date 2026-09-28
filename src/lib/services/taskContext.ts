import type { IProjectsService } from './interfaces/IProjectsService';
import { extractNodeTitle } from '../utils/nodeTitle.ts';
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

export function createTaskContext(
	projectsService: Pick<IProjectsService, 'getProject'>,
	getNode: (
		projectId: string,
		nodeId: string
	) => Promise<{ nodeData: Record<string, unknown>; templateType: string } | null>
) {
	let generation = 0;
	const projectIdBySlug = new Map<string, string>();
	const projectTitleById = new Map<string, string>();
	const nodeTitleByKey = new Map<string, string>(); // `${projectId}:${nodeId}` -> title

	const pendingProjects = new Map<string, Promise<string | null>>();
	const pendingNodes = new Map<string, Promise<string | null>>();
	function shared(
		pending: Map<string, Promise<string | null>>,
		key: string,
		load: () => Promise<string | null>
	) {
		const existing = pending.get(key);
		if (existing) return existing;
		const request = load().finally(() => {
			if (pending.get(key) === request) pending.delete(key);
		});
		pending.set(key, request);
		return request;
	}
	function resolveProjectId(slug: string) {
		return shared(pendingProjects, slug, () => loadProjectId(slug));
	}
	function resolveNodeTitle(slug: string, nodeId: string) {
		return shared(pendingNodes, `${slug}:${nodeId}`, () => loadNodeTitle(slug, nodeId));
	}

	async function loadProjectId(projectSlug: string): Promise<string | null> {
		const cached = projectIdBySlug.get(projectSlug);
		if (cached) return cached;

		const request = generation;
		const result = projectsService.getProject(projectSlug);
		const project = await result;
		if (!project || request !== generation) return null;

		projectIdBySlug.set(projectSlug, project.id);
		projectTitleById.set(project.id, project.title);
		return project.id;
	}

	async function resolveProjectTitle(projectSlug: string): Promise<string | null> {
		const projectId = await resolveProjectId(projectSlug);
		if (!projectId) return null;
		return projectTitleById.get(projectId) ?? null;
	}

	async function loadNodeTitle(projectSlug: string, nodeId: string): Promise<string | null> {
		const projectId = await resolveProjectId(projectSlug);
		if (!projectId) return null;

		const key = `${projectId}:${nodeId}`;
		const cached = nodeTitleByKey.get(key);
		if (cached) return cached;

		const request = generation;
		const nodeData = await getNode(projectId, nodeId);
		if (!nodeData || request !== generation) return null;
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
	async function joinTaskContext(tasks: TaskWithContext[]): Promise<TaskWithContext[]> {
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
			const liveNodeTitle = projectId
				? nodeTitleByKey.get(`${projectId}:${task.nodeId}`)
				: undefined;

			return {
				...task,
				projectTitle: liveProjectTitle ?? task.projectTitle,
				nodeTitle: liveNodeTitle ?? task.nodeTitle
			};
		});
	}

	return {
		joinTaskContext,
		resolveProjectTitle,
		resolveNodeTitle,
		clear() {
			generation++;
			pendingProjects.clear();
			pendingNodes.clear();
			projectIdBySlug.clear();
			projectTitleById.clear();
			nodeTitleByKey.clear();
		}
	};
}
