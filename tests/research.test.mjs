import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listResearch, isResearchUserApproved } from '../src/lib/server/research.ts';
import { filterResearch } from '../src/lib/features/research/filterResearch.ts';
import { verifyEmulatorIdToken } from '../src/lib/server/emulatorAuth.ts';
import { ResearchService } from '../src/lib/services/ResearchService.ts';

const config = {
	apiUrl: 'https://grist.test/api/',
	apiKey: 'test-secret',
	docId: 'research',
	tableId: 'Table1'
};

test('Grist records expose only research fields, safe links, and ISO saved dates', async () => {
	const papers = await listResearch(config, async (url, options) => {
		assert.equal(url, 'https://grist.test/api/docs/research/tables/Table1/records');
		assert.equal(options.headers.Authorization, 'Bearer test-secret');
		assert.equal(options.redirect, 'manual');
		return Response.json({
			records: [
				{
					id: 1,
					fields: {
						Title: ' Paper ',
						URL: 'https://arxiv.org/abs/123',
						Authors: 'Ada',
						Summary: 'Finding',
						ProcessedAt: 0,
						PrivateColumn: 'private',
						DriveLink: 'javascript:alert(1)'
					}
				},
				{
					id: 2,
					fields: {
						Title: ['L', 'unexpected'],
						URL: 'javascript:alert(1)',
						ProcessedAt: 'invalid',
						DriveLink: 'https://user:password@example.com'
					}
				},
				{ id: 3, fields: { URL: 'https://example.com', ProcessedAt: null } }
			]
		});
	});
	assert.equal(papers[0].title, 'Paper');
	assert.equal(papers[0].savedAt, '1970-01-01T00:00:00.000Z');
	assert.equal(papers[0].driveUrl, '');
	assert.equal(papers[1].url, '');
	assert.equal(papers[1].driveUrl, '');
	assert.equal(papers[1].title, 'Untitled paper');
	assert.equal(papers[1].savedAt, null);
	assert.equal(papers[2].savedAt, null);
	assert.ok(!JSON.stringify(papers).includes('private'));
});

test('upstream errors cannot leak response bodies and invalid data is rejected', async () => {
	await assert.rejects(
		listResearch(config, async () => new Response('secret upstream details', { status: 403 })),
		{ message: 'Research source returned HTTP 403' }
	);
	await assert.rejects(
		listResearch(config, async () => Response.json({ wrong: [] })),
		/Invalid research response/
	);
});

test('malformed rows do not hide the valid research records', async () => {
	const papers = await listResearch(config, async () =>
		Response.json({
			records: [
				null,
				'invalid',
				{ id: 'wrong', fields: {} },
				{ id: 1, fields: null },
				{ id: 2, fields: [] },
				{ id: -1, fields: {} },
				{ id: 3, fields: { Title: 'Valid paper' } }
			]
		})
	);
	assert.deepEqual(
		papers.map((p) => p.title),
		['Valid paper']
	);
	await assert.rejects(
		listResearch(config, async () => Response.json(null)),
		/Invalid research response/
	);
	await assert.rejects(listResearch(config, async () => new Response('not json')));
});

test('approval requires the authenticated user record and fails closed', async () => {
	const request = async (url, options) => {
		assert.match(url, /\/users\/user-id$/);
		assert.equal(options.headers.Authorization, 'Bearer user-token');
		return Response.json({ fields: { isApproved: { booleanValue: true } } });
	};
	assert.equal(
		await isResearchUserApproved('borg', 'user-id', 'Bearer user-token', false, request),
		true
	);
	for (const data of [
		{},
		{ fields: { isApproved: { stringValue: 'true' } } },
		{ fields: { isApproved: { booleanValue: false } } }
	]) {
		assert.equal(
			await isResearchUserApproved('borg', 'uid', 'Bearer token', false, async () =>
				Response.json(data)
			),
			false
		);
	}
	for (const status of [401, 403, 404]) {
		assert.equal(
			await isResearchUserApproved(
				'borg',
				'uid',
				'Bearer token',
				false,
				async () => new Response(null, { status })
			),
			false
		);
	}
	await assert.rejects(
		isResearchUserApproved(
			'borg',
			'uid',
			'Bearer token',
			false,
			async () => new Response(null, { status: 500 })
		),
		/Unable to check/
	);
});

test('research search combines text and source filters without mutating data', () => {
	const papers = [
		{
			id: 1,
			title: 'Beta',
			authors: 'Ada',
			summary: 'AI learning',
			url: 'https://arxiv.org/abs/1',
			savedAt: '2026-08-01T00:00:00Z'
		},
		{
			id: 2,
			title: 'Alpha',
			authors: 'Bob',
			summary: 'Memory',
			sharedBy: 'Ada',
			url: 'https://www.nature.com/paper',
			savedAt: '2026-09-01T00:00:00Z'
		},
		{
			id: 3,
			title: 'Gamma',
			authors: 'Ada',
			summary: 'AI learning',
			url: 'https://arxiv.org/abs/3',
			savedAt: null
		}
	];
	assert.deepEqual(
		filterResearch(papers, '  ADA ai ', 'arxiv.org', 'newest').map((p) => p.id),
		[1, 3]
	);
	assert.deepEqual(
		filterResearch(papers, 'ada', 'nature.com', 'title').map((p) => p.id),
		[2]
	);
	assert.deepEqual(
		filterResearch(papers, '', '', 'newest').map((p) => p.id),
		[2, 1, 3]
	);
	assert.deepEqual(
		filterResearch(papers, '', '', 'oldest').map((p) => p.id),
		[1, 2, 3]
	);
	assert.deepEqual(
		papers.map((p) => p.id),
		[1, 2, 3]
	);
	assert.equal(filterResearch(papers, 'nonexistent', '', 'newest').length, 0);
});

test('emulator authentication rejects production audiences, expiry and missing accounts', async () => {
	const token = (changes = {}) =>
		`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ aud: 'demo-borg', iss: 'https://securetoken.google.com/demo-borg', sub: 'user', exp: Date.now() / 1000 + 600, ...changes })).toString('base64url')}.`;
	let calls = 0;
	const request = async () => {
		calls++;
		return Response.json({ users: [{ localId: 'user', email: 'test@example.test' }] });
	};
	await assert.rejects(verifyEmulatorIdToken(token(), 'production-borg', request));
	await assert.rejects(verifyEmulatorIdToken(token({ exp: 0 }), 'demo-borg', request));
	assert.equal(calls, 0);
	assert.deepEqual(await verifyEmulatorIdToken(token(), 'demo-borg', request), {
		uid: 'user',
		email: 'test@example.test'
	});
	await assert.rejects(
		verifyEmulatorIdToken(token(), 'demo-borg', async () =>
			Response.json({ users: [{ localId: 'other' }] })
		)
	);
	await assert.rejects(
		verifyEmulatorIdToken(token(), 'demo-borg', async () =>
			Response.json({ users: [{ localId: 'user', disabled: true }] })
		)
	);
});

test('client research service requires a session and sends only its user token', async (t) => {
	await assert.rejects(new ResearchService(() => ({ user: null })).listPapers(), /Sign in/);
	const service = new ResearchService(() => ({ user: { getIdToken: async () => 'user-token' } }));
	t.mock.method(globalThis, 'fetch', async (url, options) => {
		assert.equal(url, '/api/research');
		assert.equal(options.headers.Authorization, 'Bearer user-token');
		return Response.json({ papers: [{ id: 1 }] });
	});
	assert.deepEqual(await service.listPapers(), [{ id: 1 }]);
	t.mock.method(
		globalThis,
		'fetch',
		async () => new Response('secret upstream error', { status: 502 })
	);
	await assert.rejects(service.listPapers(), {
		message: 'Research is unavailable right now. Please try again.'
	});
});
