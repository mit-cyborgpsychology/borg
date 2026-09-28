import { fieldsToObj, type FsValue } from './firestoreAdmin.ts';

export interface OutlineRecord {
	data: Record<string, unknown>;
	version: string;
}
export interface OutlineProjectStore {
	get(path: string): Promise<OutlineRecord>;
	patch(
		path: string,
		values: Record<string, string | number | boolean | null>,
		version?: string
	): Promise<void>;
}
export class OutlineProjectError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}
export function createOutlineProjectStore(
	projectId: string,
	authorization: string,
	emulator = false,
	request = fetch
): OutlineProjectStore {
	const base = `${emulator ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/`;
	const call = async (path: string, options: RequestInit = {}) => {
		const response = await request(
			path === ':commit' ? base.slice(0, -1) + ':commit' : base + path,
			{
				...options,
				headers: { Authorization: authorization, 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(10_000)
			}
		);
		if (!response.ok)
			throw new OutlineProjectError(
				[401, 403, 404, 409, 412].includes(response.status) ? response.status : 503,
				response.status === 403
					? 'You do not have access to this project.'
					: response.status === 404
						? 'Project or note no longer exists.'
						: 'Unable to save the document link. Please retry.'
			);
		return response.json();
	};
	return {
		async get(path) {
			const doc = await call(path);
			return { data: fieldsToObj(doc.fields || {}), version: doc.updateTime };
		},
		async patch(path, values, version) {
			const fields: Record<string, FsValue> = {};
			for (const [key, value] of Object.entries(values)) {
				const parts = key.split('.');
				let target = fields;
				for (const part of parts.slice(0, -1)) {
					target[part] ||= { mapValue: { fields: {} } };
					target = (target[part] as { mapValue: { fields: Record<string, FsValue> } }).mapValue
						.fields;
				}
				target[parts.at(-1)!] =
					value === null
						? { nullValue: null }
						: typeof value === 'boolean'
							? { booleanValue: value }
							: typeof value === 'number'
								? { doubleValue: value }
								: { stringValue: value };
			}
			await call(':commit', {
				method: 'POST',
				body: JSON.stringify({
					writes: [
						{
							update: {
								name: `projects/${projectId}/databases/(default)/documents/${path}`,
								fields
							},
							updateMask: { fieldPaths: Object.keys(values) },
							currentDocument: version ? { updateTime: version } : { exists: true }
						}
					]
				})
			});
		}
	};
}
