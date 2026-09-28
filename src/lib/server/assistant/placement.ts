import type { AssistantRecord } from './store.ts';

type Point = { x: number; y: number };
const gap = 64;
const cellWidth = 384;
const cellHeight = 428;
const finite = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function bounds(node: AssistantRecord) {
	const position = node.data.position as Partial<Point> | undefined;
	const data = node.data.nodeData as Record<string, unknown> | undefined;
	const measured = node.data.measured as Record<string, unknown> | undefined;
	return {
		x: finite(position?.x, 0),
		y: finite(position?.y, 0),
		width: Math.max(1, finite(measured?.width, finite(data?.width, 320))),
		// Leave room for headers and tasks when rendered dimensions aren't persisted.
		height: Math.max(1, finite(measured?.height, finite(data?.height, 300) + 64))
	};
}

// Keep a stable origin for a turn so several calls form one compact group.
export function placementOrigin(nodes: AssistantRecord[], selectedIds: string[]): Point {
	const selected = nodes.filter((node) => selectedIds.includes(node.id)).map(bounds);
	if (selected.length) {
		return {
			x: Math.max(...selected.map((node) => node.x + node.width)) + gap,
			y: Math.min(...selected.map((node) => node.y))
		};
	}
	const existing = nodes.map(bounds);
	return existing.length
		? {
				x: Math.min(...existing.map((node) => node.x)),
				y: Math.max(...existing.map((node) => node.y + node.height)) + gap
			}
		: { x: 0, y: 0 };
}

export function freePosition(nodes: AssistantRecord[], origin: Point): Point {
	const occupied = nodes.map(bounds);
	let y = origin.y;
	for (;;) {
		let nextY = Infinity;
		for (let column = 0; column < 3; column++) {
			const x = origin.x + column * cellWidth;
			const collisions = occupied.filter(
				(node) =>
					x < node.x + node.width + gap &&
					x + cellWidth > node.x &&
					y < node.y + node.height + gap &&
					y + cellHeight > node.y
			);
			if (!collisions.length) return { x, y };
			for (const node of collisions) nextY = Math.min(nextY, node.y + node.height + gap);
		}
		// Jump past obstacles instead of walking through potentially huge resized cards.
		y = Math.max(y + cellHeight, nextY);
	}
}
