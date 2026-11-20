import { parse } from 'csv-parse/browser/esm/sync'
import { LedgerError, slots, type Dataset, type Datasets, type Preview, type Slot, type Source } from '../core/types'

export const limits = { bytes: 5 * 1024 * 1024, rows: 50_000, columns: 40, cells: 400_000, cell: 16 * 1024, delimiters: 500_000 }
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export async function parseSource(slot: Slot, { input, delimiter }: Source): Promise<Dataset> {
  if (delimiter !== ',' && delimiter !== '\t') throw new LedgerError('DELIMITER', 'Choose CSV or TSV.', slot)
  if (typeof input === 'string' && /[\uD800-\uDFFF]/u.test(input)) {
    throw new LedgerError('ENCODING', 'The pasted text contains an invalid Unicode character.', slot)
  }
  const initialSize = typeof input === 'string' ? input.length : input.size
  if (initialSize > limits.bytes) throw new LedgerError('BYTES', 'The input exceeds the 5 MiB limit.', slot)
  const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(await input.arrayBuffer())
  if (bytes.length > limits.bytes) throw new LedgerError('BYTES', 'The input exceeds the 5 MiB limit.', slot)
  let text: string
  try {
    text = decoder.decode(bytes)
  } catch {
    throw new LedgerError('ENCODING', 'Save the table as UTF-8 and try again.', slot)
  }
  if (text.includes('\0')) throw new LedgerError('NUL', 'Remove NUL characters from the input.', slot)

  let delimiters = 0
  for (const char of text) {
    if (char === delimiter && ++delimiters > limits.delimiters) {
      throw new LedgerError('DELIMITERS', 'The input exceeds the 500,000 separator-character limit.', slot)
    }
  }

  const content = bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? bytes.subarray(3) : bytes
  let headers: string[] | undefined
  const rows: string[][] = []
  const fail = (code: string, message: string): never => { throw new LedgerError(code, message, slot) }
  try {
    parse(text, {
      delimiter, record_delimiter: ['\r\n', '\n', '\r'],
      max_record_size: 128 * 1024, raw: true, info: true,
      relax_column_count: true,
      on_record(parsed) {
        const { record, raw, info } = parsed as unknown as { record: string[]; raw: string; info: { bytes: number } }
        const suffix = content[info.bytes - 1]
        if (raw.endsWith('\r') && suffix === 13) {
          fail('LINE_ENDING', 'Use LF or CRLF between records.')
        }
        const location = headers ? 'Data record ' + (rows.length + 1) : 'Header'
        if (raw === '\r' || raw === '\n' || raw === '') fail('BLANK_RECORD', location + ' is blank. Remove the empty line.')
        if (record.length > limits.columns) fail('COLUMNS', location + ' exceeds the 40-column limit.')
        record.forEach((field, index) => {
          if (encoder.encode(field).length > limits.cell) {
            fail('FIELD_SIZE', location + ', column ' + (index + 1) + ' exceeds the 16 KiB field limit.')
          }
        })
        if (!headers) {
          if (record.some(name => !name.trim())) fail('EMPTY_HEADER', 'Give every column a nonempty header.')
          if (new Set(record).size !== record.length) fail('DUPLICATE_HEADER', 'Use a distinct name for every header.')
          headers = record
        } else {
          if (record.length !== headers.length) {
            fail('WIDTH', location + ' has ' + record.length + ' fields. Expected ' + headers.length + '.')
          }
          if (rows.length >= limits.rows || (rows.length + 1) * headers.length > limits.cells) {
            fail('ROWS', 'The input exceeds the row or cell limit.')
          }
          rows.push(record)
        }
        return null
      },
    })
  } catch (error) {
    if (error instanceof LedgerError) throw error
    const detail = error as { code?: string; lines?: number }
    const location = typeof detail.lines === 'number' ? ' near line ' + detail.lines : ''
    if (detail.code === 'CSV_MAX_RECORD_SIZE') fail('RECORD_SIZE', 'A record exceeds the parser size limit' + location + '.')
    fail('MALFORMED', 'Check quotation and delimiters' + location + '.')
  }
  return { headers: headers ?? fail('HEADER_REQUIRED', 'Add a header row before the data.'), rows, bytes: bytes.length, delimiters }
}

export function checkCombined(datasets: Datasets) {
  let bytes = 0, rows = 0, cells = 0, delimiters = 0
  for (const slot of slots) {
    const table = datasets[slot]
    if (!table) continue
    bytes += table.bytes
    rows += table.rows.length
    cells += table.headers.length * table.rows.length
    delimiters += table.delimiters
  }
  if (bytes > limits.bytes || rows > limits.rows || cells > limits.cells || delimiters > limits.delimiters) {
    throw new LedgerError('DATASET_LIMIT', 'Together, the tables must fit within 5 MiB, 50,000 rows, 400,000 cells and 500,000 separator characters.')
  }
}

export function previewTable(slot: Slot, table: Dataset): Preview {
  return { slot, headers: table.headers, count: table.rows.length, rows: table.rows.slice(0, 3).map(row => row.map(cell => cell.length > 96 ? cell.slice(0, 96) + '…' : cell)) }
}
