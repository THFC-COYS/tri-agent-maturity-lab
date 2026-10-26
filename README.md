The rack never trips because the agent already moved.

**Hard mode:** `0.4 ms` sensor→shed vs ~`22 ms` budget (noise + delay).

**Honesty upfront:** this is a simulated soft plant, not a physical breaker. It models noisy, delayed sensor reads and a true-load trip curve; no hardware is involved.

## See it in 90 seconds

```bash
npm install && npm run dev
```

Then choose **Enterprise Ops → Stage 4 → Hard mode** and run the scenario. Vite prints the local URL. There is no live demo URL right now; public deployment is paused.

## What this proves

This TypeScript lab makes a governed multi-agent control loop visible:

1. A noisy, delayed sensor read arrives.
2. Researcher → Planner → Executor turn it into a shed action.
3. Stage 4 applies a policy gate, audit trail, and human override.
4. The simulated actuator sheds load before the simulated trip curve—or records a late trip.

The three lanes are **human**, **AI agents**, and a **simulated actuator**. The point is control flow, not a chat transcript: the path, timing, decision, and audit are inspectable and deterministic.

## Policy gate tiers

At Stage 4, the policy gate does not give every action the same treatment. It scores each proposed action on three inputs (reversibility, blast radius, and whether the effect leaves the system) and assigns a tier:

| Tier | Treatment | Typical actions |
| --- | --- | --- |
| Tier 1 | Run free | Read-only research, drafting, reversible internal work |
| Tier 2 | Notify: the action proceeds, a human sees it, no pre-approval | Work that leaves the system or cannot be undone, at contained blast radius |
| Tier 3 | Wait for a human: blocked until a human override approves it | Anything that sends, pays, deletes, or publishes |

One rule sits above the scoring: the **hard floor**. Actions in the send, pay, delete, and publish classes are Tier 3 always. A caller cannot argue a floor class down by claiming the action is reversible, low blast radius, or contained, because those claims are exactly what the floor exists to distrust.

Every gated action writes its tier, its scoring inputs, and (for Tier 3 approvals) the approver and timestamp to the audit log. The scoring fields on audit entries are additive and optional, so audit records written before tiers existed stay valid.

### Kill-switch drill: two clocks

A tier table only matters if a human can actually stop the run in time. The kill-switch drill exercises the real Stage 4 override path against a Tier 3 action and reports two clocks into the same audit record, next to the tier score:

- **Human clock:** alert presented to human decision. Notice, decide, act.
- **System clock:** stop signal to the run fully halted. The same discipline as the breaker latency budget, started by a person instead of a sensor.

Both clocks land in the audit trail with the tier, the scoring inputs, and the approver. A drill that cannot produce both numbers fails loudly and writes no record. The drill is run quarterly and unannounced. The system clock is held to its millisecond budget (the ~22 ms hard reference); the human clock has no per-run budget, because its trend across drills, not any single run, is the board-level metric.

## Why the number matters

Hard mode adds sensor noise, read delay, jitter, and tighter headroom. The lab reports sensor→shed time against the ~22 ms trip budget so the result is measurable rather than a slide-deck claim. It is a simulation, not a claim about physical breaker performance.

## Run the checks

```bash
npm test
npm run build
```

No API keys. No backend. MIT © Greg Lucas.

