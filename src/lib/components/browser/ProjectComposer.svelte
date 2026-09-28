<script lang="ts">
	import { onMount } from 'svelte';
	import { FolderPlus, X } from '@lucide/svelte';
	let {
		onCreate,
		onClose,
		isLoading = false,
		error = null
	} = $props<{
		onCreate: (data: { title: string }) => void;
		onClose: () => void;
		isLoading?: boolean;
		error?: string | null;
	}>();
	let title = $state('');
	let input: HTMLInputElement;
	onMount(() => input.focus());
</script>

<section aria-label="New project" class="shrink-0 border-b border-zinc-200 bg-white p-4">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			if (title.trim() && !isLoading) onCreate({ title: title.trim() });
		}}
		class="mx-auto flex max-w-2xl items-center gap-3"
	>
		<FolderPlus class="h-5 w-5 shrink-0 text-zinc-400" />
		<input
			bind:this={input}
			bind:value={title}
			aria-label="Project name"
			placeholder="Name your project…"
			disabled={isLoading}
			required
			class="min-w-0 flex-1 bg-transparent py-2 font-sans text-base focus:outline-none"
		/>
		<button
			type="submit"
			disabled={isLoading || !title.trim()}
			class="rounded-md bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-40"
			>{isLoading ? 'Creating…' : 'Create project'}</button
		>
		<button
			type="button"
			onclick={onClose}
			disabled={isLoading}
			aria-label="Cancel new project"
			class="rounded p-1 text-zinc-400 hover:bg-zinc-100"><X class="h-4 w-4" /></button
		>
	</form>
	{#if error}<p role="alert" class="mx-auto mt-2 max-w-2xl text-xs text-red-700">{error}</p>{/if}
</section>
