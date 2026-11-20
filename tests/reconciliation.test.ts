import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { evaluate, indexSources, inspect } from '../src/core/engine'
import { formatAmount, parseAmount } from '../src/core/decimal'
import type { ChildSlot, Datasets, DraftConfig, Scenario, Slot } from '../src/core/types'
import { parseSource } from '../src/import/csv'
import { createReport } from '../src/report/report'
import { exampleConfig, exampleScenario, exampleSources } from '../src/worker/example'

type DataRow = { key: string | null; value: bigint | null }
type Rows = { P: DataRow[]; A: DataRow[]; B?: DataRow[] }
type Joined = { p: bigint; a: bigint | null; b: bigint | null; amount: bigint | null }
const slots = ['P', 'A', 'B'] as const
const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE p(rid INTEGER PRIMARY KEY, k TEXT NOT NULL UNIQUE COLLATE BINARY, v INTEGER) STRICT;
  CREATE TABLE a(rid INTEGER PRIMARY KEY, k TEXT COLLATE BINARY, v INTEGER) STRICT;
  CREATE TABLE b(rid INTEGER PRIMARY KEY, k TEXT COLLATE BINARY, v INTEGER) STRICT;
`)
afterAll(() => db.close())

function stage(input: Rows) {
  db.exec('DELETE FROM p; DELETE FROM a; DELETE FROM b')
  for (const slot of slots) {
    const insert = db.prepare('INSERT INTO ' + slot.toLowerCase() + ' VALUES (?, ?, ?)')
    input[slot]?.forEach((row, offset) => insert.run(offset + 1, row.key, row.value))
  }
}

function sql(input: Rows, config: DraftConfig, scenario: Scenario | null) {
  stage(input)
  const lines = {
    fields: ['p.rid AS p', 'NULL AS a', 'NULL AS b'],
    joins: [] as string[],
  }
  for (const slot of ['A', 'B'] as const) {
    if (!input[slot]) continue
    const alias = slot.toLowerCase()
    const mode = (scenario?.joins[slot] ?? config.children[slot]?.join) === 'left' ? 'LEFT' : 'INNER'
    const distinct = scenario?.distinct === slot
    const relation = distinct ? '(SELECT DISTINCT k FROM ' + alias + ' WHERE k IS NOT NULL) AS ' + alias : alias
    if (!distinct) lines.fields[slot === 'A' ? 1 : 2] = alias + '.rid AS ' + alias
    lines.joins.push(mode + ' JOIN ' + relation + ' ON ' + alias + '.k = p.k')
  }
  const owner = config.measure.slot.toLowerCase()
  const projection = 'SELECT ' + lines.fields.join(', ') + ', ' + owner + '.v AS amount FROM p ' + lines.joins.join(' ')
  const materialized = db.prepare(projection)
  materialized.setReadBigInts(true)
  const joined = materialized.all() as Joined[]
  const aggregates = db.prepare('SELECT SUM(amount) AS amount, COUNT(amount) AS nonNull FROM (' + projection + ')')
  aggregates.setReadBigInts(true)
  const source = db.prepare('SELECT SUM(v) AS amount, COUNT(v) AS nonNull FROM ' + owner)
  source.setReadBigInts(true)
  return {
    joined,
    source: source.get() as { amount: bigint | null; nonNull: bigint },
    aggregate: aggregates.get() as { amount: bigint | null; nonNull: bigint },
  }
}

function encode(value: bigint | null): string {
  if (value === null) return ''
  const magnitude = value < 0n ? -value : value
  return (value < 0n ? '-' : '') + magnitude / 1000000n + '.' + (magnitude % 1000000n).toString().padStart(6, '0')
}

function dataset(input: Rows): Datasets {
  return Object.fromEntries(slots.flatMap(slot => !input[slot] ? [] : [[slot, {
    headers: ['key', 'v'], bytes: 0, delimiters: 0, rows: input[slot].map(row => [row.key ?? '', encode(row.value)]),
  }]]))
}

function oracleIdentity(row: Joined, slot: Slot) {
  return row[slot.toLowerCase() as 'p' | 'a' | 'b']
}

function groupOf(record: DataRow, input: Rows) {
  return record.key === null ? 'null'
    : (input.P.some(row => row.key === record.key) ? 'root:' : 'orphan:') + record.key
}

function nullableSum(values: (bigint | null)[]) {
  return values.every(value => value === null) ? null : values.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
}

async function example() {
  const data: Datasets = {}
  for (const slot of slots) data[slot] = await parseSource(slot, exampleSources[slot]!)
  return indexSources(data, exampleConfig)
}

describe('the five-payment fixture', () => {
  it('agrees with a relational oracle and preserves the hidden accounting changes', async () => {
    const run = await example()
    const input = {
      P: ['O-17', 'O-24', 'O-31'].map(key => ({ key, value: null })),
      A: ([['O-17', 70n], ['O-17', 50n], ['O-24', 90n], ['O-24', 30n], ['O-31', 60n]] as const)
        .map(([key, value]) => ({ key, value: value * 1_000_000n })),
      B: ['O-17', 'O-17', 'O-31'].map(key => ({ key, value: null })),
    }
    const base = evaluate(run)
    const expectations = [
      { scenario: null, counts: [2n, 2n, 0n, 0n, 1n], output: 5n, amount: 300n },
      { scenario: exampleScenario('shipped'), counts: [1n, 1n, 0n, 0n, 1n], output: 3n, amount: 180n },
      { scenario: { joins: { B: 'left' } } as const, counts: [2n, 2n, 1n, 1n, 1n], output: 7n, amount: 420n },
      { scenario: exampleScenario('all'), counts: [1n, 1n, 1n, 1n, 1n], output: 5n, amount: 300n },
    ]
    for (const { scenario, counts, output, amount } of expectations) {
      const evaluated = evaluate(run, scenario)
      const expected = sql(input, exampleConfig, scenario)
      const records = run.index.flatMap((_, index) => inspect(run, base, evaluated, index, 'candidate').records)
      expect(records.map(record => record.appearances)).toEqual(counts)
      expect(records.map(record => expected.joined.filter(row => row.a === BigInt(record.ordinal)).length)).toEqual(counts.map(Number))
      expect(evaluated.total.joined).toBe(amount * 1_000_000n)
      expect(evaluated.total.source).toBe(expected.source.amount)
      expect(evaluated.total.joined).toBe(expected.aggregate.amount)
      expect(evaluated.total.outputRows).toBe(output)
    }
    expect(base.groups.map(group => group.movement)).toEqual([120_000_000n, -120_000_000n, 0n])
    expect(base.groups[1].joined).toBeNull()
    expect(inspect(run, base, null, 0, 'baseline', 1).pairings.map(pair => pair.B))
      .toEqual([{ kind: 'record', ordinal: 1 }, { kind: 'record', ordinal: 2 }])
    expect(inspect(run, base, evaluate(run, exampleScenario('shipped')), 0, 'candidate', 1).pairings[0].B)
      .toEqual({ kind: 'presence' })
  })
})

describe('differential tests against actual SQL joins', () => {
  it('compares every source identity and group over 1,200 reproducible configurations', () => {
    let rng = 13593907
    function random(bound: number) {
      rng ^= rng << 13
      rng ^= rng >>> 17
      rng ^= rng << 5
      return (rng >>> 0) % bound
    }
    const rootKeys = ['001', '1', '1 ', 'e\u0301', 'é', '  ']
    const amounts = [null, 0n, 1n, -9n, 12_000_000n, 12_000_000n, -999_999_999_999n]
    for (let seed = 0; seed < 1200; seed++) {
      const values = [...rootKeys, 'missing', null]
      const child = () => Array.from({ length: random(9) }, () => ({
        key: values[random(values.length)], value: amounts[random(amounts.length)],
      }))
      const input: Rows = {
        P: rootKeys.slice(0, random(rootKeys.length + 1)).map(key => ({ key, value: amounts[random(amounts.length)] })),
        A: child(), B: seed % 2 ? child() : undefined,
      }
      const owner = slots[Math.floor(seed / 2) % (input.B ? 3 : 2)]
      const config: DraftConfig = {
        rootKey: 0,
        children: { A: { key: 0, join: seed & 4 ? 'left' : 'inner' } },
        measure: { slot: owner, column: 1 }, unit: '',
      }
      if (input.B) config.children.B = { key: 0, join: seed & 8 ? 'left' : 'inner' }
      const eligible = (['A', 'B'] as const).filter(slot => input[slot] && slot !== owner)
      const scenario: Scenario | null = seed % 3
        ? { joins: { A: seed & 16 ? 'left' : 'inner' }, distinct: seed % 5 ? eligible[seed % eligible.length] : undefined }
        : null
      const run = indexSources(dataset(input), config)
      const actual = evaluate(run, scenario)
      const expected = sql(input, config, scenario)
      const tag = 'configuration ' + seed
      expect(actual.total.outputRows, tag).toBe(BigInt(expected.joined.length))
      expect(actual.total.joined, tag).toBe(expected.aggregate.amount)
      expect(actual.total.joinedNonNull, tag).toBe(expected.aggregate.nonNull)
      expect(actual.total.source, tag).toBe(expected.source.amount)
      expect(BigInt(actual.total.sourceNonNull), tag).toBe(expected.source.nonNull)
      expect(actual.total.sourceNonNull <= input[owner]!.length, tag).toBe(true)
      expect(actual.total.repeated + actual.total.excluded + actual.total.preserved, tag).toBe(input[owner]!.length)

      run.index.forEach((_, index) => {
        const evidence = inspect(run, actual, null, index, 'baseline')
        const group = evidence.group
        const name = group.kind === 'null' ? 'null' : group.kind + ':' + group.key
        const originals = input[owner]!.map((row, offset) => ({ row, ordinal: offset + 1 }))
          .filter(({ row }) => groupOf(row, input) === name)
        expect(evidence.records.map(record => record.ordinal), tag).toEqual(originals.map(original => original.ordinal))
        const matching = expected.joined.filter(row => row.p === BigInt(evidence.rootOrdinal ?? 0))
        expect(group.baseline.outputRows, tag).toBe(BigInt(matching.length))
        expect(group.baseline.joined, tag).toBe(nullableSum(matching.map(row => row.amount)))
        expect(group.baseline.source, tag).toBe(nullableSum(originals.map(record => record.row.value)))
        let movement = 0n
        for (const record of evidence.records) {
          const rows = expected.joined.filter(row => oracleIdentity(row, owner) === BigInt(record.ordinal))
          const expectedJoined = nullableSum(rows.map(row => row.amount))
          const expectedDelta = (expectedJoined ?? 0n) - (record.source ?? 0n)
          expect(record.appearances, tag).toBe(BigInt(rows.length))
          expect(record.joined, tag).toBe(expectedJoined)
          expect(record.movement, tag).toBe(expectedDelta)
          movement += expectedDelta
        }
        expect(group.baseline.movement, tag).toBe(movement)
        const witnesses = expected.joined.filter(row =>
          evidence.records.length && oracleIdentity(row, owner) === BigInt(evidence.records[0].ordinal))
        expect(evidence.pairings.length, tag).toBe(Math.min(12, witnesses.length))
        for (const pair of evidence.pairings) {
          const matches = (edge: ChildSlot, row: Joined) => {
            const position = pair[edge]
            const rid = oracleIdentity(row, edge)
            return position?.kind === 'record' ? rid === BigInt(position.ordinal) : rid === null
          }
          expect(witnesses.some(row => row.p === BigInt(pair.P) && matches('A', row) && matches('B', row)), tag).toBe(true)
        }
      })
      expect(actual.total.movement, tag).toBe((expected.aggregate.amount ?? 0n) - (expected.source.amount ?? 0n))
    }
  })

  it('counts 100 million combinations without building them and stays exact above SQLite aggregate range', () => {
    const config: DraftConfig = {
      rootKey: 0, children: { A: { key: 0, join: 'inner' }, B: { key: 0, join: 'inner' } },
      measure: { slot: 'P', column: 1 }, unit: '',
    }
    const maximum = 999_999_999_999_999_999n
    const run = indexSources(dataset({
      P: [{ key: 'x', value: maximum }],
      A: Array.from({ length: 10_000 }, () => ({ key: 'x', value: null })),
      B: Array.from({ length: 10_000 }, () => ({ key: 'x', value: null })),
    }), config)
    const result = evaluate(run)
    expect(result.total.outputRows).toBe(100_000_000n)
    expect(result.total.joined).toBe(100_000_000n * maximum)
    const evidence = inspect(run, result, null, 0, 'baseline', 1)
    expect(evidence.pairings).toHaveLength(12)
    expect(evidence.pairings[11].B).toEqual({ kind: 'record', ordinal: 12 })
  })
})

describe('validation and privacy', () => {
  it('keeps decimals exact and rejects values outside the grammar', () => {
    expect(formatAmount(parseAmount('-999999999999.999999'))).toBe('−999,999,999,999.999999')
    expect(parseAmount('+000000000001.000001')).toBe(1_000_001n)
    expect(parseAmount('-0.000000')).toBe(0n)
    expect(parseAmount('')).toBeNull()
    for (const value of ['.1', '1.', '1e6', ' 1', '2\n', '1,2', '0.0000001', '1000000000000', 'NULL']) {
      expect(() => parseAmount(value)).toThrow()
    }
  })
  it('preserves row references and rejects invalid parent keys and owner collapse', async () => {
    const run = await example()
    const config = run.config
    const duplicate = { ...run.dataset.P!, rows: [run.dataset.P!.rows[0], run.dataset.P!.rows[0]] }
    expect(() => indexSources({ ...run.dataset, P: duplicate }, config)).toThrow('Parent records 1 and 2')
    expect(() => evaluate(run, { joins: {}, distinct: 'A' })).toThrow()
  })
  it('keeps keys, amounts and excerpts out of the default export', async () => {
    const run = await example()
    const baseline = evaluate(run)
    const candidate = evaluate(run, exampleScenario('shipped'))
    const defaults = createReport(run, baseline, candidate, { amounts: false, keys: false, excerpts: false, groupId: 0 })
    expect(defaults).toContain('2 repeated, 2 excluded')
    for (const secret of ['O-17', 'PAY-01', 'North Branch', 'order_id', '300', 'USD']) expect(defaults).not.toContain(secret)
    const chosen = createReport(run, baseline, candidate, { amounts: true, keys: true, excerpts: true, groupId: 0 })
    expect(chosen).toContain('O-17')
    expect(chosen).toContain('PAY-01')
    expect(chosen).toContain('180')
  })
})
