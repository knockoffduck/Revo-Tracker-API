/**
 * Progress event bus — emits typed events during long-running operations
 * (scrape, trend generation, stat audit, etc.) that the admin SSE endpoints
 * subscribe to and stream to clients.
 *
 * Each subscriber gets a fresh emitter (via subscribe()) so concurrent
 * jobs don't interleave events.
 */

import { EventEmitter } from "node:events";

export type ProgressEvent = {
	type: "progress" | "log" | "result" | "error" | "done";
	phase?: string;
	current?: number;
	total?: number;
	percent?: number;
	level?: "info" | "warn" | "error" | "success" | "debug" | "stderr" | "stdout";
	stage?: string;
	message?: string;
	timestamp?: string;
	data?: unknown;
};

type Subscriber = {
	emitter: EventEmitter;
};

class Bus {
	private current: Subscriber | null = null;
	private queue: Subscriber[] = [];

	/** Acquire a fresh emitter for one operation. Releases when release() is called. */
	acquire(): Subscriber {
		const emitter = new EventEmitter();
		emitter.setMaxListeners(0);
		const sub: Subscriber = { emitter };
		this.queue.push(sub);
		if (!this.current) this.current = sub;
		return sub;
	}

	/** Release a previously-acquired subscriber. */
	release(sub: Subscriber) {
		const idx = this.queue.indexOf(sub);
		if (idx >= 0) this.queue.splice(idx, 1);
		if (this.current === sub) this.current = this.queue[0] ?? null;
	}

	private get active(): Subscriber {
		if (!this.current) {
			// No active subscriber — create a no-op one to avoid crashes
			const sub: Subscriber = { emitter: new EventEmitter() };
			sub.emitter.setMaxListeners(0);
			return sub;
		}
		return this.current;
	}

	emit(event: ProgressEvent): void {
		const ev: ProgressEvent = {
			timestamp: new Date().toISOString(),
			...event,
		};
		// Dispatch to the currently-active subscriber
		try {
			this.active.emitter.emit("event", ev);
		} catch {
			// ignore
		}
	}
}

declare global {
	// eslint-disable-next-line no-var
	var __revoProgressBus: Bus | undefined;
}

export const progressBus: Bus = globalThis.__revoProgressBus ?? (globalThis.__revoProgressBus = new Bus());

/**
 * Subscribe to events for a single operation. Returns the subscriber handle
 * (call .release() when done) and a stream you can read events from.
 */
export function subscribe(): { sub: Subscriber; events: AsyncIterableIterator<ProgressEvent> } {
	const sub = progressBus.acquire();
	const events = (async function* () {
		const queue: ProgressEvent[] = [];
		let resolveNext: ((v: IteratorResult<ProgressEvent>) => void) | null = null;
		let done = false;

		const onEvent = (e: ProgressEvent) => {
			if (resolveNext) {
				resolveNext({ value: e, done: false });
				resolveNext = null;
			} else {
				queue.push(e);
			}
		};
		sub.emitter.on("event", onEvent);

		try {
			while (!done) {
				if (queue.length > 0) {
					yield queue.shift()!;
					continue;
				}
				const next = await new Promise<IteratorResult<ProgressEvent>>((resolve) => {
					resolveNext = resolve;
				});
				if (next.done) break;
				yield next.value;
			}
		} finally {
			sub.emitter.off("event", onEvent);
			progressBus.release(sub);
		}
	})();
	return { sub, events };
}

/**
 * Build a Response with the right SSE headers.
 */
export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
