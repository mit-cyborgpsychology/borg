import { fieldsToObj, type FsValue } from '../firestoreAdmin.ts';

export interface AssistantRecord {
	id: string;
	data: Record<string, unknown>;
}
export interface AssistantStore {
	createCanvasRecord(
		projectId: string,
		collection: 'nodes' | 'edges',
		id: string,
		values: Record<string, unknown>
	): Promise<void>;
	get(path: string): Promise<AssistantRecord>;
	list(path: string): Promise<AssistantRecord[]>;
	query(collection: string, field: string, value: string): Promise<AssistantRecord[]>;
	createTask(id: string, values: Record<string, string | boolean>): Promise<void>;
}
export function createAssistantStore(
	database: string,
	authorization: string,
	emulator = false,
	request = fetch
): AssistantStore {
	const base = `${emulator ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'}/v1/projects/${database}/databases/(default)/documents`;
	async function call(path: string, body?: unknown) {
		const response = await request(base + path, {
			method: body ? 'POST' : 'GET',
			headers: { Authorization: authorization, 'Content-Type': 'application/json' },
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(15000),
			redirect: 'manual'
		});
		if (!response.ok)
			throw new Error(
				response.status === 403
					? 'You do not have access to this project or action.'
					: `Unable to access project data (${response.status}).`
			);
		return response.json();
	}
	function record(doc: { name: string; fields?: Record<string, FsValue> }): AssistantRecord {
		return { id: doc.name.split('/').at(-1)!, data: fieldsToObj(doc.fields || {}) };
	}
	return {
		async get(path) {
			return record(await call('/' + path));
		},
		async list(path) {
			const records: AssistantRecord[] = [];
			let token = '';
			do {
				const page = await call(
					'/' + path + '?pageSize=100' + (token ? '&pageToken=' + encodeURIComponent(token) : '')
				);
				records.push(...(page.documents || []).map(record));
				token = page.nextPageToken || '';
				if (token && records.length >= 1000)
					throw new Error('This project is too large for the assistant preview.');
			} while (token);
			return records;
		},
		async query(collection, field, value) {
			const result = await call(':runQuery', {
				structuredQuery: {
					from: [{ collectionId: collection }],
					where: {
						fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } }
					},
					limit: 200
				}
			});
			return result
				.filter((r: { document?: unknown }) => r.document)
				.map((r: { document: { name: string; fields: Record<string, FsValue> } }) =>
					record(r.document)
				);
		},
		async createCanvasRecord(projectId, collection, id, values) {
			function encode(value: unknown): unknown {
				if (value === null) return { nullValue: null };
				if (typeof value === 'number') return { doubleValue: value };
				if (typeof value === 'boolean') return { booleanValue: value };
				if (typeof value === 'string') return { stringValue: value };
				if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
				return {
					mapValue: {
						fields: Object.fromEntries(
							Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)])
						)
					}
				};
			}
			const path = `projects/${projectId}/${collection}/${id}`;
			const fields = Object.fromEntries(
				Object.entries(values).map(([key, value]) => [key, encode(value)])
			);
			const now = new Date().toISOString();
			fields.createdAt = collection === 'nodes' ? { timestampValue: now } : { stringValue: now };
			fields.updatedAt = fields.createdAt;
			const response = await request(base + ':commit', {
				method: 'POST',
				headers: { Authorization: authorization, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					writes: [
						{
							update: {
								name: `projects/${database}/databases/(default)/documents/${path}`,
								fields
							},
							currentDocument: { exists: false }
						}
					]
				}),
				signal: AbortSignal.timeout(15000),
				redirect: 'manual'
			});
			if (response.ok) return;
			if (response.status === 409) {
				const existing = record(await call('/' + path));
				if (
					existing.data.assistantOperation === values.assistantOperation &&
					existing.data.createdBy === values.createdBy
				)
					return;
			}
			throw new Error('Canvas change could not be saved. Check your permissions and retry.');
		},

		async createTask(id, values) {
			const fields = Object.fromEntries(
				Object.entries(values).map(([key, value]) => [
					key,
					typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value }
				])
			);
			const response = await request(base + ':commit', {
				method: 'POST',
				headers: { Authorization: authorization, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					writes: [
						{
							update: {
								name: `projects/${database}/databases/(default)/documents/tasks/${id}`,
								fields
							},
							currentDocument: { exists: false }
						}
					]
				}),
				signal: AbortSignal.timeout(15000),
				redirect: 'manual'
			});
			if (!response.ok) {
				// An identical task from this user turn is already committed: retries are safe.
				if (response.status === 409) {
					const existing = record(await call('/tasks/' + id));
					if (
						Object.entries(values).every(
							([key, value]) => key === 'createdAt' || existing.data[key] === value
						)
					)
						return;
				}
				throw new Error('Task could not be saved. Check your permissions and retry.');
			}
		}
	};
}
