import { formatAmount } from '../core/decimal'
import type { Group, JoinKind, Source, Slot } from '../core/types'

export const customNames: Record<Slot, string> = { P: 'Parent', A: 'Child A', B: 'Child B' }
export const exampleNames: Record<Slot, string> = { P: 'Orders', A: 'Payments', B: 'Parcels' }
export const count = (value: number | bigint) => value.toLocaleString('en-US')
export const joinLabel = (join: JoinKind) => join === 'inner' ? 'INNER' : 'LEFT'
export const groupLabel = (group: Group) => group.kind === 'null' ? 'NULL key' : group.key ?? ''
export const displayAmount = (value: bigint | null, signed = false): string => value === null ? 'NULL' : formatAmount(value, signed)
export const sourceName = (source?: Source) => !source || typeof source.input === 'string' ? '' : source.input.name

// Isolate data strings from layout direction and make invisible formatting controls visible.
export function visibleValue(value: string, limit = 260): string {
  const clipped = value.length > limit ? value.slice(0, limit) + '…' : value
  return clipped.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,
    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'))
}
