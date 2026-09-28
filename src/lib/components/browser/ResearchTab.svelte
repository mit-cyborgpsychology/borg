<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { Search, RefreshCw, ArrowUpRight, FileText, X, Network } from '@lucide/svelte';
	import { SvelteFlowProvider } from '@xyflow/svelte';
	import { getAppServices } from '$lib/app/context';
	import { createResearchState } from '$lib/features/research/createResearchState';
	import {
		filterResearch,
		researchSource,
		type ResearchSort
	} from '$lib/features/research/filterResearch';
	import ResearchMap from '../research/ResearchMap.svelte';

	const { researchService } = getAppServices();
	const feature = createResearchState(researchService);
	const resource = feature.papers;
	const mapResource = feature.map;
	let query = $state('');
	let source = $state('');
	let topicId = $state('');
	const topics = $derived($mapResource.data?.topics || []);
	const topicByUrl = $derived(
		new Map($mapResource.data?.points.map((p) => [p.url, p.topicId]) || [])
	);
	let sort = $state<ResearchSort>('newest');
	let selectedId = $state<number | null>(null);
	let listElement: HTMLUListElement | undefined = $state();
	const papers = $derived($resource.data);
	const loading = $derived($resource.status === 'idle' || $resource.status === 'loading');
	const mapLoading = $derived($mapResource.status === 'idle' || $mapResource.status === 'loading');
	const sources = $derived(
		[...new Set(papers.map((p) => researchSource(p.url)).filter(Boolean))].sort()
	);
	const visible = $derived(
		filterResearch(papers, query, source, sort).filter(
			(p) => !topicId || topicByUrl.get(p.url) === topicId
		)
	);
	const visibleIds = $derived(new Set(visible.map((p) => p.id)));
	const mappedUrls = $derived(new Set($mapResource.data?.points.map((p) => p.url) || []));
	const filtered = $derived(Boolean(query.trim() || source || topicId));
	const hasMap = $derived(
		Boolean($mapResource.data?.points.some((point) => papers.some((p) => p.url === point.url)))
	);

	onMount(() => {
		void feature.load();
	});
	onDestroy(() => feature.dispose());
	$effect(() => {
		if (selectedId !== null && !visibleIds.has(selectedId)) selectedId = null;
		if (topicId && !topics.some((t) => t.id === topicId)) topicId = '';
	});
	function clearFilters() {
		query = '';
		source = '';
		topicId = '';
	}
	async function selectFromMap(id: number) {
		selectedId = id;
		await tick();
		listElement
			?.querySelector(`[data-paper-id="${id}"]`)
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}
	function formatDate(value: string) {
		return new Date(value).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<section
	aria-label="References library"
	class="flex h-full min-h-0 flex-col overflow-hidden bg-white"
>
	<header
		class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2.5"
	>
		<div class="flex items-center gap-2">
			<Network class="h-4 w-4 text-zinc-500" />
			<h1 class="text-sm font-semibold text-zinc-800">References</h1>
			{#if papers.length || $resource.status === 'ready'}<span
					class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
					>{papers.length} papers</span
				>{/if}
		</div>
		<button
			type="button"
			aria-label="Refresh references"
			onclick={() => void feature.load()}
			disabled={loading || mapLoading}
			class="flex items-center gap-1.5 rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
		>
			<RefreshCw class="h-3 w-3 {loading || mapLoading ? 'animate-spin' : ''}" />Refresh
		</button>
	</header>
	<div class="flex min-h-0 flex-1 flex-col md:flex-row">
		<main
			aria-label="References visualization"
			class="relative min-h-0 flex-1 bg-[#f8f8f6] max-md:min-h-[35%]"
		>
			{#if hasMap && $mapResource.data}
				<SvelteFlowProvider>
					<ResearchMap
						{papers}
						points={$mapResource.data.points}
						{topics}
						selectedTopicId={topicId}
						ontopicselect={(id) => {
							topicId = topicId === id ? '' : id;
						}}
						{visibleIds}
						{selectedId}
						onselect={selectFromMap}
					/>
				</SvelteFlowProvider>
			{:else}
				<div class="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
					<Network class="h-8 w-8 text-zinc-300" />
					{#if mapLoading || loading}<p role="status" class="text-sm text-zinc-500">
							Loading references map…
						</p>
					{:else if $mapResource.error}<p class="max-w-xs text-sm text-zinc-500">
							The map is unavailable. Your papers are still listed on the right.
						</p>
					{:else if !papers.length}<p class="text-sm text-zinc-500">
							Saved papers will appear here.
						</p>
					{:else}<p class="max-w-xs text-sm text-zinc-500">
							The map needs at least three papers with embeddings. You can still browse every paper.
						</p>{/if}
				</div>
			{/if}
			{#if $mapResource.error}
				<div
					role="alert"
					class="absolute right-3 bottom-12 left-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
				>
					<span
						>{hasMap
							? 'Could not refresh the map. Showing the previous layout.'
							: $mapResource.error}</span
					>
					<button
						type="button"
						onclick={() => void feature.reloadMap()}
						disabled={mapLoading}
						class="shrink-0 underline underline-offset-2">Retry map</button
					>
				</div>
			{/if}
		</main>
		<aside
			aria-label="References papers sidebar"
			class="flex min-h-0 shrink-0 flex-col border-zinc-200 bg-white max-md:h-[55%] max-md:border-t md:w-80 md:border-l xl:w-96"
		>
			<div class="shrink-0 border-b border-zinc-200 p-4">
				<div class="mb-3 flex items-center justify-between gap-2">
					<h2 class="text-sm font-semibold text-zinc-800">Papers</h2>
					<p role="status" class="text-[11px] text-zinc-400">
						{filtered ? `${visible.length} of ${papers.length}` : papers.length}
					</p>
				</div>
				<div class="relative">
					<Search class="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-zinc-400" />
					<input
						aria-label="Search references"
						type="search"
						bind:value={query}
						placeholder="Search papers…"
						class="w-full rounded-md border border-zinc-200 py-1.5 pr-2 pl-8 text-xs text-zinc-700 outline-none focus:border-zinc-400"
					/>
				</div>
				<div class="mt-2 flex gap-2">
					<select
						aria-label="References source"
						bind:value={source}
						class="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-500"
					>
						<option value="">All sources</option>{#each sources as host (host)}<option value={host}
								>{host}</option
							>{/each}
					</select>
					<select
						aria-label="Sort references"
						bind:value={sort}
						class="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-500"
					>
						<option value="newest">Recently saved</option><option value="oldest"
							>Oldest saved</option
						><option value="title">Title A–Z</option>
					</select>
				</div>
				{#if topics.length}
					<select
						aria-label="References topic"
						bind:value={topicId}
						class="mt-2 w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] text-zinc-500"
					>
						<option value="">All topics</option>
						{#each topics as topic (topic.id)}<option value={topic.id}
								>{topic.label} · {topic.count}</option
							>{/each}
					</select>
				{/if}
				{#if filtered}<button
						type="button"
						onclick={clearFilters}
						class="mt-2 text-[11px] text-zinc-500 underline underline-offset-2"
						>Clear filters</button
					>{/if}
			</div>
			{#if $resource.error}
				<div
					role="alert"
					class="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
				>
					<p>{$resource.error}</p>
					<button
						type="button"
						onclick={() => void feature.load()}
						disabled={loading}
						class="mt-2 underline">Try again</button
					>
				</div>
			{/if}
			<div class="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
				{#if loading && !papers.length}<p
						role="status"
						class="p-6 text-center text-xs text-zinc-400"
					>
						Loading references…
					</p>
				{:else if !papers.length && !$resource.error}<h3
						class="p-6 text-center text-sm text-zinc-500"
					>
						No references yet
					</h3>
				{:else if papers.length && !visible.length}<div class="p-6 text-center">
						<h3 class="text-sm text-zinc-600">No matching papers</h3>
						<p class="mt-2 text-xs text-zinc-400">Try another title, author, or keyword.</p>
					</div>
				{:else}
					<ul
						bind:this={listElement}
						aria-label="References papers"
						class="divide-y divide-zinc-100"
					>
						{#each visible as paper (paper.id)}
							<li
								data-paper-id={paper.id}
								class="border-l-2 {selectedId === paper.id
									? 'border-l-zinc-700 bg-zinc-50'
									: 'border-l-transparent'}"
							>
								<button
									type="button"
									onclick={() => (selectedId = selectedId === paper.id ? null : paper.id)}
									aria-expanded={selectedId === paper.id}
									aria-label={`Show paper: ${paper.title}`}
									class="w-full px-4 py-3.5 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-500"
								>
									<div
										class="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400"
									>
										<span>{researchSource(paper.url) || 'Paper'}</span
										>{#if $mapResource.data && !mappedUrls.has(paper.url)}<span>Not mapped yet</span
											>{/if}
									</div>
									<h3 class="text-xs leading-relaxed font-medium text-zinc-800">{paper.title}</h3>
									{#if paper.authors}<p class="mt-1.5 line-clamp-1 text-[10px] text-zinc-400">
											{paper.authors}
										</p>{/if}
								</button>
								{#if selectedId === paper.id}
									<div aria-label="Selected paper details" role="region" class="px-4 pb-4">
										<div class="mb-3 flex items-center justify-between gap-2">
											<span class="text-[10px] font-medium tracking-wide text-zinc-400 uppercase"
												>Summary</span
											><button
												type="button"
												aria-label="Close paper details"
												onclick={() => (selectedId = null)}
												class="rounded p-1 text-zinc-400 hover:bg-zinc-200"
												><X class="h-3 w-3" /></button
											>
										</div>
										<p class="text-xs leading-relaxed text-zinc-600">
											{paper.summary || 'No summary available.'}
										</p>
										{#if paper.authors}<p class="mt-3 text-[10px] leading-relaxed text-zinc-500">
												{paper.authors}
											</p>{/if}
										<div class="mt-3 space-y-1 text-[10px] text-zinc-400">
											{#if paper.savedAt}<p>
													Saved <time datetime={paper.savedAt}>{formatDate(paper.savedAt)}</time>
												</p>{/if}
											{#if paper.sharedBy && !/@(?:lid|s\.whatsapp\.net)$/.test(paper.sharedBy)}<p>
													Shared by {paper.sharedBy}
												</p>{/if}
											{#if paper.chatName}<p>{paper.chatName}</p>{/if}
										</div>
										<div class="mt-4 flex flex-wrap gap-3 text-[11px] font-medium text-zinc-600">
											{#if paper.url}<a
													href={paper.url}
													target="_blank"
													rel="noopener noreferrer"
													class="flex items-center gap-1 hover:text-black"
													>Read paper <ArrowUpRight class="h-3 w-3" /></a
												>{/if}
											{#if paper.driveUrl}<a
													href={paper.driveUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="flex items-center gap-1 hover:text-black"
													><FileText class="h-3 w-3" />Saved PDF</a
												>{/if}
										</div>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</aside>
	</div>
</section>
