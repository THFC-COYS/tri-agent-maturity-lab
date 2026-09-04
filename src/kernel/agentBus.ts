import type { AgentRole, ChatMessage, TraceEvent } from './types'
import { createEvent, nextId } from './events'

type Listener = (event: TraceEvent) => void

/** Lightweight in-process bus for agent messages and traces. */
export class AgentBus {
  private listeners: Listener[] = []
  private events: TraceEvent[] = []
  private messages: ChatMessage[] = []

  on(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  emit(event: TraceEvent): void {
    this.events.push(event)
    for (const listener of this.listeners) listener(event)
  }

  publishAgentMessage(
    agent: AgentRole,
    content: string,
    meta: Pick<TraceEvent, 'stage' | 'skin' | 'phase'>,
  ): ChatMessage {
    const msg: ChatMessage = {
      id: nextId('msg'),
      role: 'agent',
      agent,
      content,
      ts: Date.now(),
    }
    this.messages.push(msg)
    this.emit(
      createEvent({
        kind: 'agent.message',
        stage: meta.stage,
        skin: meta.skin,
        agent,
        phase: meta.phase,
        summary: `${agent}: ${content.slice(0, 80)}${content.length > 80 ? '…' : ''}`,
        detail: { content },
      }),
    )
    return msg
  }

  publishUser(content: string): ChatMessage {
    const msg: ChatMessage = {
      id: nextId('msg'),
      role: 'user',
      content,
      ts: Date.now(),
    }
    this.messages.push(msg)
    return msg
  }

  publishSystem(content: string): ChatMessage {
    const msg: ChatMessage = {
      id: nextId('msg'),
      role: 'system',
      content,
      ts: Date.now(),
    }
    this.messages.push(msg)
    return msg
  }

  getEvents(): TraceEvent[] {
    return [...this.events]
  }

  getMessages(): ChatMessage[] {
    return [...this.messages]
  }

  clear(): void {
    this.events = []
    this.messages = []
  }
}
