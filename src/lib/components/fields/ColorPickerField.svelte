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
	<span class="mb-1 block text-sm font-medium text-zinc-600">
		{field.label}
	</span>

	{#if mode === 'display'}
		{#if value}
			<div class="py-1">
				<div class="flex items-center space-x-2">
					<div
						class="h-4 w-4 rounded border border-gray-300"
						style={value.startsWith('linear-gradient')
							? `background: ${value}`
							: `background-color: ${value}`}
					></div>
					<span class="text-sm text-zinc-600"
						>{value.startsWith('linear-gradient') ? 'Gradient' : value}</span
					>
				</div>
			</div>
		{:else}
			<div class="py-1 text-zinc-600">No color selected</div>
		{/if}
	{:else}
		<div class="space-y-2">
			<!-- Solid colors -->
			<div class="mb-2">
				<span class="text-xs font-medium text-zinc-500">Solid Colors</span>
			</div>
			<div class="mb-4 grid grid-cols-6 gap-2">
				{#each ['#fef08a', '#fde047', '#facc15', '#fed7d7', '#fbb6ce', '#ddd6fe', '#a5f3fc', '#bbf7d0', '#fed7aa', '#fecaca'] as color}
					<button
						type="button"
						class="h-8 w-8 rounded transition-colors hover:border-gray-400 {value === color
							? 'border-2 border-gray-500'
							: 'border-2 border-gray-300'}"
						style="background-color: {color}"
						aria-label="Select color {color}"
						onclick={() => {
							value = color;
						}}
					></button>
				{/each}
			</div>

			<!-- Gradients -->
			<div class="mb-2">
				<span class="text-xs font-medium text-zinc-500">Gradients</span>
			</div>
			<div class="grid grid-cols-4 gap-2">
				{#each [{ name: 'Sunset', gradient: 'linear-gradient(135deg, #ffcc9a 0%, #ffb3d1 100%)' }, { name: 'Ocean', gradient: 'linear-gradient(135deg, #a8d8ff 0%, #b8f2ff 100%)' }, { name: 'Forest', gradient: 'linear-gradient(135deg, #c8f2d4 0%, #a8e6cf 100%)' }, { name: 'Lavender', gradient: 'linear-gradient(135deg, #ffecd2 0%, #c7b3d6 100%)' }, { name: 'Fire', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' }, { name: 'Sky', gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)' }, { name: 'Silver', gradient: 'linear-gradient(135deg, #f7fafc 0%, #cbd5e0 50%, #a0aec0 100%)' }, { name: 'Rainbow', gradient: 'linear-gradient(135deg, #ffb3ba 0%, #ffdfba 16%, #ffffba 33%, #baffc9 50%, #bae1ff 66%, #dcc9ff 83%, #ffc9da 100%)' }] as gradientOption}
					<button
						type="button"
						class="h-8 w-full rounded transition-colors hover:border-gray-400 {value ===
						gradientOption.gradient
							? 'border-2 border-gray-500'
							: 'border-2 border-gray-300'}"
						style="background: {gradientOption.gradient}"
						aria-label="Select {gradientOption.name} gradient"
						onclick={() => {
							value = gradientOption.gradient;
						}}
						title="{gradientOption.name} Gradient"
					></button>
				{/each}
			</div>
			<div class="mb-2">
				<span class="text-xs font-medium text-zinc-500">Pick your own</span>
			</div>
			<input
				type="color"
				bind:value
				class="h-10 w-full cursor-pointer rounded border border-zinc-700"
				{readonly}
			/>
		</div>
	{/if}
</div>
