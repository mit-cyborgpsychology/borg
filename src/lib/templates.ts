import { canonicalNodeType } from './features/links/linkNode.ts';

export interface NodeTemplate {
	id: string;
	name: string;
	color: string;
	fields: TemplateField[];
}

export interface CustomField extends TemplateField {
	id: string;
	isCustom: true;
}

export interface TemplateField {
	id: string;
	label: string;
	type:
		| 'text'
		| 'textarea'
		| 'tags'
		| 'status'
		| 'link'
		| 'date'
		| 'time'
		| 'datetime'
		| 'button'
		| 'people-selector'
		| 'timeline-selector'
		| 'color-picker'
		| 'select';
	placeholder?: string;
	options?: string[];
	required?: boolean;
	buttonText?: string;
	buttonUrl?: string;
	showInDisplay?: boolean; // Controls visibility in display mode, defaults to true
	defaultValue?: string; // Default value for the field
}

export const nodeTemplates: Record<string, NodeTemplate> = {
	project: {
		id: 'project',
		name: 'Project',
		color: '#52525b',
		fields: [
			{
				id: 'title',
				label: 'Project Name',
				type: 'text',
				placeholder: 'Enter project name...',
				required: true
			},
			{
				id: 'collaborators',
				label: 'Collaborators',
				type: 'people-selector',
				placeholder: 'Add collaborators...'
			},
			{
				id: 'status',
				label: 'Status',
				type: 'status',
				options: ['Done']
			}
		]
	},

	subproject: {
		id: 'subproject',
		name: 'Subproject',
		color: '#52525b',
		fields: [
			{
				id: 'title',
				label: 'Subproject Name',
				type: 'text',
				placeholder: 'Enter subproject name...',
				required: true
			},
			{
				id: 'collaborators',
				label: 'Collaborators',
				type: 'people-selector',
				placeholder: 'Add collaborators...'
			},
			{
				id: 'status',
				label: 'Status',
				type: 'status',
				options: ['Done']
			}
		]
	},

	time: {
		id: 'time',
		name: 'Time',
		color: '#52525b',
		fields: [
			{
				id: 'event',
				label: 'Timeline Event',
				type: 'timeline-selector',
				placeholder: 'Select or create timeline event...'
			},
			{
				id: 'status',
				label: 'Status',
				type: 'status',
				options: ['Done']
			},
			{
				id: 'notes',
				label: 'Notes',
				type: 'textarea',
				placeholder: 'Additional notes about this event...'
			}
		]
	},

	link: {
		id: 'link',
		name: 'Link',
		color: '#52525b',
		fields: [
			{ id: 'url', label: 'URL', type: 'link', placeholder: 'Paste a URL...', required: true },
			{ id: 'title', label: 'Title', type: 'text', placeholder: 'Optional title...' },
			{
				id: 'description',
				label: 'Description',
				type: 'textarea',
				placeholder: 'Add a description...'
			},
			{
				id: 'viewMode',
				label: 'View as',
				type: 'select',
				options: ['Node', 'Iframe'],
				defaultValue: 'Node',
				showInDisplay: false
			},
			{ id: 'status', label: 'Status', type: 'status', options: ['Done'] }
		]
	},

	note: {
		id: 'note',
		name: 'Post-It',
		color: '#fef08a', // Default yellow post-it color
		fields: [
			{
				id: 'content',
				label: 'Note Content',
				type: 'textarea',
				placeholder: 'Write your note here...',
				required: true
			},
			{
				id: 'style',
				label: 'Note Style',
				type: 'select',
				options: ['Post-It', 'Text Only'],
				placeholder: 'Choose note style',
				defaultValue: 'Post-It'
			},
			{
				id: 'backgroundColor',
				label: 'Background Color',
				type: 'color-picker',
				placeholder: 'Choose background color'
			},
			{
				id: 'textSize',
				label: 'Text Size',
				type: 'select',
				options: ['Small', 'Medium', 'Large', 'Extra Large'],
				placeholder: 'Choose text size'
			}
		]
	},

	blank: {
		id: 'blank',
		name: 'Blank',
		color: '#52525b',
		fields: [
			{
				id: 'title',
				label: 'Title',
				type: 'text',
				placeholder: 'Enter title...',
				required: true
			},
			{
				id: 'status',
				label: 'Status',
				type: 'status',
				options: ['Done']
			}
		]
	},

	sticker: {
		id: 'sticker',
		name: 'Sticker',
		color: '#f59e0b',
		fields: [
			{
				id: 'title',
				label: 'Sticker Name',
				type: 'text',
				placeholder: 'Enter sticker name...',
				required: true
			}
		]
	},

	image: {
		id: 'image',
		name: 'Image',
		color: '#10b981',
		fields: [
			{
				id: 'title',
				label: 'Image Title',
				type: 'text',
				placeholder: 'Enter image title...',
				required: false
			},
			{
				id: 'imageUrl',
				label: 'Image URL',
				type: 'text',
				placeholder: 'Image URL will be set automatically...',
				required: false,
				showInDisplay: false
			},
			{
				id: 'description',
				label: 'Description',
				type: 'textarea',
				placeholder: 'Enter image description...',
				required: false
			}
		]
	},

	outline: {
		id: 'outline',
		name: 'Outline Doc',
		color: '#3b82f6',
		fields: [
			{
				id: 'title',
				label: 'Doc Title',
				type: 'text',
				placeholder: 'Enter document title...',
				required: true
			},
			{
				id: 'outlineDocId',
				label: 'Outline Doc ID',
				type: 'text',
				placeholder: 'Outline document ID...',
				required: false,
				showInDisplay: false
			},
			{
				id: 'outlineUrl',
				label: 'Outline URL',
				type: 'text',
				placeholder: 'Outline document URL...',
				required: false,
				showInDisplay: false
			}
		]
	}
};

export function getTemplate(templateId: string): NodeTemplate {
	return nodeTemplates[canonicalNodeType(templateId)] || nodeTemplates.blank;
}
