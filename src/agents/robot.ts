import type { AgentPhase, ProposedAction, SkinId } from '../kernel/types'
import { callTool } from './tools'

/** Physical-digital handoff stub — simulated robotics / actuator lane. */
export interface RobotOutput {
  phase: AgentPhase
  narrative: string
  handoff: {
    actuatorId: string
    channel: string
    status: 'queued' | 'dispatched' | 'ack'
    physicalDigital: true
  }
}

export function runRobot(
  action: ProposedAction,
  skin: SkinId,
): RobotOutput {
  const channel =
    skin === 'highered' ? 'campus-kiosk-actuator' : 'rack-shed-actuator'
  const result = callTool('dispatch_actuator', {
    title: action.title,
    channel,
    skin,
  })
  const data =
    result.ok && result.data && typeof result.data === 'object'
      ? (result.data as {
          actuatorId: string
          channel: string
          status: 'queued' | 'dispatched' | 'ack'
        })
      : {
          actuatorId: 'ACT-0000',
          channel,
          status: 'queued' as const,
        }

  return {
    phase: 'track',
    narrative: [
      `Robot/actuator lane: physical-digital handoff for "${action.title}".`,
      `Channel ${data.channel} · ${data.actuatorId} · status ${data.status}.`,
      'Stub only — no real hardware touched.',
    ].join(' '),
    handoff: {
      actuatorId: data.actuatorId,
      channel: data.channel,
      status: data.status,
      physicalDigital: true,
    },
  }
}
