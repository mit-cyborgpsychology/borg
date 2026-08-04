<script lang="ts">
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display'
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
	}>();

	let showTagInput = $state(false);

	function handleTagsInput(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.target) {
			const input = event.target as HTMLInputElement;
			const newTag = input.value.trim();
			if (newTag) {
				// Initialize as empty array if undefined
				if (!value || !Array.isArray(value)) {
					value = [];
				}
				if (!value.includes(newTag)) {
					value = [...value, newTag];
					input.value = '';
					showTagInput = false;
				}
			}
		} else if (event.key === 'Escape') {
			showTagInput = false;
		}
	}

	function removeTag(tagToRemove: string) {
		if (value && Array.isArray(value)) {
			value = value.filter((tag: string) => tag !== tagToRemove);
		}
	}
</script>

<div class="field-container">
	<span class="mb-1 block text-sm font-medium text-zinc-600">
		{field.label}
	</span>

	<div class="space-y-2">
		<div class="flex flex-wrap gap-1">
			{#if value && Array.isArray(value) && value.length > 0}
				{#each value as tag}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-black px-2 py-1 text-xs text-white"
					>
						{tag}
						{#if !readonly}
							<button onclick={() => removeTag(tag)} class="hover:text-red-300"> × </button>
						{/if}
					</span>
				{/each}
			{/if}

			{#if !readonly && mode === 'edit'}
				<div class="relative">
					<button
						type="button"
						onclick={() => (showTagInput = !showTagInput)}
						class="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-white px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-700"
					>
						<span>+</span>
					</button>

					{#if showTagInput}
						<input
							type="text"
							placeholder={field.placeholder}
							onkeydown={handleTagsInput}
							onblur={() => (showTagInput = false)}
							class="absolute top-0 left-0 z-10 w-32 rounded border border-zinc-700 bg-white px-2 py-1 text-xs text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
							autofocus
						/>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>