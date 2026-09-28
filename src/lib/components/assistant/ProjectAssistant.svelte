<script lang="ts">
	import MarkdownMessage from './MarkdownMessage.svelte';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport, isToolUIPart } from 'ai';
	import { onMount, onDestroy, tick } from 'svelte';
	import {
		Bot,
		X,
		ArrowUp,
		Square,
		Plus,
		LoaderCircle,
		Check,
		ArrowUpRight,
		FileText,
		Workflow,
		ListTodo
	} from '@lucide/svelte';
	import { getAppServices } from '$lib/app/context';
	let {
		projectSlug,
		selectedNodes,
		onOpenTasks,
		onOpenNode,
		open = $bindable(false)
	}: {
		open?: boolean;
		projectSlug: string;
		selectedNodes: { id: string; title: string }[];
		onOpenTasks: (nodeId: string) => void;
		onOpenNode: (nodeId: string) => void;
	} = $props();
	const { assistantService, authStore } = getAppServices();
	let draft = $state('');
	let excluded = $state<string[]>([]);
	let ready = $state(false);
	let list = $state<HTMLDivElement>();
	const chat = new Chat({
		transport: new DefaultChatTransport({
			fetch: (_url, options) =>
				assistantService.request(
					projectSlug,
					selectedNodes
						.filter((n) => !excluded.includes(n.id))
						.map((n) => n.id)
						.slice(0, 50),
					String(options?.body || '{}'),
					options?.signal
				)
		})
	});
	let busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');
	let historyOwner = '';
	let historyKey = '';
	const storageKey = () => historyKey;
	onMount(() => {
		historyOwner = $authStore.user?.uid || '';
		if (!historyOwner) return;
		historyKey = `borg:assistant:${historyOwner}:${projectSlug}`;
		try {
			const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]');
			if (
				Array.isArray(saved) &&
				saved.every(
					(message) =>
						message &&
						typeof message.id === 'string' &&
						['user', 'assistant'].includes(message.role) &&
						Array.isArray(message.parts) &&
						message.parts.every((part: { type?: unknown }) => part && typeof part.type === 'string')
				)
			)
				chat.messages = saved.slice(-40);
		} catch {
			/* Ignore unavailable or outdated local history. */
		}
		ready = true;
	});
	onDestroy(() => {
		void chat.stop();
	});
	$effect(() => {
		const messages = JSON.stringify(chat.messages.slice(-40));
		if (ready && historyOwner && $authStore.user?.uid === historyOwner) {
			try {
				localStorage.setItem(storageKey(), messages);
			} catch {
				/* Chat still works without persistence. */
			}
		}
		void tick().then(() => {
			if (list) list.scrollTop = list.scrollHeight;
		});
	});
	async function send() {
		if (!draft.trim() || busy) return;
		const text = draft.trim();
		draft = '';
		await chat.sendMessage({ text });
	}
	function newChat() {
		if (busy) return;
		chat.messages = [];
		chat.clearError();
	}
	function createdTask(
		output: unknown
	): { title: string; nodeId: string; kind: 'task' | 'node' } | null {
		if (
			output &&
			typeof output === 'object' &&
			'status' in output &&
			['created', 'node-created'].includes(String(output.status)) &&
			'title' in output &&
			'nodeId' in output
		)
			return {
				title: String(output.title),
				nodeId: String(output.nodeId),
				kind: output.status === 'node-created' ? 'node' : 'task'
			};
		return null;
	}
</script>

{#if open}
	<aside
		aria-label="Project assistant"
		class="flex h-full w-80 max-w-[85vw] shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white text-zinc-800 max-sm:pt-14"
	>
		<header
			class="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200/70 px-5"
		>
			<div class="flex items-center gap-2.5">
				<Bot class="h-4 w-4 text-zinc-500" />
				<h2 class="text-xs font-medium">Talking BORG</h2>
			</div>
			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={newChat}
					disabled={busy}
					title="New chat"
					aria-label="New chat"
					class="rounded-md p-1.5 text-zinc-400 hover:bg-borg-beige hover:text-zinc-800"
					><Plus class="h-4 w-4" /></button
				>
				<button
					type="button"
					onclick={() => (open = false)}
					title="Close assistant"
					aria-label="Close assistant"
					class="rounded-md p-1.5 text-zinc-400 hover:bg-borg-beige hover:text-zinc-800"
					><X class="h-4 w-4" /></button
				>
			</div>
		</header>

		{#if selectedNodes.length}
			<div class="flex flex-wrap gap-1 border-b border-zinc-100 px-3 py-2">
				{#each selectedNodes
					.filter((n) => !excluded.includes(n.id))
					.slice(0, 50) as node (node.id)}<button
						type="button"
						onclick={() => (excluded = [...excluded, node.id])}
						class="flex max-w-full items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px]"
						title="Remove from selected context"
						><span class="truncate">{node.title}</span><X class="h-3 w-3 shrink-0" /></button
					>{/each}
			</div>
		{/if}
		<div bind:this={list} class="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
			{#if !chat.messages.length}
				<div class="pt-10 pb-6">
					<div
						class="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-borg-brown/60 bg-borg-beige"
					>
						<Bot class="h-5 w-5 text-zinc-600" />
					</div>
					<h3 class="text-sm font-medium tracking-tight">What are we working on?</h3>
					<p class="mt-2 max-w-72 font-sans text-xs leading-relaxed text-zinc-500">
						Think through this project, organize your canvas, or turn an idea into a task.
					</p>
				</div>
				<div class="space-y-1">
					{#each [{ icon: FileText, label: 'Catch me up', hint: 'Summarize this project', prompt: 'Summarize this project' }, { icon: Workflow, label: 'Map out an idea', hint: 'Create and connect notes', prompt: 'Create three notes for planning, experiments, and results, and connect them' }, { icon: ListTodo, label: 'Make it actionable', hint: 'Turn selected notes into tasks', prompt: 'Turn the selected notes into tasks assigned to me' }] as suggestion (suggestion.label)}
						<button
							type="button"
							onclick={() => (draft = suggestion.prompt)}
							class="group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-borg-beige/70"
						>
							<suggestion.icon class="h-4 w-4 shrink-0 text-zinc-400" />
							<span class="min-w-0 flex-1"
								><span class="block text-xs font-medium text-zinc-700">{suggestion.label}</span
								><span class="mt-0.5 block font-sans text-[11px] text-zinc-400"
									>{suggestion.hint}</span
								></span
							>
							<ArrowUpRight class="h-3.5 w-3.5 text-zinc-300 group-hover:text-zinc-600" />
						</button>
					{/each}
				</div>
			{/if}

			{#each chat.messages as message (message.id)}
				<div
					class="space-y-2"
					class:rounded-xl={message.role === 'user'}
					class:bg-borg-beige={message.role === 'user'}
					class:px-3={message.role === 'user'}
					class:py-3={message.role === 'user'}
				>
					<div class="text-[10px] text-zinc-400">{message.role === 'user' ? 'You' : 'BORG'}</div>
					{#each message.parts as part, index (`${message.id}-${index}`)}
						{#if part.type === 'text'}
							{#if message.role === 'assistant'}
								<MarkdownMessage text={part.text} />
							{:else}<p class="font-sans text-xs leading-relaxed break-words whitespace-pre-wrap">
									{part.text}
								</p>{/if}
						{:else if isToolUIPart(part)}
							<div
								class="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600"
							>
								{#if part.state === 'output-available'}
									{@const task = createdTask(part.output)}
									{#if task}<span class="flex items-center gap-2"
											><Check class="h-3 w-3" />
											{task.kind === 'node' ? 'Node created' : 'Task created'}</span
										><button
											type="button"
											class="mt-1 block text-left underline"
											onclick={() => {
												if (task.kind === 'node') onOpenNode(task.nodeId);
												else onOpenTasks(task.nodeId);
												open = false;
											}}>{task.title}</button
										>
									{:else}<span class="flex items-center gap-2"
											><Check class="h-3 w-3" />
											{part.type === 'tool-connectNodes'
												? 'Nodes connected'
												: 'Read project context'}</span
										>{/if}
								{:else if part.state === 'output-error'}<span class="text-red-700"
										>{part.errorText}</span
									>
								{:else}<span class="flex items-center gap-2"
										><LoaderCircle class="h-3 w-3 animate-spin" />{part.type === 'tool-createTask'
											? 'Creating task…'
											: part.type === 'tool-createNode'
												? 'Creating node…'
												: part.type === 'tool-connectNodes'
													? 'Connecting nodes…'
													: 'Reading project…'}</span
									>{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/each}
			{#if busy}<p role="status" class="text-xs text-zinc-400">Working…</p>{/if}
			{#if chat.error}<p role="alert" class="font-sans text-xs text-red-700">
					{chat.error.message}
				</p>{/if}
		</div>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void send();
			}}
			class="m-4 mt-0 rounded-xl border border-zinc-300 bg-white p-3 focus-within:border-zinc-400"
		>
			<textarea
				bind:value={draft}
				aria-label="Message assistant"
				placeholder="Ask anything, or describe what to create…"
				rows="3"
				maxlength="12000"
				class="max-h-40 w-full resize-none bg-transparent px-1 py-1 font-sans text-xs leading-relaxed outline-none placeholder:text-zinc-400"
				onkeydown={(event) => {
					if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
						event.preventDefault();
						void send();
					}
				}}
			></textarea>
			<div class="mt-2 flex items-center justify-between">
				<span class="text-[10px] text-zinc-400">GPT-6 Luna</span>
				{#if busy}<button
						type="button"
						onclick={() => void chat.stop()}
						aria-label="Stop assistant"
						class="rounded border border-zinc-200 p-2"><Square class="h-3 w-3" /></button
					>
				{:else}<button
						type="submit"
						disabled={!draft.trim()}
						aria-label="Send message"
						class="rounded-lg bg-zinc-800 p-2 text-white hover:bg-zinc-700"
						><ArrowUp class="h-4 w-4" /></button
					>{/if}
			</div>
		</form>
	</aside>
{/if}

<style>
	button:not(:disabled) {
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
</style>
