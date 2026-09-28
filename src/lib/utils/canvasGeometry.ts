export const MIN_CANVAS_ZOOM = 0.3;
export const MAX_CANVAS_ZOOM = 2;

export interface CanvasPosition {
	x: number;
	y: number;
}

export interface CanvasViewport extends CanvasPosition {
	zoom: number;
}

/** Firestore supports NaN/Infinity, so checking typeof number alone is insufficient. */
export function isFinitePosition(value: unknown): value is CanvasPosition {
	if (!value || typeof value !== 'object') return false;
	const position = value as Record<string, unknown>;
	return Number.isFinite(position.x) && Number.isFinite(position.y);
}

/** Reject broken saved views and constrain valid zoom values to the canvas limits. */
export function readCanvasViewport(value: unknown): CanvasViewport | null {
	if (!isFinitePosition(value)) return null;
	const zoom = (value as Partial<CanvasViewport>).zoom;
	if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0) return null;
	return {
		x: value.x,
		y: value.y,
		zoom: Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom))
	};
}
