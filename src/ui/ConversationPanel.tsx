import type { ChatMessage } from '../kernel/types'

interface Props {
  messages: ChatMessage[]
}

const AGENT_LABEL: Record<string, string> = {
  assistant: 'Assistant',
  researcher: 'Researcher',
  planner: 'Planner',
  executor: 'Executor',
  robot: 'Robot / Actuator',
}

export function ConversationPanel({ messages }: Props) {
  if (messages.length === 0) {
    return (
      <div className="panel conversation empty">
        <p className="muted">Run a scenario to see the conversation.</p>
      </div>
    )
  }
  return (
    <div className="panel conversation" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`bubble bubble-${m.role} agent-${m.agent ?? 'none'}`}>
          <div className="bubble-meta">
            {m.role === 'user'
              ? 'You'
              : m.role === 'system'
                ? 'System'
                : AGENT_LABEL[m.agent ?? ''] ?? 'Agent'}
          </div>
          <pre className="bubble-body">{m.content}</pre>
        </div>
      ))}
    </div>
  )
}
