import { canonicalNodeType } from '../features/links/linkNode.ts';
import { getTemplate } from '../templates.ts';
import type { INodesService, IProjectsService, ITaskService } from './interfaces';
import type { INodesRepository } from './interfaces/INodesRepository';
import type { ReadSession } from './interfaces/Session';

/** Application operations coordinate repositories; adapters never import other services. */
export function createNodeService(
	repository: INodesRepository,
	readSession: ReadSession,
	projects: Pick<IProjectsService, 'invalidateStatusCache'>,
	tasks: Pick<ITaskService, 'getNodeTasks' | 'deleteTask'>,
	projectSlug?: string
): INodesService {
	return {
		async addNode(templateType, position) {
			templateType = canonicalNodeType(templateType);
			const template = getTemplate(templateType);
			if (!template) throw new Error(`Unknown node template: ${templateType}`);
			if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
				throw new Error('Node position must contain finite coordinates');
			const fields: Record<string, unknown> = { title: '' };
			for (const field of template.fields) {
				fields[field.id] =
					field.type === 'tags'
						? []
						: templateType === 'note' && field.type === 'select' && field.id === 'size'
							? 'Small'
							: (field.defaultValue ?? '');
			}
			if (templateType === 'time') fields.countdownMode = true;
			return repository.createNode(
				templateType,
				position,
				fields,
				readSession().user?.uid ?? 'anonymous'
			);
		},
		async updateNode(id, updates, userId) {
			const updated = await repository.updateNode(id, updates, userId);
			if (updated && projectSlug && (updates.nodeData || updates.data?.nodeData))
				projects.invalidateStatusCache(projectSlug);
			return updated;
		},
		async deleteNode(id) {
			if (!(await repository.deleteNode(id))) return false;
			// Retain the existing history policy: only active node tasks are removed.
			// A broader task/archive retention change needs its own migration.
			try {
				const nodeTasks = await tasks.getNodeTasks(id, projectSlug);
				await Promise.all(nodeTasks.map((task) => tasks.deleteTask(id, task.id, projectSlug)));
			} catch (error) {
				// The node is already deleted; retain the existing best-effort cleanup behavior.
				console.error('Failed to clean up tasks for deleted node:', error);
			}
			return true;
		},
		getNodes: () => repository.getNodes(),
		getEdges: () => repository.getEdges(),
		addEdge: (edge) => repository.addEdge(edge),
		deleteEdge: (id) => repository.deleteEdge(id),
		saveBatch: (nodes, edges) => repository.saveBatch(nodes, edges),
		subscribeToNodes: (next, error) => repository.subscribeToNodes(next, error),
		subscribeToEdges: (next, error) => repository.subscribeToEdges(next, error)
	};
}
