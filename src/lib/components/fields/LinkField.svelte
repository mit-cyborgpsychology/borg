<script lang="ts">
	import { describeLink } from '$lib/features/links/linkNode';
	import LinkIcon from './LinkIcon.svelte';
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();
	let link = $derived(describeLink(value));
	let label = $derived(link.providerId ? link.providerName : field.label);
</script>

<div class="field-container">
	{#if mode === 'display'}
		{#if link.url}
			<button
				onclick={(event) => {
					event.stopPropagation();
					window.open(link.url, '_blank', 'noopener,noreferrer');
				}}
				class="nodrag flex w-full items-center justify-center gap-1 rounded-lg bg-borg-brown/80 p-2 text-xs font-medium transition-colors hover:bg-borg-brown/60 focus:ring-2 focus:ring-borg-blue focus:ring-offset-2 focus:outline-none"
			>
				<LinkIcon url={link.url} />
				Open {label}
			</button>
		{:else}
			<div class="py-1 text-zinc-600">{value ? 'Invalid web address' : 'No link set'}</div>
		{/if}
	{:else if readonly}
		{#if link.url}
			<a
				href={link.url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-blue-400 underline hover:text-blue-300">{value}</a
			>
		{:else}
			<div class="py-1 text-black">-</div>
		{/if}
	{:else}
		<label class="mb-1 block text-sm font-medium text-zinc-600" for={field.id}>{field.label}</label>
		<input
			id={field.id}
			type="url"
			bind:value
			placeholder={field.placeholder}
			class="w-full rounded border border-zinc-700 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
		/>
	{/if}
</div>
