<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createPeopleDirectory } from '$lib/features/people/createPeopleDirectory';
	import ChoicePicker from '../inputs/ChoicePicker.svelte';
	import AsyncStatus from '../AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import type { TemplateField } from '../../templates';

	const { peopleService } = getAppServices();
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

	const directory = createPeopleDirectory(peopleService);
	const resource = directory.list;
	const allPeople = $derived($resource.data);
	const peopleMap = $derived(new Map(allPeople.map((person) => [person.id, person])));
	onMount(() => void directory.load());
	onDestroy(() => directory.dispose());
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
		<span class="mb-1 block text-sm font-medium text-zinc-600">
			{field.label}
		</span>
	{/if}

	<div class="space-y-2">
		<AsyncStatus state={$resource} onRetry={() => void directory.load()} />
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
							{#if mode === 'edit' && !readonly}
								<button
									type="button"
									onclick={() => {
										value = value.filter((id: string) => id !== personId);
									}}
									class="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-600 focus:opacity-100"
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
					<ChoicePicker
						label="Add person"
						resetAfterSelect
						placeholder="Add person…"
						disabled={readonly}
						options={availablePeople.map((person) => ({
							value: person.id,
							label: person.name || person.email || 'Unnamed person',
							detail: person.email
						}))}
						onchange={(id) => {
							if (!value?.includes(id)) value = [...(value || []), id];
						}}
					/>
				{/if}
			{/if}
		</div>
	</div>
</div>
