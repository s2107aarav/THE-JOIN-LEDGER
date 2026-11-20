export const slots = ['P', 'A', 'B'] as const
export type Slot = typeof slots[number]
export type ChildSlot = Exclude<Slot, 'P'>
export type JoinKind = 'inner' | 'left'
export type Source = { input: string | File; delimiter: ',' | '\t' }
export type Sources = Partial<Record<Slot, Source>>
export type Dataset = { headers: string[]; rows: string[][]; bytes: number; delimiters: number }
export type Datasets = Partial<Record<Slot, Dataset>>
export type Preview = { slot: Slot; headers: string[]; rows: string[][]; count: number }
export type DraftConfig = {
  rootKey: number
  children: Partial<Record<ChildSlot, { key: number; join: JoinKind }>>
  measure: { slot: Slot; column: number }
  unit: string
}
export type Scenario = { joins: Partial<Record<ChildSlot, JoinKind>>; distinct?: ChildSlot }
export type SumStats = {
  outputRows: bigint
  source: bigint | null
  joined: bigint | null
  sourceNonNull: number
  joinedNonNull: bigint
  repeated: number
  excluded: number
  preserved: number
  extra: bigint
  repetition: bigint
  exclusion: bigint
  movement: bigint
  absolute: bigint
}
export type Group = {
  id: number
  kind: 'root' | 'orphan' | 'null'
  key: string | null
  ownerCount: number
  baseline: SumStats
  candidate: SumStats | null
}
export type Result = { id: number; baseline: SumStats; candidate: SumStats | null; scenario: Scenario | null }
export type GroupQuery = { page: number; filter: 'affected' | 'repeated' | 'excluded' | 'all'; search: string; sort: 'impact' | 'source' }
export type GroupPage = { groups: Group[]; total: number; page: number; pageSize: number }
export type RecordEvidence = { ordinal: number; source: bigint | null; appearances: bigint; joined: bigint | null; movement: bigint; cells: string[] }
export type BranchEvidence = { slot: ChildSlot; raw: number; effective: number; factor: number; join: JoinKind; distinct: boolean; examples: number[] }
export type Position = { kind: 'record'; ordinal: number } | { kind: 'null' } | { kind: 'presence' }
export type Pairing = { P: number; A?: Position; B?: Position }
export type Evidence = {
  group: Group
  rootOrdinal: number | null
  headers: string[]
  branches: BranchEvidence[]
  records: RecordEvidence[]
  recordCount: number
  recordPage: number
  pairings: Pairing[]
  matchedRecords: Partial<Record<ChildSlot, { headers: string[]; rows: { ordinal: number; cells: string[] }[] }>>
  pairingCount: bigint
  reasons: string[]
}
export type ExportOptions = { amounts: boolean; keys: boolean; excerpts: boolean; groupId?: number }
export class LedgerError extends Error {
  constructor(public readonly code: string, message: string, public readonly slot?: Slot) {
    super(message)
    this.name = 'LedgerError'
  }
}
