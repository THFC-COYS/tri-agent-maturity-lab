import type { ScenarioConfig, SkinId } from '../kernel/types'
import { enterpriseSkin } from './enterprise/config'
import { higherEdSkin } from './highered/config'

export const SKINS: Record<SkinId, ScenarioConfig> = {
  enterprise: enterpriseSkin,
  highered: higherEdSkin,
}

export function getSkin(id: SkinId): ScenarioConfig {
  return SKINS[id]
}
