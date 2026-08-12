import { useEffect, useState } from 'react'

type ProfileOption = {
  id: string
  full_name: string
  role?: string
}

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  profiles: ProfileOption[]
  hint?: string
  /** Single-row select; manual text only when Manual is chosen */
  compact?: boolean
  required?: boolean
}

/**
 * Pick a clinic account, or type a name manually.
 */
export function StaffAssignField({
  label,
  value,
  onChange,
  profiles,
  hint,
  compact = false,
  required,
}: Props) {
  const matched = profiles.find((p) => p.full_name === value)
  const [manualMode, setManualMode] = useState(Boolean(value.trim()) && !matched)

  useEffect(() => {
    if (matched) setManualMode(false)
    else if (value.trim()) setManualMode(true)
  }, [matched, value])

  const selectValue = matched ? matched.id : manualMode ? '__manual__' : ''

  return (
    <div className={`field staff-assign ${compact ? 'staff-assign--compact' : ''}`}>
      <label>
        {label}
        {required ? ' *' : ''}
      </label>
      <div className={compact ? 'staff-assign-row' : undefined}>
        <select
          className="select"
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value
            if (!v) {
              setManualMode(false)
              onChange('')
              return
            }
            if (v === '__manual__') {
              setManualMode(true)
              if (matched) onChange('')
              return
            }
            setManualMode(false)
            const profile = profiles.find((p) => p.id === v)
            if (profile) onChange(profile.full_name)
          }}
        >
          <option value="">Select…</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {!compact && p.role ? ` (${p.role})` : ''}
            </option>
          ))}
          <option value="__manual__">Manual…</option>
        </select>
        {manualMode || !compact ? (
          <input
            className="input"
            style={compact ? undefined : { marginTop: 6 }}
            placeholder="Type name"
            value={value}
            onChange={(e) => {
              setManualMode(true)
              onChange(e.target.value)
            }}
          />
        ) : null}
      </div>
      {hint ? <div className="staff-assign-hint">{hint}</div> : null}
    </div>
  )
}
