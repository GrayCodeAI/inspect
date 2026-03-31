/**
 * Typed event bus for cross-layer communication.
 *
 * Works in both Node.js and browser contexts (no dependency on
 * Node's EventEmitter). Designed for DashboardEvent but generic
 * enough for any discriminated-union event system.
 */

export type Unsubscribe = () => void;

export type EventHandler<T> = (event: T) => void;

export class EventBus<TEvent extends { type: string }> {
  private listeners = new Map<string, Set<EventHandler<unknown>>>();
  private wildcardListeners = new Set<EventHandler<TEvent>>();

  /**
   * Subscribe to a specific event type.
   */
  on<TType extends TEvent["type"]>(
    type: TType,
    handler: EventHandler<Extract<TEvent, { type: TType }>>,
  ): Unsubscribe {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.listeners.delete(type);
    };
  }

  /**
   * Subscribe to a specific event type, auto-unsubscribe after first call.
   */
  once<TType extends TEvent["type"]>(
    type: TType,
    handler: EventHandler<Extract<TEvent, { type: TType }>>,
  ): Unsubscribe {
    const unsub = this.on(type, (event) => {
      unsub();
      handler(event);
    });
    return unsub;
  }

  /**
   * Subscribe to ALL events regardless of type.
   */
  onAny(handler: EventHandler<TEvent>): Unsubscribe {
    this.wildcardListeners.add(handler);
    return () => {
      this.wildcardListeners.delete(handler);
    };
  }

  /**
   * Emit an event to all matching listeners.
   */
  emit(event: TEvent): void {
    const set = this.listeners.get(event.type);
    if (set) {
      for (const handler of set) {
        handler(event);
      }
    }
    for (const handler of this.wildcardListeners) {
      handler(event);
    }
  }

  /**
   * Remove all listeners.
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  /**
   * Get total listener count (for diagnostics).
   */
  get listenerCount(): number {
    let count = this.wildcardListeners.size;
    for (const set of this.listeners.values()) {
      count += set.size;
    }
    return count;
  }
}
