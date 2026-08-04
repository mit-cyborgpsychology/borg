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
</script>

<div class="field-container">
	<label class="mb-1 block text-sm font-medium text-zinc-600" for={field.id}>
		{field.label}
	</label>

	{#if readonly || mode === 'display'}
		<div class="py-1 whitespace-pre-wrap text-black">
			{value || '-'}
		</div>
	{:else}
		<textarea
			id={field.id}
			bind:value
			placeholder={field.placeholder}
			rows="3"
			class="w-full resize-none rounded border border-zinc-700 bg-white px-3 py-2 text-black placeholder-zinc-400 focus:border-borg-blue focus:outline-none"
		></textarea>
	{/if}
</div>