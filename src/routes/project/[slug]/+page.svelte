<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import PresenceAvatars from '$lib/components/PresenceAvatars.svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { projectsService, taskService } from '$lib/services/instances';
	import { goto } from '$app/navigation';
	import { ChevronLeft } from '@lucide/svelte';
	import type { TaskWithContext } from '$lib/types/task';
	import { authStore } from '$lib/stores/authStore';

	const projectSlug = $derived($page.params.slug);
	let project = $state<any>(null);
	let loading = $state(true);
	let projectTasks = $state<TaskWithContext[]>([]);
	let taskSubscriptionCleanup: (() => void) | null = null;

	onMount(async () => {
		if ($authStore.loading) {
			const unsubscribe = authStore.subscribe((auth) => {
				if (!auth.loading) {
					unsubscribe();
					initializeServices();
				}
			});
		} else {
			await initializeServices();
		}
	});

	async function initializeServices() {
		await loadProject();
	}

	$effect(() => {
		return () => {
			if (taskSubscriptionCleanup) {
				taskSubscriptionCleanup();
				taskSubscriptionCleanup = null;
			}
		};
	});

	async function loadProject() {
		if (!projectSlug) return;
		const projectResult = await projectsService.getProject(projectSlug);
		project = projectResult;

		if (!project) {
			goto('/');
			return;
		}

		await loadProjectTasks();
		loading = false;
	}

	async function loadProjectTasks() {
		if (projectSlug && taskService) {
			if (taskSubscriptionCleanup) {
				taskSubscriptionCleanup();
				taskSubscriptionCleanup = null;
			}

			if ((taskService as any).subscribeToProjectTasks) {
				taskSubscriptionCleanup = (taskService as any).subscribeToProjectTasks(
					projectSlug,
					(updatedTasks: TaskWithContext[]) => {
						projectTasks = [...updatedTasks];
					}
				);
			} else {
				projectTasks = await taskService.getProjectTasks(projectSlug);
			}
		}
	}

	async function handleProjectUpdate() {
		if (projectSlug && projectsService) {
			const updatedProject = await projectsService.getProject(projectSlug);
			if (updatedProject) {
				project = updatedProject;
			}
		}
	}
</script>

<svelte:head>
	<title>{project?.title || 'Project'} | BORG</title>
</svelte:head>

{#if loading}
	<div class="flex h-screen w-full items-center justify-center bg-borg-beige">
		<div class="text-center">
			<div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
			<p class="text-black">Loading project...</p>
		</div>
	</div>
{:else if project}
	<div class="relative h-screen w-full">
		<!-- Floating top bar -->
		<div class="absolute left-3 top-3 z-50 flex items-center gap-2">
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
			<Canvas
				{projectSlug}
				{projectTasks}
				onProjectUpdate={handleProjectUpdate}
				onPanelOpen={() => {}}
			/>
		</SvelteFlowProvider>
	</div>
{/if}
