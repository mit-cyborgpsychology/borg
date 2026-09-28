import { getContext, setContext } from 'svelte';
import type { NodeUpdate } from '../../types/canvas';
import type { Task } from '../../types/task';

export interface CanvasPayloads {
	nodeDelete: { nodeId: string };
	nodeUpdate: { nodeId: string; data: NodeUpdate };
	nodeEdit: { nodeId: string; nodeData: Record<string, unknown>; templateType: string };
	nodeTasksOpen: { nodeId: string; nodeTitle: string };
	addTask: { nodeId: string };
	editTask: { nodeId: string; task: Task };
	addSticker: {
		type: string;
		stickerUrl: string;
		category: string;
		filename: string;
		name: string;
	};
}
export type CanvasActions = { [K in keyof CanvasPayloads]: (payload: CanvasPayloads[K]) => void };
const key = Symbol('canvas-actions');
export function provideCanvasActions(actions: CanvasActions) {
	setContext(key, actions);
}
export function getCanvasActions(): CanvasActions {
	const actions = getContext<CanvasActions>(key);
	if (!actions) throw new Error('Canvas actions require an owning canvas');
	return actions;
}
