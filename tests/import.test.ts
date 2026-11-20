import { describe, expect, it } from 'vitest'
import { checkCombined, parseSource } from '../src/import/csv'

describe('strict local table ingestion', () => {
  it('accepts BOM, exact text, mixed supported endings, quoted newlines and separators', async () => {
    const input = '\ufeffkey,description,amount\r\n001,"quoted, and ""doubled""\r\nnext line",-0.000001\n1 ,"",\r\n'
    const result = await parseSource('A', { input, delimiter: ',' })
    expect(result.headers).toEqual(['key', 'description', 'amount'])
    expect(result.rows).toEqual([['001', 'quoted, and "doubled"\r\nnext line', '-0.000001'], ['1 ', '', '']])
  })

  it('accepts header-only relations and explicitly quoted empties', async () => {
    expect((await parseSource('P', { input: 'key\tamount', delimiter: '\t' })).rows).toEqual([])
    expect((await parseSource('A', { input: 'key\n""\n', delimiter: ',' })).rows).toEqual([['']])
  })

  it.each([
    ['', 'HEADER_REQUIRED'], ['a,a\n1,2', 'DUPLICATE_HEADER'], ['a, \n1,2', 'EMPTY_HEADER'],
    ['a\n\n', 'BLANK_RECORD'], ['a\n\r\n', 'BLANK_RECORD'], ['a,b\n1', 'WIDTH'],
    ['a\n"unterminated', 'MALFORMED'], ['a\r1\r', 'LINE_ENDING'], ['a\n1\r2', 'LINE_ENDING'],
    ['a\n\u0000', 'NUL'], ['a\n' + ','.repeat(500001), 'DELIMITERS'], ['a\n' + 'é'.repeat(8193), 'FIELD_SIZE'],
  ])('rejects an invalid record with code %s %s', async (input, code) => {
    await expect(parseSource('B', { input, delimiter: ',' })).rejects.toMatchObject({ code, slot: 'B' })
  })

  it('rejects invalid UTF-8 and limits the combined extract', async () => {
    const input = new File([Uint8Array.from([97, 10, 0xff])], 'bad.csv')
    await expect(parseSource('P', { input, delimiter: ',' })).rejects.toMatchObject({ code: 'ENCODING' })
    expect(() => checkCombined({
      P: { headers: ['key'], rows: [], bytes: 3_000_000, delimiters: 0 },
      A: { headers: ['key'], rows: [], bytes: 3_000_000, delimiters: 0 },
    })).toThrow('Together')
  })
})
