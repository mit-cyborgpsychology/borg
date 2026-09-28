<script lang="ts">
	import { tick } from 'svelte';
	import { X, LoaderCircle } from '@lucide/svelte';
	import type { createResearchState } from '$lib/features/research/createResearchState';
	let { feature }: { feature: ReturnType<typeof createResearchState> } = $props();
	const submission = feature.submission;
	let visible = $state(false);
	let previousFocus: HTMLElement | null = null;
	let input = $state<HTMLInputElement>();
	let url = $state('');
	const pending = $derived(
		$submission.data?.status === 'queued' || $submission.data?.status === 'processing'
	);
	const busy = $derived($submission.status === 'loading' || (pending && !$submission.error));
	const failed = $derived(
		$submission.data?.status === 'failed' || $submission.data?.status === 'not_paper'
	);
	export async function open() {
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		visible = true;
		await tick();
		input?.focus();
	}
	export function close() {
		const focusInside = input?.closest('section')?.contains(document.activeElement);
		visible = false;
		if (focusInside) previousFocus?.focus({ preventScroll: true });
	}
</script>

{#if visible}
	<section
		aria-labelledby="add-paper-title"
		class="max-h-[45vh] overflow-auto border-b border-zinc-200 bg-white p-4 text-zinc-800"
	>
		<div class="mx-auto max-w-2xl">
			<div class="mb-3 flex items-center justify-between">
				<h2 id="add-paper-title" class="font-sans text-sm font-semibold">Add paper</h2>
				<button
					type="button"
					aria-label="Close add paper"
					class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
					onclick={close}><X class="h-4 w-4" /></button
				>
			</div>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					if (!busy) void feature.submitPaper(url.trim());
				}}
			>
				<label for="paper-url" class="mb-2 block text-xs font-medium">Paper URL</label>
				<input
					bind:this={input}
					id="paper-url"
					type="url"
					required
					maxlength="2048"
					bind:value={url}
					disabled={busy}
					placeholder="https://arxiv.org/abs/…"
					class="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-600 disabled:opacity-60"
				/>
				{#if $submission.error}
					<div role="alert" class="mt-4 text-xs text-red-700">{$submission.error}</div>
					{#if pending}<button
							type="button"
							class="mt-2 text-xs underline"
							onclick={() => void feature.checkSubmission()}>Check status again</button
						>{/if}
				{:else if $submission.data}
					<div
						role={failed ? 'alert' : 'status'}
						class="mt-4 text-xs leading-relaxed {failed ? 'text-red-700' : 'text-zinc-600'}"
					>
						{#if pending}<LoaderCircle class="mr-1 inline h-3 w-3 animate-spin" />{/if}{$submission
							.data.message}
						{#if $submission.data.title}<p class="mt-1 font-medium">
								{$submission.data.title}
							</p>{/if}
					</div>
				{/if}
				<div class="mt-5 flex justify-end gap-2">
					<button
						type="button"
						class="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
						onclick={close}>Close</button
					>
					<button
						type="submit"
						disabled={busy}
						class="rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-50"
						>{busy ? 'Adding paper…' : 'Add paper'}</button
					>
				</div>
			</form>
		</div>
	</section>
{/if}
