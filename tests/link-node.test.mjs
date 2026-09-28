import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	describeLink,
	getLinkTitle,
	getVisibleSecondaryLinks,
	LINK_NODE_SCHEMA_VERSION,
	normalizeLinkNode,
	normalizeLinkUrl
} from '../src/lib/features/links/linkNode.ts';
import { getTemplate, nodeTemplates } from '../src/lib/templates.ts';
import { createNodeService } from '../src/lib/services/NodeService.ts';
import { updateMatchingNodes } from '../src/lib/utils/canvasSearch.ts';
import { buildNodeUpdate } from '../src/lib/services/firebase/nodeUpdates.ts';

test('link detection uses the hostname and path, not substrings in arbitrary URLs', () => {
	for (const [url, label] of [
		['github.com/org/repo', 'Code'],
		['https://arxiv.org/abs/1234.5678', 'Paper'],
		['https://doi.org/10.123/a', 'Paper'],
		['https://example.org/paper.PDF?download=1', 'PDF'],
		['https://docs.google.com/spreadsheets/d/123/edit', 'Spreadsheet'],
		['https://docs.google.com/presentation/d/123/edit', 'Slides'],
		['https://docs.google.com/document/d/123/edit', 'Document'],
		['https://youtu.be/123', 'Video'],
		['https://figma.com/design/123', 'Design'],
		['https://github.com.example.org/?url=arxiv.org', 'Website']
	])
		assert.equal(describeLink(url).label, label);
});

test('navigation and iframe URLs accept web addresses and reject unsafe or invalid input', () => {
	assert.equal(normalizeLinkUrl(' example.com/test '), 'https://example.com/test');
	assert.equal(normalizeLinkUrl('//example.com/test'), 'https://example.com/test');
	for (const url of [
		'',
		'not a URL',
		'javascript:alert(1)',
		'data:text/html,test',
		'file:///tmp/a',
		'https://user:password@example.com'
	]) {
		assert.equal(normalizeLinkUrl(url), '');
	}
});

test('service names and icons are derived from the URL with specific paths taking priority', () => {
	for (const [url, providerId, providerName] of [
		['github.com/example/repo', 'github', 'GitHub'],
		['https://huggingface.co/org/model', 'huggingface', 'Hugging Face'],
		['https://miro.com/app/board/123', 'miro', 'Miro'],
		['https://colab.research.google.com/drive/123', 'googlecolab', 'Google Colab'],
		['https://zenodo.org/records/123', 'zenodo', 'Zenodo'],
		['https://observablehq.com/@user/notebook', 'observable', 'Observable'],
		['https://www.figma.com/design/123/Test', 'figma', 'Figma'],
		['https://www.figma.com/deck/123/Test', 'figma', 'Figma Slides'],
		['https://docs.google.com/spreadsheets/d/123', 'sheets', 'Google Sheets'],
		['https://docs.google.com/presentation/d/123', 'slides', 'Google Slides'],
		['https://docs.google.com/document/d/123', 'docs', 'Google Docs'],
		['https://arxiv.org/abs/1234.5678', 'arxiv', 'arXiv'],
		['https://example.com/?url=https://figma.com', '', 'example.com'],
		['https://figma.com.example.org/design/123', '', 'figma.com.example.org']
	]) {
		const link = describeLink(url);
		assert.equal(link.providerId, providerId);
		assert.equal(link.providerName, providerName);
	}
	assert.equal(describeLink('').providerName, '');
});

test('automatic titles follow the link while user titles are preserved and detection is searchable', () => {
	const data = { url: 'https://figma.com/deck/123', title: '' };
	assert.equal(getLinkTitle(data), 'Figma Slides');
	assert.equal(data.title, '', 'the fallback is derived, not written over the user title');
	assert.equal(getLinkTitle({ ...data, title: 'Project overview' }), 'Project overview');
	assert.equal(getLinkTitle({ url: '' }), 'Link');
	const state = { query: '', matchingNodeIds: [], currentMatchIndex: 0 };
	updateMatchingNodes(
		'Figma Slides',
		[{ id: 'link', data: { templateType: 'link', nodeData: data } }],
		state,
		() => {}
	);
	assert.deepEqual(state.matchingNodeIds, ['link']);
});

test('legacy papers and code retain metadata, secondary links, and custom fields', () => {
	const original = {
		title: 'Research',
		arxiv: 'https://arxiv.org/abs/123',
		overleaf: 'https://overleaf.com/project/456',
		publicationStatus: 'Published',
		status: 'Done',
		locked: true,
		customFields: [{ id: 'notes', label: 'Notes', type: 'textarea' }],
		notes: 'Keep this'
	};
	const result = normalizeLinkNode('paper', original);
	assert.equal(result.templateType, 'link');
	assert.equal(result.nodeData.url, original.arxiv);
	assert.equal(result.nodeData.viewMode, 'Node');
	assert.equal(result.nodeData.overleaf, original.overleaf);
	assert.equal(result.nodeData.publicationStatus, 'Published');
	assert.equal(result.nodeData.notes, 'Keep this');
	assert.equal(result.nodeData.locked, true);
	assert.ok(result.nodeData.customFields.some((field) => field.id === 'publicationStatus'));
	assert.equal(original.customFields.length, 1, 'does not mutate the saved record');
	assert.deepEqual(
		normalizeLinkNode('link', result.nodeData),
		result,
		'normalization is idempotent'
	);
	assert.equal(
		normalizeLinkNode('code', { github: 'https://github.com/org/repo' }).nodeData.url,
		'https://github.com/org/repo'
	);
});

test('legacy iframes keep their view and dimensions and cleared URLs stay cleared', () => {
	const result = normalizeLinkNode('iframe', { url: 'example.com', width: 600, height: 450 });
	assert.equal(result.nodeData.viewMode, 'Iframe');
	assert.equal(result.nodeData.width, 600);
	assert.equal(result.nodeData.height, 450);
	assert.equal(
		normalizeLinkNode('iframe', { ...result.nodeData, viewMode: 'Node' }).nodeData.viewMode,
		'Node'
	);
	assert.equal(
		normalizeLinkNode('link', { url: '', github: 'https://github.com/org/repo' }).nodeData.url,
		''
	);
	const data = { title: 'An ordinary note' };
	assert.equal(normalizeLinkNode('note', data).nodeData, data);
});

test('old URL fields become one primary and distinct extra links without stale aliases', () => {
	const original = {
		title: 'Research',
		url: 'https://arxiv.org/abs/123',
		arxiv: 'arxiv.org/abs/123',
		overleaf: 'overleaf.com/project/456',
		repeated: 'https://overleaf.com/project/456',
		notes: 'Keep this',
		customFields: [
			{ id: 'arxiv', label: 'Paper', type: 'link' },
			{ id: 'overleaf', label: 'Draft', type: 'link' },
			{ id: 'repeated', label: 'Same draft', type: 'link' },
			{ id: 'notes', label: 'Notes', type: 'textarea' }
		]
	};
	const before = structuredClone(original);
	const { nodeData } = normalizeLinkNode('link', original);
	assert.equal(nodeData.linkSchemaVersion, LINK_NODE_SCHEMA_VERSION);
	assert.deepEqual(
		nodeData.customFields.map((field) => field.id),
		['overleaf', 'notes']
	);
	assert.equal(nodeData.overleaf, 'https://overleaf.com/project/456');
	assert.equal(nodeData.arxiv, undefined);
	assert.equal(nodeData.repeated, undefined);
	assert.equal(nodeData.notes, 'Keep this');
	assert.deepEqual(original, before, 'normalization does not mutate the saved snapshot');

	const edited = { ...nodeData, url: 'https://github.com/org/repo' };
	assert.deepEqual(normalizeLinkNode('link', edited).nodeData, edited);
	assert.equal(edited.arxiv, undefined, 'the replaced primary URL cannot reappear');
	const removed = {
		...edited,
		customFields: edited.customFields.filter((field) => field.id !== 'overleaf')
	};
	delete removed.overleaf;
	assert.deepEqual(
		normalizeLinkNode('link', removed).nodeData,
		removed,
		'deleted extras stay deleted'
	);
});

test('promoted custom URLs and legacy extras retain their visibility and other metadata', () => {
	const { nodeData } = normalizeLinkNode('link', {
		title: 'My links',
		first: 'https://example.org/paper.pdf',
		second: 'https://github.com/org/repo',
		status: 'Done',
		locked: true,
		description: 'Keep the description',
		fieldVisibility: { second: false, description: false },
		customFields: [
			{ id: 'first', label: 'Paper', type: 'link', showInDisplay: false },
			{ id: 'second', label: 'Code', type: 'link' },
			{ id: 'title', label: 'Name', type: 'text', showInDisplay: false }
		]
	});
	assert.equal(nodeData.url, 'https://example.org/paper.pdf');
	assert.equal(nodeData.first, undefined);
	assert.deepEqual(nodeData.fieldVisibility, { url: false, title: false, description: false });
	assert.deepEqual(nodeData.customFields, [
		{ id: 'second', label: 'Code', type: 'link', showInDisplay: false }
	]);
	assert.equal(nodeData.title, 'My links');
	assert.equal(nodeData.description, 'Keep the description');
	assert.equal(nodeData.status, 'Done');
	assert.equal(nodeData.locked, true);
});

test('duplicate URLs remain visible if any of their old fields were visible', () => {
	const { nodeData } = normalizeLinkNode('paper', {
		arxiv: 'arxiv.org/abs/123',
		other: 'https://arxiv.org/abs/123',
		fieldVisibility: { arxiv: false },
		customFields: [{ id: 'other', label: 'Paper', type: 'link', showInDisplay: true }]
	});
	assert.equal(nodeData.fieldVisibility.url, true);
	assert.deepEqual(nodeData.customFields, []);
});

test('previously converted nodes retain the hidden state of their primary legacy field', () => {
	const { nodeData } = normalizeLinkNode('link', {
		url: 'https://arxiv.org/abs/123',
		arxiv: 'https://arxiv.org/abs/123',
		fieldVisibility: { arxiv: false }
	});
	assert.equal(nodeData.fieldVisibility.url, false);
	assert.deepEqual(nodeData.customFields, []);
});

test('invalid and empty legacy URLs remain editable, while cleared primary URLs stay cleared', () => {
	const { nodeData } = normalizeLinkNode('link', {
		url: '',
		github: 'https://github.com/org/repo',
		invalid: 'not a URL',
		empty: '',
		customFields: [
			{ id: 'invalid', label: 'Fix this', type: 'link' },
			{ id: 'empty', label: 'Draft', type: 'link' }
		]
	});
	assert.equal(nodeData.url, '');
	assert.equal(nodeData.invalid, 'not a URL');
	assert.equal(nodeData.empty, '');
	assert.equal(nodeData.customFields.length, 3);
	assert.deepEqual(normalizeLinkNode('link', nodeData).nodeData, nodeData);
});

test('migration runs once so later user edits are not reinterpreted on reload', () => {
	const data = {
		url: 'https://example.com',
		linkSchemaVersion: LINK_NODE_SCHEMA_VERSION,
		extra: 'https://example.com',
		customFields: [{ id: 'extra', label: 'Link', type: 'link', showInDisplay: false }]
	};
	assert.equal(normalizeLinkNode('link', data).nodeData, data);
	assert.equal(normalizeLinkNode('link', { ...data, url: '' }).nodeData.extra, data.extra);
});

test('content saves persist the upgraded type, including inline edits without a template type', () => {
	const upgraded = normalizeLinkNode('paper', {
		arxiv: 'https://arxiv.org/abs/123',
		overleaf: 'https://overleaf.com/project/456',
		status: 'Done'
	}).nodeData;
	const update = buildNodeUpdate({ nodeData: { ...upgraded, title: 'Edited title' } });
	assert.equal(update.templateType, 'link');
	assert.equal(update.nodeData.title, 'Edited title');
	assert.equal(update.nodeData.arxiv, undefined);
	assert.equal(update.nodeData.overleaf, upgraded.overleaf);
	assert.equal(update.status, 'Done');
	const legacySave = buildNodeUpdate({
		data: { templateType: 'code', nodeData: { github: 'github.com/org/repo' } }
	});
	assert.equal(legacySave.templateType, 'link');
	assert.equal(legacySave.nodeData.url, 'https://github.com/org/repo');
	assert.equal(legacySave.nodeData.linkSchemaVersion, LINK_NODE_SCHEMA_VERSION);
});

test('secondary links respect visibility and suppress empty, unsafe, and duplicate primary URLs', () => {
	const data = {
		url: 'https://github.com/org/repo',
		github: 'github.com/org/repo',
		paper: 'arxiv.org/abs/1234',
		hidden: 'https://example.com/private',
		empty: '',
		unsafe: 'javascript:alert(1)',
		notes: 'Keep these notes',
		customFields: [
			{ id: 'github', type: 'link', label: 'Repository' },
			{ id: 'paper', type: 'link', label: 'Paper' },
			{ id: 'hidden', type: 'link', label: 'Hidden', showInDisplay: false },
			{ id: 'empty', type: 'link', label: 'Empty' },
			{ id: 'unsafe', type: 'link', label: 'Unsafe' },
			{ id: 'notes', type: 'text', label: 'Notes' }
		]
	};
	assert.deepEqual(
		getVisibleSecondaryLinks(data).map((field) => field.id),
		['paper']
	);
	assert.deepEqual(
		getVisibleSecondaryLinks({ ...data, fieldVisibility: { url: false } }).map((field) => field.id),
		['github', 'paper']
	);
	assert.equal(data.customFields.length, 6, 'all fields remain available for editing');
});

test('creation exposes one Link template and creates canonical nodes with a default view', async () => {
	for (const type of ['paper', 'code', 'iframe']) {
		assert.equal(nodeTemplates[type], undefined);
		assert.equal(getTemplate(type).id, 'link');
	}
	const service = createNodeService(
		{
			createNode: async (type, position, fields) => ({ type, position, fields })
		},
		() => ({}),
		{},
		{}
	);
	for (const type of ['link', 'paper', 'code', 'iframe']) {
		const result = await service.addNode(type, { x: 1, y: 2 });
		assert.equal(result.type, 'link');
		assert.equal(result.fields.viewMode, 'Node');
		assert.equal(result.fields.linkSchemaVersion, LINK_NODE_SCHEMA_VERSION);
	}
});
