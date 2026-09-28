import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPaperSubmissionHandler } from '../deploy/paper-submit/handler.mjs';
import {
	publicUrl,
	isPublicAddress,
	publicLookup,
	fetchPublic
} from '../deploy/paper-submit/public-fetch.mjs';
import { requestPaperSubmission } from '../src/lib/server/paperSubmission.ts';

async function fixture(t, processPaper, seed) {
	const directory = await mkdtemp(path.join(tmpdir(), 'borg-paper-submit-'));
	if (seed) await writeFile(path.join(directory, seed.id + '.json'), JSON.stringify(seed));
	const handler = createPaperSubmissionHandler(processPaper, {
		directory,
		readToken: () => 'test-secret'
	});
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(async () => {
		await new Promise((resolve) => server.close(resolve));
		await rm(directory, { recursive: true, force: true });
	});
	return async (input, token = 'test-secret') =>
		fetch(`http://127.0.0.1:${server.address().port}`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(input)
		});
}
async function completed(request, owner, id) {
	for (let i = 0; i < 100; i++) {
		const response = await request({ action: 'status', owner, id });
		const job = await response.json();
		if (!['queued', 'processing'].includes(job.status)) return job;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('Submission did not complete');
}
test('web fetch rejects private networks, credentials, unsafe schemes and mapped IPv4', async () => {
	for (const url of [
		'file:///etc/passwd',
		'http://127.1',
		'http://2130706433',
		'http://[::1]',
		'http://[::ffff:127.0.0.1]',
		'https://user:pass@example.com',
		'http://example.com:4100',
		'http://localhost'
	])
		assert.throws(() => publicUrl(url), url);
	for (const ip of [
		'10.0.0.1',
		'172.16.0.1',
		'192.168.1.1',
		'169.254.169.254',
		'fc00::1',
		'64:ff9b::7f00:1',
		'64:ff9b:1::1',
		'fe80::1'
	])
		assert.equal(isPublicAddress(ip), false);
	assert.equal(isPublicAddress('8.8.8.8'), true);
	assert.equal(publicUrl(' https://arxiv.org/abs/123#section '), 'https://arxiv.org/abs/123');
	await assert.rejects(fetchPublic('http://127.0.0.1:8000'));
	await assert.rejects(
		new Promise((resolve, reject) =>
			publicLookup('localhost', {}, (error) => (error ? reject(error) : resolve()))
		)
	);
});
test('submission authenticates, deduplicates concurrent requests, and isolates owner status', async (t) => {
	let release;
	const wait = new Promise((resolve) => (release = resolve));
	let calls = 0;
	const request = await fixture(t, async (url, ctx) => {
		calls++;
		assert.equal(ctx.source, 'web');
		assert.equal(ctx.chatJid, undefined);
		await wait;
		return { status: 'saved', title: 'Paper', message: 'Paper saved.' };
	});
	assert.equal(
		(await request({ owner: 'a', url: 'https://example.com/paper' }, 'wrong')).status,
		401
	);
	assert.equal((await request({ owner: 'a', url: 'http://127.0.0.1' })).status, 400);
	const [a, b] = await Promise.all([
		request({ owner: 'a', url: 'https://example.com/paper' }),
		request({ owner: 'a', url: 'https://example.com/paper' })
	]);
	const first = await a.json();
	assert.equal((await b.json()).id, first.id);
	assert.equal((await request({ action: 'status', owner: 'b', id: first.id })).status, 404);
	release();
	const done = await completed(request, 'a', first.id);
	assert.equal(done.status, 'saved');
	assert.equal(calls, 1);
	assert.ok(!('owner' in done));
});
test('unfinished jobs resume after restart, and non-paper links stay rejected', async (t) => {
	const seed = {
		id: 'a'.repeat(64),
		owner: 'a',
		url: 'https://example.com/paper',
		status: 'processing',
		sharedBy: 'A'
	};
	const request = await fixture(
		t,
		async () => ({ status: 'not_paper', message: 'Not a paper.' }),
		seed
	);
	assert.equal((await completed(request, 'a', seed.id)).status, 'not_paper');
});
test('ingestion exceptions become failed status without leaking provider details', async (t) => {
	const request = await fixture(t, async () => {
		throw new Error('private credential');
	});
	const job = await (await request({ owner: 'a', url: 'https://example.com/paper' })).json();
	const done = await completed(request, 'a', job.id);
	assert.equal(done.status, 'failed');
	assert.ok(!done.message.includes('credential'));
});
test('UI proxy forwards server identity and keeps credentials and private job fields off the response', async () => {
	const result = await requestPaperSubmission(
		'https://ingest.test',
		'secret',
		{ owner: 'verified-user', url: 'https://example.com/paper' },
		async (url, options) => {
			assert.equal(options.headers.Authorization, 'Bearer secret');
			assert.equal(options.redirect, 'manual');
			assert.equal(JSON.parse(options.body).owner, 'verified-user');
			return Response.json({
				id: 'a'.repeat(64),
				url: 'https://example.com/paper',
				status: 'saved',
				message: 'Saved',
				title: 'Paper',
				owner: 'private',
				updatedAt: '2026-09-28T00:00:00Z'
			});
		}
	);
	assert.equal(result.status, 'saved');
	assert.ok(!('owner' in result));
	await assert.rejects(
		requestPaperSubmission(
			'https://ingest.test',
			'secret',
			{ owner: 'a' },
			async () => new Response('private secret', { status: 500 })
		),
		/submissions are unavailable/
	);
});

test('a stale status request cannot replace a newer submission', async () => {
	const { createResearchState } = await import(
		'../src/lib/features/research/createResearchState.ts'
	);
	const { get } = await import('svelte/store');
	let release;
	const oldStatus = new Promise((resolve) => (release = resolve));
	const requested = [];
	const job = (id, status = 'queued') => ({
		id,
		url: 'https://example.com/' + id,
		status,
		message: 'Queued',
		title: '',
		updatedAt: ''
	});
	const state = createResearchState({
		listPapers: async () => [],
		getMap: async () => null,
		submitPaper: async (url) => job(url),
		getSubmission: async (id) => {
			requested.push(id);
			return id === 'old' ? oldStatus : job(id);
		}
	});
	await state.submitPaper('old');
	const checking = state.checkSubmission();
	await state.submitPaper('new');
	release(job('old', 'saved'));
	await checking;
	assert.equal(get(state.submission).data.id, 'new');
	await state.checkSubmission();
	assert.deepEqual(requested, ['old', 'new']);
	state.dispose();
});

test('monitor requires authentication and returns only the verified owner history', async (t) => {
	const request = await fixture(t, async () => ({ status: 'saved', message: 'Saved.' }));
	const a = await (await request({ owner: 'a', url: 'https://example.com/a' })).json();
	await completed(request, 'a', a.id);
	const b = await (await request({ owner: 'b', url: 'https://example.com/b' })).json();
	await completed(request, 'b', b.id);
	assert.equal((await request({ owner: 'a', action: 'monitor' }, 'wrong')).status, 401);
	const response = await request({ owner: 'a', action: 'monitor' });
	assert.equal(response.status, 200);
	const data = await response.json();
	assert.deepEqual(
		data.submissions.map((j) => j.id),
		[a.id]
	);
	assert.equal(data.queued, 0);
	assert.equal(data.processing, 0);
	assert.ok(!JSON.stringify(data).includes('"owner"'));
	assert.equal((await request({ action: 'monitor' })).status, 400);
});
