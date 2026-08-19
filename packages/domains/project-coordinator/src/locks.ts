import { workerKey } from './journal.js'

export class WorkerLocks {
  private readonly tails = new Map<string, Promise<unknown>>()

  async run<T>(taskId: string, executionId: string, operation: () => Promise<T>): Promise<T> {
    const key = workerKey(taskId, executionId)
    const previous = this.tails.get(key) ?? Promise.resolve()
    const current = previous.catch(() => undefined).then(operation)
    this.tails.set(key, current)
    try {
      return await current
    } finally {
      if (this.tails.get(key) === current) this.tails.delete(key)
    }
  }
}
