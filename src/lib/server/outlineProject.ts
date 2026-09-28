import * as outline from './outlineApi.ts';
import { OutlineProjectError, type OutlineProjectStore } from './outlineProjectStore.ts';

export async function outlineDocumentId(projectId: string, nodeId: string) {
	const digest = new Uint8Array(
		await crypto.subtle.digest(
			'SHA-256',
			new TextEncoder().encode(JSON.stringify(['borg-outline', projectId, nodeId]))
		)
	);
	// This Outline version validates UUID v4 format, including version bits.
	digest[6] = (digest[6] & 15) | 64;
	digest[8] = (digest[8] & 63) | 128;
	const hex = [...digest.slice(0, 16)].map((n) => n.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function projectOutlineDocument(
	store: OutlineProjectStore,
	config: outline.OutlineConfig,
	input: {
		projectId: string;
		nodeId: string;
		action: 'create' | 'read' | 'link' | 'list';
		documentId?: string;
	},
	api = outline
) {
	const projectPath = `projects/${input.projectId}`;
	const nodePath = `${projectPath}/nodes/${input.nodeId}`;
	const [project, node] = await Promise.all([store.get(projectPath), store.get(nodePath)]);
	if (node.data.templateType !== 'outline')
		throw new OutlineProjectError(400, 'This node is not an Outline note.');
	const nodeData = (node.data.nodeData || {}) as Record<string, unknown>;
	const saveDoc = async (doc: Awaited<ReturnType<typeof outline.getDocument>>) => {
		const url = new URL(doc.url);
		if (
			url.origin !== new URL(config.apiUrl).origin ||
			!['https:', 'http:'].includes(url.protocol) ||
			url.username ||
			url.password
		)
			throw new Error('Invalid Outline URL');
		if (doc.deletedAt || doc.archivedAt)
			throw new OutlineProjectError(410, 'This Outline document is archived or deleted.');
		const latest = await store.get(nodePath);
		const previous = (latest.data.nodeData || {}) as Record<string, unknown>;
		if (input.action === 'read' && previous.outlineDocId !== doc.id)
			throw new OutlineProjectError(
				409,
				'This note was linked to a different document. Please reopen it.'
			);
		const values = {
			outlineDocId: doc.id,
			outlineUrl: doc.url,
			title: doc.title,
			outlineUpdatedAt: doc.updatedAt || null
		};
		if (Object.entries(values).some(([key, value]) => (previous[key] ?? null) !== value)) {
			await store.patch(
				nodePath,
				Object.fromEntries(
					Object.entries(values).map(([key, value]) => [`nodeData.${key}`, value])
				),
				latest.version
			);
		}
		return { id: doc.id, url: doc.url, title: doc.title, updatedAt: doc.updatedAt };
	};
	if (input.action === 'list') {
		if (!project.data.outlineCollectionId) return { docs: [] };
		return { docs: await api.listDocuments(config, String(project.data.outlineCollectionId)) };
	}
	if (input.action === 'read') {
		if (!nodeData.outlineDocId)
			throw new OutlineProjectError(404, 'This note has no linked document yet.');
		return await saveDoc(await api.getDocument(config, String(nodeData.outlineDocId)));
	}
	// A Firestore precondition coordinates creation across browsers and Worker instances.
	if (Number(project.data.outlineBusyUntil) > Date.now())
		throw new OutlineProjectError(
			409,
			'Another document is being linked. Please retry in a moment.'
		);
	const lease = crypto.randomUUID();
	try {
		await store.patch(
			projectPath,
			{ outlineLease: lease, outlineBusyUntil: Date.now() + 120_000 },
			project.version
		);
	} catch (error) {
		if (error instanceof OutlineProjectError && [409, 412].includes(error.status))
			throw new OutlineProjectError(409, 'The project changed. Please retry.');
		throw error;
	}
	try {
		const freshNode = await store.get(nodePath);
		const current = (freshNode.data.nodeData || {}) as Record<string, unknown>;
		if (current.outlineDocId && input.action === 'create')
			return await saveDoc(await api.getDocument(config, String(current.outlineDocId)));
		let collectionId = project.data.outlineCollectionId as string | undefined;
		let collectionPending = project.data.outlineCollectionPending;
		if (input.action === 'link') {
			if (!collectionId)
				throw new OutlineProjectError(
					400,
					'Create the first project document before linking another document from its collection.'
				);
			const doc = await api.getDocument(config, input.documentId!);
			if (doc.collectionId !== collectionId)
				throw new OutlineProjectError(
					400,
					'Choose a document from this project’s Outline collection.'
				);
			return await saveDoc(doc);
		}
		if (collectionId && !(await api.getCollection(config, collectionId))) {
			// Repair a stale binding only after Outline explicitly reports not found.
			await store.patch(projectPath, {
				outlineCollectionId: null,
				outlineCollectionPending: false
			});
			collectionId = undefined;
			collectionPending = false;
		}
		if (!collectionId) {
			const marker = `[borg-project:${input.projectId}]`;
			const recovered = await api.findProjectCollection(config, marker);
			if (recovered) collectionId = recovered.id;
			else {
				if (
					collectionPending &&
					Date.now() - Number(project.data.outlineCollectionPendingSince || 0) < 120_000
				)
					throw new OutlineProjectError(
						409,
						'An earlier collection request could not be confirmed. Please wait two minutes and retry; Borg will check for an existing collection first.'
					);
				await store.patch(projectPath, {
					outlineCollectionPending: true,
					outlineCollectionPendingSince: Date.now()
				});
				try {
					collectionId = (
						await api.createCollection(config, String(project.data.title || 'Borg project'), marker)
					).id;
				} catch (error) {
					if (
						error instanceof outline.OutlineApiError &&
						[400, 401, 403, 422, 429].includes(error.status)
					)
						await store.patch(projectPath, { outlineCollectionPending: false });
					throw error;
				}
			}
			await store.patch(projectPath, {
				outlineCollectionId: collectionId,
				outlineCollectionPending: false
			});
		}

		const id = await outlineDocumentId(input.projectId, input.nodeId);
		let doc;
		try {
			doc = await api.getDocument(config, id);
		} catch (error) {
			if (!(error instanceof outline.OutlineApiError && error.status === 404)) throw error;
		}
		if (!doc) {
			try {
				doc = await api.createDocument(config, {
					id,
					title: String(current.title || 'Untitled note'),
					collectionId
				});
			} catch (error) {
				// A timed-out create may already have succeeded. Resolve the stable ID before retrying.
				try {
					doc = await api.getDocument(config, id);
				} catch {
					throw error;
				}
			}
		}
		return await saveDoc(doc);
	} finally {
		try {
			const current = await store.get(projectPath);
			if (current.data.outlineLease === lease)
				await store.patch(
					projectPath,
					{ outlineLease: null, outlineBusyUntil: 0 },
					current.version
				);
		} catch {
			/* The lease expires if the caller loses access or the release fails. */
		}
	}
}
