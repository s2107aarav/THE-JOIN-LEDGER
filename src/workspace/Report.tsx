import { useEffect, useState } from 'react'
import type { ExportOptions, Result } from '../core/types'
import type { WorkerClient } from '../worker/client'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { errorMessage } from './useLedger'

export function Report({ client, result, groupId, onClose }: { client: WorkerClient; result: Result; groupId?: number; onClose: () => void }) {
  const [options, setOptions] = useState<ExportOptions>({ amounts: false, keys: false, excerpts: false, groupId })
  const [preview, setPreview] = useState<string>()
  const [issue, setIssue] = useState<string>()
  const [notice, setNotice] = useState<string>()

  useEffect(() => {
    let active = true
    void client.request('previewReport', { resultId: result.id, options })
      .then(value => { if (active) setPreview(value) })
      .catch(error => { if (active) setIssue(errorMessage(error)) })
    return () => { active = false }
  }, [client, options, result.id])

  function download() {
    if (!preview) return
    const url = URL.createObjectURL(new Blob([preview], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.download = 'join-ledger-report.md'
    anchor.href = url
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function copy() {
    if (!preview) return
    try {
      await navigator.clipboard.writeText(preview)
      setNotice('Report copied.')
    } catch {
      setNotice('Clipboard unavailable. Select the report text or download it.')
    }
  }

  return <Dialog title="Evidence report" onClose={onClose} className="report-dialog">
    <div className="report-content">
      <p>Review the exact text before sharing. Include source details only when they are suitable for the recipient.</p>
      <fieldset className="export-choices">
        <legend>Include in report</legend>
        {([['amounts', 'Amounts and unit'], ['keys', 'Source keys'], ['excerpts', 'Source excerpts']] as const).map(([key, label]) =>
          <label key={key}><input type="checkbox" checked={options[key]} onChange={event => {
            setPreview(undefined)
            setNotice(undefined)
            setIssue(undefined)
            setOptions({ ...options, [key]: event.target.checked })
          }} /> {label}</label>)}
      </fieldset>
      {issue && <p className="field-error" role="alert">{issue}</p>}
      {!preview && !issue && <p role="status">Preparing report…</p>}
      {preview && <label className="field">Markdown preview
        <textarea className="report-preview" readOnly value={preview} rows={13} spellCheck={false} />
        <pre className="print-report">{preview}</pre>
      </label>}
      <div className="form-actions">
        <button type="button" className="primary-button" disabled={!preview} onClick={download}><Icon name="download" /> Download Markdown</button>
        <button type="button" className="quiet-button" disabled={!preview} onClick={() => { void copy() }}><Icon name="copy" /> Copy report</button>
      </div>
      <p role="status" className="clipboard-notice">{notice}</p>
    </div>
  </Dialog>
}
