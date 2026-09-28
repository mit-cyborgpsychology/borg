<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { describeLink, normalizeLinkUrl } from '$lib/features/links/linkNode';
	import LinkIcon from './LinkIcon.svelte';
	import { Square, PanelsTopLeft } from '@lucide/svelte';

	let { value = $bindable(), fieldActions } = $props<{
		value: { url?: string; description?: string; viewMode?: string };
		fieldActions?: Snippet<[fieldId: string]>;
	}>();
	let link = $derived(describeLink(value.url));
	let urlTouched = $state(false);
	let invalidUrl = $derived(urlTouched && !!value.url?.trim() && !link.url);

	function focusEmptyUrl(input: HTMLInputElement) {
		if (!value.url) {
			void tick().then(() => {
				if (input.isConnected) input.focus({ preventScroll: true });
			});
		}
	}

	function normalizeUrl() {
		urlTouched = true;
		const normalized = normalizeLinkUrl(value.url);
		if (normalized) value.url = normalized;
	}
</script>

<section class="border-b border-zinc-200 px-4 py-4" aria-label="Link content">
	<div class="space-y-3">
		<div>
			<div class="mb-1 flex min-h-5 items-center justify-between gap-2">
				<label for="url" class="!mb-0">URL</label>
				<div class="flex max-w-[75%] min-w-0 items-center gap-2">
					<span aria-live="polite" class="min-w-0">
						{#if link.url}
							<span
								title={`${link.providerName} · ${link.label}`}
								class="flex items-center gap-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
							>
								<LinkIcon url={value.url} size="h-3 w-3" /><span class="truncate"
									>{link.providerName}</span
								>
							</span>
						{/if}
					</span>
					{@render fieldActions?.('url')}
				</div>
			</div>
			<input
				id="url"
				use:focusEmptyUrl
				type="url"
				bind:value={value.url}
				onblur={normalizeUrl}
				spellcheck={false}
				placeholder="Paste a link…"
				aria-invalid={invalidUrl}
				aria-describedby={invalidUrl ? 'link-url-error' : undefined}
				class="w-full rounded border px-2 py-1.5 outline-none aria-invalid:!border-amber-600"
			/>
			{#if invalidUrl}<p id="link-url-error" role="status" class="mt-1 text-[11px] text-amber-700">
					Invalid URL
				</p>{/if}
		</div>
		<div>
			<div class="mb-1 flex min-h-5 items-center justify-between gap-2">
				<label for="description" class="!mb-0">Description</label>
				{@render fieldActions?.('description')}
			</div>
			<textarea
				id="description"
				aria-label="Description"
				rows="2"
				bind:value={value.description}
				placeholder="Description…"
				class="block w-full resize-y rounded border px-2 py-1.5 outline-none"
			></textarea>
		</div>
	</div>
</section>

<section class="border-b border-zinc-200 px-4 py-4" aria-label="Link display">
	<h3 class="mb-2 font-sans text-xs font-semibold text-zinc-900">View as</h3>
	<div role="group" aria-label="Link display mode" class="flex gap-1 rounded-md bg-zinc-100 p-1">
		{#each ['Node', 'Iframe'] as mode}
			<button
				type="button"
				aria-pressed={(value.viewMode || 'Node') === mode}
				onclick={() => (value.viewMode = mode)}
				title={mode === 'Node' ? 'Compact card' : 'Embedded website; some sites block embedding'}
				class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-zinc-400 {(value.viewMode ||
					'Node') === mode
					? 'bg-white text-zinc-800 shadow-sm'
					: 'text-zinc-500 hover:text-zinc-700'}"
			>
				{#if mode === 'Node'}
					<Square class="h-3.5 w-3.5" aria-hidden="true" />
				{:else}
					<PanelsTopLeft class="h-3.5 w-3.5" aria-hidden="true" />
				{/if}
				{mode}
			</button>
		{/each}
	</div>
</section>
