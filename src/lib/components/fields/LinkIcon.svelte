<script lang="ts">
	import { Code, FileText, Globe, Link, Video } from '@lucide/svelte';
	import { describeLink } from '$lib/features/links/linkNode';

	let { url, size = 'h-4 w-4' } = $props<{ url: unknown; size?: string }>();
	let link = $derived(describeLink(url));
	const logos: Record<string, string> = {
		github: '/github.svg',
		docs: '/docs.svg',
		sheets: '/sheets.svg',
		slides: '/slides.svg',
		drive: '/googledrive.svg',
		overleaf: '/overleaf.svg',
		...Object.fromEntries(
			[
				'gitlab',
				'bitbucket',
				'codeberg',
				'deepnote',
				'arxiv',
				'doi',
				'pubmed',
				'acm',
				'ieee',
				'notion',
				'youtube',
				'vimeo',
				'figma',
				'dropbox',
				'miro',
				'huggingface',
				'kaggle',
				'zenodo',
				'osf',
				'codesandbox',
				'stackblitz',
				'googlecolab',
				'observable'
			].map((id) => [id, `/link-icons/${id}.svg`])
		)
	};
	let logo = $derived(logos[link.providerId]);
	let Icon = $derived(
		link.kind === 'code'
			? Code
			: link.kind === 'paper' || link.kind === 'document'
				? FileText
				: link.kind === 'video'
					? Video
					: link.kind === 'website'
						? Globe
						: Link
	);
</script>

{#if logo}
	<img src={logo} alt="" class="shrink-0 {size}" />
{:else}
	<Icon class="shrink-0 {size}" aria-hidden="true" />
{/if}
