/** Lightweight audit log for employee-agent governance actions. */

export type GovernanceDecision =
  | 'allowed'
  | 'blocked'
  | 'override_denied'
  | 'override_approved'

export interface GovernanceAuditEntry {
  id: string
  ts: number
  agentId: string
  owner: string
  action: string
  decision: GovernanceDecision
  detail: string
}

let seq = 0

export class GovernanceAuditLog {
  private entries: GovernanceAuditEntry[] = []

  record(
    partial: Omit<GovernanceAuditEntry, 'id' | 'ts'> & {
      id?: string
      ts?: number
    },
  ): GovernanceAuditEntry {
    seq += 1
    const entry: GovernanceAuditEntry = {
      id: partial.id ?? `gov-audit-${seq}`,
      ts: partial.ts ?? Date.now(),
      agentId: partial.agentId,
      owner: partial.owner,
      action: partial.action,
      decision: partial.decision,
      detail: partial.detail,
    }
    this.entries.push(entry)
    return entry
  }

  list(): GovernanceAuditEntry[] {
    return [...this.entries]
  }

  clear(): void {
    this.entries = []
  }
}
