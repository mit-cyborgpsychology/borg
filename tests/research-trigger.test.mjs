import assert from 'node:assert/strict';
import { test } from 'node:test';
import { triggerResearchMap, saveAndTriggerReference } from '../deploy/research-map/trigger.mjs';

test('every saved paper triggers map update with its count, including between tens', async () => {
	const starts = [];
	for (const count of [34, 35, 39, 40, 41, 50]) {
		assert.equal(
			await triggerResearchMap({ count: async () => count }, (n) => starts.push(n)),
			true
		);
	}
	assert.deepEqual(starts, [34, 35, 39, 40, 41, 50]);
	for (const count of [0, -1, NaN, '40'])
		assert.equal(
			await triggerResearchMap({ count: async () => count }, () => assert.fail()),
			false
		);
});
test('concurrent insertions preserve the boundary count and never trigger a failed insert', async () => {
	let count = 38;
	const starts = [];
	const collection = {
		add: async (record) => {
			if (record.fail) throw new Error('failed');
			count++;
		},
		count: async () => count
	};
	await Promise.all([
		saveAndTriggerReference(collection, {}, (n) => starts.push(n)),
		saveAndTriggerReference(collection, {}, (n) => starts.push(n)),
		saveAndTriggerReference(collection, {}, (n) => starts.push(n))
	]);
	assert.deepEqual(starts, [39, 40, 41]);
	await assert.rejects(saveAndTriggerReference(collection, { fail: true }, () => assert.fail()));
	await saveAndTriggerReference(collection, {}, (n) => starts.push(n));
	assert.deepEqual(starts, [39, 40, 41, 42]);
});
test('a hook failure does not fail the saved paper', async () => {
	assert.equal(
		await triggerResearchMap(
			{
				count: async () => {
					throw new Error('unavailable');
				}
			},
			() => assert.fail()
		),
		false
	);
	assert.equal(
		await triggerResearchMap({ count: async () => 40 }, () => {
			throw new Error('spawn failed');
		}),
		false
	);
});
