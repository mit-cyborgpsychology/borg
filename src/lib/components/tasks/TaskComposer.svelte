<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Loader2, Plus } from '@lucide/svelte';
	import { getAppServices } from '$lib/app/context';
	import { createTaskCommands } from '$lib/features/tasks/createTaskCommands';

	let { nodeId, projectSlug, onTasksUpdated } = $props<{
		nodeId: string;
		projectSlug?: string;
		onTasksUpdated?: () => void | Promise<void>;
	}>();
	const { taskService, authStore } = getAppServices();
	const commands = createTaskCommands(taskService, async () => onTasksUpdated?.());
	const command = commands.command;
	let title = $state('');
	let input: HTMLInputElement;
	let saving = $derived($command.status === 'loading');
	onDestroy(() => commands.dispose());

	async function add(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim() || saving) return;
		const result = await commands.add(
			{ nodeId, projectSlug },
			{ title: title.trim(), assignee: $authStore.user?.uid || '', status: 'active' }
		);
		if (result.ok) {
			title = '';
			// Keep typing, but don't steal focus if the user has moved elsewhere.
			if (document.activeElement === input || event.submitter === document.activeElement)
				input.focus();
		}
	}
</script>

<form onsubmit={add} aria-label="Add task" class="nodrag nopan space-y-1">
	<div
		class="flex items-center gap-1 rounded focus-within:bg-white focus-within:ring-1 focus-within:ring-zinc-200"
	>
		<button
			type="submit"
			aria-label="Add task"
			aria-disabled={saving || !title.trim()}
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-zinc-400"
		>
			{#if saving}<Loader2 class="h-3.5 w-3.5 animate-spin" />{:else}<Plus
					class="h-3.5 w-3.5"
				/>{/if}
		</button>
		<input
			bind:this={input}
			bind:value={title}
			aria-label="New task"
			aria-busy={saving}
			placeholder="Add a task…"
			readonly={saving}
			onkeydown={(event) => event.stopPropagation()}
			class="min-w-0 flex-1 bg-transparent py-1.5 pr-2 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none"
		/>
	</div>
	{#if $command.error}<p role="alert" class="px-1 text-xs text-red-700">{$command.error}</p>{/if}
</form>
