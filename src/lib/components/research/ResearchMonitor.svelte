<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw } from '@lucide/svelte';
	import type { createResearchState } from '$lib/features/research/createResearchState';
	let { feature }: { feature: ReturnType<typeof createResearchState> } = $props();
	const resource = feature.status;
	const submission = feature.submission;
	const loading = $derived($resource.status === 'loading');
	const jobs = $derived($resource.data?.submissions || []);
	const labels = {
		queued: 'Queued',
		processing: 'Processing',
		saved: 'Saved',
		already_saved: 'Already saved',
		not_paper: 'Not a paper',
		failed: 'Failed'
	};
	function date(value: string) {
		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Unknown time';
	}
	onMount(() => {
		const check = () => {
			if (!document.hidden && !loading) void feature.checkStatus();
		};
		check();
		const timer = setInterval(check, 30_000);
		document.addEventListener('visibilitychange', check);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', check);
		};
	});
</script>

<section
	id="references-monitor"
	aria-label="References status monitor"
	class="max-h-[45vh] shrink-0 overflow-y-auto border-b border-zinc-200 bg-zinc-50 px-4 py-3"
>
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<div>
			<h2 class="text-xs font-semibold text-zinc-800">Service status</h2>
			<p class="mt-1 text-[10px] text-zinc-500">
				Checks every 30 seconds while open. {#if $resource.data}Last checked {date(
						$resource.data.checkedAt
					)}.{/if}
			</p>
		</div>
		<button
			type="button"
			onclick={() => void feature.checkStatus()}
			disabled={loading}
			class="flex items-center gap-1.5 rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 disabled:opacity-50"
			><RefreshCw class="h-3 w-3 {loading ? 'animate-spin' : ''}" />{loading
				? 'Checking…'
				: 'Check now'}</button
		>
	</div>
	{#if $resource.error}<p role="alert" class="mb-3 text-xs text-red-700">
			{$resource.error} Previous results may be out of date.
		</p>{/if}
	{#if !$resource.data && loading}<p role="status" class="text-xs text-zinc-500">
			Checking services…
		</p>{/if}
	{#if $resource.data}
		<ul aria-label="Service checks" class="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
			{#each $resource.data.checks as check (check.id)}
				<li>
					<div class="flex items-center gap-2 text-xs">
						<span
							aria-hidden="true"
							class="h-1.5 w-1.5 rounded-full {check.status === 'ok'
								? 'bg-emerald-600'
								: check.status === 'error'
									? 'bg-red-500'
									: 'bg-amber-500'}"
						></span>
						<span class="font-medium text-zinc-700">{check.name}</span>
						<span class="text-[10px] text-zinc-500"
							>{check.status === 'ok'
								? 'Healthy'
								: check.status === 'error'
									? 'Unavailable'
									: 'Not configured'}</span
						>
					</div>
					<p class="mt-1 pl-3.5 text-[11px] text-zinc-500">
						{check.message}{#if check.updatedAt}
							Updated {date(check.updatedAt)}.{/if}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="mt-4 border-t border-zinc-200 pt-3">
		<h3 class="text-xs font-medium text-zinc-700">Your recent web submissions</h3>
		{#if $submission.data && !jobs.some((job) => job.id === $submission.data?.id)}
			<p class="mt-2 text-xs text-zinc-600">
				{labels[$submission.data.status]} · {$submission.data.title || $submission.data.url}
			</p>
			<p class="mt-1 text-[11px] text-zinc-500">{$submission.data.message}</p>
		{/if}
		{#if jobs.length}
			<ul class="mt-2 divide-y divide-zinc-200">
				{#each jobs as saved (saved.id)}
					{@const job =
						$submission.data?.id === saved.id && $submission.data.updatedAt > saved.updatedAt
							? $submission.data
							: saved}
					<li class="py-2 text-xs">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<span class="min-w-0 break-all text-zinc-700">{job.title || job.url}</span><span
								class={job.status === 'failed' ? 'text-red-700' : 'text-zinc-500'}
								>{labels[job.status]}</span
							>
						</div>
						<p class="mt-1 text-[11px] text-zinc-500">{job.message} · {date(job.updatedAt)}</p>
					</li>
				{/each}
			</ul>
		{:else if $resource.data && !$submission.data}
			<p class="mt-2 text-[11px] text-zinc-500">
				{$resource.data.checks.find((c) => c.id === 'queue')?.status === 'ok'
					? 'No web submissions yet.'
					: 'Submission history is unavailable until the queue check succeeds.'}
			</p>
		{/if}
	</div>
</section>
