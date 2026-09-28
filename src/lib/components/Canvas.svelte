<script lang="ts">
	import { getTemplate } from '$lib/templates';
	import { projectToolbarItems } from './nodeCreationItems';
	import { Square } from '@lucide/svelte';
	import NodeCreationMenu from '$lib/components/NodeCreationMenu.svelte';
	let creationMenu = $state<{ x: number; y: number } | null>(null);
	function openCreationMenu({ event }: { event: MouseEvent }) {
		event.preventDefault();
		creationMenu = { x: event.clientX, y: event.clientY };
	}
	async function createFromMenu(type: string, position: { x: number; y: number }) {
		if (!nodesService) return false;
		const result = await editCommand.run(() => nodesService.addNode(type, position));
		if (!result.ok)
			throw new Error($editCommand.error || 'Could not create node. Please try again.');
		return true;
	}
	import { createCommand } from '$lib/state/command';
	import { onDestroy } from 'svelte';
	const editCommand = createCommand({ queue: true });
	onDestroy(() => editCommand.dispose());
	import { provideCanvasActions, type CanvasPayloads } from '$lib/features/canvas/context';
	import AsyncStatus from './AsyncStatus.svelte';
	import { getAppServices } from '$lib/app/context';
	import { onMount } from 'svelte';
	import { connectCanvas } from '../features/canvas/connectCanvas';
	import { CanvasPersistence } from '../features/canvas/CanvasPersistence';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		SvelteFlow,
		Background,
		Controls,
		MiniMap,
		Panel,
		useSvelteFlow,
		type Node,
		type Edge,
		type Viewport,
		type Connection
	} from '@xyflow/svelte';
	import UniversalNode from './UniversalNode/UniversalNode.svelte';
	import NoteNode from './UniversalNode/NoteNode.svelte';
	import StickerNode from './UniversalNode/StickerNode.svelte';
	import type { INodesService } from '../services/interfaces';
	import CreateNodeModal from './CreateNodeModal.svelte';
	import EditPanel from './EditPanel.svelte';
	import NodeTaskSidebar from './tasks/NodeTaskSidebar.svelte';
	import TaskModal from './tasks/TaskModal.svelte';
	import Toolbar from './Toolbar.svelte';
	import StickerPanel from './stickers/StickerPanel.svelte';
	import Cursor from './Cursor.svelte';
	import type { Task } from '../types/task';
	import {
		updateMatchingNodes as updateMatches,
		navigateToMatch,
		nextMatch as goToNextMatch,
		previousMatch as goToPreviousMatch
	} from '../utils/canvasSearch';
	import { ChevronRight, ChevronLeft } from '@lucide/svelte';
	import { ProjectStore } from '../stores/ProjectStore.svelte';
	import { setProjectStoreContext } from '../stores/projectStoreContext';
	import '@xyflow/svelte/dist/style.css';
	import './svelteflow.css';

	const { authStore, projectsService, taskService, createNodesService, imageService } =
		getAppServices();
	let { projectSlug, onProjectUpdate, onPanelOpen } = $props<{
		projectSlug?: string;
		onProjectUpdate?: () => void;
		onPanelOpen?: () => void;
	}>();

	const projectStore = new ProjectStore(taskService);
	setProjectStoreContext(projectStore);

	$effect(() => {
		if (!projectSlug) return;
		projectStore.open(projectSlug);
		return () => projectStore.close();
	});

	const nodeTypes = {
		universal: UniversalNode
	};

	// Add editing state to nodes and handle lock state without recreating objects to preserve positions
	$effect(() => {
		if (nodes.length > 0) {
			nodes.forEach((node) => {
				if (node.data) {
					node.data.isBeingEdited = showEditPanel && editNodeId === node.id;
					// Set draggable property based on lock state - locked nodes can't be dragged
					const nodeData = node.data.nodeData as Record<string, unknown> | undefined;
					node.draggable = !(nodeData && nodeData.locked);
				}
			});
		}
	});

	// Use $state.raw for better performance with arrays as shown in reference
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
	let nodesService: INodesService;
	let canvasError = $state<string | null>(null);
	let saveError = $state<string | null>(null);
	let disposed = false;
	const persistence = new CanvasPersistence((nodes, edges) => nodesService.saveBatch(nodes, edges));
	let showCreateModal = $state(false);
	let createPosition = $state({ x: 0, y: 0 });
	let saveTimeout: ReturnType<typeof setTimeout>;
	let hasAttemptedProjectNodeCreation = false;

	// Minimap toggle state
	let showMinimap = $state(true);

	// Edit panel state
	let showEditPanel = $state(false);
	let editNodeId = $state('');
	let editNodeData = $state({});
	let editTemplateType = $state('');

	// Node task sidebar state
	let showNodeTaskSidebar = $state(false);
	let taskSidebarNodeId = $state('');
	let taskSidebarNodeTitle = $state('');
	let taskSidebarTasks = $state<Task[]>([]);
	let taskSubscriptionCleanup: (() => void) | null = null;

	// Search state
	let searchQuery = $state('');
	let matchingNodeIds = $state<string[]>([]);
	let currentMatchIndex = $state(0);

	// Task modal state
	let showTaskModal = $state(false);
	let taskModalNodeId = $state('');
	let taskModalTask = $state<Task | undefined>(undefined); // undefined for add mode, Task for edit mode

	// Sticker panel state
	let showStickerPanel = $state(false);

	// Right sidebar toggle state
	let showRightSidebar = $state(true);
	let sidebarTab = $state<'nodes' | 'tasks'>('nodes');

	// Selection state
	let selectedNodes = $state<Node[]>([]);
	let selectedNodesWithStatus = $derived(
		selectedNodes.filter(
			(node) => node.data?.templateType !== 'sticker' && node.data?.templateType !== 'image'
		)
	);
	let allSelectedDone = $derived(
		selectedNodesWithStatus.length > 0 &&
			selectedNodesWithStatus.every(
				(n) => (n.data?.nodeData as Record<string, unknown> | undefined)?.status === 'Done'
			)
	);

	// Project sync optimization
	let lastProjectSyncTime = 0;
	let lastKnownProjectData: any = null;
	const PROJECT_SYNC_DEBOUNCE = 5000; // 5 seconds

	// Get Svelte Flow helpers
	const { screenToFlowPosition, flowToScreenPosition, getViewport, setViewport, fitView } =
		useSvelteFlow();

	// Search functionality
	let searchState = $derived({
		query: searchQuery,
		matchingNodeIds,
		currentMatchIndex
	});

	function updateMatchingNodes() {
		updateMatches(searchQuery, nodes, searchState, navigateToCurrentMatch);
		matchingNodeIds = searchState.matchingNodeIds;
		currentMatchIndex = searchState.currentMatchIndex;
	}

	function navigateToCurrentMatch() {
		navigateToMatch(searchState, nodes, setViewport);
	}

	function nextMatch() {
		goToNextMatch(searchState, navigateToCurrentMatch);
		currentMatchIndex = searchState.currentMatchIndex;
	}

	function previousMatch() {
		goToPreviousMatch(searchState, navigateToCurrentMatch);
		currentMatchIndex = searchState.currentMatchIndex;
	}

	// Handle selection changes
	function handleSelectionChange(event: any) {
		if (event?.nodes) {
			selectedNodes = event.nodes;
		}
	}

	// Delete all selected nodes
	async function deleteSelectedNodes() {
		if (selectedNodes.length === 0) return;
		if (
			!confirm(
				`Delete ${selectedNodes.length} selected node${selectedNodes.length > 1 ? 's' : ''}?`
			)
		)
			return;

		for (const node of selectedNodes) {
			nodesService.deleteNode(node.id);
		}

		selectedNodes = [];
	}

	// Toggle Done status for all selected nodes
	async function toggleSelectedDone() {
		if (selectedNodesWithStatus.length === 0) return;

		for (const node of selectedNodesWithStatus) {
			const nodeData = { ...(node.data.nodeData || {}) } as any;
			if (allSelectedDone) {
				delete nodeData.status;
			} else {
				nodeData.status = 'Done';
			}
			await nodesService.updateNode(node.id, {
				data: { ...node.data, nodeData }
			});
		}

		if (onProjectUpdate) onProjectUpdate();
	}

	// Helper function to get viewport center position
	function getViewportCenterPosition() {
		const flowWrapper =
			document.querySelector('.svelte-flow') ||
			document.querySelector('[data-testid="rf__wrapper"]');
		if (flowWrapper) {
			const rect = flowWrapper.getBoundingClientRect();
			const screenCenter = {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2
			};
			return screenToFlowPosition(screenCenter);
		}
		// Fallback position
		return screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
	}

	// Stage edits immediately so remote snapshots cannot erase an unsaved drag.
	$effect(() => {
		if (!nodesService || !persistence.stage(nodes, edges)) return;
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => void saveCanvas(), 100);
	});

	async function saveCanvas(): Promise<void> {
		if (disposed || !nodesService) return;
		persistence.stage(nodes, edges);
		try {
			await persistence.flush();
			if (!disposed) saveError = null;
		} catch (error) {
			if (!disposed) saveError = 'Could not save canvas changes. Please retry.';
			console.error('Failed to save canvas:', error);
		}
	}

	// Optimized project sync - only when actually needed
	$effect(() => {
		if (projectSlug && projectsService && nodes.length > 0) {
			// Much longer interval since project data rarely changes
			const interval = setInterval(() => {
				checkAndSyncProjectNode();
			}, 10000); // Check every 10 seconds instead of 1 second

			return () => clearInterval(interval);
		}
	});

	// Viewport saving with debounce
	let viewportSaveTimeout: ReturnType<typeof setTimeout>;
	const VIEWPORT_SAVE_DELAY = 100; // Save after 500ms of inactivity

	// Functions for viewport position management
	async function saveViewportPosition() {
		if (!projectSlug || !projectsService) return;

		// Get current user ID
		const currentUser = $authStore.user;
		if (!currentUser) {
			console.log('Canvas: No user logged in, cannot save viewport');
			return;
		}

		try {
			const viewport = getViewport();
			const viewportData = {
				x: viewport.x,
				y: viewport.y,
				zoom: viewport.zoom
			};

			// Get existing project data to preserve existing viewport positions
			const projectResult = projectsService.getProject(projectSlug);
			const project = await projectResult;

			// Get existing viewport positions object, or create new one
			const existingViewportPositions = (project as any)?.viewportPositions || {};

			// Update viewport position for current user
			const updatedViewportPositions = {
				...existingViewportPositions,
				[currentUser.uid]: viewportData
			};

			// Save to Firebase using projects service
			await projectsService.updateProject(projectSlug, {
				viewportPositions: updatedViewportPositions
			} as any);
			console.log('Canvas: Saved viewport position for user:', currentUser.uid, viewportData);
		} catch (error) {
			console.error('Canvas: Failed to save viewport position:', error);
		}
	}

	function debouncedSaveViewport() {
		clearTimeout(viewportSaveTimeout);
		viewportSaveTimeout = setTimeout(() => {
			saveViewportPosition();
		}, VIEWPORT_SAVE_DELAY);
	}

	async function loadViewportPosition() {
		if (!projectSlug || !projectsService) return;

		// Get current user ID
		const currentUser = $authStore.user;
		if (!currentUser) {
			console.log('Canvas: No user logged in, cannot load viewport');
			return;
		}

		try {
			const projectResult = projectsService.getProject(projectSlug);
			const project = await projectResult;

			// Check for user-specific viewport position
			const userViewportPosition = (project as any)?.viewportPositions?.[currentUser.uid];

			if (userViewportPosition) {
				const { x, y, zoom } = userViewportPosition;
				// Use setTimeout to ensure SvelteFlow is fully mounted
				setTimeout(() => {
					if (disposed) return;
					setViewport({ x, y, zoom }, { duration: 0 });
					console.log(
						'Canvas: Restored viewport position for user:',
						currentUser.uid,
						userViewportPosition
					);
				}, 0);
			} else {
				console.log('Canvas: No saved viewport position found for user:', currentUser.uid);
			}
		} catch (error) {
			console.error('Canvas: Failed to load viewport position:', error);
		}
	}

	// Handle viewport move events
	function handleViewportChange() {
		// Save position when user moves the viewport (debounced)
		debouncedSaveViewport();
	}

	// Listen for node events
	const handleNodeDeleteEvent = (payload: CanvasPayloads['nodeDelete']) => {
		handleNodeDelete(payload.nodeId);
	};
	const handleNodeUpdateEvent = (payload: CanvasPayloads['nodeUpdate']) => {
		void editCommand.run(() => nodesService.updateNode(payload.nodeId, payload.data));
	};
	const handleNodeEditEvent = (payload: CanvasPayloads['nodeEdit']) => {
		editNodeId = payload.nodeId;
		// Get the latest node data from the nodes array instead of the event
		// This ensures we have the most up-to-date data, including any recent image uploads
		const currentNode = nodes.find((n) => n.id === payload.nodeId);
		editNodeData = currentNode?.data?.nodeData || payload.nodeData;
		editTemplateType = payload.templateType;
		showEditPanel = true;
		// Close other panels if open to avoid conflicts
		showNodeTaskSidebar = false;
		showStickerPanel = false;
		// Notify parent to close other panels
		onPanelOpen?.();
	};

	const handleNodeTasksOpenEvent = (payload: CanvasPayloads['nodeTasksOpen']) => {
		// Clean up previous subscription if any
		if (taskSubscriptionCleanup) {
			taskSubscriptionCleanup();
			taskSubscriptionCleanup = null;
		}

		taskSidebarNodeId = payload.nodeId;
		taskSidebarNodeTitle = payload.nodeTitle;
		taskSidebarTasks = payload.tasks;
		showNodeTaskSidebar = true;
		// Notify parent to close other panels
		onPanelOpen?.();

		// Set up real-time subscription if available
		if (taskService.subscribeToNodeTasks) {
			taskSubscriptionCleanup = taskService.subscribeToNodeTasks(
				payload.nodeId,
				(updatedTasks) => {
					console.log('Real-time task update:', updatedTasks);
					taskSidebarTasks = [...updatedTasks];
				},
				projectSlug
			);
		}

		// Close other panels if open to avoid conflicts
		showEditPanel = false;
		showStickerPanel = false;
	};

	const handleAddTaskEvent = (payload: CanvasPayloads['addTask']) => {
		taskModalNodeId = payload.nodeId;
		taskModalTask = undefined; // undefined = add mode
		showTaskModal = true;
	};

	const handleAddStickerEvent = (payload: CanvasPayloads['addSticker']) => {
		void handleAddSticker(payload);
	};

	provideCanvasActions({
		nodeDelete: handleNodeDeleteEvent,
		nodeUpdate: handleNodeUpdateEvent,
		nodeEdit: handleNodeEditEvent,
		nodeTasksOpen: handleNodeTasksOpenEvent,
		addTask: handleAddTaskEvent,
		addSticker: handleAddStickerEvent
	});

	onMount(() => {
		let previousNodeCount: number | undefined;
		let initialNodeTimeout: ReturnType<typeof setTimeout>;
		const disconnect = connectCanvas(
			async () => {
				const project = projectSlug ? await projectsService.getProject(projectSlug) : null;
				if (projectSlug && !project) throw new Error('Project not found');
				nodesService = createNodesService(project?.id ?? 'default-project', projectSlug);
				if (!disposed) await loadViewportPosition();
				return nodesService;
			},
			{
				nodes: (updatedNodes) => {
					nodes = persistence.receiveNodes(updatedNodes);
					if (projectSlug && previousNodeCount !== updatedNodes.length) {
						previousNodeCount = updatedNodes.length;
						void Promise.resolve(
							projectsService.updateNodeCount(projectSlug, updatedNodes.length)
						).catch(console.error);
					}
					if (updatedNodes.length === 0 && !hasAttemptedProjectNodeCreation) {
						hasAttemptedProjectNodeCreation = true;
						initialNodeTimeout = setTimeout(() => {
							if (!disposed && nodes.length === 0) {
								void createSyncedProjectNode(getViewportCenterPosition()).catch(console.error);
							}
						}, 100);
					}
				},
				edges: (updatedEdges) => {
					edges = persistence.receiveEdges(updatedEdges);
				},
				error: (error) => {
					canvasError = 'Could not load this canvas. Please reload to try again.';
					console.error('Failed to load canvas:', error);
				}
			}
		);

		return () => {
			disposed = true;
			disconnect();
			persistence.dispose();
			clearTimeout(initialNodeTimeout);
			clearTimeout(saveTimeout);
			clearTimeout(viewportSaveTimeout);

			// Clean up task subscription
			if (taskSubscriptionCleanup) {
				taskSubscriptionCleanup();
				taskSubscriptionCleanup = null;
			}
		};
	});

	function handleCanvasClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		// Check if clicking on the background pane (not on nodes, controls, etc.)
		// Use more specific targeting to avoid duplicate triggers
		if (
			target.classList.contains('svelte-flow__pane') ||
			target.classList.contains('react-flow__pane') ||
			(target.closest('.svelte-flow') &&
				!target.closest('.svelte-flow__node') &&
				!target.closest('.svelte-flow__controls') &&
				!target.closest('.svelte-flow__minimap') &&
				target === target.closest('.svelte-flow')?.querySelector('.svelte-flow__renderer'))
		) {
			// Prevent multiple rapid clicks
			if (showCreateModal) return;

			// Get the center of the viewport
			// createPosition = getViewportCenterPosition();
			// showCreateModal = true;
		}
	}

	async function handleCreateNode(templateType: string) {
		// Prevent duplicate node creation if modal is already closing
		if (!showCreateModal || !nodesService) return;

		const result = await editCommand.run(() => nodesService.addNode(templateType, createPosition));
		if (result.ok) showCreateModal = false;
	}

	function handleToolbarCreateNode(templateType: string) {
		if (!nodesService) return;

		// Get the center of the viewport for toolbar-created nodes
		const centerPosition = getViewportCenterPosition();
		void editCommand.run(() => nodesService.addNode(templateType, centerPosition));
	}

	// ── Canvas image drag-and-drop ───────────────────────────────────────────

	let canvasDragOver = $state(false);
	let canvasUploading = $state(false);

	function handleCanvasDragOver(e: DragEvent) {
		const types = e.dataTransfer?.types ?? [];
		const isFile = types.includes('Files');
		const isSticker = types.includes('application/borg-sticker');
		if (!isFile && !isSticker) return;
		// Don't intercept if the target is an existing node (let ImageNode handle it)
		const target = e.target as HTMLElement;
		if (target.closest('.svelte-flow__node')) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'copy';
		canvasDragOver = true;
	}

	function handleCanvasDragLeave(e: DragEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node)) {
			canvasDragOver = false;
		}
	}

	async function handleCanvasDrop(e: DragEvent) {
		e.preventDefault();
		canvasDragOver = false;

		const target = e.target as HTMLElement;
		if (target.closest('.svelte-flow__node')) return;
		if (!nodesService) return;

		// ── Sticker drop ──────────────────────────────────────────────────────
		const stickerJson = e.dataTransfer?.getData('application/borg-sticker');
		if (stickerJson) {
			try {
				const stickerData = JSON.parse(stickerJson);
				const dropPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				const position = { x: dropPos.x - 50, y: dropPos.y - 50 };

				const newNode = await nodesService.addNode('sticker', position);
				if (newNode?.id) {
					await nodesService.updateNode(newNode.id, {
						nodeData: {
							title: stickerData.name,
							stickerUrl: stickerData.stickerUrl,
							category: stickerData.category || '',
							filename: stickerData.filename || '',
							width: 100,
							height: 100,
							rotation: 0
						}
					});
				}
			} catch (err) {
				console.error('Canvas sticker drop failed', err);
			}
			return;
		}

		// ── Image file drop ───────────────────────────────────────────────────
		const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
			f.type.startsWith('image/')
		);
		if (files.length === 0) return;

		canvasUploading = true;

		for (const file of files) {
			try {
				const dropPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				const position = { x: dropPos.x - 100, y: dropPos.y - 75 };

				const newNode = await nodesService.addNode('image', position);
				if (!newNode?.id) continue;

				const downloadURL = await imageService.uploadImage(newNode.id, file);

				await nodesService.updateNode(newNode.id, {
					nodeData: { imageUrl: downloadURL }
				});
			} catch (err) {
				console.error('Canvas image drop upload failed', err);
			}
		}

		canvasUploading = false;
	}

	function handleShowStickers() {
		console.log('🎨 handleShowStickers called, current state:', showStickerPanel);
		// Close other drawers/panels when opening sticker panel
		showEditPanel = false;
		showNodeTaskSidebar = false;
		showStickerPanel = true;
		// Notify parent to close other panels
		onPanelOpen?.();
		console.log('🎨 showStickerPanel set to:', showStickerPanel);
	}

	function handleCloseCanvasPanels() {
		console.log('🎨 handleCloseCanvasPanels called - closing all Canvas panels');
		showEditPanel = false;
		showNodeTaskSidebar = false;
		showStickerPanel = false;
	}

	// Handle add sticker event (click-based)
	async function handleAddSticker(payload: CanvasPayloads['addSticker']) {
		console.log('🎨 Canvas received add sticker event:', payload);

		if (!nodesService) return;

		let baseNode: any = null;
		try {
			const stickerData = payload;

			if (stickerData.type === 'sticker') {
				// Validate sticker data first
				if (!stickerData.name || !stickerData.stickerUrl) {
					console.error('❌ Invalid sticker data - missing name or stickerUrl');
					return;
				}

				// Create sticker at center of viewport
				const position = getViewportCenterPosition();

				// Create sticker node with complete data in one step instead of two
				const stickerNodeData = {
					title: stickerData.name,
					stickerUrl: stickerData.stickerUrl,
					category: stickerData.category || '',
					filename: stickerData.filename || '',
					width: 100,
					height: 100,
					rotation: 0
				};

				// First create a basic sticker node using the service
				baseNode = await nodesService.addNode('sticker', position);
				console.log('🎨 Created base sticker node:', baseNode);

				// Then immediately update it with the sticker-specific data
				const success = await nodesService.updateNode(baseNode.id, {
					nodeData: stickerNodeData
				});

				if (success) {
					console.log('✅ Sticker node created and updated with data');
					baseNode = null; // Clear reference since update succeeded
				} else {
					console.error('❌ Failed to update sticker node with data, cleaning up incomplete node');
					// Clean up the incomplete node
					try {
						await nodesService.deleteNode(baseNode.id);
						console.log('🧹 Cleaned up incomplete sticker node');
					} catch (deleteError) {
						console.error('❌ Failed to clean up incomplete sticker node:', deleteError);
					}
					throw new Error('Failed to update sticker node with complete data');
				}
			}
		} catch (error) {
			console.error('❌ Failed to add sticker:', error);

			// Additional cleanup if baseNode was created but update failed
			if (baseNode && baseNode.id) {
				try {
					await nodesService.deleteNode(baseNode.id);
					console.log('🧹 Emergency cleanup of incomplete sticker node');
				} catch (deleteError) {
					console.error('❌ Failed emergency cleanup of sticker node:', deleteError);
				}
			}
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === '/' && !showCreateModal && !showEditPanel) {
			event.preventDefault();

			// Get the center of the viewport
			createPosition = getViewportCenterPosition();
			showCreateModal = true;
		}
	}

	function handleConnect(connection: Connection) {
		const edge: Edge = {
			id: `edge-${connection.source}-${connection.target}`,
			source: connection.source!,
			target: connection.target!,
			type: 'default',
			style: 'stroke: #d4d4d8; stroke-width: 1px;'
		};
		nodesService.addEdge(edge);
	}

	async function handleBeforeDelete({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}: {
		nodes: Node[];
		edges: Edge[];
	}) {
		// Prevent node deletion by returning false if any nodes would be deleted
		if (nodesToDelete.length > 0) {
			return false; // This should prevent the deletion
		}
		// Allow edge deletion
		return true;
	}

	function handleDelete({
		nodes: nodesToDelete,
		edges: edgesToDelete
	}: {
		nodes: Node[];
		edges: Edge[];
	}) {
		// This should only be called for edges now due to onbeforedelete
		edgesToDelete.forEach((edge) => {
			nodesService.deleteEdge(edge.id);
		});
	}

	function handleNodeDelete(nodeId: string) {
		void editCommand.run(() => nodesService.deleteNode(nodeId));
	}

	async function handleEditPanelSave(nodeId: string, data: any) {
		console.log('Canvas.handleEditPanelSave called:', { nodeId, data });
		const result = await editCommand.run(() => nodesService.updateNode(nodeId, data));
		if (!result.ok) return;

		// Check if status changed - if so, trigger project update to refresh status counts
		const hasStatusChange = data.nodeData && data.nodeData.status !== undefined;

		// If this is a project node, sync changes back to project metadata
		const node = nodes.find((n) => n.id === nodeId);
		if (node && node.data.templateType === 'project' && projectSlug && projectsService) {
			const nodeData = data.nodeData;
			const updates: any = {};

			// Sync title, status, and collaborators back to project metadata
			if (nodeData.title !== undefined) {
				updates.title = nodeData.title;
			}
			if (nodeData.status !== undefined) {
				updates.status = nodeData.status;
			}
			if (nodeData.collaborators !== undefined) {
				updates.collaborators = nodeData.collaborators;
			}

			// Include node count in the same update to batch requests
			updates.nodeCount = nodes.length;

			if (Object.keys(updates).length > 1) {
				// More than just nodeCount
				await editCommand.run(() => projectsService.updateProject(projectSlug, updates));
			}
		}

		// Notify parent component to refresh project data if status changed
		if (hasStatusChange && onProjectUpdate) {
			onProjectUpdate();
		}
	}

	async function handleEditPanelDelete(nodeId: string) {
		if (nodeId.startsWith('project-')) return;
		const result = await editCommand.run(() => nodesService.deleteNode(nodeId));
		if (result.ok) showEditPanel = false;
	}

	// Handle node drag start to bring node to front by reordering array
	function handleNodeDragStart(event: any) {
		console.log('Node drag started, bringing to front...', event);
		if (event && event.node) {
			const draggedNodeId = event.node.id;
			// Remove the dragged node from its current position
			const draggedNode = nodes.find((node) => node.id === draggedNodeId);
			const otherNodes = nodes.filter((node) => node.id !== draggedNodeId);

			if (draggedNode) {
				// Move dragged node to the end of the array (renders on top)
				// The updatedAt will be set when saving, which will persist this ordering
				nodes = [...otherNodes, draggedNode];
			}
		}
	}

	function handleNodeDragStop() {
		clearTimeout(saveTimeout);
		void saveCanvas();
	}

	// Function to refresh task sidebar data only (no global event spam)
	async function handleTasksUpdated() {
		console.log('Canvas: handleTasksUpdated called - refreshing sidebar only');

		// Only refresh the sidebar if it's open - no global event spam
		if (showNodeTaskSidebar && taskSidebarNodeId && taskService) {
			console.log('Canvas: Refreshing sidebar tasks for node:', taskSidebarNodeId);
			const tasksResult = taskService.getNodeTasks(taskSidebarNodeId, projectSlug);
			const updatedTasks = await tasksResult;
			console.log('Canvas: Updated sidebar tasks:', updatedTasks.length);
			taskSidebarTasks = [...updatedTasks];
		}
	}

	// Handle task modal completion
	function handleTaskModalComplete() {
		showTaskModal = false;
		// Refresh task sidebar if it's open and refresh nodes
		handleTasksUpdated();
	}

	async function createSyncedProjectNode(position: { x: number; y: number }) {
		if (!projectSlug || !projectsService || !nodesService) {
			if (nodesService) {
				const result = nodesService.addNode('project', position);
				void result.catch(console.error);
			}
			return;
		}

		// Get project data
		let project: any;
		try {
			const projectResult = projectsService.getProject(projectSlug);
			project = await projectResult;
		} catch (error) {
			console.error('Failed to load project for node creation:', error);
			if (nodesService) {
				const result = nodesService.addNode('project', position);
				void result.catch(console.error);
			}
			return;
		}

		if (!project) {
			if (nodesService) {
				const result = nodesService.addNode('project', position);
				void result.catch(console.error);
			}
			return;
		}

		// Use the service's addNode method which properly handles Firebase
		try {
			const newNode = await nodesService.addNode('project', position);

			// Update the node with project data
			const nodeData = {
				title: project.title,
				status: project.status,
				collaborators: project.collaborators || [],
				website: ''
			};

			// Update the node with the synced data
			await nodesService.updateNode(newNode.id, {
				data: {
					...newNode.data,
					nodeData
				}
			});
		} catch (error) {
			console.error('Failed to create synced project node:', error);
		}
	}

	// Optimized project sync that only runs when project data actually changes
	async function checkAndSyncProjectNode() {
		if (!projectSlug || !projectsService) return;

		const now = Date.now();
		if (now - lastProjectSyncTime < PROJECT_SYNC_DEBOUNCE) {
			return; // Skip if we synced recently
		}

		let project: any;
		try {
			const projectResult = projectsService.getProject(projectSlug);
			project = await projectResult;
		} catch (error) {
			console.error('Failed to load project for sync check:', error);
			return;
		}

		if (!project) return;

		// Check if project data actually changed
		const projectDataString = JSON.stringify({
			title: project.title,
			status: project.status,
			collaborators: project.collaborators
		});

		if (lastKnownProjectData === projectDataString) {
			return; // No changes, skip sync
		}

		console.log('Project data changed, syncing nodes...');
		lastKnownProjectData = projectDataString;
		lastProjectSyncTime = now;

		await syncProjectNode(project);
	}

	async function syncProjectNode(project?: any) {
		if (!projectSlug || !projectsService) return;

		// Get project data if not provided
		if (!project) {
			try {
				const projectResult = projectsService.getProject(projectSlug);
				project = await projectResult;
			} catch (error) {
				console.error('Failed to load project for sync:', error);
				return;
			}
		}

		if (!project) return;

		// Find ALL project nodes and sync them
		const projectNodes = nodes.filter((node) => node.data.templateType === 'project');

		for (const node of projectNodes) {
			const currentTitle = (node.data.nodeData as any)?.title;
			const currentStatus = (node.data.nodeData as any)?.status;

			// Only update if title or status has changed
			if (currentTitle !== (project as any).title || currentStatus !== (project as any).status) {
				try {
					await nodesService.updateNode(node.id, {
						data: {
							...node.data,
							nodeData: {
								...(node.data.nodeData || {}),
								title: (project as any).title,
								status: (project as any).status,
								collaborators: (project as any).collaborators || []
							}
						}
					});
				} catch (error) {
					console.error(`Failed to sync project node ${node.id}:`, error);
				}
			}
		}
	}

	// Get display label for a node in the node list
	function getNodeLabel(node: Node): string {
		const nd = node.data?.nodeData as Record<string, unknown> | undefined;
		const type = node.data?.templateType as string | undefined;
		return (
			(nd?.title as string) ||
			(nd?.name as string) ||
			(nd?.content as string)?.slice?.(0, 40) ||
			type ||
			'Untitled'
		);
	}

	// Focus a node in the viewport and open its inspector
	function focusNode(node: Node) {
		fitView({ nodes: [node], duration: 400, padding: 0.5 });
		editNodeId = node.id;
		editNodeData = node.data?.nodeData || {};
		editTemplateType = (node.data?.templateType as string) || 'blank';
		showEditPanel = true;
		showNodeTaskSidebar = false;
		showStickerPanel = false;
	}

	// Filtered node list (exclude stickers and images from the list)
	let listedNodes = $derived(
		nodes.filter((n) => n.data?.templateType !== 'sticker' && n.data?.templateType !== 'image')
	);

	// Active tasks grouped by node for sidebar (sidebar-display shape, distinct
	// from projectStore.tasksByNode which UniversalNode reads for badge counts)
	let activeTasks = $derived(projectStore.tasks.filter((t) => (t.status || 'active') === 'active'));
	// Live node titles from the already-subscribed nodes array, so the
	// sidebar reflects a node's current title immediately on rename instead
	// of a stored copy on the task that has no update path.
	let liveNodeTitles = $derived.by(() => {
		const map = new SvelteMap<string, string>();
		for (const node of nodes) map.set(node.id, getNodeLabel(node));
		return map;
	});
	let sidebarTasksByNode = $derived(
		activeTasks.reduce(
			(acc, task) => {
				if (!acc[task.nodeId]) {
					const nodeTitle = liveNodeTitles.get(task.nodeId) ?? task.nodeTitle ?? 'Untitled';
					acc[task.nodeId] = { nodeTitle, tasks: [] };
				}
				acc[task.nodeId].tasks.push(task);
				return acc;
			},
			{} as Record<string, { nodeTitle: string; tasks: typeof activeTasks }>
		)
	);
</script>

<svelte:window on:keydown={handleKeyDown} />

<!-- Canvas and Sidebar Container -->
<div class="flex h-full w-full">
	<!-- Canvas -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative flex-1" onclick={handleCanvasClick}>
		<AsyncStatus
			state={{ status: projectStore.status, error: projectStore.error }}
			onRetry={() => projectStore.retry()}
		/>
		<AsyncStatus state={$editCommand} pendingLabel="Saving…" />
		{#if canvasError || saveError}
			<div
				role="alert"
				class="absolute top-16 left-3 z-50 rounded border border-red-300 bg-white p-3 text-sm text-red-800"
			>
				{canvasError || saveError}
				{#if saveError}<button class="ml-2 underline" onclick={() => void saveCanvas()}
						>Retry save</button
					>{/if}
			</div>
		{/if}
		<!-- Floating Toolbar -->
		<Toolbar
			view="project"
			onCreateNode={handleToolbarCreateNode}
			onShowStickers={handleShowStickers}
		/>

		<!-- Bulk Action Buttons -->
		{#if selectedNodes.length > 0}
			<div class="absolute bottom-8 left-1/2 z-30 -translate-x-1/2">
				<div class="flex gap-2 rounded-lg border border-zinc-200 bg-white p-1.5">
					{#if selectedNodesWithStatus.length > 0}
						<button
							onclick={toggleSelectedDone}
							class="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors hover:cursor-pointer {allSelectedDone
								? 'border-green-300 bg-green-100 text-green-800 hover:bg-green-200'
								: 'border-green-300 bg-green-100 text-green-800 hover:bg-green-200'}"
						>
							{allSelectedDone ? 'Mark Undone' : 'Mark Done'}
						</button>
					{/if}
					<button
						onclick={deleteSelectedNodes}
						class="flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:cursor-pointer hover:bg-red-100"
					>
						Delete ({selectedNodes.length})
					</button>
				</div>
			</div>
		{/if}

		<div
			class="relative h-full w-full"
			ondragover={handleCanvasDragOver}
			ondragleave={handleCanvasDragLeave}
			ondrop={handleCanvasDrop}
			role="region"
			aria-label="Canvas"
		>
			{#if canvasDragOver || canvasUploading}
				<div
					class="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-white/60 bg-black/30"
				>
					<div class="flex flex-col items-center gap-2 text-sm font-medium text-white drop-shadow">
						{#if canvasUploading}
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></div>
							<span>Uploading...</span>
						{:else}
							<span>Drop to add to canvas</span>
						{/if}
					</div>
				</div>
			{/if}
			<SvelteFlow
				onpanecontextmenu={openCreationMenu}
				class="bg-black"
				bind:nodes
				bind:edges
				{nodeTypes}
				defaultEdgeOptions={{ style: 'stroke: #d4d4d8; stroke-width: 1px;' }}
				onconnect={handleConnect}
				onbeforedelete={handleBeforeDelete}
				ondelete={handleDelete}
				onnodedragstart={handleNodeDragStart}
				onnodedragstop={handleNodeDragStop}
				onmoveend={handleViewportChange}
				onselectionchange={handleSelectionChange}
				nodesDraggable={true}
				nodesConnectable={true}
				elevateNodesOnSelect={true}
				minZoom={0.3}
				deleteKey={['Delete', 'Backspace']}
				panOnDrag={false}
				panOnScroll={true}
				panOnScrollSpeed={1}
				zoomOnScroll={false}
				zoomOnPinch={true}
			>
				{#if creationMenu}
					{#key creationMenu}
						<NodeCreationMenu
							position={creationMenu}
							view="project"
							onCreate={createFromMenu}
							onClose={() => (creationMenu = null)}
						/>
					{/key}
				{/if}
				<Background />
				<Controls />
				<Panel position="bottom-right">
					<button
						onclick={() => (showMinimap = !showMinimap)}
						class="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50"
					>
						{showMinimap ? 'Hide' : 'Show'} Map
					</button>
				</Panel>
				{#if showMinimap}
					<MiniMap class="border border-zinc-200" style="margin-bottom: 54px" />
				{/if}
			</SvelteFlow>
		</div>

		<!-- Node Task Sidebar (overlay on canvas) -->
		{#if showNodeTaskSidebar}
			<div class="absolute inset-y-0 right-0 z-40 flex">
				<NodeTaskSidebar
					nodeId={taskSidebarNodeId}
					nodeTitle={taskSidebarNodeTitle}
					{projectSlug}
					tasks={taskSidebarTasks}
					onClose={() => {
						if (taskSubscriptionCleanup) {
							taskSubscriptionCleanup();
							taskSubscriptionCleanup = null;
						}
						showNodeTaskSidebar = false;
					}}
					onTasksUpdated={handleTasksUpdated}
				/>
			</div>
		{/if}

		<!-- Sticker Panel (overlay on canvas) -->
		{#if showStickerPanel}
			<div class="absolute inset-y-0 right-0 z-40 flex">
				<StickerPanel bind:isOpen={showStickerPanel} onClose={() => (showStickerPanel = false)} />
			</div>
		{/if}
	</div>

	<!-- Right Sidebar -->
	{#if showRightSidebar}
		<div
			role="complementary"
			aria-label="Project sidebar"
			class="flex h-full min-h-0 w-80 max-w-[85vw] flex-shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white"
		>
			<div class="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
				<span class="font-sans text-xs font-semibold text-zinc-900">Project</span>
				<button
					onclick={() => (showRightSidebar = false)}
					aria-label="Collapse sidebar"
					title="Collapse sidebar"
					class="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
					><ChevronRight class="h-4 w-4" /></button
				>
			</div>
			<!-- Top: Tabs + Search -->
			<div class="flex flex-col gap-3 border-b border-zinc-200 px-3 py-3">
				<!-- Tabs -->
				<div class="flex rounded-md bg-zinc-100 p-1 text-xs">
					<button
						onclick={() => {
							sidebarTab = 'nodes';
							showEditPanel = false;
						}}
						class="flex-1 rounded py-1 font-medium transition-colors {sidebarTab === 'nodes'
							? 'bg-white text-zinc-900 shadow-sm'
							: 'text-zinc-400 hover:text-zinc-600'}">Nodes</button
					>
					<button
						onclick={() => {
							sidebarTab = 'tasks';
							showEditPanel = false;
						}}
						class="flex-1 rounded py-1 font-medium transition-colors {sidebarTab === 'tasks'
							? 'bg-white text-zinc-900 shadow-sm'
							: 'text-zinc-400 hover:text-zinc-600'}"
						>Tasks{#if activeTasks.length > 0}
							({activeTasks.length}){/if}</button
					>
				</div>
				<!-- Search (nodes tab only) -->
				{#if sidebarTab === 'nodes' && !showEditPanel}
					<div class="flex items-center gap-1">
						<input
							type="text"
							bind:value={searchQuery}
							oninput={updateMatchingNodes}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									if (e.shiftKey) {
										previousMatch();
									} else {
										nextMatch();
									}
								}
							}}
							placeholder="Search nodes..."
							class="min-w-0 flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-black placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
						/>
						{#if matchingNodeIds.length > 0}
							<span class="shrink-0 text-xs text-zinc-500"
								>{currentMatchIndex + 1}/{matchingNodeIds.length}</span
							>
							<button
								onclick={previousMatch}
								class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
								title="Previous (Shift+Enter)"
								aria-label="Previous match"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
								>
							</button>
							<button
								onclick={nextMatch}
								class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
								title="Next (Enter)"
								aria-label="Next match"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg
								>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Content -->
			{#if sidebarTab === 'tasks'}
				<!-- Task list -->
				<div class="min-h-0 flex-1 overflow-y-auto">
					{#if activeTasks.length === 0}
						<p class="p-4 text-center text-xs text-zinc-400">No active tasks</p>
					{:else}
						<div class="space-y-5 p-4">
							{#each Object.entries(sidebarTasksByNode) as [nodeId, nodeGroup] (nodeId)}
								<div>
									<p class="mb-2 px-1 text-xs font-semibold text-zinc-800">{nodeGroup.nodeTitle}</p>
									{#each nodeGroup.tasks as task (task.id)}
										<div
											class="flex items-start gap-2 rounded px-1 py-1.5 text-xs hover:bg-zinc-50"
										>
											<button
												onclick={async () => {
													const result = taskService.resolveTask(
														task.nodeId,
														task.id,
														task.projectSlug
													);
													await result;
												}}
												class="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-zinc-300 hover:border-green-500 hover:bg-green-50"
												aria-label="Mark task as complete"
											></button>
											<span class="text-zinc-700">{task.title}</span>
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if showEditPanel && editNodeId}
				<!-- Back to node list -->
				<button
					onclick={() => (showEditPanel = false)}
					class="flex w-full items-center gap-1 border-b border-zinc-100 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
					>
					All nodes
				</button>
				<!-- Node inspector -->
				<EditPanel
					error={$editCommand.error}
					nodeId={editNodeId}
					nodeData={editNodeData}
					templateType={editTemplateType}
					onSave={handleEditPanelSave}
					onDelete={handleEditPanelDelete}
				/>
			{:else}
				<!-- Node list -->
				<div class="min-h-0 flex-1 overflow-y-auto">
					{#if listedNodes.length === 0}
						<p class="p-4 text-center text-xs text-zinc-400">No nodes yet</p>
					{:else}
						{#each listedNodes as node (node.id)}
							{@const label = getNodeLabel(node)}
							{@const NodeIcon =
								projectToolbarItems.find((item) => item.id === node.data?.templateType)?.icon ??
								Square}
							{#if label}
								<button
									onclick={() => focusNode(node)}
									class="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
								>
									<span
										class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-[10px] font-semibold text-zinc-500"
										><NodeIcon class="h-3.5 w-3.5" /></span
									>
									<span class="min-w-0 flex-1"
										><span class="block truncate text-xs font-medium text-zinc-800">{label}</span
										><span class="mt-0.5 block font-mono text-[11px] text-zinc-400"
											>{getTemplate(node.data?.templateType as string)?.name || 'Node'}</span
										></span
									>
									<ChevronRight class="h-3 w-3 text-zinc-300 opacity-0 group-hover:opacity-100" />
								</button>
							{/if}
						{/each}
					{/if}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Small show-panel button on the right edge when sidebar is hidden -->
		<button
			onclick={() => (showRightSidebar = true)}
			class="absolute top-1/2 right-0 z-50 -translate-y-1/2 rounded-l border border-r-0 border-zinc-200 bg-white px-0.5 py-2 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
			title="Show panel"
		>
			<ChevronLeft class="h-3 w-3" />
		</button>
	{/if}
</div>

{#if showCreateModal}
	<CreateNodeModal
		error={$editCommand.error}
		position={createPosition}
		onCreate={handleCreateNode}
		onClose={() => (showCreateModal = false)}
	/>
{/if}

{#if showTaskModal}
	<TaskModal
		nodeId={taskModalNodeId}
		{projectSlug}
		task={taskModalTask}
		onClose={() => (showTaskModal = false)}
		onTaskAdded={handleTaskModalComplete}
		onTaskUpdated={handleTaskModalComplete}
	/>
{/if}

<!-- Real-time cursors -->
<Cursor {projectSlug} {screenToFlowPosition} {flowToScreenPosition} />
