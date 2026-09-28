<script lang="ts">
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

	function handleSubmit(event: Event) {
		event.preventDefault();

		if (!title.trim()) return;

		onCreate({
			title: title.trim()
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
	onclick={handleBackdropClick}
>
	<div class="w-full max-w-md rounded-lg border border-zinc-700 bg-borg-beige p-6 shadow-xl">
		<h2 class="mb-4 text-lg font-semibold text-black">Create New Project</h2>

		<form onsubmit={handleSubmit} class="space-y-4">
			{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
			<div>
				<label for="title" class="mb-1 block text-sm font-medium text-zinc-700">
					Project Name
				</label>
				<input
					id="title"
					bind:value={title}
					type="text"
					placeholder="Enter project name"
					required
					disabled={isLoading}
					class="w-full rounded border border-zinc-700 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					autofocus
				/>
			</div>

			<div class="flex gap-3 pt-4">
				<button
					type="button"
					onclick={onClose}
					disabled={isLoading}
					class="flex-1 rounded bg-borg-brown px-4 py-2 text-zinc-700 transition-colors hover:bg-borg-brown/80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					type="submit"
					disabled={!title.trim() || isLoading}
					class="flex flex-1 items-center justify-center gap-2 rounded bg-borg-violet px-4 py-2 text-white transition-colors hover:bg-borg-blue disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isLoading}
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
						></div>
						Creating...
					{:else}
						Create Project
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
