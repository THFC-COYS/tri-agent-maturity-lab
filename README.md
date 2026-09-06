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

## Why the number matters

Hard mode adds sensor noise, read delay, jitter, and tighter headroom. The lab reports sensor→shed time against the ~22 ms trip budget so the result is measurable rather than a slide-deck claim. It is a simulation, not a claim about physical breaker performance.

## Run the checks

```bash
npm test
npm run build
```

No API keys. No backend. MIT © Greg Lucas.

