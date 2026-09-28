<script lang="ts">
	import { onMount } from 'svelte';
	import { MousePointer2, ListTodo, BookOpen, Library, Paintbrush, Bot, X } from '@lucide/svelte';

	const version = '1.2';
	let dialog: HTMLDialogElement;
	const updates = [
		{
			icon: MousePointer2,
			title: 'Right-click menus',
			description: 'Add nodes and access quick actions right where you’re working.'
		},
		{
			icon: ListTodo,
			title: 'Redesigned Tasks & Timeline',
			description: 'Hopefully usable this time'
		},
		{
			icon: BookOpen,
			title: 'Wiki integration',
			description: 'Create and edit wiki documents directly in BORG!'
		},
		{
			icon: Library,
			title: 'References database',
			description: 'Papers synced from WhatsApp, searchable and mapped out for exploring.'
		},
		{
			icon: Paintbrush,
			title: 'Redesigned UI & infrastructure',
			description: 'Prettier and faster (Hopefully?)'
		},
		{
			icon: Bot,
			title: 'AGI/RSI Agent (coming soon??)',
			description: 'An AI savior that can save everything and everyone (in development)'
		}
	];

	onMount(() => {
		const key = `borg:welcome:${version}`;
		try {
			if (localStorage.getItem(key) === 'seen') return;
			dialog.showModal();
			localStorage.setItem(key, 'seen');
		} catch {
			// Keep the welcome usable if the browser blocks local storage.
			if (!dialog.open) dialog.showModal();
		}
	});
</script>

<dialog
	bind:this={dialog}
	aria-labelledby="release-welcome-title"
	class="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[620px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-800 backdrop:bg-black/20"
>
	<header
		class="flex items-center justify-between gap-4 border-b border-zinc-200 bg-borg-beige px-5 py-4"
	>
		<h1 id="release-welcome-title" class="text-base font-medium">Welcome to BORG v1.2!</h1>
		<button
			type="button"
			onclick={() => dialog.close()}
			aria-label="Close welcome"
			class="cursor-pointer rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
			><X class="h-4 w-4" /></button
		>
	</header>
	<ul class="grid grid-cols-1 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-2">
		{#each updates as update (update.title)}
			<li class="flex items-start gap-3">
				<update.icon class="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
				<div>
					<h2 class="text-sm font-medium">{update.title}</h2>
					<p class="mt-1 font-sans text-xs leading-relaxed text-balance text-zinc-500">
						{update.description}
					</p>
				</div>
			</li>
		{/each}
	</ul>
	<footer class="flex justify-end border-t border-zinc-200 px-5 py-3">
		<button
			type="button"
			onclick={() => dialog.close()}
			class="cursor-pointer rounded border border-borg-brown bg-borg-beige px-4 py-2 text-xs text-zinc-800 hover:bg-borg-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
			>Let me innnn</button
		>
	</footer>
</dialog>
