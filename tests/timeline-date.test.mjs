import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	formatTimelineDate,
	timelineMillis,
	timelineTimestamp,
	easternOffset
} from '../src/lib/utils/timelineDate.ts';

test('timeline display keeps the written clock time and supports UTC and fractional offsets', () => {
	assert.equal(formatTimelineDate('2026-09-28T09:15:00Z'), 'Sep 28, 2026 · 09:15 UTC');
	assert.equal(formatTimelineDate('2026-09-28T23:59-12:00'), 'Sep 28, 2026 · 23:59 AOE');
	assert.equal(formatTimelineDate('2026-09-28T09:15-04:00'), 'Sep 28, 2026 · 09:15 EDT');
	assert.equal(formatTimelineDate('2026-09-28T09:15+05:30'), 'Sep 28, 2026 · 09:15 UTC+05:30');
});

test('ET quick dates use the selected date for daylight saving, including a March starting on Sunday', () => {
	assert.equal(easternOffset('2026-03-07', '12:00'), '-05:00');
	assert.equal(easternOffset('2026-03-08', '12:00'), '-04:00');
	assert.equal(easternOffset('2026-10-31', '12:00'), '-04:00');
	assert.equal(easternOffset('2026-11-01', '12:00'), '-05:00');
});

test('future filters understand legacy dates and exclude malformed timestamps', () => {
	assert.equal(timelineTimestamp({ date: '2026-09-28', time: '17:30' }), '2026-09-28T17:30');
	assert.equal(timelineTimestamp({ date: '2026-09-28' }), '2026-09-28T23:59');
	assert.equal(timelineMillis({ timestamp: 'invalid' }), 0);
	assert.equal(
		timelineMillis({ timestamp: '2026-09-28T23:59-12:00' }),
		Date.parse('2026-09-29T11:59Z')
	);
});
