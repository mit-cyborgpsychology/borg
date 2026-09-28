import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProjectCanvasNodes } from '../src/lib/features/projects/projectCanvasNodes.ts';

const marker = {
	id: 'project-one',
	type: 'universal',
	position: { x: 800, y: 400 },
	data: { templateType: 'project', nodeData: { projectId: 'one' } }
};
const note = {
	id: 'note',
	type: 'universal',
	position: { x: 10, y: 20 },
	data: { templateType: 'note', nodeData: { title: 'Scratch note' } }
};
const project = {
	id: 'one',
	title: 'Actual project',
	slug: 'actual-project',
	status: 'active',
	collaborators: []
};

test('position snapshots arriving before metadata never render untitled project placeholders', () => {
	const waiting = buildProjectCanvasNodes([], [marker, note], []);
	assert.deepEqual(waiting, [note]);
	const ready = buildProjectCanvasNodes([project], [marker, note], waiting);
	assert.equal(ready.length, 2);
	assert.equal(ready[0].type, 'projectCanvas');
	assert.equal(ready[0].data.nodeData.title, 'Actual project');
	assert.deepEqual(ready[0].position, marker.position);
	assert.deepEqual(buildProjectCanvasNodes([], [marker, note], ready), [note]);
});

test('metadata and saved positions reconcile in either arrival order, including same-count renames', () => {
	const initial = buildProjectCanvasNodes([project], [], []);
	const ready = buildProjectCanvasNodes([{ ...project, title: 'Renamed' }], [marker], initial);
	assert.equal(ready[0].data.nodeData.title, 'Renamed');
	assert.deepEqual(ready[0].position, marker.position);
	const dragging = { ...ready[0], dragging: true, position: { x: 20, y: 30 } };
	assert.deepEqual(
		buildProjectCanvasNodes([project], [marker], [dragging])[0].position,
		dragging.position
	);
});
