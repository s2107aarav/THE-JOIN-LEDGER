import { LedgerError } from '../core/types'
import type { Command, Request, Requests, Response, Responses } from './protocol'

type Pending = {
  resolve: (value: Responses[Command]) => void
  reject: (error: LedgerError) => void
  progress?: (stage: string) => void
  timer: ReturnType<typeof setTimeout>
}

export class WorkerClient {
  private worker: Worker | undefined
  private generation = 0
  private sequence = 0
  private pending = new Map<number, Pending>()

  private open() {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./ledger.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', ({ data }: MessageEvent<Response>) => {
      if (data.generation !== this.generation) return
      const item = this.pending.get(data.requestId)
      if (!item) return
      if (data.type === 'progress') {
        item.progress?.(data.stage)
        return
      }
      clearTimeout(item.timer)
      this.pending.delete(data.requestId)
      if (data.type === 'success') item.resolve(data.value)
      else item.reject(new LedgerError(data.issue.code, data.issue.message, data.issue.slot))
    })
    const failed = () => {
      if (this.worker === worker) this.stop('WORKER', 'The calculation worker stopped. Retry the investigation.')
    }
    worker.addEventListener('error', failed)
    worker.addEventListener('messageerror', failed)
    this.worker = worker
    return worker
  }

  request<K extends Command>(kind: K, value: Requests[K], progress?: (stage: string) => void): Promise<Responses[K]> {
    return new Promise((resolve, reject) => {
      let worker: Worker
      try {
        worker = this.open()
      } catch {
        reject(new LedgerError('WORKER', 'This browser could not start the local calculation worker.'))
        return
      }
      const requestId = ++this.sequence
      const request = { kind, value, requestId, generation: this.generation } as Request
      const timer = setTimeout(() => this.stop('TIMEOUT', 'The calculation took too long. Retry with a smaller extract.'), 20_000)
      this.pending.set(requestId, { resolve: value => resolve(value as Responses[K]), reject, progress, timer })
      try {
        worker.postMessage(request)
      } catch {
        this.stop('WORKER', 'The browser could not send the input to the calculation worker.')
      }
    })
  }

  private stop(code: string, message: string) {
    this.generation++
    this.worker?.terminate()
    this.worker = undefined
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new LedgerError(code, message))
    }
    this.pending.clear()
  }

  reset() { this.stop('CANCELLED', 'Calculation cancelled.') }
  dispose() { this.reset() }
}
