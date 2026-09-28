import type { Node } from '@xyflow/svelte';
import type { Project } from '../../types/project';

/** Position markers are storage records, never independently renderable cards. */
export function buildProjectCanvasNodes(
	projects: readonly Project[],
	canvasNodes: readonly Node[],
	previous: readonly Node[]
): Node[] {
	const saved = new Map(canvasNodes.map((node) => [node.id, node]));
	const existing = new Map(previous.map((node) => [node.id, node]));
	const cards = new Map<string, Node>();
	projects
		.filter((project) => project.id !== 'project-canvas')
		.forEach((project, index) => {
			const id = `project-${project.id}`;
			const old = existing.get(id);
			cards.set(id, {
				id,
				type: 'projectCanvas',
				position: (old?.dragging ? old.position : saved.get(id)?.position) ??
					old?.position ?? {
						x: 150 + (index % 4) * 280,
						y: 150 + Math.floor(index / 4) * 220
					},
				data: {
					templateType: 'project',
					nodeData: {
						title: project.title,
						status: project.status,
						collaborators: project.collaborators || [],
						website: (project as Project & { website?: string }).website || '',
						projectId: project.id,
						projectSlug: project.slug
					}
				},
				draggable: true
			});
		});
	// Preserve the visual stacking order of cards already on screen.
	const ordered: Node[] = [];
	for (const node of previous) {
		const card = cards.get(node.id);
		if (card) {
			ordered.push(card);
			cards.delete(node.id);
		}
	}
	ordered.push(...cards.values());
	const content = canvasNodes.filter((node) => !node.id.startsWith('project-'));
	const updatedAt = (node: Node) =>
		(node as Node & { updatedAt?: { toMillis?: () => number } }).updatedAt?.toMillis?.() ?? 0;
	content.sort((a, b) => updatedAt(a) - updatedAt(b));
	return [...ordered, ...content];
}
