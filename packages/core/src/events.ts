/**
 * A tiny typed emitter. packages/core cannot use Node's EventEmitter (the lint
 * boundary forbids node: imports), and pulling a dependency in for this would
 * be heavier than the thirty lines it takes.
 */
export type Listener<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<E extends keyof Events>(event: E, listener: Listener<Events[E]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy first: a listener may unsubscribe itself while we iterate.
    for (const listener of [...set]) {
      (listener as Listener<Events[E]>)(payload);
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
