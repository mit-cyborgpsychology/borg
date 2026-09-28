<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { describeLink, normalizeLinkUrl } from '$lib/features/links/linkNode';
	import LinkIcon from './LinkIcon.svelte';

	let {
		id,
		label = 'URL',
		value = $bindable(),
		focusWhenEmpty = false,
		actions
	} = $props<{
		id: string;
		label?: string;
		value?: string;
		focusWhenEmpty?: boolean;
		actions?: Snippet;
	}>();
	let link = $derived(describeLink(value));
	let touched = $state(false);
	let invalid = $derived(touched && !!value?.trim() && !link.url);

	function focusEmptyUrl(input: HTMLInputElement) {
		if (focusWhenEmpty && !value) {
			void tick().then(() => {
				if (input.isConnected) input.focus({ preventScroll: true });
			});
		}
	}

	function normalizeUrl() {
		touched = true;
		const normalized = normalizeLinkUrl(value);
		if (normalized) value = normalized;
	}
</script>

<div>
	<div class="mb-1 flex min-h-5 items-center justify-between gap-2">
		<label for={id} class="!mb-0">{label}</label>
		<div class="flex max-w-[75%] min-w-0 items-center gap-2">
			<span aria-live="polite" class="min-w-0">
				{#if link.url}
					<span
						title={`${link.providerName} · ${link.label}`}
						class="flex items-center gap-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500"
					>
						<LinkIcon url={value} size="h-3 w-3" /><span class="truncate">{link.providerName}</span>
					</span>
				{/if}
			</span>
			{@render actions?.()}
		</div>
	</div>
	<input
		{id}
		use:focusEmptyUrl
		type="url"
		bind:value
		onblur={normalizeUrl}
		spellcheck={false}
		placeholder="Paste a link…"
		aria-invalid={invalid}
		aria-describedby={invalid ? `${id}-error` : undefined}
		class="w-full rounded border px-2 py-1.5 outline-none aria-invalid:!border-amber-600"
	/>
	{#if invalid}
		<p id={`${id}-error`} role="status" class="mt-1 text-[11px] text-amber-700">Invalid URL</p>
	{/if}
</div>
