export interface PresenceConnection {
	send(message: unknown): void;
	close(): void;
}

export interface IPresenceService {
	connect(
		room: string,
		handlers: {
			message: (message: unknown) => void;
			connected?: () => void;
			disconnected?: () => void;
			error?: (error: unknown) => void;
		}
	): PresenceConnection;
}
