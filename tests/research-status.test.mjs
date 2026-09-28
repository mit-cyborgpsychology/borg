import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getResearchStatus } from '../src/lib/server/researchStatus.ts';

const env = {
	GRIST_API_URL: 'https://grist.test/api',
	GRIST_API_KEY: 'grist-secret',
	GRIST_RESEARCH_DOC_ID: 'doc',
	RESEARCH_MAP_URL: 'https://backend.test/research-map',
	RESEARCH_MAP_TOKEN: 'map-secret',
	RESEARCH_INGEST_URL: 'https://backend.test/research-submit',
	RESEARCH_INGEST_TOKEN: 'queue-secret'
};
test('monitor isolates failed services, authenticates queue owner, and omits private upstream fields', async () => {
	const result = await getResearchStatus(env, 'verified-user', async (url, options) => {
		assert.equal(options.redirect, 'manual');
		if (String(url).includes('grist.test')) return Response.json({ records: [] });
		if (String(url).endsWith('/health'))
			return Response.json({
				borg: {
					jobs: [
						{ label: 'com.borg.server', running: true },
						{ label: 'com.borg.whatsapp', running: false }
					]
				},
				chroma: { ok: true },
				private: 'hidden'
			});
		if (String(url).endsWith('/research-map')) throw new Error('map-secret');
		assert.equal(options.headers.Authorization, 'Bearer queue-secret');
		assert.deepEqual(JSON.parse(options.body), { action: 'monitor', owner: 'verified-user' });
		return Response.json({
			queued: 1,
			processing: 0,
			submissions: [
				{
					id: 'a'.repeat(64),
					url: 'https://example.test',
					status: 'queued',
					updatedAt: new Date().toISOString(),
					owner: 'private',
					credential: 'secret'
				}
			]
		});
	});
	assert.equal(result.checks.find((c) => c.id === 'map').status, 'error');
	assert.equal(result.checks.find((c) => c.id === 'whatsapp').status, 'error');
	assert.equal(result.checks.find((c) => c.id === 'chroma').status, 'ok');
	assert.equal(result.checks.find((c) => c.id === 'queue').status, 'ok');
	assert.equal(result.submissions.length, 1);
	assert.ok(!JSON.stringify(result).includes('secret'));
	assert.ok(!JSON.stringify(result).includes('private'));
});
test('missing configuration never makes a request and is distinct from an outage', async () => {
	const result = await getResearchStatus({}, 'user', () => {
		throw new Error('Should not request');
	});
	assert.equal(result.checks.length, 6);
	assert.ok(result.checks.every((c) => c.status === 'unconfigured'));
});
test('redirects and invalid health payloads fail closed without hiding other checks', async () => {
	const result = await getResearchStatus(
		env,
		'user',
		async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.test' } })
	);
	assert.ok(result.checks.every((c) => c.status === 'error'));
	assert.deepEqual(result.submissions, []);
});
