/** Simple undo/redo stack for project snapshots. */
export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private readonly limit: number;

  constructor(initial: T, limit = 50) {
    this.current = initial;
    this.limit = limit;
  }

  get state(): T {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Replace current without recording (e.g. after import). */
  replace(value: T): void {
    this.current = value;
    this.past = [];
    this.future = [];
  }

  /** Push a new state; clears redo branch. */
  push(value: T): void {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = value;
    this.future = [];
  }

  /** Mutate current in place without a history entry (live drag). */
  setSilent(value: T): void {
    this.current = value;
  }

  undo(): T {
    if (!this.canUndo) return this.current;
    this.future.push(this.current);
    this.current = this.past.pop() as T;
    return this.current;
  }

  redo(): T {
    if (!this.canRedo) return this.current;
    this.past.push(this.current);
    this.current = this.future.pop() as T;
    return this.current;
  }
}
