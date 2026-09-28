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

type LinkKind = 'link' | 'website' | 'code' | 'paper' | 'document' | 'video' | 'design';

interface LinkProvider {
	id: string;
	name: string;
	hosts: string[];
	kind: LinkKind;
	label: string;
	pathPrefix?: string;
}

// Specific paths precede general hosts. This is the single configuration for
// service detection; components never guess a service from an editable label.
const linkProviders: LinkProvider[] = [
	{
		id: 'sheets',
		name: 'Google Sheets',
		hosts: ['docs.google.com'],
		pathPrefix: '/spreadsheets/',
		kind: 'document',
		label: 'Spreadsheet'
	},
	{
		id: 'slides',
		name: 'Google Slides',
		hosts: ['docs.google.com'],
		pathPrefix: '/presentation/',
		kind: 'document',
		label: 'Slides'
	},
	{
		id: 'docs',
		name: 'Google Docs',
		hosts: ['docs.google.com'],
		kind: 'document',
		label: 'Document'
	},
	{
		id: 'drive',
		name: 'Google Drive',
		hosts: ['drive.google.com'],
		kind: 'document',
		label: 'File'
	},
	{ id: 'github', name: 'GitHub', hosts: ['github.com'], kind: 'code', label: 'Code' },
	{ id: 'gitlab', name: 'GitLab', hosts: ['gitlab.com'], kind: 'code', label: 'Code' },
	{ id: 'bitbucket', name: 'Bitbucket', hosts: ['bitbucket.org'], kind: 'code', label: 'Code' },
	{ id: 'codeberg', name: 'Codeberg', hosts: ['codeberg.org'], kind: 'code', label: 'Code' },
	{ id: 'deepnote', name: 'Deepnote', hosts: ['deepnote.com'], kind: 'code', label: 'Code' },
	{ id: 'arxiv', name: 'arXiv', hosts: ['arxiv.org'], kind: 'paper', label: 'Paper' },
	{ id: 'doi', name: 'DOI', hosts: ['doi.org'], kind: 'paper', label: 'Paper' },
	{
		id: 'openreview',
		name: 'OpenReview',
		hosts: ['openreview.net'],
		kind: 'paper',
		label: 'Paper'
	},
	{ id: 'overleaf', name: 'Overleaf', hosts: ['overleaf.com'], kind: 'paper', label: 'Paper' },
	{
		id: 'pubmed',
		name: 'PubMed',
		hosts: ['pubmed.ncbi.nlm.nih.gov'],
		kind: 'paper',
		label: 'Paper'
	},
	{ id: 'acm', name: 'ACM', hosts: ['acm.org'], kind: 'paper', label: 'Paper' },
	{ id: 'ieee', name: 'IEEE', hosts: ['ieee.org'], kind: 'paper', label: 'Paper' },
	{
		id: 'notion',
		name: 'Notion',
		hosts: ['notion.so', 'notion.site'],
		kind: 'document',
		label: 'Document'
	},
	{
		id: 'qualtrics',
		name: 'Qualtrics',
		hosts: ['qualtrics.com'],
		kind: 'website',
		label: 'Survey'
	},
	{
		id: 'youtube',
		name: 'YouTube',
		hosts: ['youtube.com', 'youtu.be'],
		kind: 'video',
		label: 'Video'
	},
	{ id: 'vimeo', name: 'Vimeo', hosts: ['vimeo.com'], kind: 'video', label: 'Video' },
	{
		id: 'figma',
		name: 'Figma Slides',
		hosts: ['figma.com'],
		pathPrefix: '/deck/',
		kind: 'design',
		label: 'Slides'
	},
	{ id: 'figma', name: 'Figma', hosts: ['figma.com'], kind: 'design', label: 'Design' },
	{ id: 'dropbox', name: 'Dropbox', hosts: ['dropbox.com'], kind: 'document', label: 'File' },
	{ id: 'miro', name: 'Miro', hosts: ['miro.com'], kind: 'design', label: 'Board' },
	{
		id: 'huggingface',
		name: 'Hugging Face',
		hosts: ['huggingface.co', 'hf.co'],
		kind: 'code',
		label: 'Code'
	},
	{ id: 'kaggle', name: 'Kaggle', hosts: ['kaggle.com'], kind: 'code', label: 'Code' },
	{ id: 'zenodo', name: 'Zenodo', hosts: ['zenodo.org'], kind: 'paper', label: 'Research' },
	{ id: 'osf', name: 'OSF', hosts: ['osf.io'], kind: 'paper', label: 'Research' },
	{
		id: 'codesandbox',
		name: 'CodeSandbox',
		hosts: ['codesandbox.io'],
		kind: 'code',
		label: 'Code'
	},
	{ id: 'stackblitz', name: 'StackBlitz', hosts: ['stackblitz.com'], kind: 'code', label: 'Code' },
	{
		id: 'googlecolab',
		name: 'Google Colab',
		hosts: ['colab.research.google.com', 'colab.google'],
		kind: 'code',
		label: 'Notebook'
	},
	{
		id: 'observable',
		name: 'Observable',
		hosts: ['observablehq.com'],
		kind: 'code',
		label: 'Notebook'
	}
];

/** URL-derived metadata updates instantly without changing the user's title. */
export function describeLink(value: unknown) {
	const url = normalizeLinkUrl(value);
	if (!url)
		return {
			url: '',
			hostname: '',
			kind: 'link' as LinkKind,
			label: 'Link',
			providerId: '',
			providerName: ''
		};
	const { hostname, pathname } = new URL(url);
	const host = hostname.replace(/^www\./, '');
	const provider = linkProviders.find(
		(rule) =>
			rule.hosts.some((domain) => host === domain || host.endsWith(`.${domain}`)) &&
			(!rule.pathPrefix || pathname.startsWith(rule.pathPrefix))
	);
	const pdf = /\.pdf$/i.test(pathname);
	return {
		url,
		hostname: host,
		kind: provider?.kind ?? (pdf ? 'document' : 'website'),
		label: provider?.label ?? (pdf ? 'PDF' : 'Website'),
		providerId: provider?.id ?? '',
		providerName: provider?.name ?? host
	};
}

export function getLinkTitle(data: { title?: unknown; url?: unknown }): string {
	return (
		(typeof data.title === 'string' && data.title) || describeLink(data.url).providerName || 'Link'
	);
}

/** One display policy for extra links in cards and embeds; saved fields remain editable. */
export function getVisibleSecondaryLinks(data: Record<string, any>): TemplateField[] {
	const primaryUrl = data.fieldVisibility?.url === false ? '' : normalizeLinkUrl(data.url);
	const fields: TemplateField[] = Array.isArray(data.customFields) ? data.customFields : [];
	return fields.filter(
		(field) =>
			field.type === 'link' &&
			(field.showInDisplay ?? true) &&
			!!normalizeLinkUrl(data[field.id]) &&
			(!primaryUrl || normalizeLinkUrl(data[field.id]) !== primaryUrl)
	);
}

export const LINK_NODE_SCHEMA_VERSION = 1;

const legacyLinkFields = [
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
const linkContentFields = new Set(['url', 'title', 'description', 'status', 'viewMode']);

/** Upgrade old nodes on read; the next content save persists the canonical shape. */
export function normalizeLinkNode(type: string, data: Record<string, unknown>) {
	if (canonicalNodeType(type) !== 'link') return { templateType: type, nodeData: data };
	// Once upgraded, edits (including cleared, repeated, or removed URLs) are intentional.
	if (
		typeof data.linkSchemaVersion === 'number' &&
		data.linkSchemaVersion >= LINK_NODE_SCHEMA_VERSION
	) {
		return { templateType: 'link', nodeData: data };
	}

	const savedFields: TemplateField[] = Array.isArray(data.customFields) ? data.customFields : [];
	const customFields = savedFields
		.filter((field) => !linkContentFields.has(field.id))
		.map((field) => ({ ...field }));
	const visibility = { ...(data.fieldVisibility as Record<string, boolean> | undefined) };
	for (const field of savedFields) {
		if (
			linkContentFields.has(field.id) &&
			visibility[field.id] === undefined &&
			field.showInDisplay !== undefined
		) {
			visibility[field.id] = field.showInDisplay;
		}
	}
	for (const id of legacyLinkFields) {
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

	const candidates = [
		...legacyLinkFields,
		...customFields.filter((field) => field.type === 'link').map((field) => field.id)
	];
	const primaryId = candidates.find((id) => normalizeLinkUrl(data[id]));
	// An explicitly cleared or invalid primary URL stays available for editing.
	const inferPrimary = typeof data.url !== 'string';
	const rawUrl = inferPrimary ? (primaryId ? data[primaryId] : '') : data.url;
	const primaryUrl = normalizeLinkUrl(rawUrl);
	const primaryField = customFields.find(
		(field) =>
			field.type === 'link' && primaryUrl && normalizeLinkUrl(data[field.id]) === primaryUrl
	);
	if (primaryField && visibility.url === undefined) {
		visibility.url = visibility[primaryField.id] ?? primaryField.showInDisplay ?? true;
	}

	const nodeData: Record<string, unknown> = {
		...data,
		url: primaryUrl || rawUrl,
		viewMode:
			data.viewMode === 'Iframe' || data.viewMode === 'Node'
				? data.viewMode
				: type === 'iframe'
					? 'Iframe'
					: 'Node',
		linkSchemaVersion: LINK_NODE_SCHEMA_VERSION
	};
	const fields: TemplateField[] = [];
	const seen = new Map<string, TemplateField>();
	for (const field of customFields) {
		if (field.type !== 'link') {
			fields.push(field);
			continue;
		}
		const visible = visibility[field.id] ?? field.showInDisplay ?? true;
		const url = normalizeLinkUrl(data[field.id]);
		const duplicate = url ? seen.get(url) : undefined;
		if (url && (url === primaryUrl || duplicate)) {
			// A visible copy keeps the URL visible after collapsing duplicate controls.
			if (url === primaryUrl) visibility.url = (visibility.url ?? true) || visible;
			else if (duplicate) duplicate.showInDisplay = (duplicate.showInDisplay ?? true) || visible;
			delete nodeData[field.id];
		} else {
			field.showInDisplay = visible;
			fields.push(field);
			if (url) {
				nodeData[field.id] = url;
				seen.set(url, field);
			}
		}
		// Extra links now store visibility alongside their field definition.
		delete visibility[field.id];
	}
	nodeData.customFields = fields;
	if (data.fieldVisibility || Object.keys(visibility).length) nodeData.fieldVisibility = visibility;
	return { templateType: 'link', nodeData };
}
