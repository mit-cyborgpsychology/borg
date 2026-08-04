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
		<div class="py-1 text-black">
			{#if value}
				{@const targetDate = new Date(value)}
				{@const now = new Date()}
				{#if targetDate > now}
					{@const timeDiff = targetDate.getTime() - now.getTime()}
					{@const days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24))}
					<div class="space-y-1">
						<div class="font-medium text-yellow-400">
							{days} day{days !== 1 ? 's' : ''} remaining
						</div>
						<div class="text-sm text-zinc-600">
							{targetDate.toLocaleDateString()}
						</div>
					</div>
				{:else}
					{targetDate.toLocaleDateString()}
				{/if}
			{:else}
				-
			{/if}
		</div>
	{:else}
		<input
			id={field.id}
			type="date"
			bind:value
			class="w-full rounded border border-zinc-700 bg-white px-3 py-2 text-black focus:border-borg-blue focus:outline-none"
		/>
	{/if}
</div>