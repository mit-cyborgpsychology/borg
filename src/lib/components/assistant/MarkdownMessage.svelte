<script lang="ts">
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let { text }: { text: string } = $props();
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	// DOMPurify needs a browser DOM. SSR uses escaped plain text until mount.
	let html = $derived(
		mounted
			? DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }), {
					ALLOWED_TAGS: [
						'p',
						'br',
						'strong',
						'em',
						'del',
						'blockquote',
						'pre',
						'code',
						'ul',
						'ol',
						'li',
						'h1',
						'h2',
						'h3',
						'h4',
						'h5',
						'h6',
						'hr',
						'a',
						'table',
						'thead',
						'tbody',
						'tr',
						'th',
						'td'
					],
					ALLOWED_ATTR: ['href', 'title', 'start'],
					ALLOW_DATA_ATTR: false,
					ALLOW_ARIA_ATTR: false
				})
			: ''
	);
</script>

<div class="markdown-message min-w-0 font-sans text-xs leading-relaxed text-zinc-800">
	{#if mounted}
		<!-- HTML is parsed by Marked and sanitized with a restricted DOMPurify allowlist above. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}
	{:else}<p class="whitespace-pre-wrap">{text}</p>{/if}
</div>

<style>
	.markdown-message {
		overflow-wrap: anywhere;
	}
	.markdown-message :global(p),
	.markdown-message :global(ul),
	.markdown-message :global(ol),
	.markdown-message :global(blockquote),
	.markdown-message :global(pre),
	.markdown-message :global(table) {
		margin: 0.6rem 0;
	}
	.markdown-message :global(:first-child) {
		margin-top: 0;
	}
	.markdown-message :global(:last-child) {
		margin-bottom: 0;
	}
	.markdown-message :global(h1),
	.markdown-message :global(h2),
	.markdown-message :global(h3),
	.markdown-message :global(h4),
	.markdown-message :global(h5),
	.markdown-message :global(h6) {
		margin: 1rem 0 0.4rem;
		font-size: 0.8125rem;
		font-weight: 600;
	}
	.markdown-message :global(ul) {
		list-style: disc;
		padding-left: 1.25rem;
	}
	.markdown-message :global(ol) {
		list-style: decimal;
		padding-left: 1.25rem;
	}
	.markdown-message :global(li) {
		margin: 0.2rem 0;
	}
	.markdown-message :global(a) {
		text-decoration: underline;
		text-underline-offset: 2px;
		color: var(--color-borg-blue);
	}
	.markdown-message :global(blockquote) {
		border-left: 2px solid var(--color-zinc-300);
		padding-left: 0.75rem;
		color: var(--color-zinc-500);
	}
	.markdown-message :global(code) {
		border-radius: 3px;
		background: var(--color-zinc-100);
		padding: 0.1rem 0.25rem;
		font-size: 0.8em;
	}
	.markdown-message :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--color-zinc-200);
		border-radius: 6px;
		background: var(--color-zinc-50);
		padding: 0.75rem;
	}
	.markdown-message :global(pre code) {
		padding: 0;
		background: transparent;
	}
	.markdown-message :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
		font-size: 0.75rem;
	}
	.markdown-message :global(th),
	.markdown-message :global(td) {
		border: 1px solid var(--color-zinc-200);
		padding: 0.35rem 0.5rem;
		text-align: left;
	}
	.markdown-message :global(th) {
		background: var(--color-zinc-50);
	}
	.markdown-message :global(hr) {
		margin: 1rem 0;
		border-color: var(--color-zinc-200);
	}
</style>
