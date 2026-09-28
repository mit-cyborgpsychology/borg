import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp } from 'firebase/firestore';
import { readUserDocument } from '../src/lib/services/firebase/userDocument.ts';

const iso = '2026-09-27T12:30:00.000Z';
for (const [name, value] of [
	['Firestore Timestamp', Timestamp.fromDate(new Date(iso))],
	['Date', new Date(iso)],
	['ISO string', iso],
	['serialized timestamp', { seconds: Date.parse(iso) / 1000, nanoseconds: 0 }]
]) {
	test(`user dates normalize ${name} before reaching feature state`, () => {
		const user = readUserDocument('alice', {
			id: 'stored-id',
			name: 'Alice',
			createdAt: value,
			lastLoginAt: value
		});
		assert.equal(user.createdAt, iso);
		assert.equal(user.lastLoginAt, iso);
		assert.equal(user.id, 'alice');
		assert.equal(user.name, 'Alice');
	});
}

test('legacy users missing date fields still expose serializable dates', () => {
	const user = readUserDocument('legacy', {});
	assert.equal(typeof user.createdAt, 'string');
	assert.ok(Number.isFinite(Date.parse(user.createdAt)));
	assert.ok(Number.isFinite(Date.parse(user.lastLoginAt)));
});
