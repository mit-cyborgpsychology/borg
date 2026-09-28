<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTasksState } from '$lib/features/tasks/createTasksState';
	import { getAppServices } from '$lib/app/context';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import TaskWorkspace from '../tasks/TaskWorkspace.svelte';
	let { activeTab } = $props<{ activeTab: string }>();
	const { taskService, authStore, projectsService, taskContext } = getAppServices();
	const feature = createTasksState(taskService, projectsService, taskContext.joinTaskContext);
	const resource = feature.list;
	const directory = feature.directory;
	onDestroy(() => feature.dispose());
	$effect(() => {
		if (activeTab === 'tasks' && $resource.status === 'idle') void load();
	});
	async function load() {
		await feature.load($authStore.userType === 'collaborator');
	}
</script>

<StatusOverlay>
	{#if $directory.status === 'error'}<AsyncStatus
			state={$directory}
			onRetry={() => void load()}
		/>{/if}
	<AsyncStatus state={$resource} onRetry={() => void load()} /></StatusOverlay
>
<div class="h-full min-h-0 overflow-auto p-4 md:overflow-hidden">
	<div class="mx-auto w-full max-w-6xl md:h-full">
		<TaskWorkspace
			active={$resource.data.active}
			completed={$resource.data.resolved}
			loading={$resource.status === 'idle' || $resource.status === 'loading'}
			onRefresh={load}
			hasMore={{
				active: !!$resource.data.cursors.active,
				completed: !!$resource.data.cursors.completed
			}}
			pageNumbers={$resource.data.pageNumbers}
			onPageChange={(view, direction) => feature.changePage(view, direction)}
			projects={$resource.data.projects}
			project={$resource.data.selectedProject}
			onProjectChange={(value) => feature.selectProject(value)}
		/>
	</div>
</div>
