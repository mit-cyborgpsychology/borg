import type { ResearchPaper } from '../types/research';

export interface ResearchConfig {
	apiUrl: string;
	apiKey: string;
	docId: string;
	tableId: string;
}

interface GristRecord {
	id: number;
	fields: Record<string, unknown>;
}

function isGristRecord(value: unknown): value is GristRecord {
	if (!value || typeof value !== 'object') return false;
	const { id, fields } = value as Partial<GristRecord>;
	return (
		typeof id === 'number' &&
		Number.isSafeInteger(id) &&
		id > 0 &&
		!!fields &&
		typeof fields === 'object' &&
		!Array.isArray(fields)
	);
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function webUrl(value: unknown): string {
	try {
		const url = new URL(text(value));
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
			? url.href
			: '';
	} catch {
		return '';
	}
}

function savedDate(value: unknown): string | null {
	if (value === null || value === undefined || value === '') return null;
	const date = new Date(typeof value === 'number' ? value * 1000 : text(value));
	return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function listResearch(
	config: ResearchConfig,
	request = fetch
): Promise<ResearchPaper[]> {
	const base = config.apiUrl.replace(/\/+$/, '');
	const response = await request(
		`${base}/docs/${encodeURIComponent(config.docId)}/tables/${encodeURIComponent(config.tableId)}/records`,
		{
			headers: { Authorization: `Bearer ${config.apiKey}` },
			signal: AbortSignal.timeout(20_000),
			// Workers requires manual mode; the status check below rejects redirects.
			redirect: 'manual'
		}
	);
	// Never pass Grist response bodies or credentials through to the browser.
	if (!response.ok) throw new Error(`Research source returned HTTP ${response.status}`);
	const data = (await response.json()) as { records?: unknown[] } | null;
	if (!Array.isArray(data?.records)) throw new Error('Invalid research response');
	return data.records.filter(isGristRecord).map(({ id, fields }) => ({
		id,
		title: text(fields.Title) || 'Untitled paper',
		url: webUrl(fields.URL),
		authors: text(fields.Authors),
		summary: text(fields.Summary),
		sharedBy: text(fields.SharedBy),
		chatName: text(fields.ChatName),
		driveUrl: webUrl(fields.DriveLink),
		savedAt: savedDate(fields.ProcessedAt)
	}));
}

// Read the caller's own approval record using their Firebase token. No
// service-account credential or client-supplied approval flag is needed.
export async function isResearchUserApproved(
	projectId: string,
	uid: string,
	authorization: string,
	emulator: boolean,
	request = fetch
): Promise<boolean> {
	const host = emulator ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
	const response = await request(
		`${host}/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
		{ headers: { Authorization: authorization }, signal: AbortSignal.timeout(10_000) }
	);
	if ([401, 403, 404].includes(response.status)) return false;
	if (!response.ok) throw new Error('Unable to check account approval');
	const data = (await response.json()) as { fields?: { isApproved?: { booleanValue?: boolean } } };
	return data.fields?.isApproved?.booleanValue === true;
}
