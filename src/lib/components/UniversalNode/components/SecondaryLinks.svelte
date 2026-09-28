<script lang="ts">
	import { describeLink, getVisibleSecondaryLinks } from '$lib/features/links/linkNode';
	import LinkField from '../../fields/LinkField.svelte';

	let { nodeData, embedded = false } = $props<{
		nodeData: Record<string, any>;
		embedded?: boolean;
	}>();
	let fields = $derived(getVisibleSecondaryLinks(nodeData));
</script>

{#if fields.length}
	<div class={embedded ? 'space-y-2 border-t border-zinc-200 p-2' : 'space-y-2'}>
		{#each fields as field (field.id)}
			<LinkField
				field={{ ...field, label: describeLink(nodeData[field.id]).providerName }}
				value={nodeData[field.id]}
			/>
		{/each}
	</div>
{/if}
