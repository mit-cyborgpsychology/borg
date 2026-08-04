<script lang="ts">
	import { onMount } from 'svelte';
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
	import { ServiceFactory } from '../services/ServiceFactory';
	import type { INodesService, IProjectsService, ITaskService } from '../services/interfaces';
	import CreateNodeModal from './CreateNodeModal.svelte';
	import EditPanel from './EditPanel.svelte';
	import NodeTaskSidebar from './tasks/NodeTaskSidebar.svelte';
	import TaskModal from './tasks/TaskModal.svelte';
	import Toolbar from './Toolbar.svelte';
	import StickerPanel from './stickers/StickerPanel.svelte';
	import Cursor from './Cursor.svelte';
	import type { Task, TaskWithContext } from '../types/task';
	import { authStore } from '../stores/authStore';
	import {
		updateMatchingNodes as updateMatches,
		navigateToMatch,
		nextMatch as goToNextMatch,
		previousMatch as goToPreviousMatch
	} from '../utils/canvasSearch';
	import { ChevronRight, ChevronLeft } from '@lucide/svelte';
	import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
	import { app } from '../firebase/config';
	import { compressImageFile } from '../utils/resizeImage';
	import '@xyflow/svelte/dist/style.css';
	import './svelteflow.css';

	let {
		projectSlug,
		onProjectUpdate,
		onPanelOpen,
		projectTasks = []
	} = $props<{
		projectSlug?: string;
		onProjectUpdate?: () => void;
		onPanelOpen?: () => void;
		projectTasks?: TaskWithContext[];
	}>();

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
					node.draggable = !(node.data.nodeData && node.data.nodeData.locked);
				}
			});
		}
	});

	// Use $state.raw for better performance with arrays as shown in reference
	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);
	let previousNodes = $state.raw<Node[]>([]);
	let previousEdges = $state.raw<Edge[]>([]);
	let nodesService: INodesService;
	let projectsService: IProjectsService;
	let taskService: ITaskService;
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

	// Flag to prevent redundant auto-saves after explicit saves
	let skipNextAutoSave = $state(false);

	// Selection state
	let selectedNodes = $state<Node[]>([]);
	let selectedNodesWithStatus = $derived(
		selectedNodes.filter(
			(node) =>
				node.data?.templateType !== 'sticker' &&
				node.data?.templateType !== 'image' &&
				node.data?.templateType !== 'iframe'
		)
	);
	let allSelectedDone = $derived(
		selectedNodesWithStatus.length > 0 &&
			selectedNodesWithStatus.every((n) => n.data?.nodeData?.status === 'Done')
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
		skipNextAutoSave = true;
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
		skipNextAutoSave = true;
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

	// Auto-save positions when nodes change (e.g., after dragging)
	// but SKIP if nodes were just added/removed (handled by Firestore subscriptions)
	$effect(() => {
		if (nodesService && nodes.length > 0 && previousNodes.length > 0) {
			// Only trigger auto-save if this is likely a position/content change, not add/remove
			const nodeCountChanged = nodes.length !== previousNodes.length;
			if (nodeCountChanged) {
				// Node was added/removed - don't auto-save as Firestore already has the data
				// Just update our tracking arrays
				previousNodes = [...nodes];
				previousEdges = [...edges];
				return;
			}

			// Check if this is a position change (from dragging) - save immediately
			let hasPositionChanges = false;
			if (previousNodes.length === nodes.length) {
				for (let i = 0; i < nodes.length; i++) {
					const current = nodes[i];
					const previous = previousNodes.find((p) => p.id === current.id);
					if (
						previous &&
						(current.position.x !== previous.position.x ||
							current.position.y !== previous.position.y)
					) {
						hasPositionChanges = true;
						break;
					}
				}
			}

			clearTimeout(saveTimeout);

			// Use shorter timeout for position changes to prevent Firebase conflicts
			const timeout = hasPositionChanges ? 100 : 500;

			saveTimeout = setTimeout(async () => {
				// Skip auto-save if we just did an explicit save
				if (skipNextAutoSave) {
					skipNextAutoSave = false;
					return;
				}

				console.log(
					`Canvas: Auto-saving (hasPositionChanges: ${hasPositionChanges}, timeout: ${timeout}ms)`
				);

				// Use optimized batch save if available, otherwise fall back to regular batch save
				if (
					'saveBatchOptimized' in nodesService &&
					typeof (nodesService as any).saveBatchOptimized === 'function'
				) {
					const result = (nodesService as any).saveBatchOptimized(
						nodes,
						edges,
						previousNodes,
						previousEdges
					);
					if (result instanceof Promise) await result;
				} else {
					const result = nodesService.saveBatch(nodes, edges);
					if (result instanceof Promise) await result;
				}

				// Update previous state after saving
				previousNodes = [...nodes];
				previousEdges = [...edges];

				// Update project node count if we have a project (debounced)
				if (projectSlug && projectsService) {
					await projectsService.updateNodeCount(projectSlug, nodes.length);
				}
			}, timeout);
		}
	});

	// Removed duplicate node count update - handled in auto-save effect above

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
			const project = projectResult instanceof Promise ? await projectResult : projectResult;

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
			const project = projectResult instanceof Promise ? await projectResult : projectResult;

			// Check for user-specific viewport position
			const userViewportPosition = (project as any)?.viewportPositions?.[currentUser.uid];

			if (userViewportPosition) {
				const { x, y, zoom } = userViewportPosition;
				// Use setTimeout to ensure SvelteFlow is fully mounted
				setTimeout(() => {
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

	onMount(() => {
		projectsService = ServiceFactory.createProjectsService();
		taskService = ServiceFactory.createTaskService();

		// Initialize services asynchronously to get actual project ID
		(async () => {
			// Get the actual project ID from project slug
			let actualProjectId = 'default-project';
			if (projectSlug && projectsService) {
				try {
					const project = projectsService.getProject
						? await projectsService.getProject(projectSlug)
						: projectsService.getProject(projectSlug);

					if (project) {
						actualProjectId = project.id;
					}
				} catch (error) {
					console.error('Failed to load project:', error);
				}
			}

			// Load and restore viewport position
			await loadViewportPosition();

			nodesService = ServiceFactory.createNodesService(
				actualProjectId,
				(newNodes) => {
					nodes = newNodes;
				},
				() => nodes,
				(newEdges) => {
					edges = newEdges;
				},
				() => edges,
				projectSlug
			);

			// Load initial data - localStorage services use loadFromStorage, Firebase services use subscriptions
			if (nodesService.loadFromStorage) {
				// localStorage service
				nodesService.loadFromStorage();
			} else {
				// Firebase service - set up real-time subscriptions
				console.log('Setting up Firebase subscriptions...');
				console.log('nodesService methods:', {
					subscribeToNodes: !!nodesService.subscribeToNodes,
					subscribeToEdges: !!nodesService.subscribeToEdges
				});

				if (nodesService.subscribeToNodes && nodesService.subscribeToEdges) {
					console.log('Setting up real-time subscriptions');
					// Subscribe to real-time updates
					const unsubscribeNodes = nodesService.subscribeToNodes((updatedNodes) => {
						console.log('Canvas received nodes update:', updatedNodes.length, 'nodes');
						nodes = updatedNodes;
						// Initialize previous state if empty (first load)
						if (previousNodes.length === 0) {
							previousNodes = [...updatedNodes];
						}

						// Check if we need to create initial project node
						if (updatedNodes.length === 0 && !hasAttemptedProjectNodeCreation) {
							hasAttemptedProjectNodeCreation = true;
							console.log('No nodes found, creating initial project node');
							setTimeout(() => {
								const initialPosition = getViewportCenterPosition();
								createSyncedProjectNode(initialPosition);
							}, 100);
						}
					});

					const unsubscribeEdges = nodesService.subscribeToEdges((updatedEdges) => {
						console.log('Canvas received edges update:', updatedEdges.length, 'edges');
						edges = updatedEdges;
						// Initialize previous state if empty (first load)
						if (previousEdges.length === 0) {
							previousEdges = [...updatedEdges];
						}
					});

					// Clean up subscriptions on component destroy
					return () => {
						console.log('Cleaning up Firebase subscriptions');
						unsubscribeNodes();
						unsubscribeEdges();
					};
				} else {
					// Fallback to manual loading if subscriptions not available
					try {
						const nodeResults = nodesService.getNodes();
						const edgeResults = nodesService.getEdges();

						const loadedNodes = nodeResults instanceof Promise ? await nodeResults : nodeResults;
						const loadedEdges = edgeResults instanceof Promise ? await edgeResults : edgeResults;

						nodes = loadedNodes;
						edges = loadedEdges;
						// Initialize previous state for local storage
						previousNodes = [...loadedNodes];
						previousEdges = [...loadedEdges];
					} catch (error) {
						console.error('Failed to load nodes and edges:', error);
					}
				}
			}

			// For localStorage services, handle initial project node creation
			if (nodesService.loadFromStorage) {
				// Add initial project node if none exist, or sync existing project node
				if (nodes.length === 0) {
					// Use a small delay to ensure the Svelte Flow component is fully mounted
					setTimeout(() => {
						if (nodes.length === 0) {
							// Double-check in case nodes were loaded from storage
							const initialPosition = getViewportCenterPosition();
							createSyncedProjectNode(initialPosition);
						}
					}, 100);
				} else {
					// Sync existing project node with project data
					syncProjectNode();
				}
			}
		})();

		// Listen for node events
		const handleNodeDeleteEvent = (event: CustomEvent) => {
			handleNodeDelete(event.detail.nodeId);
		};
		const handleNodeUpdateEvent = (event: CustomEvent) => {
			nodesService.updateNode(event.detail.nodeId, event.detail.data);
		};
		const handleNodeEditEvent = (event: CustomEvent) => {
			editNodeId = event.detail.nodeId;
			// Get the latest node data from the nodes array instead of the event
			// This ensures we have the most up-to-date data, including any recent image uploads
			const currentNode = nodes.find((n) => n.id === event.detail.nodeId);
			editNodeData = currentNode?.data?.nodeData || event.detail.nodeData;
			editTemplateType = event.detail.templateType;
			showEditPanel = true;
			// Close other panels if open to avoid conflicts
			showNodeTaskSidebar = false;
			showStickerPanel = false;
			// Notify parent to close other panels
			onPanelOpen?.();
		};

		const handleNodeTasksOpenEvent = (event: CustomEvent) => {
			// Clean up previous subscription if any
			if (taskSubscriptionCleanup) {
				taskSubscriptionCleanup();
				taskSubscriptionCleanup = null;
			}

			taskSidebarNodeId = event.detail.nodeId;
			taskSidebarNodeTitle = event.detail.nodeTitle;
			taskSidebarTasks = event.detail.tasks;
			showNodeTaskSidebar = true;
			// Notify parent to close other panels
			onPanelOpen?.();

			// Set up real-time subscription if available
			if (taskService.subscribeToNodeTasks) {
				taskSubscriptionCleanup = taskService.subscribeToNodeTasks(
					event.detail.nodeId,
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

		const handleAddTaskEvent = (event: CustomEvent) => {
			taskModalNodeId = event.detail.nodeId;
			taskModalTask = undefined; // undefined = add mode
			showTaskModal = true;
		};

		const handleAddStickerEvent = (event: CustomEvent) => {
			handleAddSticker(event);
		};

		document.addEventListener('nodeDelete', handleNodeDeleteEvent as EventListener);
		document.addEventListener('nodeUpdate', handleNodeUpdateEvent as EventListener);
		document.addEventListener('nodeEdit', handleNodeEditEvent as EventListener);
		document.addEventListener('nodeTasksOpen', handleNodeTasksOpenEvent as EventListener);
		document.addEventListener('addTask', handleAddTaskEvent as EventListener);
		document.addEventListener('addSticker', handleAddStickerEvent as EventListener);
		document.addEventListener('closeCanvasPanels', handleCloseCanvasPanels as EventListener);

		return () => {
			document.removeEventListener('nodeDelete', handleNodeDeleteEvent as EventListener);
			document.removeEventListener('nodeUpdate', handleNodeUpdateEvent as EventListener);
			document.removeEventListener('nodeEdit', handleNodeEditEvent as EventListener);
			document.removeEventListener('nodeTasksOpen', handleNodeTasksOpenEvent as EventListener);
			document.removeEventListener('addTask', handleAddTaskEvent as EventListener);
			document.removeEventListener('addSticker', handleAddStickerEvent as EventListener);
			document.removeEventListener('closeCanvasPanels', handleCloseCanvasPanels as EventListener);

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

	function handleCreateNode(templateType: string) {
		// Prevent duplicate node creation if modal is already closing
		if (!showCreateModal || !nodesService) return;

		(nodesService as any).addNode(templateType, createPosition);
		showCreateModal = false;
	}

	function handleToolbarCreateNode(templateType: string) {
		if (!nodesService) return;

		// Get the center of the viewport for toolbar-created nodes
		const centerPosition = getViewportCenterPosition();
		(nodesService as any).addNode(templateType, centerPosition);
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
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
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

				const newNode = await (nodesService as any).addNode('sticker', position);
				if (newNode?.id) {
					await (nodesService as any).updateNode(newNode.id, {
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
		const storage = getStorage(app);

		for (const file of files) {
			try {
				const dropPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
				const position = { x: dropPos.x - 100, y: dropPos.y - 75 };

				const newNode = await (nodesService as any).addNode('image', position);
				if (!newNode?.id) continue;

				const compressed = await compressImageFile(file);
				const timestamp = Date.now();
				const storageRef = ref(storage, `images/${newNode.id}/${timestamp}_${file.name}`);
				const snapshot = await uploadBytes(storageRef, compressed);
				const downloadURL = await getDownloadURL(snapshot.ref);

				await (nodesService as any).updateNode(newNode.id, {
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
	async function handleAddSticker(event: CustomEvent) {
		console.log('🎨 Canvas received add sticker event:', event.detail);

		if (!nodesService) return;

		let baseNode: any = null;
		try {
			const stickerData = event.detail;

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
				baseNode = await (nodesService as any).addNode('sticker', position);
				console.log('🎨 Created base sticker node:', baseNode);

				// Then immediately update it with the sticker-specific data
				const success = await (nodesService as any).updateNode(baseNode.id, {
					nodeData: stickerNodeData
				});

				if (success) {
					console.log('✅ Sticker node created and updated with data');
					baseNode = null; // Clear reference since update succeeded
				} else {
					console.error('❌ Failed to update sticker node with data, cleaning up incomplete node');
					// Clean up the incomplete node
					try {
						await (nodesService as any).deleteNode(baseNode.id);
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
					await (nodesService as any).deleteNode(baseNode.id);
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
		nodesService.deleteNode(nodeId);
	}

	function handleEditPanelSave(nodeId: string, data: any) {
		console.log('Canvas.handleEditPanelSave called:', { nodeId, data });
		nodesService.updateNode(nodeId, data);
		skipNextAutoSave = true; // Skip the next auto-save since we just did an explicit save

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
				projectsService.updateProject(projectSlug, updates);
			}
		}

		// Notify parent component to refresh project data if status changed
		if (hasStatusChange && onProjectUpdate) {
			onProjectUpdate();
		}
	}

	function handleEditPanelDelete(nodeId: string) {
		console.log('Canvas.handleEditPanelDelete called for:', nodeId);
		console.log('nodesService:', nodesService);

		try {
			const result = nodesService.deleteNode(nodeId);
			console.log('deleteNode result:', result);
			showEditPanel = false;
		} catch (error) {
			console.error('Failed to delete node:', error);
			alert('Failed to delete node. Check console for details.');
		}
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

	// Handle node drag stop to save position immediately
	function handleNodeDragStop(event: any) {
		console.log('Node drag stopped, saving positions...', event);
		console.log('Event details:', {
			node: event?.node,
			targetNode: event?.targetNode,
			eventType: typeof event
		});
		console.log(
			'Current nodes state:',
			nodes.map((n) => ({ id: n.id, position: n.position, templateType: n.data?.templateType }))
		);

		if (nodesService) {
			// Single atomic save - use optimized batch save if available
			if (
				'saveBatchOptimized' in nodesService &&
				typeof (nodesService as any).saveBatchOptimized === 'function'
			) {
				const result = (nodesService as any).saveBatchOptimized(
					nodes,
					edges,
					previousNodes,
					previousEdges
				);
				if (result instanceof Promise) {
					result
						.then(() => {
							console.log('Positions saved after drag (optimized)');
							// Update previous state and skip next auto-save
							previousNodes = [...nodes];
							previousEdges = [...edges];
							skipNextAutoSave = true;
						})
						.catch((error) => {
							console.error('Failed to save positions after drag:', error);
						});
				} else {
					// Update previous state and skip next auto-save
					previousNodes = [...nodes];
					previousEdges = [...edges];
					skipNextAutoSave = true;
				}
			} else if (nodesService.saveBatch) {
				const result = nodesService.saveBatch(nodes, edges);
				if (result instanceof Promise) {
					result
						.then(() => {
							console.log('Positions saved after drag');
							// Update previous state and skip next auto-save
							previousNodes = [...nodes];
							previousEdges = [...edges];
							skipNextAutoSave = true;
						})
						.catch((error) => {
							console.error('Failed to save positions after drag:', error);
						});
				} else {
					// Update previous state and skip next auto-save
					previousNodes = [...nodes];
					previousEdges = [...edges];
					skipNextAutoSave = true;
				}
			}
		}

		// Removed individual node position save to prevent triple saves
		// The batch save above handles all position updates atomically
	}

	// Function to refresh task sidebar data only (no global event spam)
	async function handleTasksUpdated() {
		console.log('Canvas: handleTasksUpdated called - refreshing sidebar only');

		// Only refresh the sidebar if it's open - no global event spam
		if (showNodeTaskSidebar && taskSidebarNodeId && taskService) {
			console.log('Canvas: Refreshing sidebar tasks for node:', taskSidebarNodeId);
			const tasksResult = taskService.getNodeTasks(taskSidebarNodeId, projectSlug);
			const updatedTasks = tasksResult instanceof Promise ? await tasksResult : tasksResult;
			console.log('Canvas: Updated sidebar tasks:', updatedTasks.length);
			taskSidebarTasks = [...updatedTasks];
		}

		// For localStorage services only - refresh storage data
		if (nodesService.loadFromStorage) {
			nodesService.loadFromStorage();
		}
		// Firebase services handle updates via subscriptions automatically
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
				const result = (nodesService as any).addNode('project', position);
				if (result instanceof Promise) result.catch(console.error);
			}
			return;
		}

		// Get project data
		let project: any;
		try {
			const projectResult = projectsService.getProject(projectSlug);
			project = projectResult instanceof Promise ? await projectResult : projectResult;
		} catch (error) {
			console.error('Failed to load project for node creation:', error);
			if (nodesService) {
				const result = (nodesService as any).addNode('project', position);
				if (result instanceof Promise) result.catch(console.error);
			}
			return;
		}

		if (!project) {
			if (nodesService) {
				const result = (nodesService as any).addNode('project', position);
				if (result instanceof Promise) result.catch(console.error);
			}
			return;
		}

		// Use the service's addNode method which properly handles Firebase
		try {
			const newNode = await (nodesService as any).addNode('project', position);

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
			project = projectResult instanceof Promise ? await projectResult : projectResult;
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
				project = projectResult instanceof Promise ? await projectResult : projectResult;
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
		const nd = node.data?.nodeData;
		const type = node.data?.templateType;
		return nd?.title || nd?.name || (nd?.content as string)?.slice?.(0, 40) || type || 'Untitled';
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

	// Filtered node list (exclude stickers/images/iframes for the list)
	let listedNodes = $derived(
		nodes.filter(
			(n) =>
				n.data?.templateType !== 'sticker' &&
				n.data?.templateType !== 'image' &&
				n.data?.templateType !== 'iframe'
		)
	);

	// Active tasks grouped by node for sidebar
	let activeTasks = $derived(projectTasks.filter((t) => (t.status || 'active') === 'active'));
	let tasksByNode = $derived(
		activeTasks.reduce(
			(acc, task) => {
				if (!acc[task.nodeId]) acc[task.nodeId] = { nodeTitle: task.nodeTitle, tasks: [] };
				acc[task.nodeId].tasks.push(task);
				return acc;
			},
			{} as Record<string, { nodeTitle: string; tasks: typeof activeTasks }>
		)
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<svelte:window on:keydown={handleKeyDown} />

<!-- Canvas and Sidebar Container -->
<div class="flex h-full w-full">
	<!-- Canvas -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative flex-1" onclick={handleCanvasClick}>
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
			class="flex h-full min-h-0 w-64 flex-shrink-0 flex-col overflow-hidden border-l border-zinc-200 bg-white"
		>
			<!-- Top: Tabs + Search -->
			<div class="flex flex-col gap-2 border-b border-zinc-200 p-2">
				<!-- Tabs -->
				<div class="flex rounded border border-zinc-200 p-0.5 text-xs">
					<button
						onclick={() => {
							sidebarTab = 'nodes';
							showEditPanel = false;
						}}
						class="flex-1 rounded py-1 font-medium transition-colors {sidebarTab === 'nodes'
							? 'bg-zinc-100 text-zinc-800'
							: 'text-zinc-400 hover:text-zinc-600'}">Nodes</button
					>
					<button
						onclick={() => {
							sidebarTab = 'tasks';
							showEditPanel = false;
						}}
						class="flex-1 rounded py-1 font-medium transition-colors {sidebarTab === 'tasks'
							? 'bg-zinc-100 text-zinc-800'
							: 'text-zinc-400 hover:text-zinc-600'}"
						>Tasks{#if activeTasks.length > 0}
							({activeTasks.length}){/if}</button
					>
				</div>
				<!-- Search (nodes tab only) -->
				{#if sidebarTab === 'nodes'}
					<div class="flex items-center gap-1">
						<input
							type="text"
							bind:value={searchQuery}
							oninput={updateMatchingNodes}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.shiftKey ? previousMatch() : nextMatch();
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
				<div class="flex-1 overflow-y-auto">
					{#if activeTasks.length === 0}
						<p class="p-4 text-center text-xs text-zinc-400">No active tasks</p>
					{:else}
						<div class="space-y-3 p-2">
							{#each Object.entries(tasksByNode) as [, nodeGroup]}
								<div>
									<p class="mb-1 px-1 text-xs font-medium text-zinc-500">{nodeGroup.nodeTitle}</p>
									{#each nodeGroup.tasks as task}
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
													if (result instanceof Promise) await result;
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
					nodeId={editNodeId}
					nodeData={editNodeData}
					templateType={editTemplateType}
					onSave={handleEditPanelSave}
					onDelete={handleEditPanelDelete}
				/>
			{:else}
				<!-- Node list -->
				<div class="flex-1 overflow-y-auto">
					{#if listedNodes.length === 0}
						<p class="p-4 text-center text-xs text-zinc-400">No nodes yet</p>
					{:else}
						{#each listedNodes as node (node.id)}
							{@const label = getNodeLabel(node)}
							{#if label}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									onclick={() => focusNode(node)}
									class="flex cursor-pointer items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs hover:bg-zinc-50"
								>
									<span class="truncate text-zinc-700">{label}</span>
									<span
										class="ml-auto shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-400"
										style="font-size:10px">{node.data?.templateType}</span
									>
								</div>
							{/if}
						{/each}
					{/if}
				</div>
			{/if}

			<!-- Collapse button inside sidebar bottom -->
			<div class="border-t border-zinc-100 p-2">
				<button
					onclick={() => (showRightSidebar = false)}
					class="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600"
					title="Hide panel"
				>
					<ChevronRight class="h-3 w-3" />
					<span>Hide</span>
				</button>
			</div>
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
