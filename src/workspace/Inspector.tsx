import { useEffect, useRef } from 'react'
import type { Evidence, Group, Position, Slot } from '../core/types'
import { Icon } from './Icon'
import { count, displayAmount, groupLabel, joinLabel, visibleValue } from './presentation'

export type EvidenceSelection = {
  id: number
  version: 'baseline' | 'candidate'
  ordinal?: number
  page?: number
  full?: boolean
}

function positionLabel(position?: Position) {
  if (!position) return '—'
  if (position.kind === 'presence') return 'Distinct key'
  if (position.kind === 'null') return 'NULL extension'
  return '#' + position.ordinal
}

export function Inspector({ evidence, group, loading, selection, names, owner, onSelect, onClose, focusRequested }: {
  evidence?: Evidence
  group?: Group
  loading: boolean
  selection: EvidenceSelection
  names: Record<Slot, string>
  owner: Slot
  onSelect: (selection: EvidenceSelection) => void
  onClose: () => void
  focusRequested: number
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusRequested) heading.current?.focus()
  }, [selection.id, focusRequested])

  const selected = evidence?.records.find(record => record.ordinal === selection.ordinal) ?? evidence?.records[0]
  const activeGroup = evidence?.group ?? group
  const stats = activeGroup && (selection.version === 'candidate' ? activeGroup.candidate : activeGroup.baseline)
  const recordPage = evidence?.recordPage ?? 1
  const recordPages = Math.ceil((evidence?.recordCount ?? 0) / 25)

  return <section className="inspector" aria-labelledby="inspector-heading" aria-busy={loading}>
    <div className="inspector-label"><Icon name="layers" /> Source evidence
      <button type="button" className="icon-button" onClick={onClose} aria-label="Close evidence"><Icon name="close" /></button>
    </div>
    <div className="inspector-content">
      <div className="evidence-title">
        <h3 tabIndex={-1} ref={heading} id="inspector-heading">{activeGroup ? <bdi>{visibleValue(groupLabel(activeGroup), 100)}</bdi> : 'Inspecting group'}</h3>
        {stats && <span className={'evidence-delta mono ' + (stats.repeated ? 'repeated-ink' : stats.excluded ? 'excluded-ink' : '')}>{displayAmount(stats.movement, true)}</span>}
      </div>
      {activeGroup?.kind === 'orphan' && <p className="inspector-detail">Orphaned detail key. No parent matches this exact text.</p>}
      {activeGroup?.kind === 'null' && <p className="inspector-detail">These detail records have empty match keys.</p>}
      {evidence?.rootOrdinal != null && <p className="inspector-detail">Parent record <span className="mono">#{evidence.rootOrdinal}</span></p>}
      {activeGroup?.kind !== 'null' && activeGroup?.key !== null && activeGroup?.key !== undefined && (
        <details className="record-detail match-detail">
          <summary>Match key details</summary>
          <p>Exact text. Spaces are shown as <code>␣</code>.</p>
          <code dir="ltr">{visibleValue(activeGroup.key, 4096).replaceAll(' ', '␣')}</code>
        </details>
      )}
      {activeGroup?.candidate && <div className="segmented inspector-versions" role="group" aria-label="Evidence for">
        <button type="button" aria-pressed={selection.version === 'baseline'} onClick={() => onSelect({ ...selection, version: 'baseline', full: undefined })}>Baseline</button>
        <button type="button" aria-pressed={selection.version === 'candidate'} onClick={() => onSelect({ ...selection, version: 'candidate', full: undefined })}>Scenario</button>
      </div>}
      {loading && !evidence && <p className="evidence-loading">Reading source evidence…</p>}
      {evidence && <>
        {evidence.reasons.length > 0 && <ul className="reason-list">
          {evidence.reasons.map(reason => <li key={reason}>{reason.replace(/^[AB]\b/, slot => names[slot as Slot])}</li>)}
        </ul>}
        {evidence.branches.length > 0 && <div className="branch-trace" aria-label="Detail table matches">
          {evidence.branches.map(branch => <div className="branch-trace-line" key={branch.slot}>
            <span className="branch-name">{names[branch.slot]} <span className="join-code">{joinLabel(branch.join)}</span></span>
            <span>{count(branch.raw)} {branch.raw === 1 ? 'match' : 'matches'}{branch.distinct ? ' · ' + count(branch.effective) + ' distinct key' : ''}</span>
          </div>)}
        </div>}
        {evidence.records.length > 0 && <div className="source-records">
          <h4>{names[owner]} records</h4>
          <div className="scroll-table" role="region" tabIndex={0} aria-label="Selected amount source records">
            <table className="mini-ledger">
              <thead><tr><th scope="col">Record</th><th scope="col">Original</th><th scope="col">Appearances</th><th scope="col">Joined</th></tr></thead>
              <tbody>{evidence.records.map(record => <tr key={record.ordinal} className={selected?.ordinal === record.ordinal ? 'picked-record' : ''}>
                <th scope="row"><button type="button" className="record-button" aria-label={'#' + record.ordinal + ' · Inspect source record ' + record.ordinal} aria-pressed={selected?.ordinal === record.ordinal}
                  onClick={() => onSelect({ ...selection, ordinal: record.ordinal, full: undefined })}>#{record.ordinal}</button></th>
                <td>{displayAmount(record.source)}</td><td>×{count(record.appearances)}</td><td>{displayAmount(record.joined)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {recordPages > 1 && <div className="pagination compact">
            <button type="button" className="small-button" disabled={recordPage <= 1} onClick={() => onSelect({ ...selection, ordinal: undefined, full: undefined, page: recordPage - 1 })}>Previous records</button>
            <span>{recordPage} / {recordPages}</span>
            <button type="button" className="small-button" disabled={recordPage >= recordPages} onClick={() => onSelect({ ...selection, ordinal: undefined, full: undefined, page: recordPage + 1 })}>Next records</button>
          </div>}
        </div>}
        {selected && <>
          <div className="calculation">
            <span className="calculation-label">Record #{selected.ordinal} contribution</span>
            <strong className="mono">{selected.source === null ? 'NULL amount' : displayAmount(selected.source) + ' × ' + count(selected.appearances) + ' = ' + displayAmount(selected.joined ?? 0n)}</strong>
            <span>{selected.appearances === 0n ? 'Excluded by the join' : selected.appearances > 1n ? 'Repeated in the join' : 'Present once'}<span className="calculation-divider">·</span>Movement <span className="mono">{displayAmount(selected.movement, true)}</span></span>
          </div>
          <details className="record-detail" key={selected.ordinal}>
            <summary>Original record fields</summary>
            <dl>{evidence.headers.map((header, index) => <div key={index}>
              <dt><bdi>{visibleValue(header, 140)}</bdi></dt>
              <dd><bdi>{visibleValue(selected.cells[index] ?? '', selection.full && !loading ? 65537 : 4096) || 'Empty'}</bdi></dd>
            </div>)}</dl>
            {!selection.full && selected.cells.some(value => value.endsWith('…')) && <button type="button" className="text-button" onClick={() => onSelect({ ...selection, ordinal: selected.ordinal, full: true })}>Show full fields</button>}
          </details>
        </>}
        {!loading && evidence.pairings.length > 0 && <details className="record-detail" open={evidence.pairings.length <= 3}>
          <summary>Join pairings <span>· {count(evidence.pairingCount)} for this record</span></summary>
          {BigInt(evidence.pairings.length) < evidence.pairingCount && <p>Showing the first {evidence.pairings.length} pairings.</p>}
          <div className="scroll-table" role="region" tabIndex={0} aria-label="Joined source record pairings">
            <table className="mini-ledger pairing-table">
              <thead><tr><th scope="col">{names.P}</th>{evidence.branches.map(branch => <th key={branch.slot} scope="col">{names[branch.slot]}</th>)}</tr></thead>
              <tbody>{evidence.pairings.map((pair, index) => <tr key={index}>
                <td>#{pair.P}</td>{evidence.branches.map(branch => <td key={branch.slot}>{positionLabel(pair[branch.slot])}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </details>}
        {evidence.branches.filter(branch => branch.slot !== owner && branch.raw > 0).map(branch => {
          const matches = evidence.matchedRecords[branch.slot]
          if (!matches?.rows.length) return null
          return <details className="record-detail" key={branch.slot}>
            <summary>{names[branch.slot]} samples <span>· {matches.rows.length} of {count(branch.raw)}</span></summary>
            <div className="scroll-table" role="region" tabIndex={0} aria-label={names[branch.slot] + ' matching source rows'}>
              <table className="mini-ledger">
                <thead><tr><th scope="col">Record</th>{matches.headers.map((header, index) => <th key={index} scope="col">{visibleValue(header, 80)}</th>)}</tr></thead>
                <tbody>{matches.rows.map(row => <tr key={row.ordinal}><th scope="row">#{row.ordinal}</th>
                  {row.cells.map((value, index) => <td key={index}><bdi>{visibleValue(value, 160) || 'Empty'}</bdi></td>)}
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        })}
      </>}
    </div>
  </section>
}
