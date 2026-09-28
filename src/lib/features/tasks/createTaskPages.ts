import { get } from 'svelte/store';
import { createResource } from '../../state/resource.ts';
import type { ITaskService, IProjectsService } from '../../services/interfaces';
import type { TaskPageCursor } from '../../services/interfaces/ITaskService';
import type { TaskWithContext } from '../../types/task';

export type TaskProjectEntry = { value: string; label: string; count: number };

type View = 'active' | 'completed';
type PageState = {
	projects: TaskProjectEntry[];
	selectedProject: string;
	active: TaskWithContext[];
	resolved: TaskWithContext[];
	cursors: Record<View, TaskPageCursor | null>;
	pageNumbers: Record<View, number>;
	starts: Record<View, (TaskPageCursor | null)[]>;
};

/** Keep cursor history for Previous without downloading earlier pages again. */
export function createTaskPages(
	tasks: ITaskService,
	join: (tasks: TaskWithContext[]) => Promise<TaskWithContext[]>,
	projects: IProjectsService
) {
	const initial: PageState = {
		projects: [],
		selectedProject: '',
		active: [],
		resolved: [],
		cursors: { active: null, completed: null },
		pageNumbers: { active: 1, completed: 1 },
		starts: { active: [null], completed: [null] }
	};
	const list = createResource(initial);
	let assignee: string | undefined;
	let visible: (task: TaskWithContext) => boolean = () => true;
	let generation = 0;
	let allowExternal = true;
	async function loadDirectory(personId?: string): Promise<TaskProjectEntry[]> {
		const all = await projects.getAllProjects();
		const entries = all.map((project) => ({
			value: `project:${project.slug}`,
			label: project.title
		}));
		if (allowExternal)
			entries.push(
				{ value: 'source:outline', label: 'Outline' },
				{ value: 'source:unlinked', label: 'Unlinked project' }
			);
		const results: TaskProjectEntry[] = [];
		for (let offset = 0; offset < entries.length; offset += 8) {
			results.push(
				...(await Promise.all(
					entries.slice(offset, offset + 8).map(async (entry) => ({
						...entry,
						count: await tasks.getTaskProjectCount(entry.value, personId)
					}))
				))
			);
		}
		return results
			.filter((entry) => entry.count > 0)
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	async function fetchPage(
		view: View,
		cursor: TaskPageCursor | null,
		personId: string | undefined,
		filter: typeof visible,
		project: string
	) {
		const page = await tasks.getTaskPage({
			status: view === 'active' ? 'active' : 'resolved',
			assignee: personId,
			cursor,
			project
		});
		return { items: await join(page.tasks.filter(filter)), cursor: page.nextCursor };
	}

	return {
		list,
		load(
			personId?: string,
			prepareFilter: () => Promise<(task: TaskWithContext) => boolean> = async () => () => true,
			includeExternal = true
		) {
			const current = assignee === personId ? get(list).data : initial;
			assignee = personId;
			allowExternal = includeExternal;
			const request = ++generation;
			return list.load(async () => {
				const filter = await prepareFilter();
				if (request === generation) visible = filter;
				const [active, resolved, directory] = await Promise.all([
					fetchPage(
						'active',
						current.starts.active[current.pageNumbers.active - 1],
						personId,
						filter,
						current.selectedProject
					),
					fetchPage(
						'completed',
						current.starts.completed[current.pageNumbers.completed - 1],
						personId,
						filter,
						current.selectedProject
					),
					loadDirectory(personId)
				]);
				return {
					...current,
					projects: directory,
					active: active.items,
					resolved: resolved.items,
					cursors: { active: active.cursor, completed: resolved.cursor }
				};
			});
		},
		selectProject(project: string) {
			const current = get(list);
			if (current.status === 'loading') return Promise.resolve();
			return list.load(async () => {
				const [active, resolved] = await Promise.all([
					fetchPage('active', null, assignee, visible, project),
					fetchPage('completed', null, assignee, visible, project)
				]);
				return {
					...initial,
					projects: current.data.projects,
					selectedProject: project,
					active: active.items,
					resolved: resolved.items,
					cursors: { active: active.cursor, completed: resolved.cursor }
				};
			});
		},
		changePage(view: View, direction: -1 | 1) {
			const current = get(list);
			const pageNumber = current.data.pageNumbers[view] + direction;
			if (current.status === 'loading' || pageNumber < 1) return Promise.resolve();
			if (direction === 1 && !current.data.cursors[view]) return Promise.resolve();
			const cursor =
				direction === 1 ? current.data.cursors[view] : current.data.starts[view][pageNumber - 1];
			const personId = assignee;
			const filter = visible;
			return list.load(async () => {
				const page = await fetchPage(view, cursor, personId, filter, current.data.selectedProject);
				const starts = current.data.starts[view].slice(0, pageNumber - 1);
				starts.push(cursor);
				return {
					...current.data,
					[view === 'active' ? 'active' : 'resolved']: page.items,
					cursors: { ...current.data.cursors, [view]: page.cursor },
					pageNumbers: { ...current.data.pageNumbers, [view]: pageNumber },
					starts: { ...current.data.starts, [view]: starts }
				};
			});
		},
		dispose() {
			generation++;
			list.dispose();
		}
	};
}
