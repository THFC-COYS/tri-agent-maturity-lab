import type { ScenarioConfig } from '../../kernel/types'

export const higherEdSkin: ScenarioConfig = {
  skin: 'highered',
  title: 'Higher Education',
  subtitle: 'Student success · advising · retention operations',
  promptPlaceholder: 'Describe a campus challenge (e.g. STEM retention decline)…',
  defaultPrompt:
    'Fall census shows a 6% decline in continuing STEM students. Design an advising outreach response for gateway-math early alerts.',
  contextLabel: 'Campus context',
  actionVerb: 'Launch outreach',
  sampleFacts: [
    'Fall census shows 6% decline in continuing students in STEM majors.',
    'Advising wait times peak Mon/Tue; 40% of no-shows lack a follow-up plan.',
    'Early-alert flags rose in gateway math; tutoring capacity is flat YoY.',
  ],
}
