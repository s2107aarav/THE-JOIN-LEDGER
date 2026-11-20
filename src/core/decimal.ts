import { LedgerError } from './types'

const scale = 1_000_000n
const decimal = /^[+-]?[0-9]{1,12}(?:\.[0-9]{1,6})?$/u

export function parseAmount(value: string): bigint | null {
  if (value === '') return null
  if (!decimal.test(value) || /\s/u.test(value)) {
    throw new LedgerError('AMOUNT', 'Use a signed decimal with up to 12 whole digits and 6 fractional digits.')
  }
  const negative = value.startsWith('-')
  const unsigned = value.replace(/^[+-]/u, '')
  const [whole, fraction = ''] = unsigned.split('.')
  const amount = BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'))
  return negative ? -amount : amount
}

export function formatAmount(value: bigint | null, signed = false): string {
  if (value === null) return 'NULL'
  const absolute = value < 0n ? -value : value
  const whole = String(absolute / scale).replace(/\B(?=(\d{3})+(?!\d))/gu, ',')
  const fraction = String(absolute % scale).padStart(6, '0').replace(/0+$/u, '')
  const sign = value < 0n ? '−' : signed && value > 0n ? '+' : ''
  return sign + whole + (fraction ? '.' + fraction : '')
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}
