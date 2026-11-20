import { useEffect, useRef, useState } from 'react'
import { LedgerError, slots, type ChildSlot, type DraftConfig, type JoinKind, type Preview, type Result, type Scenario, type Slot, type Source, type Sources } from '../core/types'
import { WorkerClient } from '../worker/client'
import { exampleConfig, exampleScenario, exampleSources, readExamplePreset } from '../worker/example'

export type Mapping = {
  rootKey?: number
  children: Partial<Record<ChildSlot, { key?: number; join?: JoinKind }>>
  measure?: DraftConfig['measure']
  unit: string
}

type Previews = Partial<Record<Slot, Preview>>
type Draft = { sources: Sources; previews: Previews; mapping: Mapping }
export type Case = { example: boolean; config: DraftConfig; sources: Sources; previews: Previews; result: Result }

const emptyDraft = (): Draft => ({ sources: {}, previews: {}, mapping: { children: {}, unit: '' } })

export function validConfig(draft: Draft): DraftConfig | null {
  const { rootKey, children, measure, unit } = draft.mapping
  if (!draft.previews.P || !draft.previews.A || rootKey === undefined || !measure) return null
  if (!draft.previews[measure.slot]?.headers[measure.column]) return null
  const edges: DraftConfig['children'] = {}
  for (const slot of ['A', 'B'] as const) {
    if (!draft.previews[slot]) continue
    const edge = children[slot]
    if (edge?.key === undefined || !edge.join) return null
    edges[slot] = { key: edge.key, join: edge.join }
  }
  return { rootKey, children: edges, measure, unit: unit.trim() || 'Amount' }
}

export function errorMessage(error: unknown): string {
  return error instanceof LedgerError ? error.message : 'The workspace could not complete this operation. Try again.'
}

export function useLedger() {
  const [client] = useState(() => new WorkerClient())
  const [current, setCurrent] = useState<Case>()
  const [draft, setDraft] = useState(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [stage, setStage] = useState<string | null>('Calculating the example')
  const [error, setError] = useState<string | null>(null)
  const operation = useRef(0)
  const mounted = useRef(true)

  async function run<T>(initial: string, perform: (progress: (stage: string) => void) => Promise<T>, accept: (value: T) => void) {
    const token = ++operation.current
    const active = () => mounted.current && operation.current === token
    setStage(initial)
    setError(null)
    try {
      const result = await perform(label => { if (active()) setStage(label) })
      if (!active()) return false
      accept(result)
      return true
    } catch (caught) {
      if (active()) setError(errorMessage(caught))
      return false
    } finally {
      if (active()) setStage(null)
    }
  }

  function loadExample(preset: ReturnType<typeof readExamplePreset>, reset = true) {
    if (reset) client.reset()
    setEditing(false)
    setDraft(emptyDraft())
    setCurrent(undefined)
    return run('Calculating the example', async progress => {
      const baseline = await client.request('analyze', { config: exampleConfig, sources: exampleSources }, progress)
      const scenario = exampleScenario(preset)
      return scenario ? client.request('compare', { resultId: baseline.id, scenario }, progress) : baseline
    }, result => setCurrent({ example: true, config: exampleConfig, sources: exampleSources, previews: {}, result }))
  }

  useEffect(() => {
    mounted.current = true
    void loadExample(readExamplePreset(), false)
    return () => {
      mounted.current = false
      ++operation.current
      client.dispose()
    }
    // The isolated worker is created once for the workspace lifetime.
  }, [client])

  function dropStaged(slot: Slot) {
    void client.request('removeTable', { slot }).catch(() => { /* The next analysis supplies its complete inputs. */ })
  }

  function openImport() {
    setError(null)
    void run('Preparing the import editor', () => client.request('beginEdit', {
      reuseCommitted: Boolean(current && !current.example),
    }), () => {})
    setDraft(current && !current.example ? {
      sources: current.sources,
      previews: current.previews,
      mapping: current.config,
    } : emptyDraft())
    setEditing(true)
  }

  function revert(dropDraft = true) {
    if (dropDraft) {
      for (const slot of slots) {
        if (draft.sources[slot] && draft.sources[slot] !== current?.sources[slot]) dropStaged(slot)
      }
    }
    setEditing(false)
    setError(null)
    setDraft(emptyDraft())
  }

  function prepare(slot: Slot, source: Source) {
    return run('Reading table', progress => client.request('prepareTable', { slot, source }, progress), preview => {
      setDraft(previous => {
        const oldPreview = previous.previews[slot]
        const oldColumn = (index: number | undefined) => {
          if (index === undefined || !oldPreview) return undefined
          const nextIndex = preview.headers.indexOf(oldPreview.headers[index])
          return nextIndex === -1 ? undefined : nextIndex
        }
        const mapping = { ...previous.mapping, children: { ...previous.mapping.children } }
        if (slot === 'P') {
          mapping.rootKey = oldColumn(mapping.rootKey)
        } else {
          const oldEdge = mapping.children[slot]
          const rootColumn = mapping.rootKey === undefined ? undefined : previous.previews.P?.headers[mapping.rootKey]
          const suggested = rootColumn === undefined ? -1 : preview.headers.indexOf(rootColumn)
          mapping.children[slot] = { join: oldEdge?.join, key: oldColumn(oldEdge?.key) ?? (suggested < 0 ? undefined : suggested) }
        }
        if (mapping.measure?.slot === slot) {
          const column = oldColumn(mapping.measure.column)
          mapping.measure = column === undefined ? undefined : { slot, column }
        }
        return {
          sources: { ...previous.sources, [slot]: source },
          previews: { ...previous.previews, [slot]: preview },
          mapping,
        }
      })
    })
  }

  function remove(slot: Slot) {
    dropStaged(slot)
    setDraft(previous => {
      const next = { ...previous, sources: { ...previous.sources }, previews: { ...previous.previews } }
      delete next.sources[slot]
      delete next.previews[slot]
      const mapping = { ...previous.mapping, children: { ...previous.mapping.children } }
      if (slot === 'P') mapping.rootKey = undefined
      else delete mapping.children[slot]
      if (mapping.measure?.slot === slot) mapping.measure = undefined
      return { ...next, mapping }
    })
  }

  function updateMapping(update: (mapping: Mapping) => Mapping) {
    setDraft(previous => ({ ...previous, mapping: update(previous.mapping) }))
  }

  function analyze() {
    const config = validConfig(draft)
    if (!config) return
    return run('Analyzing the joins', progress => client.request('analyze', { config, sources: draft.sources }, progress), result => {
      setCurrent({ example: false, config, sources: draft.sources, previews: draft.previews, result })
      setEditing(false)
      setDraft(emptyDraft())
    })
  }

  function compare(scenario: Scenario | null) {
    if (!current) return
    return run('Comparing join rules', progress => client.request('compare', { resultId: current.result.id, scenario }, progress),
      result => setCurrent({ ...current, result }))
  }

  function cancel() {
    if (!current) return loadExample('raw')
    client.reset()
    revert(false)
    return run('Restoring the previous case', async progress => {
      const baseline = await client.request('analyze', { config: current.config, sources: current.sources }, progress)
      return current.result.scenario
        ? client.request('compare', { resultId: baseline.id, scenario: current.result.scenario }, progress)
        : baseline
    }, result => setCurrent({ ...current, result }))
  }

  function retry() {
    if (current) return cancel()
    return loadExample(readExamplePreset())
  }

  return { client, current, draft, error, editing, stage, loadExample, openImport, revert, prepare, remove, updateMapping, analyze, compare, cancel, retry }
}

export type LedgerController = ReturnType<typeof useLedger>
