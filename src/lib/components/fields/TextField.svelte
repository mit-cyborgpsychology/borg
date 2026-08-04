<script lang="ts">
	import type { TemplateField } from '../../templates';

	let {
		field,
		value = $bindable(),
		readonly = false,
		mode = 'display',
		isProjectTitle = false
	} = $props<{
		field: TemplateField;
		value: any;
		readonly?: boolean;
		mode?: 'display' | 'edit';
		isProjectTitle?: boolean;
	}>();
</script>

<div class="field-container">
	{#if !(field.id === 'title' && mode === 'display')}
		<label class="mb-1 block text-sm font-medium text-zinc-600" for={field.id}>
			{field.label}
		</label>
	{/if}

	{#if readonly || mode === 'display'}
		<div
			class="py-1 font-semibold text-black {isProjectTitle
				? '-mt-2 text-3xl'
				: field.id === 'title'
					? 'font-sans text-lg text-balance'
					: ''}"
		>
			{value || '-'}
		</div>
	{:else}
		<input
			id={field.id}
			type="text"
			bind:value
			placeholder={field.placeholder}
			class="w-full rounded border border-zinc-200 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
		/>
	{/if}
</div>