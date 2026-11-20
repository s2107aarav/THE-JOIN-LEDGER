import { Dialog } from './Dialog'

export function Method({ onClose }: { onClose: () => void }) {
  return <Dialog title="Method" onClose={onClose} className="method-dialog">
    <div className="method-content">
      <h3>Describe one level of joins</h3>
      <p>Link one or two detail tables to a single parent using exact text keys. The parent key must be unique and populated. Select one additive amount from any input table.</p>
      <p>Each INNER join requires a match. Each LEFT join retains a parent without a match by supplying a NULL-extended position. Detail tables each match the parent key, so their match counts multiply.</p>
      <h3>Follow an original record</h3>
      <p>Record numbers count logical data rows after the header. Equal-looking rows have separate identities. The source sum covers all records in the selected input, including child records without a parent.</p>
      <p>The ledger multiplies each original amount by its number of appearances. The movement is the joined contribution minus the original contribution. An empty amount is SQL NULL. An output with no numeric values has a NULL sum, even when no amount moved.</p>
      <h3>Compare a rule</h3>
      <p>Switch INNER or LEFT, or use distinct keys on one detail table that does not own the amount. Distinct keys represent whether a match exists and retain a link to the original supporting records. Choose the rule that fits the report's intended population.</p>
      <h3>Prepare an extract</h3>
      <p>Choose a small set of parent keys and keep all matching details from every branch. Supply UTF-8 CSV or TSV with a header and up to 5 MiB and 50,000 data records across the set. Keys preserve spaces, case and leading zeros. Empty child keys map to NULL.</p>
      <p>Amounts use one unit and a period as the decimal separator. Up to 12 digits before the period and six after it are supported. Calculate any expressions before exporting the input.</p>
      <h3>Processing and sharing</h3>
      <p>Selected files and pastes are processed in this tab. Reset or reload to release the case. Sharing a link works for the built-in example. Report previews start redacted. Optional amounts, keys and excerpts can be included before you copy or download.</p>
    </div>
  </Dialog>
}
