import type { TemplateField } from '../../templates.ts';

const legacyTypes = new Set(['paper', 'code', 'iframe']);

export function canonicalNodeType(type: string): string {
	return legacyTypes.has(type) ? 'link' : type;
}

/** Only web addresses are usable as navigation and embedded content. */
export function normalizeLinkUrl(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) return '';
	const input = value.trim();
	if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input)) return '';
	try {
		const url = new URL(
			input.startsWith('//')
				? `https:${input}`
				: /^https?:\/\//i.test(input)
					? input
					: `https://${input}`
		);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
		if (!url.hostname.includes('.') && url.hostname !== 'localhost') return '';
		return url.href;
	} catch {
		return '';
	}
}

/** Detection is derived from the current URL, never stored or fetched by the UI. */
export function describeLink(value: unknown) {
	const url = normalizeLinkUrl(value);
	if (!url) return { url: '', hostname: '', kind: 'link', label: 'Link' };
	const { hostname, pathname } = new URL(url);
	const host = hostname.replace(/^www\./, '');
	const matches = (...domains: string[]) =>
		domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
	let kind = 'website';
	let label = 'Website';
	if (matches('github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'deepnote.com')) {
		kind = 'code';
		label = 'Code';
	} else if (
		matches(
			'arxiv.org',
			'doi.org',
			'openreview.net',
			'overleaf.com',
			'pubmed.ncbi.nlm.nih.gov',
			'acm.org',
			'ieee.org'
		)
	) {
		kind = 'paper';
		label = 'Paper';
	} else if (/\.pdf$/i.test(pathname)) {
		kind = 'document';
		label = 'PDF';
	} else if (matches('docs.google.com')) {
		kind = 'document';
		label = pathname.startsWith('/spreadsheets/')
			? 'Spreadsheet'
			: pathname.startsWith('/presentation/')
				? 'Slides'
				: 'Document';
	} else if (matches('notion.so', 'notion.site')) {
		kind = 'document';
		label = 'Document';
	} else if (matches('youtube.com', 'youtu.be', 'vimeo.com')) {
		kind = 'video';
		label = 'Video';
	} else if (matches('figma.com')) {
		kind = 'design';
		label = 'Design';
	}
	return { url, hostname: host, kind, label };
}

/** Compatibility at the data boundary: keep every legacy field and secondary URL. */
export function normalizeLinkNode(type: string, data: Record<string, unknown>) {
	if (canonicalNodeType(type) !== 'link') return { templateType: type, nodeData: data };
	const customFields = Array.isArray(data.customFields)
		? (data.customFields as TemplateField[]).filter(
				(field) => !['url', 'title', 'description', 'status', 'viewMode'].includes(field.id)
			)
		: [];
	const legacyUrls = [
		'github',
		'deepnote',
		'arxiv',
		'overleaf',
		'publisher',
		'website',
		'google_docs',
		'google_sheets',
		'google_slides',
		'google_drive',
		'dropbox'
	];
	for (const id of legacyUrls) {
		if (data[id] && !customFields.some((field) => field.id === id)) {
			customFields.push({ id, label: id.replaceAll('_', ' '), type: 'link' });
		}
	}
	if (data.publicationStatus && !customFields.some((field) => field.id === 'publicationStatus')) {
		customFields.push({
			id: 'publicationStatus',
			label: 'Publication status',
			type: 'status',
			options: ['Draft', 'Under Review', 'Accepted', 'Published']
		});
	}
	const inferredUrl = [
		...legacyUrls,
		...customFields.filter((field) => field.type === 'link').map((field) => field.id)
	]
		.map((id) => data[id])
		.find((value) => normalizeLinkUrl(value));
	return {
		templateType: 'link',
		nodeData: {
			...data,
			// An explicitly cleared URL must stay cleared on subsequent reads.
			url: typeof data.url === 'string' ? data.url : (inferredUrl ?? ''),
			viewMode:
				data.viewMode === 'Iframe' || data.viewMode === 'Node'
					? data.viewMode
					: type === 'iframe'
						? 'Iframe'
						: 'Node',
			customFields
		}
	};
}
