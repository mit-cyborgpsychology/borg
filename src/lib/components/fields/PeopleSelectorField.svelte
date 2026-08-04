<script lang="ts">
	import { peopleService } from '../../services/instances';
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

	// State for people data
	let allPeople = $state<any[]>([]);
	let peopleMap = $state<Map<string, any>>(new Map());

	// Load people data reactively
	$effect(() => {
		(async () => {
			const result = peopleService.getAllPeople();
			const people = result instanceof Promise ? await result : result;
			allPeople = people;

			// Create a map for quick lookup
			const map = new Map();
			people.forEach((person) => map.set(person.id, person));
			peopleMap = map;
		})();
	});

	// Helper function to get initials from name
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

<div class="field-container">
	{#if mode === 'edit'}
		<label class="mb-1 block text-sm font-medium text-zinc-600">
			{field.label}
		</label>
	{/if}

	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-1.5">
			{#if value && Array.isArray(value) && value.length > 0}
				{#each value as personId}
					{@const person = peopleMap.get(personId)}
					{#if person}
						<div class="group relative">
							<div
								class="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-zinc-200"
								title={person.name || person.email || 'User'}
							>
								{#if person.photoUrl}
									<img
										src={person.photoUrl}
										alt={person.name || person.email || 'User'}
										class="h-full w-full object-cover"
										referrerpolicy="no-referrer"
									/>
								{:else}
									<div
										class="flex h-full w-full items-center justify-center bg-borg-green text-xs font-medium text-white"
									>
										{getInitials(person.name || person.email || 'U')}
									</div>
								{/if}
							</div>
							{#if mode === 'edit'}
								<button
									onclick={() => {
										value = value.filter((id) => id !== personId);
									}}
									class="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600"
									aria-label="Remove {person.name}"
								>
									×
								</button>
							{/if}
						</div>
					{/if}
				{/each}
			{/if}

			{#if mode === 'edit'}
				{@const availablePeople = allPeople.filter((p) => !value?.includes(p.id))}
				{#if availablePeople.length > 0}
					<select
						value=""
						onchange={(e) => {
							const target = e.target as HTMLSelectElement;
							const selectedId = target.value;
							if (selectedId) {
								value = value ? [...value, selectedId] : [selectedId];
								target.value = '';
							}
						}}
						class="rounded border border-zinc-700 bg-white px-2 py-1 text-xs text-black focus:border-borg-blue focus:outline-none"
					>
						<option value="">Add person...</option>
						{#each availablePeople as person}
							<option value={person.id}>{person.name}</option>
						{/each}
					</select>
				{/if}
			{/if}
		</div>
	</div>
</div>
