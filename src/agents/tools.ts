/** Deterministic stub tools — no network, no secrets. */

export interface StubTool {
  name: string
  description: string
  run: (args: Record<string, unknown>) => { ok: boolean; data: unknown }
}

const KNOWLEDGE: Record<string, string[]> = {
  enterprise: [
    'Q3 pipeline velocity is down 12% vs plan in the West region.',
    'Top blocker: handoff lag between SDR and AE (avg 3.4 days).',
    'Competitor NovaCorp launched a mid-market bundle last month.',
    'Renewal risk concentrated in accounts with <2 product touches / quarter.',
  ],
  highered: [
    'Fall census shows 6% decline in continuing students in STEM majors.',
    'Advising wait times peak Mon/Tue; 40% of no-shows lack a follow-up plan.',
    'Early-alert flags rose in gateway math; tutoring capacity is flat YoY.',
    'Students with 2+ outreach touches retain at 11 pts higher than peers.',
  ],
}

export const stubTools: StubTool[] = [
  {
    name: 'lookup_context',
    description: 'Fetch scenario facts for the active skin.',
    run: (args) => {
      const skin = String(args.skin ?? 'enterprise')
      const facts = KNOWLEDGE[skin] ?? KNOWLEDGE.enterprise
      return { ok: true, data: { facts, source: 'stub-knowledge-base' } }
    },
  },
  {
    name: 'score_priority',
    description: 'Score a prompt for urgency (0–100).',
    run: (args) => {
      const text = String(args.text ?? '').toLowerCase()
      let score = 40
      if (text.includes('urgent') || text.includes('risk')) score += 25
      if (text.includes('decline') || text.includes('down')) score += 15
      if (text.includes('renewal') || text.includes('retention')) score += 10
      if (text.includes('student') || text.includes('pipeline')) score += 5
      return {
        ok: true,
        data: {
          score: Math.min(100, score),
          band: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
        },
      }
    },
  },
  {
    name: 'draft_plan',
    description: 'Produce a short numbered plan from facts.',
    run: (args) => {
      const goal = String(args.goal ?? 'Improve outcomes')
      const facts = (args.facts as string[]) ?? []
      const steps = [
        `Clarify success metric for: ${goal}`,
        facts[0] ? `Address signal: ${facts[0]}` : 'Gather baseline metrics',
        'Assign owner and 7-day checkpoint',
        'Publish status to stakeholders',
        'Queue physical-digital handoff via stub actuator when approved',
      ]
      return { ok: true, data: { steps } }
    },
  },
  {
    name: 'simulate_action',
    description: 'Simulate executing a proposed operational action.',
    run: (args) => {
      const title = String(args.title ?? 'action')
      return {
        ok: true,
        data: {
          status: 'simulated',
          title,
          ticketId: `SIM-${Math.abs(hash(title)) % 9000 + 1000}`,
          note: 'Stub execution — no external systems touched.',
        },
      }
    },
  },
  {
    name: 'dispatch_actuator',
    description:
      'Stub robot/actuator — physical-digital handoff (no real hardware).',
    run: (args) => {
      const title = String(args.title ?? 'action')
      const channel = String(args.channel ?? 'ops-floor-actuator')
      const id = `ACT-${Math.abs(hash(`${channel}:${title}`)) % 9000 + 1000}`
      return {
        ok: true,
        data: {
          actuatorId: id,
          channel,
          status: 'dispatched' as const,
          ackMs: 40 + (Math.abs(hash(title)) % 60),
          note: 'Simulated robotics lane — digital plan → stub physical dispatch.',
        },
      }
    },
  },
]

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export function callTool(
  name: string,
  args: Record<string, unknown>,
): { ok: boolean; data: unknown } {
  const tool = stubTools.find((t) => t.name === name)
  if (!tool) return { ok: false, data: { error: `Unknown tool: ${name}` } }
  return tool.run(args)
}
