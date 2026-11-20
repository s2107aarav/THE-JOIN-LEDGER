import { abs, parseAmount } from './decimal'
import {
  LedgerError, type BranchEvidence, type ChildSlot, type Dataset, type Datasets, type DraftConfig,
  type Evidence, type Group, type GroupPage, type GroupQuery, type Pairing, type Position,
  type RecordEvidence, type Scenario, type SumStats,
} from './types'

const edges = ['A', 'B'] as const
const pageSize = 25

type IndexedGroup = {
  kind: Group['kind']
  key: string | null
  root: number | null
  matches: Record<ChildSlot, number[]>
  records: number[]
  sum: bigint
  absolute: bigint
  nonNull: number
}

export type Investigation = {
  index: IndexedGroup[]
  dataset: Datasets
  config: DraftConfig
  amounts: (bigint | null)[]
}

export type Evaluation = {
  groups: SumStats[]
  total: SumStats
  scenario: Scenario | null
}

function column(table: Dataset, index: number) {
  return Number.isInteger(index) && index >= 0 && index < table.headers.length
}

function readColumn(table: Dataset, index: number, slot: 'P' | ChildSlot): string[] {
  if (!column(table, index)) throw new LedgerError('COLUMN', 'Choose a column from the current table.', slot)
  return table.rows.map(row => row[index])
}

function makeGroup(kind: Group['kind'], key: string | null, root: number | null): IndexedGroup {
  return { kind, key, root, matches: { A: [], B: [] }, records: [], sum: 0n, absolute: 0n, nonNull: 0 }
}

export function indexSources(dataset: Datasets, config: DraftConfig): Investigation {
  const root = dataset.P
  const owner = dataset[config.measure.slot]
  if (!root || !dataset.A || !owner) {
    throw new LedgerError('TABLES', 'Add a parent, a detail table and a measure.')
  }
  if (Array.from(config.unit).length > 24) {
    throw new LedgerError('UNIT', 'Use a unit label of up to 24 characters.')
  }

  const rootKeys = readColumn(root, config.rootKey, 'P')
  const roots = new Map<string, IndexedGroup>()
  const index: IndexedGroup[] = []
  rootKeys.forEach((key, offset) => {
    if (!key) throw new LedgerError('EMPTY_KEY', 'Parent record ' + (offset + 1) + ' has an empty key.', 'P')
    const duplicate = roots.get(key)
    if (duplicate) {
      throw new LedgerError('DUPLICATE_KEY', 'Parent records ' + (duplicate.root! + 1) + ' and ' +
        (offset + 1) + ' have the same exact key.', 'P')
    }
    const group = makeGroup('root', key, offset)
    if (config.measure.slot === 'P') group.records.push(offset)
    roots.set(key, group)
    index.push(group)
  })
  const orphanGroups = new Map<string | null, IndexedGroup>()
  for (const slot of edges) {
    const table = dataset[slot]
    if (!table) continue
    const model = config.children[slot]
    if (!model || (model.join !== 'inner' && model.join !== 'left')) {
      throw new LedgerError('JOIN', 'Choose a key and a join rule.', slot)
    }
    readColumn(table, model.key, slot).forEach((key, offset) => {
      const rootGroup = roots.get(key)
      if (rootGroup) {
        rootGroup.matches[slot].push(offset)
        if (config.measure.slot === slot) rootGroup.records.push(offset)
      } else if (config.measure.slot === slot) {
        const groupKey = key === '' ? null : key
        let group = orphanGroups.get(groupKey)
        if (!group) {
          group = makeGroup(groupKey === null ? 'null' : 'orphan', groupKey, null)
          orphanGroups.set(groupKey, group)
          index.push(group)
        }
        group.records.push(offset)
      }
    })
  }
  const amounts = readColumn(owner, config.measure.column, config.measure.slot).map((value, offset) => {
    try {
      return parseAmount(value)
    } catch {
      throw new LedgerError('AMOUNT', 'Record ' + (offset + 1) + ', column ' + (config.measure.column + 1) +
        ': use a decimal with up to 12 whole digits and 6 fractional digits, or leave it empty for NULL.', config.measure.slot)
    }
  })
  for (const group of index) {
    for (const offset of group.records) {
      const value = amounts[offset]
      if (value === null) continue
      group.sum += value
      group.absolute += abs(value)
      group.nonNull++
    }
  }
  return { index, dataset, config, amounts }
}

function branchesFor(run: Investigation, group: IndexedGroup, scenario: Scenario | null): BranchEvidence[] {
  if (group.root === null) return []
  return edges.flatMap(slot => {
    if (!run.dataset[slot]) return []
    const raw = group.matches[slot].length
    const distinct = scenario?.distinct === slot
    const effective = distinct && raw > 0 ? 1 : raw
    const join = scenario?.joins[slot] ?? run.config.children[slot]!.join
    return [{
      slot, raw, effective, join, distinct,
      factor: join === 'left' ? Math.max(1, effective) : effective,
      examples: group.matches[slot].slice(0, 3).map(index => index + 1),
    }]
  })
}

function appearances(run: Investigation, group: IndexedGroup, branches: BranchEvidence[]): bigint {
  if (group.root === null) return 0n
  return branches.reduce((count, edge) =>
    edge.slot === run.config.measure.slot ? count : count * BigInt(edge.factor), 1n)
}

function groupStats(run: Investigation, group: IndexedGroup, scenario: Scenario | null): SumStats {
  const branches = branchesFor(run, group, scenario)
  const count = appearances(run, group, branches)
  const originalCount = group.records.length
  const joinedNonNull = BigInt(group.nonNull) * count
  const difference = count - 1n
  const movement = group.sum * difference
  return {
    outputRows: group.root === null ? 0n : branches.reduce((product, edge) => product * BigInt(edge.factor), 1n),
    source: group.nonNull ? group.sum : null,
    joined: joinedNonNull > 0n ? group.sum * count : null,
    sourceNonNull: group.nonNull, joinedNonNull,
    repeated: count > 1n ? originalCount : 0,
    excluded: count === 0n ? originalCount : 0,
    preserved: count === 1n ? originalCount : 0,
    extra: count > 1n ? BigInt(originalCount) * difference : 0n,
    repetition: count > 1n ? movement : 0n,
    exclusion: count === 0n ? movement : 0n,
    movement, absolute: group.absolute * abs(difference),
  }
}

export function evaluate(run: Investigation, scenario: Scenario | null = null): Evaluation {
  if (scenario?.distinct && (!run.dataset[scenario.distinct] || scenario.distinct === run.config.measure.slot)) {
    throw new LedgerError('SCENARIO', 'Choose a mounted detail branch that does not own the measure.')
  }
  for (const slot of edges) {
    const join = scenario?.joins[slot]
    if (join && (!run.dataset[slot] || (join !== 'inner' && join !== 'left'))) {
      throw new LedgerError('SCENARIO', 'Choose a supported join rule for a mounted detail branch.')
    }
  }
  const total: SumStats = {
    outputRows: 0n, source: null, joined: null, sourceNonNull: 0, joinedNonNull: 0n,
    repeated: 0, excluded: 0, preserved: 0, extra: 0n, repetition: 0n, exclusion: 0n,
    movement: 0n, absolute: 0n,
  }
  const groups = run.index.map(group => {
    const stats = groupStats(run, group, scenario)
    total.outputRows += stats.outputRows
    if (stats.source !== null) total.source = (total.source ?? 0n) + stats.source
    if (stats.joined !== null) total.joined = (total.joined ?? 0n) + stats.joined
    total.sourceNonNull += stats.sourceNonNull
    total.joinedNonNull += stats.joinedNonNull
    total.repeated += stats.repeated
    total.excluded += stats.excluded
    total.preserved += stats.preserved
    total.extra += stats.extra
    total.repetition += stats.repetition
    total.exclusion += stats.exclusion
    total.movement += stats.movement
    total.absolute += stats.absolute
    return stats
  })
  return { groups, total, scenario }
}

export function describeGroup(run: Investigation, base: Evaluation, candidate: Evaluation | null, id: number): Group {
  const group = run.index[id]
  if (!group) throw new LedgerError('GROUP', 'Choose a group from the current result.')
  return {
    id, kind: group.kind, key: group.key, ownerCount: group.records.length,
    baseline: base.groups[id], candidate: candidate?.groups[id] ?? null,
  }
}

export function listGroups(run: Investigation, base: Evaluation, candidate: Evaluation | null, query: GroupQuery): GroupPage {
  const score = (group: Group) => {
    const other = group.candidate?.absolute ?? 0n
    return group.baseline.absolute > other ? group.baseline.absolute : other
  }
  const changed = (group: Group) => Math.max(group.baseline.repeated + group.baseline.excluded,
    (group.candidate?.repeated ?? 0) + (group.candidate?.excluded ?? 0))
  const groups = run.index.map((_, id) => describeGroup(run, base, candidate, id)).filter(group => {
    if (query.search && !(group.key ?? '').includes(query.search)) return false
    if (query.filter === 'repeated') return Boolean(group.baseline.repeated || group.candidate?.repeated)
    if (query.filter === 'excluded') return Boolean(group.baseline.excluded || group.candidate?.excluded)
    return query.filter === 'all' || changed(group) > 0
  })
  if (query.sort === 'impact') {
    groups.sort((a, b) => score(a) === score(b) ? changed(b) - changed(a) || a.id - b.id : score(a) > score(b) ? -1 : 1)
  }
  const page = Math.max(1, Math.min(query.page, Math.ceil(groups.length / pageSize)))
  return { groups: groups.slice((page - 1) * pageSize, page * pageSize), total: groups.length, page, pageSize }
}

function previewCells(cells: string[]): string[] {
  let remaining = 4096
  return cells.map(value => {
    const visible = value.slice(0, remaining)
    remaining -= visible.length
    return visible === value ? visible : visible + '…'
  })
}

function position(group: IndexedGroup, branch: BranchEvidence, offset: number): Position {
  if (branch.raw === 0) return { kind: 'null' }
  if (branch.distinct) return { kind: 'presence' }
  return { kind: 'record', ordinal: group.matches[branch.slot][offset] + 1 }
}

export function inspect(
  run: Investigation, base: Evaluation, candidate: Evaluation | null,
  id: number, version: 'baseline' | 'candidate', ordinal?: number, requestedPage = 1, full = false,
): Evidence {
  const group = describeGroup(run, base, candidate, id)
  const data = run.index[id]
  const evaluation = version === 'candidate' ? candidate : base
  if (!evaluation) throw new LedgerError('SCENARIO', 'Run a scenario before inspecting it.')
  const branches = branchesFor(run, data, evaluation.scenario)
  const count = appearances(run, data, branches)
  const slot = run.config.measure.slot
  const table = run.dataset[slot]!
  const recordPage = Math.max(1, Math.min(requestedPage, Math.ceil(data.records.length / pageSize)))
  const records: RecordEvidence[] = data.records.slice((recordPage - 1) * pageSize, recordPage * pageSize).map(offset => {
    const source = run.amounts[offset]
    return {
      ordinal: offset + 1, source, appearances: count,
      joined: count === 0n || source === null ? null : source * count,
      movement: (source ?? 0n) * (count - 1n),
      cells: full && offset + 1 === ordinal ? table.rows[offset] : previewCells(table.rows[offset]),
    }
  })
  const picked = ordinal === undefined ? records[0]?.ordinal : ordinal
  const visibleOffset = picked === undefined ? undefined : data.records.find(offset => offset + 1 === picked)
  const pairs: Pairing[] = []
  const pairingCount = visibleOffset === undefined ? 0n : count
  if (data.root !== null && pairingCount > 0n) {
    const rightFactor = branches.find(edge => edge.slot === 'B' && slot !== 'B')?.factor ?? 1
    const limit = Number(pairingCount < 12n ? pairingCount : 12n)
    for (let i = 0; i < limit; i++) {
      const pair: Pairing = { P: data.root + 1 }
      for (const edge of branches) {
        pair[edge.slot] = edge.slot === slot
          ? { kind: 'record', ordinal: picked! }
          : position(data, edge, edge.slot === 'A' ? Math.floor(i / rightFactor) : i % rightFactor)
      }
      pairs.push(pair)
    }
  }
  const matchedRecords: Evidence['matchedRecords'] = {}
  for (const branch of branches) {
    const child = run.dataset[branch.slot]!
    matchedRecords[branch.slot] = {
      headers: child.headers,
      rows: data.matches[branch.slot].slice(0, 3).map(offset => ({
        ordinal: offset + 1, cells: previewCells(child.rows[offset]),
      })),
    }
  }
  const reasons: string[] = []
  if (data.kind === 'null') reasons.push('The detail record has a NULL match key.')
  if (data.kind === 'orphan') reasons.push('No parent record has this exact key.')
  for (const edge of branches) {
    if (edge.join === 'inner' && edge.raw === 0) reasons.push(edge.slot + ' requires a match and found none.')
    if (edge.join === 'left' && edge.raw === 0) reasons.push(edge.slot + ' has no matches. LEFT supplies a NULL-extended position.')
    if (edge.distinct && edge.raw > 0) reasons.push(edge.slot + ' contributes one distinct key backed by ' + edge.raw + ' source records.')
    if (count > 1n && edge.factor > 1 && edge.slot !== slot) {
      reasons.push(edge.slot + ' supplies ' + edge.factor + ' matches per selected source record.')
    }
  }
  if (data.root !== null && !data.records.length && slot !== 'P') reasons.push('This group has no original measure records.')
  return {
    group, rootOrdinal: data.root === null ? null : data.root + 1,
    headers: table.headers, branches, records, recordCount: data.records.length, recordPage,
    pairings: pairs, pairingCount, reasons, matchedRecords,
  }
}
