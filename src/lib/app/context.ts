import { getContext, setContext } from 'svelte';
import type { AppServices } from './types';

const KEY = Symbol('app-services');

export function provideAppServices(services: AppServices): void {
	setContext(KEY, services);
}

export function getAppServices(): AppServices {
	const services = getContext<AppServices>(KEY);
	if (!services) throw new Error('App services must be provided by the root layout');
	return services;
}
