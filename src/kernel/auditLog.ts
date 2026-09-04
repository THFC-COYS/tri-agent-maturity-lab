import type { AuditEntry, MaturityStage, SkinId } from './types'
import { nextId } from './events'

export class AuditLog {
  private entries: AuditEntry[] = []

  record(
    partial: Omit<AuditEntry, 'id' | 'ts'> & { id?: string; ts?: number },
  ): AuditEntry {
    const entry: AuditEntry = {
      id: partial.id ?? nextId('audit'),
      ts: partial.ts ?? Date.now(),
      stage: partial.stage,
      skin: partial.skin,
      action: partial.action,
      decision: partial.decision,
      actor: partial.actor,
      detail: partial.detail,
    }
    this.entries.push(entry)
    return entry
  }

  list(): AuditEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }

  static snapshot(
    stage: MaturityStage,
    skin: SkinId,
    action: string,
    decision: AuditEntry['decision'],
    actor: string,
    detail?: string,
  ): AuditEntry {
    return {
      id: nextId('audit'),
      ts: Date.now(),
      stage,
      skin,
      action,
      decision,
      actor,
      detail,
    }
  }
}
