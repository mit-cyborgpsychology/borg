<script lang="ts">
	import type { Task } from '$lib/types/task';
	import TaskList from '../../tasks/TaskList.svelte';
	import { getCanvasActions } from '$lib/features/canvas/context';

	let { tasks, nodeId, projectSlug, borderColor, onTaskClick } = $props<{
		tasks: Task[];
		nodeId: string;
		projectSlug: string;
		borderColor: string;
		onTaskClick: () => void;
	}>();
	const canvasActions = getCanvasActions();
</script>

<div
	class="nodrag nopan max-w-64 min-w-48 rounded-b-lg border border-t-0 bg-zinc-50/80 p-1.5"
	style:border-color={borderColor}
>
	<TaskList
		{tasks}
		{nodeId}
		{projectSlug}
		compact
		limit={3}
		onShowAll={onTaskClick}
		onEdit={(task) => canvasActions.editTask({ nodeId, task })}
	/>
</div>
