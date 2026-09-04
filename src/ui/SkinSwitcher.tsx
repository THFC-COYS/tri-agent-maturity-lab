import type { SkinId } from '../kernel/types'
import { SKINS } from '../skins'

interface Props {
  skin: SkinId
  onChange: (skin: SkinId) => void
  disabled?: boolean
}

export function SkinSwitcher({ skin, onChange, disabled }: Props) {
  return (
    <div className="skin-switcher" role="group" aria-label="Demo skin">
      {(Object.keys(SKINS) as SkinId[]).map((id) => {
        const cfg = SKINS[id]
        const active = id === skin
        return (
          <button
            key={id}
            type="button"
            className={`skin-chip ${active ? 'active' : ''} skin-${id}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(id)}
          >
            {cfg.title}
          </button>
        )
      })}
    </div>
  )
}
