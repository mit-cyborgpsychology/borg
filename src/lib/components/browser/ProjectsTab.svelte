<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createProjectsState } from '../../features/projects/createProjectsState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ProjectComposer from './ProjectComposer.svelte';
	import ProjectsCanvas from './ProjectsCanvas.svelte';
	import { FolderOpen, Trash2, Search, Network, Grid, Plus } from '@lucide/svelte';

	const { projectsService, authStore, taskService } = getAppServices();
	const featureState = createProjectsState(projectsService, taskService);
	const resource = featureState.list;
	const summaries = featureState.summaries;
	const command = featureState.command;
	onDestroy(() => featureState.dispose());

	let { viewMode = $bindable<'list' | 'canvas'>('canvas') } = $props<{
		viewMode?: 'list' | 'canvas';
	}>();

	let projects = $derived($resource.data.projects);
	let showProjectComposer = $state(false);
	let searchQuery = $state('');
	let projectCounts = $derived($summaries.data.counts);
	let projectTaskCounts = $derived($summaries.data.taskCounts);
	let dataLoaded = $derived($resource.status !== 'idle');
	let creatingProject = $state(false);
	let deletingProjects = $state<Set<string>>(new Set());

	onMount(() => {
		loadProjects();
	});

	$effect(() => {
		if (viewMode === 'list' && $resource.status === 'ready') {
			void featureState.loadSummaries(projects);
		}
	});

	async function loadProjects(force = false) {
		if (dataLoaded && !force) return;
		await featureState.load();
	}

	// Listen for project updates when returning from project pages
	function handleVisibilityChange() {
		if (!document.hidden) {
			// Invalidate caches and force refresh when returning from project pages
			projectsService.invalidateAllStatusCaches();
			loadProjects(true);
		}
	}

	async function handleCreateProject(projectData: Parameters<typeof featureState.create>[0]) {
		creatingProject = true;
		try {
			if ((await featureState.create(projectData)).ok) showProjectComposer = false;
		} finally {
			creatingProject = false;
		}
	}

	function handleOpenProject(slug: string) {
		// Both members and collaborators can access project pages
		// The canvas restriction is handled within the project page itself
		goto(`/project/${slug}`);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString();
	}

	async function handleDeleteProject(event: MouseEvent, slug: string, title: string) {
		event.stopPropagation(); // Prevent opening the project

		if (
			confirm(
				`Are you sure you want to delete the project "${title}"? This action cannot be undone.`
			)
		) {
			// Add project to deleting set
			deletingProjects.add(slug);
			deletingProjects = new Set(deletingProjects);

			try {
				await featureState.remove(slug);
			} finally {
				// Remove project from deleting set
				deletingProjects.delete(slug);
				deletingProjects = new Set(deletingProjects);
			}
		}
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$command} pendingLabel="Saving…" />
	<AsyncStatus state={$resource} onRetry={() => void loadProjects(true)} />
</StatusOverlay>

<svelte:document on:visibilitychange={handleVisibilityChange} />

<div class="flex h-full w-full flex-col overflow-hidden">
	{#if showProjectComposer}
		<ProjectComposer
			error={$command.error}
			onCreate={handleCreateProject}
			onClose={() => (showProjectComposer = false)}
			isLoading={creatingProject}
		/>
	{/if}

	<!-- Content Area -->
	<div class={viewMode === 'canvas' ? 'min-h-0 flex-1' : 'flex-1 overflow-y-auto p-4'}>
		{#if viewMode === 'list'}
			<!-- Inline controls: search + toggle + new project -->
			{#if $authStore.userType !== 'collaborator'}
				<div class="mb-3 flex items-center gap-2">
					<div class="relative">
						<Search class="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
						<input
							type="text"
							placeholder="Search projects..."
							bind:value={searchQuery}
							class="w-48 rounded border border-zinc-200 bg-white py-1.5 pr-3 pl-8 text-sm text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
						/>
					</div>
					<div class="flex w-48 rounded border border-zinc-200 bg-white p-0.5">
						<button
							onclick={() => (viewMode = 'canvas')}
							class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-sm text-zinc-500 transition-colors hover:text-zinc-700"
						>
							<Network class="h-3.5 w-3.5" />
							Canvas
						</button>
						<button
							onclick={() => (viewMode = 'list')}
							class="flex flex-1 items-center justify-center gap-1.5 rounded bg-zinc-100 px-2 py-1 text-sm font-medium text-zinc-800 transition-colors"
						>
							<Grid class="h-3.5 w-3.5" />
							List
						</button>
					</div>
					<div class="flex-1"></div>
					<button
						onclick={() => (showProjectComposer = true)}
						class="flex items-center gap-1.5 rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
					>
						<Plus class="h-3.5 w-3.5" />
						New Project
					</button>
				</div>
			{/if}

			<!-- List View -->
			{#if $summaries.status === 'error'}
				<AsyncStatus state={$summaries} onRetry={() => void featureState.loadSummaries(projects)} />
			{/if}
			{#if projects.filter((p) => p.id !== 'project-canvas').length === 0}
				<div class="flex h-64 flex-col items-center justify-center text-center">
					<FolderOpen class="mb-4 h-8 w-8 text-zinc-300" />
					<h3 class="mb-2 text-lg font-medium text-black">No projects yet</h3>
					<p class="mb-4 text-sm text-zinc-500">Create your first project to get started</p>
				</div>
			{:else}
				<div class="space-y-1">
					{#each projects.filter((p) => p.id !== 'project-canvas' && (!searchQuery || p.title
									?.toLowerCase()
									.includes(searchQuery.toLowerCase()))) as project}
						{@const isDeleting = deletingProjects.has(project.slug)}
						{@const counts = projectCounts[project.slug]}
						{@const taskCount = projectTaskCounts[project.slug] ?? '…'}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="group flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 transition-colors hover:bg-borg-beige {isDeleting
								? 'pointer-events-none opacity-50'
								: ''}"
							onclick={() => !isDeleting && handleOpenProject(project.slug)}
						>
							<div
								class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-borg-brown bg-borg-beige"
							>
								<FolderOpen class="h-3.5 w-3.5 text-zinc-600" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-zinc-800">{project.title}</p>
								<p class="text-xs text-zinc-400">
									{taskCount} tasks ·
									<span class="inline-flex items-center gap-0.5"
										><span class="h-1.5 w-1.5 rounded-full bg-purple-400"></span>{counts?.todo ??
											'…'}</span
									>
									<span class="inline-flex items-center gap-0.5"
										><span class="h-1.5 w-1.5 rounded-full bg-sky-400"></span>{counts?.doing ??
											'…'}</span
									>
									<span class="inline-flex items-center gap-0.5"
										><span class="h-1.5 w-1.5 rounded-full bg-green-400"></span>{counts?.done ??
											'…'}</span
									>
								</p>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-xs text-zinc-400 capitalize">{project.status || 'active'}</span>
								<button
									onclick={(e) =>
										!isDeleting && handleDeleteProject(e, project.slug, project.title)}
									aria-label="Delete"
									disabled={isDeleting}
									class="rounded p-1 text-zinc-300 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400 disabled:cursor-not-allowed"
								>
									{#if isDeleting}
										<div
											class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"
										></div>
									{:else}
										<Trash2 class="h-3.5 w-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else}
			<!-- Canvas View -->
			<div class="h-full w-full">
				<ProjectsCanvas
					projects={projects.filter((p) => p.id !== 'project-canvas')}
					onProjectClick={handleOpenProject}
					onProjectUpdate={() => loadProjects(true)}
					onCreateProject={() => (showProjectComposer = true)}
					bind:viewMode
				/>
			</div>
		{/if}
	</div>
</div>
