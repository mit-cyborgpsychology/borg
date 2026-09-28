<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Task } from '$lib/types/task';
	import TaskList from './TaskList.svelte';

	let { nodeId, nodeTitle, projectSlug, tasks, onClose, onTasksUpdated } = $props<{
		nodeId: string;
		nodeTitle: string;
		projectSlug?: string;
		tasks: Task[];
		onClose: () => void;
		onTasksUpdated?: () => void | Promise<void>;
	}>();
</script>

<section
	aria-label="Node tasks"
	class="flex h-full w-80 flex-col border-l border-zinc-200 bg-white"
>
	<div class="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4">
		<div class="min-w-0">
			<h3 class="font-sans text-xs font-semibold text-zinc-900">Tasks</h3>
			<p class="mt-1 truncate text-xs text-zinc-500" title={nodeTitle}>{nodeTitle}</p>
		</div>
		<button
			onclick={onClose}
			aria-label="Close tasks"
			class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
			><X class="h-4 w-4" /></button
		>
	</div>
	<div class="min-h-0 flex-1 overflow-auto p-3">
		{#key nodeId}
			<TaskList {tasks} {nodeId} {projectSlug} {onTasksUpdated} />
		{/key}
	</div>
</section>
