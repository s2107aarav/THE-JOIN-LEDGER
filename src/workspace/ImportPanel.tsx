import { useId, useState } from 'react'
import { slots, type ChildSlot, type JoinKind, type Preview, type Slot, type Source } from '../core/types'
import { Icon } from './Icon'
import { customNames, count, sourceName, visibleValue } from './presentation'
import { validConfig, type LedgerController } from './useLedger'

function TablePreview({ preview }: { preview: Preview }) {
  return <details className="table-preview">
    <summary>Preview table</summary>
    <div className="scroll-table" tabIndex={0} role="region" aria-label={customNames[preview.slot] + ' table preview'}>
      <table>
        <thead><tr>{preview.headers.map((header, index) => <th key={index} scope="col">{visibleValue(header, 80)}</th>)}</tr></thead>
        <tbody>{preview.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><bdi>{visibleValue(cell, 80) || '∅'}</bdi></td>)}</tr>)}</tbody>
      </table>
      {preview.rows.length === 0 && <p>Header only. This table has no records.</p>}
    </div>
  </details>
}

function SourceEditor({ slot, ledger }: { slot: Slot; ledger: LedgerController }) {
  const { draft, prepare, remove, updateMapping } = ledger
  const preview = draft.previews[slot]
  const source = draft.sources[slot]
  const name = customNames[slot]
  const id = useId()
  const [paste, setPaste] = useState(typeof source?.input === 'string' ? source.input : '')
  const [delimiter, setDelimiter] = useState<Source['delimiter']>(source?.delimiter ?? ',')
  const [explicitDelimiter, setExplicitDelimiter] = useState(Boolean(source))
  const [replacing, setReplacing] = useState(!preview)
  const [pasteError, setPasteError] = useState<string>()
  const enabled = ledger.stage === null

  const key = slot === 'P' ? draft.mapping.rootKey : draft.mapping.children[slot]?.key

  function mapKey(column: number | undefined) {
    updateMapping(mapping => slot === 'P'
      ? { ...mapping, rootKey: column }
      : { ...mapping, children: { ...mapping.children, [slot]: { ...mapping.children[slot], key: column } } })
  }

  function mapJoin(slot: ChildSlot, join: JoinKind | undefined) {
    updateMapping(mapping => ({
      ...mapping, children: { ...mapping.children, [slot]: { ...mapping.children[slot], join } },
    }))
  }

  return <section className="source-editor" aria-labelledby={id + '-title'}>
    <h3 id={id + '-title'}><Icon name="tables" /> {name} {slot === 'B' && <span className="optional">Optional</span>}</h3>
    {preview && <div className="import-ready">
      <span><Icon name="check" /> {count(preview.count)} {preview.count === 1 ? 'record' : 'records'}</span>
      {sourceName(source) && <bdi className="source-file-name">{visibleValue(sourceName(source), 96)}</bdi>}
      <div className="source-actions">
        <button className="text-button" type="button" disabled={!enabled} onClick={() => setReplacing(value => !value)}>{replacing ? 'Hide input' : 'Replace'}</button>
        <button className="text-button" type="button" disabled={!enabled} onClick={() => { remove(slot); setReplacing(true); setPaste(''); setPasteError(undefined) }}>Remove</button>
      </div>
    </div>}
    {(!preview || replacing) && <>
      <label className="field" htmlFor={id + '-delimiter'}>Delimiter
        <select id={id + '-delimiter'} value={delimiter} onChange={event => { setDelimiter(event.target.value as Source['delimiter']); setExplicitDelimiter(true) }} disabled={!enabled}>
          <option value=",">Comma (CSV)</option><option value={'\t'}>Tab (TSV)</option>
        </select>
      </label>
      <label className="field file-label" htmlFor={id + '-file'}>{name} file
        <input id={id + '-file'} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={!enabled} onChange={event => {
          const input = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!input) return
          const separator = !explicitDelimiter && /\.tsv$/i.test(input.name) ? '\t' : delimiter
          setDelimiter(separator)
          setPasteError(undefined)
          void prepare(slot, { input, delimiter: separator }).then(accepted => { if (accepted) setReplacing(false) })
        }} />
      </label>
      <label className="field" htmlFor={id + '-paste'}>Paste {name.toLowerCase()} data
        <textarea id={id + '-paste'} rows={3} spellCheck={false} placeholder={slot === 'P' ? 'order_id,customer' : 'order_id,amount'} value={paste}
          disabled={!enabled} onChange={event => {
            if (event.target.value.length > 5 * 1024 * 1024) {
              setPasteError('This paste exceeds the 5 MiB input limit.')
              return
            }
            setPasteError(undefined)
            setPaste(event.target.value)
          }} />
      </label>
      {pasteError && <p className="field-error" role="alert">{pasteError}</p>}
      <button type="button" className="small-button" disabled={!enabled || paste.length === 0 || Boolean(pasteError)}
        onClick={() => { void prepare(slot, { input: paste, delimiter }).then(accepted => { if (accepted) setReplacing(false) }) }}>Load {name.toLowerCase()} paste</button>
    </>}
    {preview && <>
      <label className="field" htmlFor={id + '-key'}>{slot === 'P' ? 'Parent key' : name + ' key'}
        <select id={id + '-key'} value={key ?? ''} onChange={event => mapKey(event.target.value === '' ? undefined : +event.target.value)} disabled={!enabled}>
          <option value="">Choose a column</option>
          {preview.headers.map((header, index) => <option key={index} value={index}>{visibleValue(header, 100)}</option>)}
        </select>
      </label>
      {slot !== 'P' && <label className="field" htmlFor={id + '-join'}>{name} join rule
        <select id={id + '-join'} value={draft.mapping.children[slot]?.join ?? ''} disabled={!enabled}
          onChange={event => mapJoin(slot, event.target.value ? event.target.value as JoinKind : undefined)}>
          <option value="">Choose a join rule</option>
          <option value="inner">INNER · Requires a match</option>
          <option value="left">LEFT · Keeps unmatched parents</option>
        </select>
      </label>}
      <TablePreview preview={preview} />
    </>}
  </section>
}

export function ImportPanel({ ledger }: { ledger: LedgerController }) {
  const { draft, stage, updateMapping } = ledger
  const measure = draft.mapping.measure ? draft.mapping.measure.slot + ':' + draft.mapping.measure.column : ''

  return <section className="import-panel" id="import-editor" aria-labelledby="import-heading">
    <header className="panel-heading">
      <div>
        <h2 tabIndex={-1} id="import-heading">Use your own tables</h2>
        <p>Choose a small set of parent keys and include every matching detail from each table. Unrelated samples can hide repeated or missing records.</p>
      </div>
      <button type="button" className="icon-button" aria-label="Close import" onClick={() => { if (stage) void ledger.cancel(); else ledger.revert() }}><Icon name="close" size={20} /></button>
    </header>
    <form onSubmit={event => { event.preventDefault(); void ledger.analyze() }}>
      <div className="source-grid">
        {slots.map(slot => <SourceEditor slot={slot} ledger={ledger} key={slot} />)}
      </div>
      <div className="import-mapping">
        <label className="field" htmlFor="measure-column">Amount column
          <select id="measure-column" value={measure} disabled={Boolean(stage)} onChange={event => {
            if (!event.target.value) {
              updateMapping(previous => ({ ...previous, measure: undefined }))
              return
            }
            const [slot, column] = event.target.value.split(':')
            updateMapping(previous => ({ ...previous, measure: { slot: slot as Slot, column: +column } }))
          }}>
            <option value="">Choose one numeric column</option>
            {slots.map(slot => draft.previews[slot] && <optgroup key={slot} label={customNames[slot]}>
              {draft.previews[slot].headers.map((header, index) => <option key={index} value={slot + ':' + index}>{visibleValue(header, 100)}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="field" htmlFor="unit-label">Unit label <span className="optional">Optional</span>
          <input id="unit-label" value={draft.mapping.unit} placeholder="Amount" maxLength={24}
            disabled={Boolean(stage)} onChange={event => updateMapping(previous => ({ ...previous, unit: event.target.value }))} />
        </label>
        <p>Keys compare as written. Empty child keys and empty amounts are NULL. Amounts use a period and one unit.</p>
      </div>
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={Boolean(stage) || !validConfig(draft)}>Analyze</button>
        <button type="button" className="quiet-button" disabled={Boolean(stage)} onClick={() => ledger.revert()}>Revert edits</button>
      </div>
    </form>
  </section>
}
