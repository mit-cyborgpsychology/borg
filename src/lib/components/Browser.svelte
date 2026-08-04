<script lang="ts">
	import { onMount } from 'svelte';
	import {
		FolderOpen,
		Users,
		Calendar,
		CheckSquare,
		LogOut,
		BookOpen,
		User,
		ExternalLink,
		FileText
	} from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import ProjectsTab from './browser/ProjectsTab.svelte';
	import PeopleTab from './browser/PeopleTab.svelte';
	import TimelineTab from './browser/TimelineTab.svelte';
	import TaskTab from './browser/TaskTab.svelte';
	import PersonalTab from './browser/PersonalTab.svelte';
	import DocsTab from './browser/DocsTab.svelte';
	import { projectsService, taskService, peopleService, outlineService } from '../services/instances';
	import { FirebaseTimelineService } from '../services/firebase/FirebaseTimelineService';
	import type { ITimelineService } from '../services/interfaces';

	import { firebaseAuth, authStore } from '../stores/authStore';
	import PresenceAvatars from './PresenceAvatars.svelte';

	type Tab = 'projects' | 'people' | 'timeline' | 'tasks' | 'personal' | 'docs' | 'resources';

	let activeTab = $state<Tab>('projects');
	let viewMode = $state<'list' | 'canvas'>('canvas');

	$effect(() => {
		if ($authStore.userType === 'collaborator') viewMode = 'list';
	});

	// Shared per-page-load service - the rest are app-wide singletons imported directly
	let timelineService: ITimelineService;

	let globalCounts = $state({ todo: 0, doing: 0, done: 0 });
	let servicesInitialized = $state(false);
	let cachedProjects = $state<any[]>([]);

	onMount(() => {
		timelineService = new FirebaseTimelineService();

		servicesInitialized = true;

		// Only load data for the initial tab (projects)
		if (activeTab === 'projects') {
			updateGlobalCounts();
		}

		// Update counts when returning from project pages
		const handleVisibilityChange = () => {
			if (!document.hidden) {
				updateGlobalCounts();
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	function setActiveTab(tab: Tab) {
		activeTab = tab;

		// Trigger global counts update when switching to projects tab
		if (tab === 'projects' && servicesInitialized) {
			updateGlobalCounts();
		}
	}

	async function updateGlobalCounts(forceRefresh = false) {
		if (projectsService) {
			// Load projects once and reuse for counts (unless forced to refresh)
			if (cachedProjects.length === 0 || forceRefresh) {
				cachedProjects = await projectsService.getAllProjects();
			}

			// Calculate counts from cached projects to avoid duplicate getAllProjects call
			const counts = { todo: 0, doing: 0, done: 0 };
			for (const project of cachedProjects) {
				const projectCounts = await projectsService.getProjectStatusCounts(project.slug);
				counts.todo += projectCounts.todo;
				counts.doing += projectCounts.doing;
				counts.done += projectCounts.done;
			}
			globalCounts = counts;
		}
	}

	async function handleLogout() {
		if (confirm('Are you sure you want to log out?')) {
			await firebaseAuth.signOut();
		}
	}
</script>

<div class="flex h-full min-h-screen w-full flex-col bg-white">
	<!-- Top Nav -->
	<div class="fixed top-0 right-0 left-0 z-50 flex h-12 items-center gap-1 border-b border-zinc-200 bg-white px-3">
		<!-- Logo -->
		<img src="BORG.svg" class="mr-3 h-5" alt="" />

		<div class="h-5 border-l border-zinc-200"></div>

		<!-- Nav items -->
		<button
			onclick={() => setActiveTab('projects')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'projects' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<FolderOpen class="h-4 w-4" />
			Projects
		</button>

		<button
			onclick={() => setActiveTab('people')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'people' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<Users class="h-4 w-4" />
			People
		</button>

		<button
			onclick={() => setActiveTab('timeline')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'timeline' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<Calendar class="h-4 w-4" />
			Timeline
		</button>

		<button
			onclick={() => setActiveTab('tasks')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'tasks' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<CheckSquare class="h-4 w-4" />
			Tasks
		</button>

		<button
			onclick={() => setActiveTab('personal')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'personal' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<User class="h-4 w-4" />
			Personal
		</button>

		<button
			onclick={() => setActiveTab('docs')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors {activeTab === 'docs' ? 'bg-zinc-100 text-zinc-800 font-medium' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'}"
		>
			<FileText class="h-4 w-4" />
			Docs
		</button>

		<button
			onclick={() => window.open('https://borg.cyborglab.org/project/lab-resources', '_blank')}
			class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
		>
			<BookOpen class="h-4 w-4" />
			<span class="flex items-center gap-1">Resources <ExternalLink strokeWidth={2.5} class="h-3 w-3" /></span>
		</button>

		<!-- Spacer -->
		<div class="flex-1"></div>

		<!-- Active users (global mode — shows everyone across all pages) -->
		<PresenceAvatars />

		<div class="h-5 border-l border-zinc-200 mx-1"></div>

		<!-- Logout -->
		<button
			onclick={handleLogout}
			class="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
			title="Log out"
		>
			<LogOut class="h-4 w-4" />
			<span>Log out</span>
		</button>
	</div>

	<!-- Main Content -->
	<div class="flex h-screen w-full flex-col overflow-hidden pt-12">
		{#if servicesInitialized}
			{#if activeTab === 'projects'}
				<ProjectsTab {projectsService} {cachedProjects} onCountsUpdate={updateGlobalCounts} bind:viewMode />
			{:else if activeTab === 'people'}
				<PeopleTab {peopleService} {taskService} {activeTab} />
			{:else if activeTab === 'timeline'}
				<TimelineTab {timelineService} {activeTab} />
			{:else if activeTab === 'tasks'}
				<TaskTab {taskService} {peopleService} {activeTab} />
			{:else if activeTab === 'personal'}
				<PersonalTab {taskService} {activeTab} />
			{:else if activeTab === 'docs'}
				<DocsTab {outlineService} {projectsService} {taskService} {activeTab} />
			{/if}
		{:else}
			<div class="flex h-screen w-full items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-black border-t-transparent"
					></div>
					<p class="text-zinc-600">Initializing services...</p>
				</div>
			</div>
		{/if}
	</div>
</div>
