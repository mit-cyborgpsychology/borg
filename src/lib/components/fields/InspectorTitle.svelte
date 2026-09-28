<script lang="ts">
	import { tick } from 'svelte';
	import { Pencil } from '@lucide/svelte';

	let {
		value = $bindable(),
		fallback,
		automatic = false
	} = $props<{
		value: string | undefined;
		fallback: string;
		automatic?: boolean;
	}>();
	let editing = $state(false);
	let draft = $state('');
	let button = $state<HTMLButtonElement>();

	function start() {
		draft = value || '';
		editing = true;
	}

	function focus(input: HTMLInputElement) {
		input.focus();
		input.select();
	}

	async function finish(save: boolean, restoreFocus = false) {
		if (!editing) return;
		editing = false;
		if (save) value = draft.trim();
		if (restoreFocus) {
			await tick();
			button?.focus();
		}
	}
</script>

<h2
	aria-label={value || fallback}
	class="min-w-0 font-sans text-base leading-snug font-semibold text-zinc-900"
>
	{#if editing}
		<input
			use:focus
			bind:value={draft}
			aria-label="Title"
			placeholder={fallback}
			onblur={() => finish(true)}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					void finish(event.key === 'Enter', true);
				}
			}}
			class="w-full border-0 border-b border-zinc-300 bg-transparent px-0 py-1 outline-none placeholder:text-zinc-400"
		/>
	{:else}
		<button
			bind:this={button}
			type="button"
			onclick={start}
			aria-label="Edit title"
			title="Rename"
			class="group flex w-full items-start gap-2 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-zinc-400"
		>
			<span class="min-w-0 flex-1 break-words">{value || fallback}</span>
			{#if automatic && !value}<span
					title="Uses the detected link name"
					class=" mt-0.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400"
					>Auto</span
				>{/if}
			<Pencil
				class="mt-1 h-3 w-3 shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
				aria-hidden="true"
			/>
		</button>
	{/if}
</h2>
