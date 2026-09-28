<script lang="ts">
	let {
		state,
		onRetry,
		pendingLabel = 'Loading…'
	} = $props<{
		state: { status: string; error: string | null };
		onRetry?: () => void;
		pendingLabel?: string;
	}>();
</script>

{#if state.status === 'loading'}
	<p role="status" class="px-4 py-2 text-sm text-zinc-500">{pendingLabel}</p>
{:else if state.error}
	<div role="alert" class="px-4 py-2 text-sm text-red-700">
		{state.error}
		{#if onRetry}<button class="ml-2 underline" onclick={onRetry}>Retry</button>{/if}
	</div>
{/if}
