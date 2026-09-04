import type { TraceEvent } from './types'

let seq = 0

export function resetEventSeq(): void {
  seq = 0
}

export function nextId(prefix = 'evt'): string {
  seq += 1
  return `${prefix}-${seq}`
}

export function createEvent(
  partial: Omit<TraceEvent, 'id' | 'ts'> & { id?: string; ts?: number },
): TraceEvent {
  return {
    id: partial.id ?? nextId('evt'),
    ts: partial.ts ?? Date.now(),
    kind: partial.kind,
    stage: partial.stage,
    skin: partial.skin,
    agent: partial.agent,
    phase: partial.phase,
    summary: partial.summary,
    detail: partial.detail,
  }
}
