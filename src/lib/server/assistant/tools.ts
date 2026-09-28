import { freePosition, placementOrigin } from './placement.ts';
import { normalizeLinkUrl } from '../../features/links/linkNode.ts';
import { tool } from 'ai';
import { z } from 'zod';
import type { AssistantStore } from './store.ts';
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const taskInput = z.object({
	nodeId: identifier,
	title: z.string().trim().min(1).max(250),
	assignee: z
		.string()
		.max(128)
		.describe('Person ID, "me" for the signed-in user, or empty for unassigned.'),
	notes: z.string().max(4000),
	dueDate: z
		.string()
		.regex(/^(\d{4}-\d{2}-\d{2})?$/)
		.describe('YYYY-MM-DD or empty. Do not invent deadlines.')
});
export const nodeInput = z.object({
	type: z.enum(['note', 'blank', 'link']),
	title: z.string().trim().min(1).max(250),
	content: z.string().max(4000).describe('Note body or link description; empty if unused.'),
	url: z.string().max(2000).describe('Required for link nodes; empty for other types.')
});
async function operationId(parts: unknown[]) {
	const hash = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(JSON.stringify(parts))
	);
	return (
		'agent-' + Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
	);
}
export function createAssistantTools(
	store: AssistantStore,
	projectId: string,
	uid: string,
	turnId: string,
	selectedIds: string[]
) {
	let writes = 0;
	let nodeWrites = 0;
	let nodeOrigin: { x: number; y: number } | undefined;
	let edgeWrites = 0;
	let canvasQueue: Promise<unknown> = Promise.resolve();
	function serial<T>(operation: () => Promise<T>): Promise<T> {
		const next = canvasQueue.then(operation);
		canvasQueue = next.catch(() => {});
		return next;
	}
	async function authorize() {
		const user = await store.get(`users/${uid}`);
		if (user.data.isApproved !== true) throw new Error('Your account needs approval.');
		return store.get(`projects/${projectId}`);
	}
	return {
		getProjectContext: tool({
			description:
				'Read current project, its canvas nodes, tasks, people, and selected nodes. Read before answering project questions or creating tasks, nodes, or connections.',
			inputSchema: z.object({}),
			execute: async () => {
				const project = await authorize();
				const [nodes, tasks, people, edges] = await Promise.all([
					store.list(`projects/${projectId}/nodes`),
					store.query('tasks', 'projectSlug', String(project.data.slug)),
					store.list('users'),
					store.list(`projects/${projectId}/edges`)
				]);
				return {
					project: {
						id: project.id,
						title: project.data.title,
						description: project.data.description
					},
					currentUserId: uid,
					edges: edges
						.slice(0, 200)
						.map((e) => ({ id: e.id, source: e.data.source, target: e.data.target })),
					edgesMayBeTruncated: edges.length > 200,
					nodesMayBeTruncated: nodes.length > 100,
					nodes: nodes
						.sort((a, b) => Number(selectedIds.includes(b.id)) - Number(selectedIds.includes(a.id)))
						.slice(0, 100)
						.map((n) => ({
							id: n.id,
							type: n.data.templateType,
							position: n.data.position,
							selected: selectedIds.includes(n.id),
							data: JSON.stringify(n.data.nodeData || {}).slice(0, 2000)
						})),
					tasks: tasks.map((t) => ({
						id: t.id,
						title: t.data.title,
						nodeId: t.data.nodeId,
						assignee: t.data.assignee,
						status: t.data.status,
						dueDate: t.data.dueDate
					})),
					tasksMayBeTruncated: tasks.length === 200,
					people: people
						.filter((p) => p.data.isApproved === true)
						.map((p) => ({
							id: p.id,
							name: p.data.preferredName || p.data.name || p.data.displayName
						}))
				};
			}
		}),
		createNode: tool({
			description:
				'Create a requested note, blank card, or link node. Nodes are arranged in a compact group near selected nodes, or below existing content, avoiding occupied space. Returns nodeId for creating tasks or connections. Maximum 5 new nodes per turn. Only create when requested; this does not create a Wiki document.',
			inputSchema: nodeInput,
			execute: async (input) =>
				serial(async () => {
					const values = nodeInput.parse(input);
					const project = await authorize();
					const url = values.type === 'link' ? normalizeLinkUrl(values.url) : '';
					if (values.type === 'link' && !url)
						throw new Error('A valid HTTP(S) URL is required for a link node.');
					const id = await operationId([uid, projectId, turnId, 'node', { ...values, url }]);
					const nodes = await store.list(`projects/${projectId}/nodes`);
					if (nodes.some((n) => n.id === id))
						return { status: 'node-created', nodeId: id, title: values.title };
					if (nodeWrites >= 5) throw new Error('Only five nodes can be created per turn.');
					nodeOrigin ??= placementOrigin(nodes, selectedIds);
					const position = freePosition(nodes, nodeOrigin);
					const nodeData =
						values.type === 'note'
							? {
									title: values.title,
									content: values.content || values.title,
									style: 'Post-It',
									width: 256,
									height: 180
								}
							: values.type === 'link'
								? {
										title: values.title,
										url,
										description: values.content,
										viewMode: 'Node',
										status: ''
									}
								: { title: values.title, status: '' };
					await store.createCanvasRecord(projectId, 'nodes', id, {
						type: 'universal',
						templateType: values.type,
						nodeData,
						position,
						projectSlug: String(project.data.slug),
						status: null,
						createdBy: uid,
						createdByAssistant: true,
						assistantOperation: id
					});
					nodeWrites++;
					return { status: 'node-created', nodeId: id, title: values.title };
				})
		}),
		connectNodes: tool({
			description:
				'Connect two nodes in this project with a directed canvas edge. Use actual node IDs from context or createNode results. Only connect when asked. Maximum 10 connections per turn.',
			inputSchema: z.object({ source: identifier, target: identifier }),
			execute: async ({ source, target }) =>
				serial(async () => {
					identifier.parse(source);
					identifier.parse(target);
					await authorize();
					if (source === target) throw new Error('Choose two different nodes.');
					await Promise.all([
						store.get(`projects/${projectId}/nodes/${source}`),
						store.get(`projects/${projectId}/nodes/${target}`)
					]);
					const edges = await store.list(`projects/${projectId}/edges`);
					const existing = edges.find((e) => e.data.source === source && e.data.target === target);
					if (existing) return { status: 'nodes-connected', id: existing.id, source, target };
					if (edgeWrites >= 10) throw new Error('Only ten connections can be created per turn.');
					const id = await operationId([uid, projectId, 'edge', source, target]);
					await store.createCanvasRecord(projectId, 'edges', id, {
						id,
						source,
						target,
						type: 'default',
						style: 'stroke: #d4d4d8; stroke-width: 1px;',
						createdBy: uid,
						createdByAssistant: true,
						assistantOperation: id
					});
					edgeWrites++;
					return { status: 'nodes-connected', id, source, target };
				})
		}),

		createTask: tool({
			description:
				'Create a requested task on an existing node in this project. Only use when the user asks to create tasks, never just when summarizing. Maximum 5 tasks per turn.',
			inputSchema: taskInput,
			execute: async (input) => {
				const values = taskInput.parse(input);
				const project = await authorize();
				const node = await store.get(`projects/${projectId}/nodes/${values.nodeId}`);
				const assignee = values.assignee === 'me' ? uid : values.assignee;
				if (assignee) {
					identifier.parse(assignee);
					const person = await store.get(`users/${assignee}`);
					if (person.data.isApproved !== true) throw new Error('Choose an approved person.');
				}
				if (
					values.dueDate &&
					new Date(values.dueDate).toISOString().slice(0, 10) !== values.dueDate
				)
					throw new Error('Invalid due date.');
				const hash = await crypto.subtle.digest(
					'SHA-256',
					new TextEncoder().encode(
						JSON.stringify([uid, projectId, turnId, { ...values, assignee }])
					)
				);
				const id =
					'agent-' +
					Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
				if (writes >= 5)
					throw new Error('Only five tasks can be created in one turn. Ask the user to continue.');
				writes++;
				try {
					await store.createTask(id, {
						...values,
						assignee,
						id,
						projectId,
						projectSlug: String(project.data.slug),
						nodeType: String(node.data.templateType || 'blank'),
						sourceType: 'project',
						status: 'active',
						createdAt: new Date().toISOString(),
						createdBy: uid,
						createdByAssistant: true
					});
				} catch (cause) {
					writes--;
					throw cause;
				}

				return {
					id,
					title: values.title,
					nodeId: node.id,
					href: `/project/${encodeURIComponent(String(project.data.slug))}?node=${encodeURIComponent(node.id)}`,
					status: 'created'
				};
			}
		})
	};
}
