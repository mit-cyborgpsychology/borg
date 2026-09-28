import { GitBranch, Calendar, StickyNote, Link, Square, Image, BookOpen } from '@lucide/svelte';
import { nodeTemplates } from '../templates';

export const projectsToolbarItems = [
	{ id: 'note', icon: StickyNote, template: nodeTemplates.note },
	{ id: 'image', icon: Image, template: nodeTemplates.image },
	{ id: 'link', icon: Link, template: nodeTemplates.link }
];

export const projectToolbarItems = [
	{ id: 'subproject', icon: GitBranch, template: nodeTemplates.subproject },
	{ id: 'time', icon: Calendar, template: nodeTemplates.time },
	{ id: 'note', icon: StickyNote, template: nodeTemplates.note },
	{ id: 'image', icon: Image, template: nodeTemplates.image },
	{ id: 'outline', icon: BookOpen, template: nodeTemplates.outline },
	{ id: 'link', icon: Link, template: nodeTemplates.link },
	{ id: 'blank', icon: Square, template: nodeTemplates.blank }
];
