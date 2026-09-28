import type { NodeUpdate } from '../../types/canvas';

/** Maps the two existing editor payload shapes to one Firestore update. */
export function buildNodeUpdate(update: NodeUpdate): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	if (update.position) fields.position = update.position;
	if (update.data?.templateType) fields.templateType = update.data.templateType;
	if (update.data?.projectSlug) fields.projectSlug = update.data.projectSlug;
	const nodeData = update.data?.nodeData ?? update.nodeData;
	if (nodeData) {
		fields.nodeData = nodeData;
		// Clearing the nested status must also clear the project summary field.
		fields.status = nodeData.status || null;
	}
	return omitUndefined(fields) as Record<string, unknown>;
}

function omitUndefined(value: unknown): unknown {
	if (value === null || typeof value !== 'object' || value instanceof Date) return value;
	if (Array.isArray(value)) return value.map(omitUndefined);
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.map(([key, entry]) => [key, omitUndefined(entry)])
	);
}
