import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createNodeDetail,
	hasDetailValue,
	inferDetailValue
} from '../src/lib/features/canvas/nodeDetails.ts';

test('details infer usable web links without treating numbers or sentences as URLs', () => {
	assert.deepEqual(inferDetailValue(' github.com/org/repo '), {
		type: 'link',
		value: 'https://github.com/org/repo'
	});
	assert.deepEqual(inferDetailValue('https://example.com/a?q=1'), {
		type: 'link',
		value: 'https://example.com/a?q=1'
	});
	for (const value of [
		'3.5',
		'Room 401',
		'example.com is the reference',
		'javascript:alert(1)',
		'https://user:password@example.com'
	]) {
		assert.deepEqual(inferDetailValue(value), { type: 'text', value });
	}
	assert.deepEqual(inferDetailValue(' First line\nSecond line '), {
		type: 'textarea',
		value: 'First line\nSecond line'
	});
});

test('only unambiguous, valid calendar dates become date details', () => {
	assert.deepEqual(inferDetailValue('2028-02-29'), { type: 'date', value: '2028-02-29' });
	for (const value of ['2027-02-29', '2026-02-30', '2026-13-01', '02/03/2026', 'Tomorrow']) {
		assert.deepEqual(inferDetailValue(value), { type: 'text', value });
	}
});

test('adding a detail validates name and value while preserving existing definitions', () => {
	const existing = Object.freeze([
		Object.freeze({ id: 'title', label: 'Title', type: 'text' }),
		Object.freeze({ id: 'legacy', label: 'Venue', type: 'text', showInDisplay: false })
	]);
	for (const name of ['title', ' TITLE ', ' venue ']) {
		assert.throws(() => createNodeDetail('new', name, 'value', existing), /already in use/);
	}
	assert.throws(() => createNodeDetail('new', ' ', 'value', existing), /name and value/);
	assert.throws(() => createNodeDetail('new', 'Reference', ' ', existing), /name and value/);
	assert.deepEqual(createNodeDetail('new', ' Reference ', ' arxiv.org/abs/123 ', existing), {
		field: { id: 'new', label: 'Reference', type: 'link', isCustom: true, showInDisplay: true },
		value: 'https://arxiv.org/abs/123'
	});
	assert.equal(existing.length, 2);
	assert.equal(existing[1].showInDisplay, false);
});

test('empty details stay off cards, while zero, false, and populated tag lists remain', () => {
	for (const value of [undefined, null, '', ' \n ', [], ['', ' ']]) {
		assert.equal(hasDetailValue(value), false);
	}
	for (const value of [0, false, 'Media Lab', ['Research']]) {
		assert.equal(hasDetailValue(value), true);
	}
});
