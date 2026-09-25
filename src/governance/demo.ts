/**
 * Employee-agent governance demo (CLI).
 * Two scripted scenes only — no fail-closed scene (that stays in tests).
 *
 * Run: npm run demo:agents
 */

import { DEFAULT_AGENT_REGISTRY } from './agentRegistry'
import { GovernanceAuditLog } from './audit'
import { runEmailAction, type EmailAction } from './checkpoint'

function print(line: string): void {
  console.log(line)
}

function main(): void {
  const agent = DEFAULT_AGENT_REGISTRY[0]
  if (!agent) {
    print('Blocked. The agent registry is empty, so the demo cannot run.')
    return
  }

  const audit = new GovernanceAuditLog()

  print('Employee-agent governance demo — Cedar Ridge College (fictional).')
  print(
    `Registered agent: ${agent.name}, owned by ${agent.owner}, role: ${agent.job}.`,
  )
  print(
    `Rule: this agent may only email addresses at ${agent.schoolDomain}. Fake data only. No real email is sent.`,
  )
  print('')

  // Scene 1 — allowed: transcript to school domain
  print('Scene 1 — Email a student transcript to an address at the school.')
  const allowedAction: EmailAction = {
    agentId: agent.id,
    tool: 'send_email',
    to: `registrar@${agent.schoolDomain}`,
    attachmentKind: 'student_record',
    subject: 'Student transcript (fake)',
  }
  const allowed = runEmailAction(allowedAction, { audit })
  print(allowed.message)
  print(
    `Audit: decision=${allowed.auditDecision}. The checkpoint allowed this send because the recipient is at ${agent.schoolDomain}.`,
  )
  print('')

  // Scene 2 — blocked: same transcript to outside Gmail + scripted deny
  print('Scene 2 — Email the same student transcript to an outside Gmail address.')
  const blockedAction: EmailAction = {
    agentId: agent.id,
    tool: 'send_email',
    to: 'parent.example@gmail.com',
    attachmentKind: 'student_record',
    subject: 'Student transcript (fake)',
  }
  const blocked = runEmailAction(blockedAction, {
    audit,
    onHumanOverride: () => {
      print(
        'Human override requested. A person must approve this on purpose before it can go out.',
      )
      print('Scripted human override: denied.')
      return 'deny'
    },
  })
  print(blocked.message)
  print(
    'Audit: decision=override_denied. The checkpoint blocked a student-record disclosure of the kind student-privacy rules prohibit for outside recipients, and the scripted override left it blocked.',
  )
  print('')

  print(`Demo complete. Audit log has ${audit.list().length} entries.`)
}

main()
