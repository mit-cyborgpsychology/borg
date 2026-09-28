<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { Trash2 } from '@lucide/svelte';

	const id = $props.id();
	let dialog = $state<HTMLDialogElement>();
	let cancelButton = $state<HTMLButtonElement>();
	let request = $state<{ title?: string; message: string } | null>(null);
	let resolve: ((confirmed: boolean) => void) | undefined;

	function finish(confirmed: boolean) {
		const pending = resolve;
		resolve = undefined;
		dialog?.close();
		request = null;
		pending?.(confirmed);
	}

	export async function open(options: { title?: string; message: string }): Promise<boolean> {
		if (resolve) return false;
		const result = new Promise<boolean>((done) => (resolve = done));
		request = options;
		await tick();
		if (resolve && dialog) {
			dialog.showModal();
			cancelButton?.focus();
		}
		return result;
	}

	onDestroy(() => finish(false));
</script>

{#if request}
	<dialog
		bind:this={dialog}
		aria-labelledby={`${id}-title`}
		aria-describedby={`${id}-message`}
		oncancel={(event) => {
			event.preventDefault();
			finish(false);
		}}
		onclose={() => finish(false)}
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
		class="nodrag nopan fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border border-zinc-200 bg-white p-5 text-zinc-800 shadow-xl backdrop:bg-black/20"
	>
		<div class="mb-3 flex items-center gap-2">
			<Trash2 class="h-4 w-4 text-zinc-400" />
			<h2 id={`${id}-title`} class="font-sans text-base font-semibold">
				{request.title || 'Delete node?'}
			</h2>
		</div>
		<p id={`${id}-message`} class="font-mono text-xs leading-relaxed text-zinc-500">
			{request.message}
		</p>
		<div class="mt-5 flex justify-end gap-2 font-mono text-xs">
			<button
				bind:this={cancelButton}
				type="button"
				onclick={() => finish(false)}
				class="rounded-md border border-zinc-200 px-3 py-2 text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-zinc-400"
				>Cancel</button
			>
			<button
				type="button"
				onclick={() => finish(true)}
				class="rounded-md bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
				>Delete</button
			>
		</div>
	</dialog>
{/if}
