<script lang="ts">
	import { getAppServices } from '$lib/app/context';
	import Canvas from '$lib/components/Canvas.svelte';
	import PresenceAvatars from '$lib/components/PresenceAvatars.svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import { createProjectState } from '$lib/features/projects/createProjectState';
	import AsyncStatus from '$lib/components/AsyncStatus.svelte';
	import { goto } from '$app/navigation';
	import { ChevronLeft } from '@lucide/svelte';

	const { projectsService } = getAppServices();
	const projectSlug = $derived($page.params.slug ?? '');
	const feature = createProjectState(projectsService);
	const resource = feature.project;
	let project = $derived($resource.data);
	let loading = $derived(
		!project && ($resource.status === 'idle' || $resource.status === 'loading')
	);
	onDestroy(() => feature.dispose());
	$effect(() => {
		const slug = projectSlug;
		if (slug) {
			feature.project.reset();
			void feature.load(slug).then((result) => {
				if (result === null) goto('/');
			});
		}
	});
	async function handleProjectUpdate() {
		await feature.load(projectSlug);
	}
</script>

<svelte:head>
	<title>{project?.title || 'Project'} | BORG</title>
</svelte:head>

<AsyncStatus state={$resource} onRetry={() => void feature.load(projectSlug)} />
{#if loading}
	<div class="flex h-screen w-full items-center justify-center bg-borg-beige">
		<div class="text-center">
			<div
				class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
			></div>
			<p class="text-black">Loading project...</p>
		</div>
	</div>
{:else if project}
	<div class="relative h-screen w-full">
		<!-- Floating top bar -->
		<div class="absolute top-3 left-3 z-50 flex items-center gap-2">
			<button
				onclick={() => goto('/')}
				class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
			>
				<ChevronLeft class="h-3.5 w-3.5" />
				Projects
			</button>
			<div class="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1">
				<PresenceAvatars room={projectSlug} />
			</div>
		</div>

		<!-- Canvas fills full height -->
		<SvelteFlowProvider>
			{#key projectSlug}<Canvas
					{projectSlug}
					onProjectUpdate={handleProjectUpdate}
					onPanelOpen={() => {}}
				/>{/key}
		</SvelteFlowProvider>
	</div>
{/if}
