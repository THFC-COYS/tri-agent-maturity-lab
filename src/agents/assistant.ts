import type { SkinId } from '../kernel/types'

/** Stage 1 — single assisted suggestion; human does the work. */
export function runAssistant(prompt: string, skin: SkinId): string {
  if (skin === 'highered') {
    return [
      'Assisted suggestion (you still own the work):',
      `1. Restate the student-success goal in one sentence: "${prompt.slice(0, 100)}"`,
      '2. Pull the early-alert list for the affected cohort.',
      '3. Draft three outreach messages (email / SMS / advisor note).',
      '4. Book advising capacity before you send anything.',
      '5. Track response rate for 7 days — no automation in Stage 1.',
    ].join('\n')
  }
  return [
    'Assisted suggestion (you still own the work):',
    `1. Restate the business outcome in one sentence: "${prompt.slice(0, 100)}"`,
    '2. Pull last week’s funnel metrics for the affected segment.',
    '3. Draft a recovery checklist for the owning team.',
    '4. Schedule a 30-min standup; assign a single DRI.',
    '5. Report progress Friday — no automation in Stage 1.',
  ].join('\n')
}
