<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createDocsState } from '../../features/docs/createDocsState';
	import AsyncStatus from '../AsyncStatus.svelte';
	import StatusOverlay from '../StatusOverlay.svelte';
	import { getAppServices } from '$lib/app/context';
	import type { OutlineDocSummary } from '../../services/interfaces/IOutlineService';
	import { FileText, Activity } from '@lucide/svelte';

	const { outlineService, projectsService, taskService } = getAppServices();
	const featureState = createDocsState(outlineService, projectsService, taskService);
	const resource = featureState.list;
	onDestroy(() => featureState.dispose());

	let { activeTab } = $props<{
		activeTab: string;
	}>();

	let docs = $derived($resource.data.docs);
	const activityResource = featureState.activity;
	let activity = $derived($activityResource.data);
	let projectByCollectionId = $derived($resource.data.projects);
	let searchQuery = $state('');
	let dataLoaded = $derived($resource.status !== 'idle');
	let loading = $derived($resource.status === 'loading');

	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (activeTab === 'docs' && !dataLoaded) {
			loadDocs();
			loadActivity();
		}
	});

	async function loadDocs(query = '') {
		await featureState.load(query);
	}
	async function loadActivity() {
		await featureState.loadActivity();
	}
	onDestroy(() => {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	});

	function handleSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			loadDocs(searchQuery.trim());
		}, 300);
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function projectNameFor(doc: OutlineDocSummary): string {
		return projectByCollectionId.get(doc.collectionId)?.title || 'Unmapped';
	}
</script>

<StatusOverlay>
	<AsyncStatus state={$resource} onRetry={() => void loadDocs(searchQuery.trim())} />
</StatusOverlay>

<div class="flex h-full w-full flex-col overflow-hidden">
	<!-- Toolbar -->
	<div
		class="flex w-full flex-shrink-0 items-center gap-2 border-b border-borg-brown bg-borg-beige px-4 py-2"
	>
		<input
			bind:value={searchQuery}
			oninput={handleSearchInput}
			type="text"
			placeholder="Search docs..."
			class="w-56 rounded border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
		/>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-4">
		<!-- Docs list -->
		<div class="mb-6">
			<p class="mb-2 text-xs font-medium text-zinc-400">Documents ({docs.length})</p>
			{#if loading}
				<div class="flex items-center gap-2 p-4 text-sm text-zinc-400">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent"
					></div>
					Loading...
				</div>
			{:else if docs.length === 0}
				<div class="flex h-32 flex-col items-center justify-center text-center">
					<FileText class="mb-2 h-6 w-6 text-zinc-300" />
					<p class="text-sm text-zinc-400">{searchQuery ? 'No docs found' : 'No docs yet'}</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each docs as doc}
						<button
							onclick={() => window.open(doc.url, '_blank')}
							class="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-borg-beige"
						>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-zinc-800">
									{doc.title || 'Untitled Doc'}
								</p>
								<p class="truncate text-xs text-zinc-400">{projectNameFor(doc)}</p>
							</div>
							<p class="flex-shrink-0 pl-3 text-xs text-zinc-400">{formatDate(doc.updatedAt)}</p>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Activity feed -->
		<div class="border-t border-zinc-100 pt-4">
			<p class="mb-2 text-xs font-medium text-zinc-400">Recent Activity</p>
			{#if activity.length === 0}
				<div class="flex h-24 flex-col items-center justify-center text-center">
					<Activity class="mb-2 h-6 w-6 text-zinc-300" />
					<p class="text-sm text-zinc-400">No Outline-triggered tasks yet</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each activity as task}
						<div class="rounded-lg border border-zinc-200 bg-white px-3 py-2.5">
							<div class="flex items-center justify-between gap-3">
								<p
									class="min-w-0 truncate text-sm font-medium text-zinc-800 {task.status ===
									'resolved'
										? 'text-zinc-400 line-through'
										: ''}"
								>
									{task.title}
								</p>
								<p class="flex-shrink-0 text-xs text-zinc-400">{formatDate(task.createdAt)}</p>
							</div>
							<p class="truncate text-xs text-zinc-400">
								{task.projectTitle || 'Outline'} · {task.outlineDocTitle || 'Untitled Doc'}
							</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
