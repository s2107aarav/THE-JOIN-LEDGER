import { evaluate, indexSources, inspect, listGroups, type Evaluation, type Investigation } from '../core/engine'
import { LedgerError, slots, type Dataset, type Datasets, type Source } from '../core/types'
import { checkCombined, parseSource, previewTable } from '../import/csv'
import { createReport } from '../report/report'
import type { Request, Response, Responses } from './protocol'

const worker = self as unknown as DedicatedWorkerGlobalScope
type StagedTable = { source: Source; table: Dataset }
let staged: Partial<Record<keyof Datasets, StagedTable>> = {}
let committed: typeof staged = {}
let current: { id: number; run: Investigation; baseline: Evaluation; candidate: Evaluation | null } | undefined
let nextResult = 0

async function handle(request: Request, progress: (stage: string) => void): Promise<Responses[keyof Responses]> {
  switch (request.kind) {
    case 'beginEdit':
      staged = request.value.reuseCommitted ? { ...committed } : {}
      return null
    case 'prepareTable': {
      const { slot, source } = request.value
      progress('Reading and validating the table')
      const table = await parseSource(slot, source)
      const candidate = { ...staged, [slot]: { source, table } }
      checkCombined(Object.fromEntries(Object.entries(candidate).map(([key, entry]) => [key, entry.table])))
      staged = candidate
      return previewTable(slot, table)
    }
    case 'removeTable':
      delete staged[request.value.slot]
      return null
    case 'analyze': {
      const { sources, config } = request.value
      const tables: Datasets = {}
      const nextStaged: typeof staged = {}
      progress('Reading and validating the tables')
      for (const slot of slots) {
        const source = sources[slot]
        if (!source) continue
        const cached = staged[slot]
        const table = cached && cached.source.delimiter === source.delimiter && cached.source.input === source.input
          ? cached.table
          : await parseSource(slot, source)
        tables[slot] = table
        checkCombined(tables)
        nextStaged[slot] = { source, table }
      }
      progress('Indexing matches and calculating contributions')
      const run = indexSources(tables, config)
      const baseline = evaluate(run)
      current = { id: ++nextResult, run, baseline, candidate: null }
      staged = nextStaged
      committed = { ...nextStaged }
      return { id: current.id, baseline: baseline.total, candidate: null, scenario: null }
    }
    default: {
      if (!current || current.id !== request.value.resultId) {
        throw new LedgerError('STALE', 'This result has changed. Reopen the current investigation.')
      }
      const { run, baseline, candidate } = current
      if (request.kind === 'compare') {
        progress('Comparing join rules')
        const scenario = request.value.scenario
        const next = scenario ? evaluate(run, scenario) : null
        current = { id: ++nextResult, run, baseline, candidate: next }
        return { id: current.id, baseline: baseline.total, candidate: next?.total ?? null, scenario }
      }
      if (request.kind === 'listGroups') return listGroups(run, baseline, candidate, request.value.query)
      if (request.kind === 'inspect') {
        const { groupId, version, ordinal, page, full } = request.value
        return inspect(run, baseline, candidate, groupId, version, ordinal, page, full)
      }
      return createReport(run, baseline, candidate, request.value.options)
    }
  }
}

let pending = Promise.resolve()
worker.addEventListener('message', ({ data: request }: MessageEvent<Request>) => {
  const envelope = { requestId: request.requestId, generation: request.generation }
  const send = (response: Response) => worker.postMessage(response)
  pending = pending.then(async () => {
    try {
      const value = await handle(request, stage => send({ ...envelope, type: 'progress', stage }))
      send({ ...envelope, type: 'success', value })
    } catch (error) {
      const issue = error instanceof LedgerError
        ? { code: error.code, message: error.message, slot: error.slot }
        : { code: 'COMPUTE', message: 'The calculation could not finish. Retry the investigation.' }
      send({ ...envelope, type: 'error', issue })
    }
  })
})
