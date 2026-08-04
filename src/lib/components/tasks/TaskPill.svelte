<script lang="ts">
	import type { PersonTaskCount } from '../../types/task';
	import { getPersonCached } from '../../stores/peopleCache.svelte';

	interface Props {
		personTaskCount: PersonTaskCount;
		onclick?: () => void;
	}

	let { personTaskCount, onclick }: Props = $props();
	let person = $derived(getPersonCached(personTaskCount.personId));
</script>

<button
	class="inline-flex items-center gap-1 rounded-full border border-black bg-borg-orange px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-borg-orange/90"
	onclick={(event) => {
		event.stopPropagation();
		onclick?.();
	}}
>
	<span>{person?.name || 'Unknown'}</span>
	<span class="text-rose-300">({personTaskCount.count})</span>
</button>
