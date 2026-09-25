/** Fake employee-agent registry for Cedar Ridge College (fictional). */

export interface RegisteredAgent {
  id: string
  name: string
  owner: string
  job: string
  school: string
  /** Email domain the agent may send to (lowercase, no @). */
  schoolDomain: string
  allowedTools: string[]
}

/** Default registry: one advising agent at a fictional school. */
export const DEFAULT_AGENT_REGISTRY: RegisteredAgent[] = [
  {
    id: 'crc-advising-1',
    name: 'Cedar Ridge Advising Agent',
    owner: 'J. Rivera',
    job: 'academic advising',
    school: 'Cedar Ridge College',
    schoolDomain: 'cedarridge.edu',
    allowedTools: ['send_email'],
  },
]

export type RegistryLoader = () => RegisteredAgent[]

/** Load the registered agents. Throws if the registry cannot be read or parsed. */
export function loadAgentRegistry(
  loader: RegistryLoader = () => DEFAULT_AGENT_REGISTRY,
): RegisteredAgent[] {
  const registry = loader()
  if (!Array.isArray(registry)) {
    throw new Error('Agent registry is not a list.')
  }
  for (const agent of registry) {
    if (
      !agent ||
      typeof agent.id !== 'string' ||
      typeof agent.owner !== 'string' ||
      typeof agent.schoolDomain !== 'string' ||
      !Array.isArray(agent.allowedTools)
    ) {
      throw new Error('Agent registry entry is missing required fields.')
    }
  }
  return registry
}

export function findAgent(
  agentId: string,
  loader?: RegistryLoader,
): RegisteredAgent | undefined {
  return loadAgentRegistry(loader).find((a) => a.id === agentId)
}
