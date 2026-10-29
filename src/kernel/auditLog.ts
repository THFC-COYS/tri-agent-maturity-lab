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
      tier: partial.tier,
      scoreInputs: partial.scoreInputs,
      floorApplied: partial.floorApplied,
      approvedBy: partial.approvedBy,
      approvedAt: partial.approvedAt,
      drillId: partial.drillId,
      humanClockMs: partial.humanClockMs,
      systemClockMs: partial.systemClockMs,
      actionProposedBy: partial.actionProposedBy,
      executionStagedWith: partial.executionStagedWith,
      stopLandedOn: partial.stopLandedOn,
      stopAttribution: partial.stopAttribution,
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
    gate?: Pick<
      AuditEntry,
      | 'tier'
      | 'scoreInputs'
      | 'floorApplied'
      | 'approvedBy'
      | 'approvedAt'
      | 'drillId'
      | 'humanClockMs'
      | 'systemClockMs'
      | 'actionProposedBy'
      | 'executionStagedWith'
      | 'stopLandedOn'
      | 'stopAttribution'
    >,
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
      tier: gate?.tier,
      scoreInputs: gate?.scoreInputs,
      floorApplied: gate?.floorApplied,
      approvedBy: gate?.approvedBy,
      approvedAt: gate?.approvedAt,
      drillId: gate?.drillId,
      humanClockMs: gate?.humanClockMs,
      systemClockMs: gate?.systemClockMs,
      actionProposedBy: gate?.actionProposedBy,
      executionStagedWith: gate?.executionStagedWith,
      stopLandedOn: gate?.stopLandedOn,
      stopAttribution: gate?.stopAttribution,
    }
  }
}
