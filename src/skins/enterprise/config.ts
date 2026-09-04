import type { ScenarioConfig } from '../../kernel/types'

export const enterpriseSkin: ScenarioConfig = {
  skin: 'enterprise',
  title: 'Enterprise Ops',
  subtitle: 'Rack protection · breaker-amp headroom · governed shed',
  promptPlaceholder:
    'Describe a rack load event (e.g. row B rising toward breaker limit)…',
  defaultPrompt:
    'Row B rack load is climbing toward the breaker amp limit. Shed non-critical load before the soft-plant trip curve — keep the rack online.',
  contextLabel: 'DC / ops context',
  actionVerb: 'Shed load',
  sampleFacts: [
    'Row B PDU trending 38 A toward a 48 A breaker limit (soft-plant).',
    'Non-critical batch jobs on racks B3–B5 can shed ~16 A within policy.',
    'Assumed trip budget: 50 ms free / ~22 ms hard soft-plant (sim curve, not field hardware).',
  ],
}
