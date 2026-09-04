import { describe, expect, it } from "vitest"
import {
  callTool,
  runAssistant,
  runPlanner,
  runResearcher,
  runExecutor,
  runRobot,
} from "../agents"

describe("stub tools and agents", () => {
  it("lookup_context returns skin-specific facts", () => {
    const ent = callTool("lookup_context", { skin: "enterprise" })
    const he = callTool("lookup_context", { skin: "highered" })
    expect(ent.ok).toBe(true)
    expect(he.ok).toBe(true)
    const ef = (ent.data as { facts: string[] }).facts
    const hf = (he.data as { facts: string[] }).facts
    expect(ef[0]).toMatch(/PDU|breaker|rack/i)
    expect(hf[0]).toMatch(/STEM|census|student/i)
  })

  it("assistant returns human-owned checklist", () => {
    const text = runAssistant("Fix retention", "highered")
    expect(text).toMatch(/Assisted suggestion/i)
    expect(text).toMatch(/no automation/i)
  })

  it("researcher and planner produce coordinated artifacts", () => {
    const research = runResearcher("pipeline down", "enterprise")
    expect(research.findings.length).toBeGreaterThan(0)
    const plan = runPlanner("pipeline down", "enterprise", research.findings)
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.proposedAction.title.length).toBeGreaterThan(0)
    const exec = runExecutor(plan.proposedAction)
    expect(exec.simulation).toBeTruthy()
  })

  it("marks irreversible prompts as high risk", () => {
    const plan = runPlanner(
      "urgent risk — terminate vendor contract irreversible",
      "enterprise",
      ["fact"],
    )
    expect(plan.proposedAction.risk).toBe("high")
    expect(plan.proposedAction.reversible).toBe(false)
  })

  it("robot dispatches stub actuator for physical-digital handoff", () => {
    const plan = runPlanner("pipeline down", "enterprise", ["fact"])
    const robot = runRobot(plan.proposedAction, "enterprise")
    expect(robot.handoff.physicalDigital).toBe(true)
    expect(robot.handoff.actuatorId).toMatch(/^ACT-/)
    const tool = callTool("dispatch_actuator", {
      title: plan.proposedAction.title,
      channel: "ops-floor-actuator",
      skin: "enterprise",
    })
    expect(tool.ok).toBe(true)
  })
})
