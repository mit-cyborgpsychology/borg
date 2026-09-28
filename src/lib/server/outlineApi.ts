// Thin wrapper around Outline's REST API. Used by both the doc-creation route
// and (later) the comment-webhook bridge — one place that talks to Outline.

export class OutlineApiError extends Error {
	status: number;
	endpoint: string;
	constructor(status: number, publicEndpoint = '') {
		super(`Outline request failed (${status}).`);
		this.status = status;
		this.endpoint = publicEndpoint;
	}
}

export interface OutlineConfig {
	apiUrl: string;
	apiToken: string;
}

// Accept OUTLINE_API_URL with or without a trailing "/api" so a stray
// "/api" in the configured env var doesn't silently double up the path.
function apiBase(rawUrl: string): string {
	const trimmed = rawUrl.replace(/\/+$/, '');
	return trimmed.endsWith('/api') ? trimmed.slice(0, -'/api'.length) : trimmed;
}

// Outline's API returns document `url` as a path relative to the Outline
// instance (e.g. "/doc/untitled-abc123"), not an absolute URL. Resolving it
// against Borg's own origin (browser default for a relative window.open)
// sends users to the wrong site entirely, so make it absolute here.
function toAbsoluteUrl(config: OutlineConfig, maybeRelativeUrl: string): string {
	if (/^https?:\/\//i.test(maybeRelativeUrl)) return maybeRelativeUrl;
	return `${apiBase(config.apiUrl)}${maybeRelativeUrl.startsWith('/') ? '' : '/'}${maybeRelativeUrl}`;
}

async function outlineFetch(
	config: OutlineConfig,
	endpoint: string,
	body: Record<string, unknown>
) {
	const res = await fetch(`${apiBase(config.apiUrl)}/api/${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiToken}`
		},
		body: JSON.stringify(body),
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});

	if (!res.ok) {
		throw new OutlineApiError(res.status, endpoint);
	}

	return res.json();
}

export async function createCollection(config: OutlineConfig, name: string, description?: string) {
	const json = await outlineFetch(config, 'collections.create', {
		name,
		description,
		permission: 'read_write',
		sharing: false
	});
	return json.data as { id: string; name: string };
}

export async function getCollection(config: OutlineConfig, id: string) {
	try {
		const json = await outlineFetch(config, 'collections.info', { id });
		return json.data as { id: string; name: string };
	} catch (error) {
		if (error instanceof OutlineApiError && error.status === 404) return null;
		throw error;
	}
}

export async function createDocument(
	config: OutlineConfig,
	params: { id?: string; title: string; collectionId: string; text?: string }
) {
	const json = await outlineFetch(config, 'documents.create', {
		...(params.id ? { id: params.id } : {}),
		title: params.title,
		collectionId: params.collectionId,
		text: params.text ?? '',
		publish: true
	});
	const doc = json.data as { id: string; url: string; title: string };
	return { ...doc, url: toAbsoluteUrl(config, doc.url) };
}

export async function getDocument(config: OutlineConfig, id: string) {
	const json = await outlineFetch(config, 'documents.info', { id });
	const doc = json.data as {
		id: string;
		url: string;
		title: string;
		collectionId?: string;
		updatedAt?: string;
		deletedAt?: string;
		archivedAt?: string;
	};
	return { ...doc, url: toAbsoluteUrl(config, doc.url) };
}

export interface OutlineDocSummary {
	id: string;
	title: string;
	url: string;
	updatedAt: string;
	collectionId: string;
}

function toDocSummary(config: OutlineConfig, doc: OutlineDocSummary): OutlineDocSummary {
	return {
		id: doc.id,
		title: doc.title,
		url: toAbsoluteUrl(config, doc.url),
		updatedAt: doc.updatedAt,
		collectionId: doc.collectionId
	};
}

export async function searchDocuments(config: OutlineConfig, query: string) {
	const json = await outlineFetch(config, 'documents.search', { query });
	const results = json.data as Array<{ document: OutlineDocSummary }>;
	return results.map((r) => toDocSummary(config, r.document));
}

export async function listDocuments(config: OutlineConfig, collectionId: string) {
	const json = await outlineFetch(config, 'documents.list', {
		collectionId,
		sort: 'updatedAt',
		direction: 'DESC'
	});
	const results = json.data as OutlineDocSummary[];
	return results.map((doc) => toDocSummary(config, doc));
}

export async function createComment(
	config: OutlineConfig,
	params: { documentId: string; text: string; parentCommentId?: string }
) {
	const json = await outlineFetch(config, 'comments.create', {
		documentId: params.documentId,
		text: params.text,
		...(params.parentCommentId && { parentCommentId: params.parentCommentId })
	});
	return json.data as { id: string };
}

export async function findProjectCollection(config: OutlineConfig, marker: string) {
	for (let offset = 0; ; offset += 100) {
		const result = await outlineFetch(config, 'collections.list', { limit: 100, offset });
		const rows = result.data as Array<{ id: string; description?: string }>;
		const match = rows.find((row) => row.description?.includes(marker));
		if (match) return match;
		if (rows.length < 100) return null;
	}
}
