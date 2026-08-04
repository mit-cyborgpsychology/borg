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

	function getStatusColor(status: string): string {
		const statusColors: Record<string, string> = {
			Done: 'bg-green-400 text-black',

			// Publication statuses for papers
			Draft: 'bg-gray-300 text-black',
			'Under Review': 'bg-yellow-500 text-black',
			Accepted: 'bg-green-500 text-black',
			Published: 'bg-blue-400 text-black'
		};

		return statusColors[status] || 'bg-zinc-500/20 text-zinc-600';
	}
</script>

<div class="field-container">
	<span class="mb-1 block text-sm font-medium text-zinc-600">
		{field.label}
	</span>

	<div class="space-y-2">
		{#if readonly || mode === 'display'}
			{#if value}
				<span
					class="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium {getStatusColor(
						value
					)}"
				>
					{value}
				</span>
			{:else}
				<div class="py-1 text-black">-</div>
			{/if}
		{:else}
			<div class="flex flex-wrap gap-2">
				{#each field.options || [] as option}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							value = value === option ? '' : option;
						}}
						class="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium transition-colors {value ===
						option
							? getStatusColor(option)
							: 'bg-zinc-100 text-black hover:bg-zinc-300'}"
					>
						{option}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
