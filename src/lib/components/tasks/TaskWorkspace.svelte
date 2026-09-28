<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		Search,
		Check,
		CheckSquare,
		ArrowUpRight,
		RotateCcw,
		FolderOpen,
		ListTodo
	} from '@lucide/svelte';
	import { getAppServices } from '$lib/app/context';
	import { createTaskCommands } from '$lib/features/tasks/createTaskCommands';
	import { localDateString } from '$lib/utils/timelineDate';
	import type { TaskProjectEntry } from '$lib/features/tasks/createTaskPages';
	import type { TaskWithContext } from '$lib/types/task';
	import TaskRow from './TaskRow.svelte';
	import TaskEditor from './TaskEditor.svelte';
	import AsyncStatus from '../AsyncStatus.svelte';
	import PersonAvatar from '../PersonAvatar.svelte';

	let {
		active,
		completed,
		personal = false,
		loading = false,
		onRefresh,
		hasMore = { active: false, completed: false },
		pageNumbers = { active: 1, completed: 1 },
		onPageChange,
		projects,
		project,
		onProjectChange
	} = $props<{
		projects: TaskProjectEntry[];
		project: string;
		onProjectChange: (value: string) => Promise<unknown>;
		active: TaskWithContext[];
		completed: TaskWithContext[];
		personal?: boolean;
		loading?: boolean;
		onRefresh: () => Promise<unknown>;
		hasMore?: { active: boolean; completed: boolean };
		pageNumbers?: { active: number; completed: number };
		onPageChange?: (view: 'active' | 'completed', direction: -1 | 1) => Promise<unknown>;
	}>();
	const { taskService, authStore, peopleCache } = getAppServices();
	const commands = createTaskCommands(taskService, () => onRefresh());
	const command = commands.command;
	onDestroy(() => commands.dispose());
	const workspaceId = $props.id();
	let taskContent = $state<HTMLDivElement>();
	async function changePage(direction: -1 | 1) {
		const result = await onPageChange?.(view, direction);
		if (!result) return;
		editingId = null;
		deletingId = null;
		await tick();
		taskContent?.scrollTo({ top: 0 });
	}
	let undoButton = $state<HTMLButtonElement>();
	let searchInput = $state<HTMLInputElement>();
	let query = $state('');
	let view = $state<'active' | 'completed'>('active');
	let mineOnly = $state(false);
	let recentOnly = $state(false);
	let overdueOnly = $state(false);
	let now = $state(Date.now());
	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 60000);
		return () => clearInterval(timer);
	});
	const today = $derived(localDateString(new Date(now)));
	let editingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);
	let pendingId = $state<string | null>(null);
	let undoTask = $state<TaskWithContext | null>(null);
	const busy = $derived($command.status === 'loading' || pendingId !== null || loading);
	function projectKey(task: TaskWithContext) {
		return task.sourceType === 'outline'
			? 'source:outline'
			: task.projectSlug
				? `project:${task.projectSlug}`
				: 'source:unlinked';
	}
	function projectName(task: TaskWithContext) {
		return task.sourceType === 'outline' ? 'Outline' : task.projectTitle || 'Unlinked project';
	}
	function matches(task: TaskWithContext, includeProject = true) {
		if (mineOnly && task.assignee !== $authStore.user?.uid) return false;
		if (includeProject && project && projectKey(task) !== project) return false;
		const person = task.assignee ? peopleCache.getPersonCached(task.assignee) : null;
		return [task.title, task.nodeTitle, task.projectTitle, task.outlineDocTitle, person?.name]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
			.includes(query.trim().toLowerCase());
	}
	const filteredActive = $derived(active.filter((task) => matches(task)));
	const filteredCompleted = $derived(completed.filter((task) => matches(task)));
	const overdueCount = $derived(
		filteredActive.filter((task) => task.dueDate && task.dueDate < today).length
	);
	const visible = $derived(
		(view === 'active' ? filteredActive : filteredCompleted)
			.filter((task) =>
				view === 'active'
					? !overdueOnly || (!!task.dueDate && task.dueDate < today)
					: !recentOnly || Date.parse(task.updatedAt || task.createdAt) >= now - 30 * 86400000
			)
			.sort((a, b) =>
				view === 'completed'
					? Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)
					: (a.dueDate || '9999').localeCompare(b.dueDate || '9999') ||
						b.createdAt.localeCompare(a.createdAt)
			)
	);
	async function selectProject(value: string) {
		if (busy) return;
		const result = await onProjectChange(value);
		if (!result) return;
		editingId = null;
		deletingId = null;
		await tick();
		taskContent?.scrollTo({ top: 0 });
	}

	async function toggle(task: TaskWithContext) {
		if (busy) return;
		const focused = document.activeElement;
		pendingId = task.id;
		const result = await (task.status === 'resolved'
			? commands.reactivate(task)
			: commands.resolve(task));
		pendingId = null;
		if (result.ok) {
			undoTask = task;
			editingId = null;
			await tick();
			if (document.activeElement === focused || document.activeElement === document.body)
				undoButton?.focus({ preventScroll: true });
		}
	}
	async function undo() {
		if (!undoTask || busy) return;
		const task = undoTask;
		pendingId = task.id;
		const result = await (task.status === 'resolved'
			? commands.resolve(task)
			: commands.reactivate(task));
		pendingId = null;
		if (result.ok) undoTask = null;
	}
	async function closeEditor() {
		const id = editingId;
		editingId = null;
		await tick();
		const row = id ? document.getElementById(`${workspaceId}-${id}`) : null;
		(row?.querySelector('button') || searchInput)?.focus({ preventScroll: true });
	}

	async function remove(task: TaskWithContext) {
		if (busy) return;
		pendingId = task.id;
		const result = await commands.remove(task);
		pendingId = null;
		if (result.ok) {
			deletingId = null;
			if (undoTask?.id === task.id) undoTask = null;
		}
	}
</script>

<div
	class="grid min-h-0 gap-5 md:h-full md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-6"
>
	<aside aria-label="Task projects" class="min-h-0 md:flex md:h-full md:flex-col">
		<h2 class="mb-3 shrink-0 px-2 font-sans text-xs font-semibold text-zinc-500">Projects</h2>
		<nav
			aria-label="Filter tasks by project"
			class="flex min-h-0 gap-1 overflow-x-auto pb-2 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto"
		>
			{#each [{ value: '', label: 'All projects', count: projects.reduce((sum, item) => sum + item.count, 0) }, ...projects] as item (item.value)}
				<button
					type="button"
					aria-pressed={project === item.value}
					disabled={busy}
					onclick={() => void selectProject(item.value)}
					title={item.label}
					class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-xs md:w-full {project ===
					item.value
						? 'bg-zinc-100 text-zinc-900'
						: 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'}"
				>
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded {item.value
							? 'bg-amber-50 text-amber-700'
							: 'bg-sky-50 text-sky-700'}"
					>
						{#if item.value}<FolderOpen class="h-3 w-3" />{:else}<ListTodo
								class="h-3.5 w-3.5"
							/>{/if}
					</span>
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					<span
						class="ml-2 text-[10px] text-zinc-400 tabular-nums"
						title="Tasks across all pages and statuses">{item.count}</span
					>
				</button>
			{/each}
		</nav>
	</aside>
	<div bind:this={taskContent} class="min-h-0 min-w-0 space-y-4 md:overflow-y-auto md:px-1 md:pb-1">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex gap-1">
				{#each [{ id: 'active', label: 'Active', count: filteredActive.length }, { id: 'completed', label: 'Completed', count: filteredCompleted.length }] as tab (tab.id)}
					<button
						type="button"
						aria-pressed={view === tab.id}
						onclick={() => {
							view = tab.id as typeof view;
							editingId = null;
						}}
						class="rounded-full px-3 py-1.5 text-xs {view === tab.id
							? 'bg-zinc-200 text-zinc-900'
							: 'text-zinc-500 hover:bg-zinc-100'}"
						>{tab.label}
						<span class="ml-1 text-zinc-500" title="Tasks on this page">{tab.count}</span></button
					>
				{/each}
			</div>
			{#if !personal}
				<button
					type="button"
					role="switch"
					aria-checked={mineOnly}
					onclick={() => (mineOnly = !mineOnly)}
					class="flex items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs"
					><span
						class="flex h-3.5 w-3.5 items-center justify-center rounded border {mineOnly
							? 'border-zinc-700 bg-zinc-700 text-white'
							: 'border-zinc-300'}"
						>{#if mineOnly}<Check class="h-3 w-3" />{/if}</span
					>Assigned to me</button
				>
			{/if}
		</div>
		<div class="flex flex-wrap items-start gap-2">
			<div
				class="flex min-w-40 flex-1 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5"
			>
				<Search class="h-3.5 w-3.5 shrink-0 text-zinc-400" /><input
					bind:this={searchInput}
					type="search"
					aria-label="Search tasks"
					placeholder={onPageChange ? 'Search this page…' : 'Search tasks…'}
					bind:value={query}
					class="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none"
				/>
			</div>
		</div>
		{#if view === 'active' && (overdueCount || overdueOnly)}
			<button
				type="button"
				aria-pressed={overdueOnly}
				onclick={() => (overdueOnly = !overdueOnly)}
				class="rounded-full px-2.5 py-1 text-xs {overdueOnly
					? 'bg-red-50 text-red-700'
					: 'text-red-600 hover:bg-red-50'}">{overdueCount} overdue</button
			>
		{:else if view === 'completed'}
			<button
				type="button"
				aria-pressed={recentOnly}
				onclick={() => (recentOnly = !recentOnly)}
				class="rounded-full px-2.5 py-1 text-xs {recentOnly
					? 'bg-zinc-100 text-zinc-800'
					: 'text-zinc-500 hover:bg-zinc-100'}">Last 30 days</button
			>
		{/if}
		<AsyncStatus state={$command} pendingLabel="Saving…" />
		{#if undoTask}<div
				class="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600"
			>
				<span role="status" class="truncate"
					>{undoTask.title} {undoTask.status === 'resolved' ? 'reopened' : 'completed'}</span
				><button
					type="button"
					disabled={busy}
					bind:this={undoButton}
					onclick={() => void undo()}
					class="flex shrink-0 items-center gap-1 text-zinc-900"
					><RotateCcw class="h-3 w-3" />Undo</button
				>
			</div>{/if}
		<div class="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
			{#each visible as task (task.id)}
				{@const assignee = task.assignee ? peopleCache.getPersonCached(task.assignee) : null}
				{#if editingId === task.id}
					<TaskEditor
						{task}
						nodeId={task.nodeId}
						projectSlug={task.projectSlug}
						onClose={() => void closeEditor()}
						onTaskUpdated={() => void onRefresh()}
					/>
				{:else}
					<div
						id={`${workspaceId}-${task.id}`}
						class="relative isolate flex min-w-0 flex-col rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50/50"
					>
						<TaskRow
							card
							{task}
							pending={pendingId === task.id}
							disabled={busy}
							onToggle={() => void toggle(task)}
							onEdit={() => {
								editingId = task.id;
								deletingId = null;
							}}
							onDelete={() => (deletingId = deletingId === task.id ? null : task.id)}
						/>
						<div
							class="mt-auto ml-8 flex min-w-0 items-center justify-between gap-3 pt-2 text-[11px] text-zinc-400"
						>
							<div class="flex min-w-0 items-center gap-1.5">
								{#if task.projectSlug && task.sourceType !== 'outline'}<a
										href={`/project/${encodeURIComponent(task.projectSlug)}`}
										class="relative z-10 flex min-w-0 items-center gap-1 rounded hover:text-zinc-700"
										><span class="truncate">{projectName(task)}</span><ArrowUpRight
											class="h-3 w-3 shrink-0"
										/></a
									>{:else}<span>{projectName(task)}</span>{/if}
								{#if task.nodeTitle || task.outlineDocTitle}<span>·</span><span class="truncate"
										>{task.nodeTitle || task.outlineDocTitle}</span
									>{/if}
							</div>
							{#if assignee}
								<span
									class="inline-flex max-w-[45%] min-w-0 shrink-0 items-center gap-1.5 text-zinc-500"
									title={assignee.name}
								>
									<PersonAvatar
										size="tiny"
										name={assignee.name || 'Assignee'}
										photoUrl={assignee.photoUrl}
									/>
									<span class="truncate">{assignee.name?.trim().split(/\s+/)[0] || 'Assignee'}</span
									>
								</span>
							{/if}
						</div>
						{#if deletingId === task.id}<div
								class="relative z-10 mt-3 flex items-center justify-end gap-3 border-t border-zinc-100 pt-3 text-xs"
							>
								<span>Delete task?</span><button
									type="button"
									disabled={busy}
									onclick={() => (deletingId = null)}>Keep</button
								><button
									type="button"
									disabled={busy}
									onclick={() => void remove(task)}
									class="text-red-700">Delete</button
								>
							</div>{/if}
					</div>
				{/if}
			{:else}
				{#if !loading}
					<div class="col-span-full py-12 text-center">
						<CheckSquare class="mx-auto mb-3 h-6 w-6 text-zinc-300" />
						<p class="font-sans text-sm text-zinc-500">
							{query || project || overdueOnly || mineOnly
								? 'No matching tasks on this page'
								: hasMore[view] || pageNumbers[view] > 1
									? 'No visible tasks on this page'
									: view === 'completed'
										? 'Nothing completed yet'
										: personal
											? 'You’re all caught up'
											: 'No active tasks'}
						</p>
					</div>
				{/if}
			{/each}
		</div>
		{#if onPageChange}
			<nav
				aria-label="Task pagination"
				class="flex items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500"
			>
				<button
					type="button"
					disabled={loading || busy || pageNumbers[view] === 1}
					onclick={() => void changePage(-1)}
					class="rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50 disabled:cursor-default disabled:opacity-40"
					>Previous</button
				>
				<span aria-live="polite" aria-atomic="true">Page {pageNumbers[view]}</span>
				<button
					type="button"
					disabled={loading || busy || !hasMore[view]}
					onclick={() => void changePage(1)}
					class="rounded-md border border-zinc-200 px-3 py-2 text-zinc-700 hover:bg-zinc-50 disabled:cursor-default disabled:opacity-40"
					>Next</button
				>
			</nav>
		{/if}
	</div>
</div>
