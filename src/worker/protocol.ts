import type { DraftConfig, Evidence, ExportOptions, GroupPage, GroupQuery, Preview, Result, Scenario, Slot, Source, Sources } from '../core/types'

export type Requests = {
  beginEdit: { reuseCommitted: boolean }
  prepareTable: { slot: Slot; source: Source }
  removeTable: { slot: Slot }
  analyze: { config: DraftConfig; sources: Sources }
  compare: { resultId: number; scenario: Scenario | null }
  listGroups: { resultId: number; query: GroupQuery }
  inspect: { resultId: number; groupId: number; version: 'baseline' | 'candidate'; ordinal?: number; page?: number; full?: boolean }
  previewReport: { resultId: number; options: ExportOptions }
}
export type Responses = {
  beginEdit: null
  prepareTable: Preview
  removeTable: null
  analyze: Result
  compare: Result
  listGroups: GroupPage
  inspect: Evidence
  previewReport: string
}
export type Command = keyof Requests
export type Request = { [K in Command]: { kind: K; value: Requests[K]; requestId: number; generation: number } }[Command]
export type Response = {
  requestId: number
  generation: number
} & (
  { type: 'success'; value: Responses[Command] }
  | { type: 'progress'; stage: string }
  | { type: 'error'; issue: { code: string; message: string; slot?: Slot; fatal?: boolean } }
)
