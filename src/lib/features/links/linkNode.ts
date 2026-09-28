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
