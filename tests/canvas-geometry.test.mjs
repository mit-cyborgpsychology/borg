import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	isFinitePosition,
	readCanvasViewport,
	MIN_CANVAS_ZOOM,
	MAX_CANVAS_ZOOM
} from '../src/lib/utils/canvasGeometry.ts';
import { buildNodeUpdate } from '../src/lib/services/firebase/nodeUpdates.ts';

test('saved canvas views reject malformed coordinates and nonpositive zoom', () => {
	for (const value of [undefined, null, {}, 'invalid', { x: 0, y: 0 }]) {
		assert.equal(readCanvasViewport(value), null);
	}
	for (const value of [NaN, Infinity, -Infinity, '20', null, undefined]) {
		assert.equal(readCanvasViewport({ x: value, y: 0, zoom: 1 }), null);
		assert.equal(readCanvasViewport({ x: 0, y: value, zoom: 1 }), null);
		assert.equal(readCanvasViewport({ x: 0, y: 0, zoom: value }), null);
	}
	for (const zoom of [0, -1]) assert.equal(readCanvasViewport({ x: 0, y: 0, zoom }), null);
});

test('valid canvas views preserve panning and use the same zoom limits as the renderer', () => {
	const viewport = { x: 400.25, y: -170.5, zoom: 0.75 };
	assert.deepEqual(readCanvasViewport(viewport), viewport);
	assert.notEqual(readCanvasViewport(viewport), viewport);
	assert.equal(readCanvasViewport({ ...viewport, zoom: 0.001 }).zoom, MIN_CANVAS_ZOOM);
	assert.equal(readCanvasViewport({ ...viewport, zoom: 1e100 }).zoom, MAX_CANVAS_ZOOM);
});

test('NaN and infinite node positions cannot reach geometry writes', () => {
	for (const value of [NaN, Infinity, -Infinity, '20', undefined]) {
		for (const position of [
			{ x: value, y: 0 },
			{ x: 0, y: value }
		]) {
			assert.equal(isFinitePosition(position), false);
			assert.throws(() => buildNodeUpdate({ position }), /finite coordinates/);
		}
	}
	assert.equal(isFinitePosition({ x: -100.5, y: 0 }), true);
	assert.deepEqual(buildNodeUpdate({ position: { x: -100.5, y: 0 } }), {
		position: { x: -100.5, y: 0 }
	});
});
