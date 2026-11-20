import orders from '../../public/example/orders.csv?raw'
import payments from '../../public/example/payments.csv?raw'
import parcels from '../../public/example/parcels.csv?raw'
import type { DraftConfig, Scenario, Sources } from '../core/types'

export type ExamplePreset = 'raw' | 'shipped' | 'all'
export const exampleSources: Sources = {
  P: { input: orders, delimiter: ',' }, A: { input: payments, delimiter: ',' }, B: { input: parcels, delimiter: ',' },
}
export const exampleConfig: DraftConfig = {
  rootKey: 0,
  children: { A: { key: 1, join: 'inner' }, B: { key: 1, join: 'inner' } },
  measure: { slot: 'A', column: 2 },
  unit: 'USD',
}

export function exampleScenario(preset: ExamplePreset): Scenario | null {
  return preset === 'raw' ? null : { joins: { B: preset === 'all' ? 'left' : 'inner' }, distinct: 'B' }
}

export function readExamplePreset(): ExamplePreset {
  if (location.hash === '#example=payments&scenario=shipped') return 'shipped'
  if (location.hash === '#example=payments&scenario=all') return 'all'
  return 'raw'
}
