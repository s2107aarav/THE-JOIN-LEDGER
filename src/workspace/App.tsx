import { useDeferredValue, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChildSlot, Evidence, Group, GroupPage, GroupQuery, JoinKind, Scenario, Slot } from '../core/types'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { ImportPanel } from './ImportPanel'
import { Inspector, type EvidenceSelection } from './Inspector'
import { Method } from './Method'
import { Report } from './Report'
import { count, customNames, displayAmount, exampleNames, groupLabel, joinLabel, visibleValue } from './presentation'
import { errorMessage, useLedger, type Case } from './useLedger'

const sourceUrl = 'https://github.com/s2107aarav/the-join-ledger'
const smallScreen = '(max-width: 639px)'
const filters: { value: GroupQuery['filter']; title: string }[] = [
  { value: 'affected', title: 'Affected' },
  { value: 'repeated', title: 'Repeated' },
  { value: 'excluded', title: 'Excluded' },
  { value: 'all', title: 'All groups' },
]

function mobileSnapshot() {
  return window.matchMedia(smallScreen).matches
}

function onViewportChange(listener: () => void) {
  const media = window.matchMedia(smallScreen)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

function Movement({ group, selected, onSelect }: { group: Group; selected: boolean; onSelect: (trigger: HTMLElement) => void }) {
  return <button type="button" className={'amount-button mono ' + (group.baseline.repeated ? 'repeated-ink' : group.baseline.excluded ? 'excluded-ink' : '')}
    aria-label={displayAmount(group.baseline.movement, true) + ' · Inspect ' + visibleValue(groupLabel(group), 100)} aria-expanded={selected}
    onClick={event => onSelect(event.currentTarget)}>
    {displayAmount(group.baseline.movement, true)} <Icon name="chevron" size={14} />
  </button>
}

function GroupName({ group }: { group: Group }) {
  return <>
    <strong className="group-key"><bdi>{visibleValue(groupLabel(group), 100)}</bdi></strong>
    <span className="group-status">
      {group.baseline.repeated > 0 && <span className="repeated-ink"><Icon name="repeat" size={13} />{count(group.baseline.repeated)} repeated</span>}
      {group.baseline.excluded > 0 && <span className="excluded-ink"><Icon name="exclude" size={13} />{count(group.baseline.excluded)} excluded</span>}
      {group.baseline.repeated === 0 && group.baseline.excluded === 0 && <span><Icon name="check" size={13} />{group.ownerCount ? 'Preserved' : 'No source records'}</span>}
      {group.kind === 'orphan' && <span>Orphan</span>}
    </span>
  </>
}

function CandidateValue({ group, original, candidate }: { group: Group; original: bigint | null; candidate: bigint | null }) {
  return <>{displayAmount(original)}
    {group.candidate && <small className="candidate-amount" aria-label={'Scenario ' + displayAmount(candidate)}> {displayAmount(candidate)} scenario</small>}
  </>
}

function RelationModel({ current, names, open, onToggle, onCompare, busy }: {
  current: Case; names: Record<Slot, string>; open: boolean; onToggle: () => void
  onCompare: (scenario: Scenario | null) => void; busy: boolean
}) {
  const edges = (['A', 'B'] as const).filter(slot => current.config.children[slot])
  const scenario = current.result.scenario
  const model = (slot: ChildSlot) => scenario?.joins[slot] ?? current.config.children[slot]!.join

  function updateJoin(slot: ChildSlot, kind: JoinKind) {
    const joins = { ...scenario?.joins, [slot]: kind }
    if (kind === current.config.children[slot]?.join) delete joins[slot]
    onCompare(Object.keys(joins).length || scenario?.distinct ? { joins, distinct: scenario?.distinct } : null)
  }

  function updateDistinct(distinct: ChildSlot | undefined) {
    const joins = scenario?.joins ?? {}
    onCompare(Object.keys(joins).length || distinct ? { joins, distinct } : null)
  }

  return <section className="relationship" aria-labelledby="relationship-heading">
    <div className="relationship-main">
      <div className="relationship-label" id="relationship-heading"><Icon name="branch" /> Join model</div>
      <div className="relationships">
        <div className="relation-node"><Icon name="tables" size={16} /><strong>{names.P}</strong><span>{current.config.measure.slot === 'P' ? 'Amount source' : 'Parent'}</span></div>
        <div className="relation-edges">
          {edges.map(slot => <div className="relation-edge" key={slot}>
            <span className="edge-label" aria-label={joinLabel(model(slot)) + ' join from ' + names.P + ' to ' + names[slot]}>{joinLabel(model(slot))}</span>
            <div className="relation-node child-node">
              <strong>{names[slot]}</strong>{current.config.measure.slot === slot && <span>Amount source</span>}
              {scenario?.distinct === slot && <span>Distinct keys</span>}
            </div>
          </div>)}
        </div>
      </div>
      <button type="button" className={open ? 'quiet-button compare-button' : 'outline-button compare-button'} aria-expanded={open} disabled={busy} onClick={onToggle}>
        <Icon name="branch" />{open ? 'Hide comparison' : 'Compare a scenario'}
      </button>
    </div>
    {open && <div className="scenario-controls">
      <div className="scenario-fields">
        {edges.map(slot => <label className="field" key={slot}>{names[slot]} inclusion
          <select disabled={busy} value={model(slot)} onChange={event => updateJoin(slot, event.target.value as JoinKind)}>
            <option value="inner">INNER · Requires a match</option>
            <option value="left">LEFT · Keeps unmatched parents</option>
          </select>
        </label>)}
        <label className="field">Use distinct keys
          <select disabled={busy || edges.every(slot => current.config.measure.slot === slot)} value={scenario?.distinct ?? ''}
            onChange={event => updateDistinct((event.target.value || undefined) as ChildSlot | undefined)}>
            <option value="">None · Use original detail rows</option>
            {edges.filter(slot => current.config.measure.slot !== slot).map(slot => <option key={slot} value={slot}>{names[slot]} · One match per key</option>)}
          </select>
        </label>
        {scenario && <button type="button" className="quiet-button" disabled={busy} onClick={() => onCompare(null)}>Reset comparison</button>}
      </div>
      <p>{scenario?.distinct ? names[scenario.distinct] + ' supplies one match per key. Its inclusion rule still determines whether unmatched parents survive.' : 'Change a join rule to compare its effect against the baseline.'}</p>
    </div>}
  </section>
}

export function App() {
  const ledger = useLedger()
  const current = ledger.current
  const result = current?.result
  const mobile = useSyncExternalStore(onViewportChange, mobileSnapshot)
  const [query, setQuery] = useState<GroupQuery>({ page: 1, filter: 'affected', sort: 'impact', search: '' })
  const deferredSearch = useDeferredValue(query.search)
  const [page, setPage] = useState<GroupPage>()
  const [selection, setSelection] = useState<EvidenceSelection>()
  const [evidence, setEvidence] = useState<{ selection: EvidenceSelection; result: number; value: Evidence }>()
  const [requestIssue, setRequestIssue] = useState<string>()
  const [dialog, setDialog] = useState<'method' | 'report' | 'share'>()
  const [shareUrl, setShareUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [focusEvidence, setFocusEvidence] = useState(0)
  const defaultPick = useRef(true)
  const trigger = useRef<HTMLElement | null>(null)
  const ledgerHeading = useRef<HTMLHeadingElement>(null)
  const importTrigger = useRef<HTMLElement | null>(null)
  const names = current?.example ? exampleNames : customNames

  useEffect(() => {
    defaultPick.current = true
    setQuery({ page: 1, filter: 'affected', sort: 'impact', search: '' })
    setSelection(undefined)
    setPage(undefined)
    setEvidence(undefined)
    setFocusEvidence(0)
    setScenarioOpen(Boolean(current?.result.scenario))
  }, [current?.config])

  useEffect(() => {
    if (!result || ledger.stage) return
    let active = true
    setRequestIssue(undefined)
    void ledger.client.request('listGroups', { resultId: result.id, query: { ...query, search: deferredSearch } }).then(value => {
      if (!active) return
      setPage(value)
      if (defaultPick.current && value.groups.length) {
        defaultPick.current = false
        // Keep the mobile ledger compact until a user opens a group.
        if (!mobileSnapshot()) setSelection({ id: value.groups[0].id, version: result.candidate ? 'candidate' : 'baseline' })
      }
    }).catch(error => { if (active) setRequestIssue(errorMessage(error)) })
    return () => { active = false }
  }, [ledger.client, ledger.stage, result, query.page, query.filter, query.sort, deferredSearch])

  useEffect(() => {
    if (!result || !selection || ledger.stage) return
    let active = true
    void ledger.client.request('inspect', {
      resultId: result.id, groupId: selection.id,
      version: result.candidate ? selection.version : 'baseline',
      ordinal: selection.ordinal, page: selection.page, full: selection.full,
    }).then(value => { if (active) setEvidence({ selection, result: result.id, value }) })
      .catch(error => { if (active) setRequestIssue(errorMessage(error)) })
    return () => { active = false }
  }, [ledger.client, ledger.stage, result, selection])

  useEffect(() => {
    if (ledger.editing) document.getElementById('import-heading')?.focus()
  }, [ledger.editing])

  function selectGroup(group: Group, from?: HTMLElement) {
    if (from) trigger.current = from
    setFocusEvidence(value => from ? value + 1 : 0)
    setSelection({ id: group.id, version: result?.candidate ? 'candidate' : 'baseline' })
  }

  function closeEvidence() {
    setSelection(undefined)
    setFocusEvidence(0)
    if (trigger.current?.isConnected) trigger.current.focus()
    else ledgerHeading.current?.focus()
  }

  async function shareExample() {
    const scenario = result?.scenario
    // Custom combinations remain in the tab; the public example shares only its three documented presets.
    const rawExample = !scenario
    const documented = scenario?.distinct === 'B' && (scenario.joins.A ?? 'inner') === 'inner'
    const preset = rawExample ? 'raw' : documented ? (scenario.joins.B === 'left' ? 'all' : 'shipped') : 'raw'
    const url = new URL(window.location.pathname, window.location.origin)
    url.hash = new URLSearchParams({ example: 'payments', scenario: preset }).toString()
    window.history.replaceState(null, '', url)
    setShareUrl(url.href)
    try {
      await navigator.clipboard.writeText(url.href)
      setNotice(!rawExample && !documented ? 'Baseline example link copied.' : 'Example link copied.')
    } catch {
      setDialog('share')
    }
  }

  function restoreExample() {
    setNotice('')
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    void ledger.loadExample('raw')
  }

  function closeImport() {
    ledger.revert()
    if (importTrigger.current?.isConnected) importTrigger.current.focus()
  }

  const base = result?.baseline
  const candidate = result?.candidate
  const selectedGroup = page?.groups.find(group => group.id === selection?.id)
  const currentEvidence = evidence?.result === result?.id && evidence?.selection === selection ? evidence?.value : undefined
  const visibleEvidence = currentEvidence ?? (evidence && selection && evidence.result === result?.id &&
    evidence.selection.id === selection.id && evidence.selection.version === selection.version &&
    evidence.selection.page === selection.page ? evidence.value : undefined)
  const effectiveSelection = selection && !candidate && selection.version === 'candidate' ? { ...selection, version: 'baseline' as const } : selection
  const inspector = effectiveSelection && current ? <Inspector evidence={visibleEvidence} group={selectedGroup} loading={!currentEvidence}
    selection={effectiveSelection} names={names} owner={current.config.measure.slot} onSelect={value => { setFocusEvidence(0); setSelection(value) }}
    onClose={closeEvidence} focusRequested={focusEvidence} /> : null

  function nextPage(change: number) {
    setQuery(value => ({ ...value, page: (page?.page ?? value.page) + change }))
  }

  const selectedUnit = current?.config.unit

  return <>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <header className="site-header">
      <div className="site-frame header-content">
        <a className="brand" href="./" aria-label="The Join Ledger home"><span className="brand-mark"><Icon name="ledger" size={23} /></span><span>The Join Ledger</span></a>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#workspace" aria-current="page">Workspace</a>
          <button type="button" onClick={() => setDialog('method')}>Method</button>
          <a href={sourceUrl}>Source <Icon name="external" size={14} /></a>
        </nav>
        <span className="private-indicator"><Icon name="lock" size={14} /> Processed in this tab</span>
      </div>
    </header>
    <main id="main-content" className="site-frame" onKeyDown={event => {
      if (event.key === 'Escape' && selection && !dialog && !ledger.editing) closeEvidence()
    }}>
      <section className="overview" id="workspace" aria-labelledby="overview-heading">
        <div className="overview-intro">
          <div className="dataset-label"><Icon name="tables" size={15} />{current?.example || !current ? 'Built-in example · Orders and payments' : 'Your investigation'}</div>
          <h1 id="overview-heading">{current?.example || !current ? <>Five payments in.<br />Five rows out.</> : <>Trace the total.</>}</h1>
          <p>{current?.example || !current
            ? 'Both totals agree. Follow the source records to see which payments were counted twice and which went missing.'
            : 'Follow each original amount through the join and compare the records included by another rule.'}</p>
          <div className="overview-actions">
            {(current?.example || !current) && <button type="button" className="primary-button" disabled={!page?.groups.length || Boolean(ledger.stage) || ledger.editing}
              onClick={event => { if (page?.groups[0]) selectGroup(page.groups[0], event.currentTarget) }}><Icon name="search" /> Trace the payments</button>}
            <button type="button" className={current && !current.example ? 'primary-button' : 'outline-button'} disabled={Boolean(ledger.stage) || ledger.editing}
              onClick={event => { importTrigger.current = event.currentTarget; ledger.openImport() }}><Icon name="tables" />{current && !current.example ? 'Edit my tables' : 'Use my tables'}</button>
          </div>
        </div>
        <div className="summary-paper">
          <div className="summary-label"><span>Reconciliation</span>{selectedUnit && <span className="unit-label">{visibleValue(selectedUnit, 32)}</span>}</div>
          <div className={'summary-columns' + (candidate ? ' with-candidate' : '')}>
            <div><span>Source SUM</span><strong className="mono" data-testid="source-total">{base ? displayAmount(base.source) : '—'}</strong>
              <small>{base ? count(base.repeated + base.excluded + base.preserved) + ' original records' : 'Reading input'}</small></div>
            <div><span>Joined SUM</span><strong className="mono" data-testid="joined-total">{base ? displayAmount(base.joined) : '—'}</strong>
              <small>{base ? count(base.outputRows) + ' joined rows' : 'Calculating'}</small></div>
            {candidate && <div className="summary-candidate"><span>Scenario SUM</span><strong className="mono" data-testid="scenario-total">{displayAmount(candidate.joined)}</strong>
              <small>{count(candidate.outputRows)} joined rows{base?.joined !== null && base?.joined !== undefined && candidate.joined !== null ? ' · ' + displayAmount(candidate.joined - base.joined, true) : ''}</small></div>}
          </div>
          {base && <div className="summary-status">
            <span className="repeated-ink"><Icon name="repeat" /> {count(base.repeated)} repeated</span>
            <span className="excluded-ink"><Icon name="exclude" /> {count(base.excluded)} excluded</span>
            <span className="mono" title="Signed movement versus source">Net {displayAmount(base.movement, true)}</span>
          </div>}
        </div>
      </section>

      {(ledger.stage || ledger.error || requestIssue || notice) && <div className={ledger.error || requestIssue ? 'status-bar error-bar' : 'status-bar'}>
        {(ledger.error || requestIssue) ? <p role="alert">{ledger.error || requestIssue}</p> : <p role="status">{ledger.stage || notice}</p>}
        {ledger.stage && <button type="button" className="quiet-button" onClick={() => { void ledger.cancel() }}>Cancel</button>}
        {!ledger.stage && (ledger.error || requestIssue) && !ledger.editing && <button type="button" className="quiet-button" onClick={() => { setRequestIssue(undefined); void ledger.retry() }}>Retry</button>}
        {!ledger.stage && notice && !(ledger.error || requestIssue) && <button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="close" /></button>}
      </div>}
      <p className="sr-only" role="status">{!ledger.stage && result ? 'Analysis ready. ' + (candidate ? 'Scenario comparison is available.' : count(result.baseline.outputRows) + ' joined rows.') : ''}</p>
      {ledger.editing && <ImportPanel ledger={{ ...ledger, revert: closeImport }} />}
      {current && result && <>
        <RelationModel current={current} names={names} open={scenarioOpen} busy={Boolean(ledger.stage) || ledger.editing}
          onToggle={() => setScenarioOpen(open => !open)} onCompare={scenario => { void ledger.compare(scenario) }} />
        {(ledger.editing || ledger.stage && result) && <p className="previous-result"><Icon name="ledger" /> Previous result. Export becomes available when the current case is ready.</p>}
        <div className="workspace-grid">
          <section className="ledger-panel" aria-labelledby="ledger-heading">
            <header className="ledger-heading">
              <div><h2 tabIndex={-1} id="ledger-heading" ref={ledgerHeading}>Contribution ledger</h2><p>{selectedUnit ? visibleValue(selectedUnit, 32) + ' by parent key' : 'Selected amount by parent key'}</p></div>
              <button type="button" className="outline-button report-button" disabled={Boolean(ledger.stage) || ledger.editing || Boolean(requestIssue || ledger.error)} onClick={() => setDialog('report')}>
                <Icon name="download" /> Preview report
              </button>
            </header>
            <div className="ledger-controls">
              <div className="segmented filters" role="group" aria-label="Filter groups">
                {filters.map(filter => <button key={filter.value} type="button" aria-pressed={query.filter === filter.value}
                  onClick={() => setQuery(old => ({ ...old, filter: filter.value, page: 1 }))}>{filter.title}</button>)}
              </div>
              <label className="key-search">
                <span className="sr-only">Find a key</span><Icon name="search" />
                <input type="search" placeholder="Find a key…" value={query.search}
                  onChange={event => setQuery(old => ({ ...old, search: event.target.value, page: 1 }))} />
              </label>
            </div>
            {page?.groups.length ? (mobile
              ? <ul className="mobile-ledger" aria-label="Contribution groups">{page.groups.map(group => <li className={selection?.id === group.id ? 'active-group' : ''} key={group.id}>
                <div className="mobile-group-heading"><div><GroupName group={group} /></div><Movement group={group} selected={selection?.id === group.id} onSelect={from => selectGroup(group, from)} /></div>
                <dl className="mobile-amounts"><div><dt>Source</dt><dd>{displayAmount(group.baseline.source)}</dd></div>
                  <div><dt>Joined</dt><dd><CandidateValue group={group} original={group.baseline.joined} candidate={group.candidate?.joined ?? null} /></dd></div>
                  {group.candidate && <div><dt>Scenario movement</dt><dd>{displayAmount(group.candidate.movement, true)}</dd></div>}</dl>
                {selection?.id === group.id && inspector}
              </li>)}</ul>
              : <div className="scroll-table ledger-table-wrap" tabIndex={0} role="region" aria-label="Contribution ledger table">
                <table className="ledger-table">
                  <thead><tr><th scope="col">Parent key</th><th scope="col">Source</th><th scope="col">Joined</th><th scope="col">Movement</th></tr></thead>
                  <tbody>{page.groups.map(group => <tr key={group.id} className={selection?.id === group.id ? 'active-group' : ''}
                    onClick={event => {
                      if (!(event.target instanceof Element) || event.target.closest('button')) return
                      const control = event.currentTarget.querySelector('button')
                      if (control) selectGroup(group, control)
                    }}>
                    <th scope="row"><GroupName group={group} /></th>
                    <td className="mono">{displayAmount(group.baseline.source)}</td>
                    <td className="mono"><CandidateValue group={group} original={group.baseline.joined} candidate={group.candidate?.joined ?? null} /></td>
                    <td><Movement group={group} selected={selection?.id === group.id} onSelect={from => selectGroup(group, from)} />
                      {group.candidate && <small className="candidate-amount">{displayAmount(group.candidate.movement, true)} scenario</small>}</td>
                  </tr>)}</tbody>
                </table>
              </div>) : <div className="empty-ledger">
              <Icon name="search" size={22} />
              <p>{!page ? 'Reading groups…' : query.search ? 'No groups match this key.' : 'No groups match this filter.'}</p>
              {page && <button type="button" className="text-button" onClick={() => setQuery(old => ({ ...old, search: '', filter: 'all', page: 1 }))}>Show all groups</button>}
            </div>}
            {page && <div className="ledger-footer">
              <div>{page.total ? count((page.page - 1) * page.pageSize + 1) + '–' + count(Math.min(page.total, page.page * page.pageSize)) + ' of ' + count(page.total) : '0'} {page.total === 1 ? 'group' : 'groups'}</div>
              {page.total > page.pageSize && <div className="pagination">
                <button type="button" className="small-button" disabled={page.page <= 1} onClick={() => nextPage(-1)}>Previous</button>
                <button type="button" className="small-button" disabled={page.page * page.pageSize >= page.total} onClick={() => nextPage(1)}>Next</button>
              </div>}
              <label className="sort-control">Sort <select aria-label="Sort groups" value={query.sort} onChange={event => setQuery(old => ({ ...old, sort: event.target.value as GroupQuery['sort'], page: 1 }))}>
                <option value="impact">Largest impact</option><option value="source">Join order</option>
              </select></label>
            </div>}
            {candidate && <p className="ledger-footnote">Scenario amounts use the same source records. Movement is measured against the source in both columns.</p>}
          </section>
          {!mobile && <aside className="evidence-margin" aria-label="Source record inspector">
            {inspector ?? <div className="inspector idle-inspector"><div className="inspector-label"><Icon name="layers" /> Source evidence</div><p>Select a movement to inspect its records.</p></div>}
          </aside>}
        </div>
      </>}
    </main>
    <footer className="site-frame footer">
      <span><Icon name="lock" size={14} /> Source records stay in your browser</span>
      <div>
        {current?.example && <button type="button" onClick={() => { void shareExample() }} disabled={Boolean(ledger.stage) || ledger.editing}><Icon name="link" /> Share example</button>}
        <a href={sourceUrl + '/issues/new'}>Feedback <Icon name="external" size={13} /></a>
        {current && !current.example && <button type="button" onClick={restoreExample}>Clear workspace</button>}
      </div>
    </footer>
    {dialog === 'method' && <Method onClose={() => setDialog(undefined)} />}
    {dialog === 'report' && result && !ledger.editing && !ledger.stage && <Report client={ledger.client} result={result} groupId={selection?.id} onClose={() => setDialog(undefined)} />}
    {dialog === 'share' && <Dialog title="Share example" onClose={() => setDialog(undefined)}><div className="report-content">
      <label className="field">Example link<input readOnly value={shareUrl} onFocus={event => event.currentTarget.select()} /></label>
    </div></Dialog>}
  </>
}
