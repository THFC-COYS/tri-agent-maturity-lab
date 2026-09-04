import { describe, expect, it } from "vitest"
import { createOrchestrator } from "../kernel/orchestrator"
import { evaluateRun } from "../kernel/evaluation"

describe("evaluation harness", () => {
  it("is deterministic for identical stage-3 runs", () => {
    const a = createOrchestrator().run({
      prompt: "STEM retention decline",
      stage: 3,
      skin: "highered",
    })
    const b = createOrchestrator().run({
      prompt: "STEM retention decline",
      stage: 3,
      skin: "highered",
    })
    expect(a.metrics).toEqual(b.metrics)
    expect(a.metrics).not.toBeNull()
    expect(a.metrics!.decisionQuality).toBeGreaterThan(50)
    expect(a.metrics!.cycleTimeMs).toBeGreaterThan(0)
    expect(a.metrics!.costUnits).toBeGreaterThan(0)
    expect(a.metrics!.riskScore).toBeGreaterThanOrEqual(0)
  })

  it("scores stage 1 with stage note", () => {
    const result = createOrchestrator().run({
      prompt: "Help",
      stage: 1,
      skin: "enterprise",
    })
    expect(result.metrics?.notes.some((n) => /Stage 1/i.test(n))).toBe(true)
  })

  it("evaluateRun is stable", () => {
    const input = {
      stage: 2 as const,
      events: [] as [],
      audit: [] as [],
      proposedAction: {
        id: "x",
        title: "t",
        description: "d",
        risk: "low" as const,
        reversible: true,
      },
      awaitingOverride: false,
      executed: false,
    }
    expect(evaluateRun(input)).toEqual(evaluateRun(input))
  })
})
