import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	describeLink,
	normalizeLinkNode,
	normalizeLinkUrl
} from '../src/lib/features/links/linkNode.ts';
import { getTemplate, nodeTemplates } from '../src/lib/templates.ts';
import { createNodeService } from '../src/lib/services/NodeService.ts';

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
	}
});
