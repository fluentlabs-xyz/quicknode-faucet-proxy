export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);

    this.tails.set(key, queued);
    await previous;

    try {
      return await fn();
    } finally {
      release();
      queued.finally(() => {
        if (this.tails.get(key) === queued) {
          this.tails.delete(key);
        }
      });
    }
  }
}
