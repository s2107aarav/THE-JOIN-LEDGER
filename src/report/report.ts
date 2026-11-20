import { formatAmount } from '../core/decimal'
import { inspect, listGroups, type Evaluation, type Investigation } from '../core/engine'
import { LedgerError, type ExportOptions, type SumStats } from '../core/types'

function literal(text: string): string {
  return JSON.stringify(text).replace(/[\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/gu,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
}

function summary(stats: SumStats, amounts: boolean) {
  const lines = [
    '- Joined rows: ' + stats.outputRows,
    '- Owner records: ' + stats.repeated + ' repeated, ' + stats.excluded + ' excluded, ' + stats.preserved + ' preserved',
    '- Additional appearances: ' + stats.extra,
    '- Non-NULL owner amounts: ' + stats.sourceNonNull + ' source, ' + stats.joinedNonNull + ' joined',
  ]
  if (amounts) lines.push(
    '- SQL SUM, source: ' + formatAmount(stats.source),
    '- SQL SUM, joined: ' + formatAmount(stats.joined),
    '- Additive movement: ' + formatAmount(stats.movement, true),
    '- Signed effect of repetition: ' + formatAmount(stats.repetition, true),
    '- Signed effect of exclusion: ' + formatAmount(stats.exclusion, true),
  )
  return lines
}

export function createReport(run: Investigation, base: Evaluation, candidate: Evaluation | null, options: ExportOptions): string {
  const lines = [
    '# The Join Ledger investigation', '', 'Application 0.1.0 · Join contract 1', '',
    'Calculated from the supplied extract. Parent P has one unique text key. Each detail branch matches P by exact text. Empty keys and amounts are NULL.',
    'The extract can omit relevant records. The report author chooses the intended inclusion rules.', '',
    'Measure owner: ' + run.config.measure.slot,
  ]
  if (options.amounts && run.config.unit) lines.push('', 'Declared unit', '', '    ' + literal(run.config.unit))
  lines.push('', '## Baseline', '')
  for (const [slot, config] of Object.entries(run.config.children)) {
    if (config && run.dataset[slot as 'A' | 'B']) lines.push('- ' + slot + ': ' + config.join.toUpperCase() + ', raw detail')
  }
  lines.push(...summary(base.total, options.amounts))
  if (candidate) {
    lines.push('', '## Scenario', '')
    for (const [slot, config] of Object.entries(run.config.children)) {
      const edge = slot as 'A' | 'B'
      if (!config || !run.dataset[edge]) continue
      const kind = candidate.scenario?.joins[edge] ?? config.join
      lines.push('- ' + slot + ': ' + kind.toUpperCase() + ', ' +
        (candidate.scenario?.distinct === slot ? 'one distinct key per match' : 'raw detail'))
    }
    lines.push(...summary(candidate.total, options.amounts))
  }
  const page = listGroups(run, base, candidate, { page: 1, filter: 'affected', search: '', sort: 'impact' })
  const selected = options.groupId === undefined ? undefined : inspect(run, base, candidate, options.groupId, 'baseline')
  lines.push('', '## Affected groups', '', 'Showing ' + Math.min(10, page.total) + ' of ' + page.total + '.')
  page.groups.slice(0, 10).forEach((group, index) => {
    const stats = group.baseline
    lines.push('', '- Group ' + (index + 1) + ' (' + group.kind + '): ' +
      stats.repeated + ' repeated, ' + stats.excluded + ' excluded' +
      (options.amounts ? ', movement ' + formatAmount(stats.movement, true) : '') +
      (group.candidate ? '; scenario ' + group.candidate.repeated + ' repeated, ' + group.candidate.excluded + ' excluded' +
        (options.amounts ? ', movement ' + formatAmount(group.candidate.movement, true) : '') : ''))
    if (options.keys && group.key !== null) lines.push('', '    ' + literal(group.key))
  })
  if (selected) {
    lines.push('', '## Selected group evidence', '', ...selected.reasons.map(reason => '- ' + reason))
    if (options.keys && selected.group.key !== null) lines.push('', '    ' + literal(selected.group.key))
    lines.push('', 'Showing ' + Math.min(12, selected.recordCount) + ' of ' + selected.recordCount + ' original measure records.', '')
    selected.records.slice(0, 12).forEach((record, index) => {
      lines.push('- Record ' + (index + 1) + ': ' + record.appearances + ' appearances' +
        (options.amounts ? ', source ' + formatAmount(record.source) + ', movement ' + formatAmount(record.movement, true) : ''))
      if (options.excerpts) {
        const owner = run.config.measure.slot
        const measureColumn = run.config.measure.column
        const keyColumn = owner === 'P' ? run.config.rootKey : run.config.children[owner]!.key
        const cells = record.cells.map((value, column) => {
          if ((!options.amounts && column === measureColumn) || (!options.keys && column === keyColumn)) return '[redacted]'
          return value.slice(0, 80)
        })
        lines.push('', '    [' + cells.map(literal).join(', ') + ']', '')
      }
    })
  }
  const report = lines.join('\n') + '\n'
  if (new TextEncoder().encode(report).length > 65536) {
    throw new LedgerError('REPORT_SIZE', 'This report exceeds 64 KiB. Leave out the optional source fields.')
  }
  return report
}
