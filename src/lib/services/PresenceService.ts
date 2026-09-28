import type { IPresenceService } from './interfaces/IPresenceService';

/** Owns transport parsing, reconnect timers, and final disposal. */
export function createPresenceService(
	endpoint: string,
	createSocket = (url: string) => new WebSocket(url)
): IPresenceService {
	return {
		connect(room, handlers) {
			let socket: WebSocket | undefined;
			let closed = false;
			let retry: ReturnType<typeof setTimeout> | undefined;
			function connect() {
				if (closed) return;
				socket = createSocket(`${endpoint}/${encodeURIComponent(room)}`);
				socket.onopen = () => {
					if (!closed) handlers.connected?.();
				};
				socket.onmessage = (event) => {
					if (closed) return;
					try {
						handlers.message(JSON.parse(event.data));
					} catch (error) {
						handlers.error?.(error);
					}
				};
				socket.onerror = (error) => {
					if (!closed) handlers.error?.(error);
				};
				socket.onclose = () => {
					if (closed) return;
					handlers.disconnected?.();
					retry = setTimeout(connect, 3000);
				};
			}
			connect();
			return {
				send(message) {
					if (!closed && socket?.readyState === 1) socket.send(JSON.stringify(message));
				},
				close() {
					closed = true;
					clearTimeout(retry);
					socket?.close();
				}
			};
		}
	};
}
