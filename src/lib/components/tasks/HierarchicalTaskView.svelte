<script lang="ts">
	import { Calendar, CheckCircle, Trash2, RotateCcw, Loader2, ExternalLink } from '@lucide/svelte';
	import type { TaskWithContext } from '../../types/task';
	import { getPersonCached } from '../../stores/peopleCache.svelte';

	let {
		tasks,
		showActions = false,
		isResolved = false,
		onResolveTask,
		onDeleteTask,
		onReactivateTask,
		groupByProject = true
	} = $props<{
		tasks: TaskWithContext[];
		showActions?: boolean;
		isResolved?: boolean;
		onResolveTask?: (task: TaskWithContext) => void;
		onDeleteTask?: (task: TaskWithContext) => void;
		onReactivateTask?: (task: TaskWithContext) => void;
		groupByProject?: boolean;
	}>();

	// Selected project state
	let selectedProject = $state<string | null>(null);
	// Loading states for task actions
	let loadingTasks = $state<Set<string>>(new Set());

	// Project selection function
	function selectProject(projectSlug: string) {
		selectedProject = projectSlug;
	}

	// Task action handlers with loading states
	async function handleResolveTask(task: TaskWithContext) {
		loadingTasks.add(task.id);
		loadingTasks = new Set(loadingTasks);

		try {
			await onResolveTask?.(task);
		} finally {
			loadingTasks.delete(task.id);
			loadingTasks = new Set(loadingTasks);
		}
	}

	async function handleReactivateTask(task: TaskWithContext) {
		loadingTasks.add(task.id);
		loadingTasks = new Set(loadingTasks);

		try {
			await onReactivateTask?.(task);
		} finally {
			loadingTasks.delete(task.id);
			loadingTasks = new Set(loadingTasks);
		}
	}

	async function handleDeleteTask(task: TaskWithContext) {
		loadingTasks.add(task.id);
		loadingTasks = new Set(loadingTasks);

		try {
			await onDeleteTask?.(task);
		} finally {
			loadingTasks.delete(task.id);
			loadingTasks = new Set(loadingTasks);
		}
	}

	// Group tasks by project and node
	function groupTasksByProjectAndNode(tasks: TaskWithContext[]) {
		const projects: Record<
			string,
			{
				project: { slug: string; title: string };
				nodes: Record<
					string,
					{
						node: { id: string; title: string; type: string };
						tasks: TaskWithContext[];
					}
				>;
			}
		> = {};

		for (const task of tasks) {
			const projectSlug = task.projectSlug || 'unknown';
			const projectTitle = task.projectTitle || (task.sourceType === 'outline' ? 'Outline' : 'Unknown Project');
			const nodeId = task.nodeId;
			const nodeTitle = task.nodeTitle || 'Untitled';
			const nodeType = task.nodeType;

			if (!projects[projectSlug]) {
				projects[projectSlug] = {
					project: { slug: projectSlug, title: projectTitle },
					nodes: {}
				};
			}

			if (!projects[projectSlug].nodes[nodeId]) {
				projects[projectSlug].nodes[nodeId] = {
					node: { id: nodeId, title: nodeTitle, type: nodeType },
					tasks: []
				};
			}

			projects[projectSlug].nodes[nodeId].tasks.push(task);
		}

		return projects;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString();
	}

	function isOverdue(dueDate: string) {
		return new Date(dueDate) < new Date();
	}

	// Get project and node grouped tasks
	let tasksByProject = $derived(groupTasksByProjectAndNode(tasks));

	// Group tasks by time period for flat view
	let tasksByTimePeriod = $derived(() => {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		const recent: TaskWithContext[] = [];
		const older: TaskWithContext[] = [];

		tasks.forEach((task: TaskWithContext) => {
			const taskDate = task.updatedAt ? new Date(task.updatedAt) : new Date(task.createdAt);
			if (taskDate >= sevenDaysAgo) {
				recent.push(task);
			} else {
				older.push(task);
			}
		});

		return { recent, older };
	});

	// Auto-select first project if none selected
	$effect(() => {
		const projectSlugs = Object.keys(tasksByProject);
		if (projectSlugs.length > 0 && !selectedProject) {
			selectedProject = projectSlugs[0];
		}
	});
</script>

{#if tasks.length === 0}
	<div class="mt-12 flex h-full items-center justify-center">
		<div class="text-center">
			<CheckCircle class="mx-auto h-12 w-12 text-zinc-600" />
			<h3 class="mt-4 text-lg font-medium text-black">
				No {isResolved ? 'resolved' : 'active'} tasks found
			</h3>
			<p class="mt-2 text-sm text-zinc-500">
				{isResolved
					? 'Resolved tasks will appear here when you mark tasks as complete'
					: 'Tasks will appear here when you add them to nodes'}
			</p>
		</div>
	</div>
{:else if groupByProject}
	<div class="flex h-full max-h-full gap-8">
		<!-- Left sidebar: Projects list -->
		<div class="w-52 flex-shrink-0 overflow-y-auto pb-2">
			<div class="space-y-1">
				{#each Object.entries(tasksByProject) as [projectSlug, projectData]}
					{@const projectTaskCount = Object.values(projectData.nodes).reduce(
						(sum, nodeData) => sum + nodeData.tasks.length,
						0
					)}
					{@const isSelected = selectedProject === projectSlug}

					<div
						onclick={() => selectProject(projectSlug)}
						onkeydown={(e) => e.key === 'Enter' && selectProject(projectSlug)}
						role="button"
						tabindex="0"
						class="group relative flex w-full cursor-pointer items-center rounded-lg border px-3 py-2.5 text-left transition-colors {isSelected
							? 'border-borg-brown bg-borg-beige'
							: 'border-zinc-200 bg-white hover:bg-zinc-50'}"
					>
						<div class="min-w-0 flex-1 pr-6">
							<p class="truncate text-sm font-medium text-zinc-800">{projectData.project.title}</p>
							<p class="text-xs text-zinc-400">{projectTaskCount} tasks</p>
						</div>
						<button
							onclick={(e) => {
								e.stopPropagation();
								window.open(`/project/${projectSlug}`, '_blank');
							}}
							class="absolute top-2 right-2 rounded p-0.5 text-zinc-300 opacity-0 transition-all group-hover:opacity-100 hover:text-zinc-600"
							title="Open project"
						>
							<ExternalLink class="h-3.5 w-3.5" />
						</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- Right panel: Tasks -->
		<div class="flex-1 overflow-y-auto">
			{#if selectedProject && tasksByProject[selectedProject]}
				{@const projectData = tasksByProject[selectedProject]}

				<div class="space-y-4">
					{#each Object.entries(projectData.nodes) as [nodeId, nodeData]}
						{@const nodeTaskCount = nodeData.tasks.length}

						<!-- Node Header -->
						<div class="space-y-3">
							<div class="flex items-center gap-3 pt-2">
								<h4 class="text-base font-semibold text-black">
									{nodeData.node.title}
								</h4>
								<span
									class="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-500"
								>
									{nodeData.node.type}
								</span>
								<span class="text-sm font-medium text-zinc-600">
									{nodeTaskCount} tasks
								</span>
							</div>

							<!-- Tasks under this node -->
							<div class="space-y-1">
								{#each nodeData.tasks as task}
									{@const person = getPersonCached(task.assignee)}
									{@const isLoading = loadingTasks.has(task.id)}
									{@const overdue = task.dueDate && isOverdue(task.dueDate)}

										<div
											class="group flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-zinc-50"
										>
											<!-- Checkbox -->
											<div class="flex items-center pt-0.5">
												{#if showActions && !isResolved}
													<button
														onclick={(e) => {
															e.stopPropagation();
															handleResolveTask(task);
														}}
														class="rounded border border-zinc-500 p-0.5 hover:border-green-500 hover:bg-green-50 {isLoading
															? 'opacity-50'
															: ''}"
														title="Mark as resolved"
														disabled={isLoading}
													>
														{#if isLoading}
															<Loader2 class="h-3 w-3 animate-spin text-zinc-500" />
														{:else}
															<CheckCircle class="h-3 w-3 text-transparent" />
														{/if}
													</button>
												{:else if showActions && isResolved}
													<button
														onclick={(e) => {
															e.stopPropagation();
															handleReactivateTask(task);
														}}
														class="rounded border border-green-500 bg-green-500 p-0.5 hover:bg-green-600 {isLoading
															? 'opacity-50'
															: ''}"
														title="Reactivate task"
														disabled={isLoading}
													>
														{#if isLoading}
															<Loader2 class="h-3 w-3 animate-spin text-white" />
														{:else}
															<CheckCircle class="h-3 w-3 text-white" />
														{/if}
													</button>
												{:else}
													<div class="h-4 w-4 rounded border border-zinc-300"></div>
												{/if}
											</div>

											<!-- Task content -->
											<div class="min-w-0 flex-1">
												<div class="mb-1 flex items-center gap-2">
													<span
														class="text-sm text-zinc-900 {isResolved
															? 'line-through opacity-60'
															: ''}"
													>
														{task.title}
													</span>
													{#if person?.photoUrl}
														<img
															src={person.photoUrl}
															alt={person.name || 'Assignee'}
															class="h-5 w-5 rounded-full"
															title={person.name || 'Unassigned'}
															referrerpolicy="no-referrer"
														/>
													{/if}
												</div>

												<!-- Task meta info -->
												<div class="flex items-center gap-3 text-xs text-zinc-500">
													{#if task.dueDate}
														<div class="flex items-center gap-1 {overdue ? 'text-rose-500' : ''}">
															<Calendar class="h-3 w-3" />
															<span>Due {formatDate(task.dueDate)}</span>
															{#if overdue && !isResolved}
																<span class="text-rose-500">(Overdue)</span>
															{/if}
														</div>
													{/if}

													{#if task.notes}
														<span class="text-xs text-zinc-600 italic">"{task.notes}"</span>
													{/if}
												</div>
											</div>

											<!-- Delete button -->
											{#if showActions}
												<div
													class="flex items-center opacity-0 transition-opacity group-hover:opacity-100"
												>
													<button
														onclick={() => onDeleteTask?.(task)}
														class="rounded p-1 hover:bg-rose-100"
														title="Delete task"
													>
														<Trash2 class="h-4 w-4 text-zinc-400 hover:text-rose-600" />
													</button>
												</div>
											{/if}
										</div>
									{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex h-full items-center justify-center">
					<div class="text-center">
						<CheckCircle class="mx-auto mb-4 h-12 w-12 text-zinc-300" />
						<h3 class="text-lg font-medium text-zinc-600">Select a project</h3>
						<p class="mt-2 text-sm text-zinc-500">
							Choose a project from the left to view its tasks
						</p>
					</div>
				</div>
			{/if}
		</div>
	</div>
{:else}
	<!-- Flat view: All tasks grouped by time period -->
	{#if true}
		{@const timePeriods = tasksByTimePeriod()}
		<div class="space-y-6">
			{#if timePeriods.recent.length > 0}
				<div>
					<h3 class="mb-3 border-b border-zinc-200 pb-2 text-base font-semibold text-zinc-800">
						Last week ({timePeriods.recent.length})
					</h3>
					<div class="space-y-1">
						{#each timePeriods.recent as task}
							{@const person = getPersonCached(task.assignee)}
							{@const isLoading = loadingTasks.has(task.id)}
							{@const overdue = task.dueDate && isOverdue(task.dueDate)}

								<div
									class="group flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-zinc-50"
								>
									<div class="flex items-center pt-0.5">
										<div class="h-4 w-4 rounded border border-zinc-300 bg-green-500"></div>
									</div>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<span class="text-sm text-zinc-900">
												{task.title}
											</span>
											{#if person}
												<img
													src={person.photoUrl}
													alt={person.name}
													class="h-5 w-5 rounded-full border border-zinc-200"
													referrerpolicy="no-referrer"
													onerror={(e) =>
														((e.currentTarget as HTMLImageElement).style.display = 'none')}
												/>
											{/if}
											<!-- Project and Node Info -->
											<span class="text-xs text-zinc-500">
												{task.projectTitle} • {task.nodeTitle}
											</span>
										</div>
										<div class="flex items-center gap-3 text-xs text-zinc-500">
											{#if person}
												<span>{person.name}</span>
											{/if}
											{#if task.updatedAt}
												<div class="flex items-center gap-1">
													<Calendar class="h-3 w-3" />
													<span>Resolved {formatDate(task.updatedAt)}</span>
												</div>
											{/if}
											{#if task.dueDate}
												<div class="flex items-center gap-1 {overdue ? 'text-red-600' : ''}">
													<Calendar class="h-3 w-3" />
													<span>Due {formatDate(task.dueDate)}</span>
													{#if overdue}<span class="font-medium">(was overdue)</span>{/if}
												</div>
											{/if}
											{#if task.notes}
												<span class="text-xs text-zinc-600 italic">"{task.notes}"</span>
											{/if}
										</div>
									</div>
									<!-- Actions -->
									{#if showActions}
										<div
											class="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100"
										>
											{#if isResolved}
												<button
													onclick={() => handleReactivateTask(task)}
													disabled={isLoading}
													class="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
													title="Reactivate task"
												>
													{#if isLoading}
														<Loader2 class="h-4 w-4 animate-spin" />
													{:else}
														<RotateCcw class="h-4 w-4" />
													{/if}
												</button>
											{:else}
												<button
													onclick={() => handleResolveTask(task)}
													disabled={isLoading}
													class="rounded-md p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-50"
													title="Mark as resolved"
												>
													{#if isLoading}
														<Loader2 class="h-4 w-4 animate-spin" />
													{:else}
														<CheckCircle class="h-4 w-4" />
													{/if}
												</button>
											{/if}
											<button
												onclick={() => handleDeleteTask(task)}
												disabled={isLoading}
												class="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
												title="Delete task"
											>
												{#if isLoading}
													<Loader2 class="h-4 w-4 animate-spin" />
												{:else}
													<Trash2 class="h-4 w-4" />
												{/if}
											</button>
										</div>
									{/if}
								</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if timePeriods.older.length > 0}
				<div>
					<h3 class="mb-3 border-b border-zinc-200 pb-2 text-base font-semibold text-zinc-800">
						Last month ({timePeriods.older.length})
					</h3>
					<div class="space-y-1">
						{#each timePeriods.older as task}
							{@const person = getPersonCached(task.assignee)}
							{@const isLoading = loadingTasks.has(task.id)}
							{@const overdue = task.dueDate && isOverdue(task.dueDate)}

								<div
									class="group flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-zinc-50"
								>
									<div class="flex items-center pt-0.5">
										<div class="h-4 w-4 rounded border border-zinc-300 bg-green-500"></div>
									</div>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<span class="text-sm text-zinc-900">
												{task.title}
											</span>
											{#if person}
												<img
													src={person.photoUrl}
													alt={person.name}
													class="h-5 w-5 rounded-full border border-zinc-200"
													referrerpolicy="no-referrer"
													onerror={(e) =>
														((e.currentTarget as HTMLImageElement).style.display = 'none')}
												/>
											{/if}
											<!-- Project and Node Info -->
											<span class="text-xs text-zinc-500">
												{task.projectTitle} • {task.nodeTitle}
											</span>
										</div>
										<div class="flex items-center gap-3 text-xs text-zinc-500">
											{#if person}
												<span>{person.name}</span>
											{/if}
											{#if task.updatedAt}
												<div class="flex items-center gap-1">
													<Calendar class="h-3 w-3" />
													<span>Resolved {formatDate(task.updatedAt)}</span>
												</div>
											{/if}
											{#if task.dueDate}
												<div class="flex items-center gap-1 {overdue ? 'text-red-600' : ''}">
													<Calendar class="h-3 w-3" />
													<span>Due {formatDate(task.dueDate)}</span>
													{#if overdue}<span class="font-medium">(was overdue)</span>{/if}
												</div>
											{/if}
											{#if task.notes}
												<span class="text-xs text-zinc-600 italic">"{task.notes}"</span>
											{/if}
										</div>
									</div>
									<!-- Actions -->
									{#if showActions}
										<div
											class="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100"
										>
											{#if isResolved}
												<button
													onclick={() => handleReactivateTask(task)}
													disabled={isLoading}
													class="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
													title="Reactivate task"
												>
													{#if isLoading}
														<Loader2 class="h-4 w-4 animate-spin" />
													{:else}
														<RotateCcw class="h-4 w-4" />
													{/if}
												</button>
											{:else}
												<button
													onclick={() => handleResolveTask(task)}
													disabled={isLoading}
													class="rounded-md p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-50"
													title="Mark as resolved"
												>
													{#if isLoading}
														<Loader2 class="h-4 w-4 animate-spin" />
													{:else}
														<CheckCircle class="h-4 w-4" />
													{/if}
												</button>
											{/if}
											<button
												onclick={() => handleDeleteTask(task)}
												disabled={isLoading}
												class="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
												title="Delete task"
											>
												{#if isLoading}
													<Loader2 class="h-4 w-4 animate-spin" />
												{:else}
													<Trash2 class="h-4 w-4" />
												{/if}
											</button>
										</div>
									{/if}
								</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
{/if}
