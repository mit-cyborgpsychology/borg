<script lang="ts">
	let {
		nodeData,
		isEditingTitle = $bindable(),
		onSave,
		isProjectNode = false,
		isBeingEdited = false,
		fallbackTitle = 'Untitled'
	} = $props<{
		nodeData: any;
		isEditingTitle: boolean;
		onSave: (title: string) => void;
		isProjectNode?: boolean;
		isBeingEdited?: boolean;
		fallbackTitle?: string;
	}>();

	let titleContent = $state('');
	let titleInput = $state<HTMLInputElement>();

	function startTitleEdit() {
		if (isProjectNode) return; // Don't allow editing project titles
		if (isBeingEdited) return; // Don't allow editing if edit panel is open
		if (nodeData.locked) return; // Don't allow editing if node is locked

		isEditingTitle = true;
		titleContent = nodeData.title || '';

		// Focus the input after it's rendered
		setTimeout(() => {
			if (titleInput) {
				titleInput.focus();
				titleInput.select();
			}
		}, 0);
	}

	function saveTitleContent() {
		onSave(titleContent);
		isEditingTitle = false;
	}

	function handleTitleBlur() {
		saveTitleContent();
	}

	function handleTitleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveTitleContent();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			titleContent = nodeData.title || '';
			isEditingTitle = false;
		}
	}

	function handleTitleClick(event: MouseEvent) {
		if (isProjectNode) return; // Project titles can't be edited
		if (isBeingEdited) return; // Don't allow editing if edit panel is open
		if (nodeData.locked) return; // Don't allow editing if node is locked

		event.stopPropagation(); // Prevent node click when clicking title
		startTitleEdit();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if isEditingTitle}
	<input
		bind:this={titleInput}
		bind:value={titleContent}
		onblur={handleTitleBlur}
		onkeydown={handleTitleKeydown}
		class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-black focus:ring-2 focus:ring-borg-blue focus:outline-none {isProjectNode
			? 'text-xl font-semibold'
			: 'text-base'}"
		placeholder={fallbackTitle}
	/>
{:else}
	<div
		onclick={handleTitleClick}
		class="{isProjectNode || nodeData.locked
			? ''
			: 'cursor-text'} py-1 font-semibold text-black {isProjectNode
			? '-mt-2 text-3xl'
			: 'font-sans text-base leading-snug text-balance'}"
	>
		{nodeData.title || fallbackTitle}
	</div>
{/if}
