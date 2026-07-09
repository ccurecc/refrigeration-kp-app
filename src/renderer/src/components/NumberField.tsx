import { useState } from 'react'

interface NumberFieldProps {
  value: number
  onChange: (value: number) => void
  min?: number
  disabled?: boolean
}

/**
 * Controlled numeric input with a string draft, so the field can be cleared and
 * a leading 0 does not stick. The numeric value propagates on every valid edit;
 * an empty or partial value (e.g. "-") is treated as `min` without snapping the
 * text back, and is normalised on blur.
 */
export function NumberField({ value, onChange, min = 0, disabled }: NumberFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '')

  const handleChange = (raw: string): void => {
    setDraft(raw)
    if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') {
      onChange(min)
      return
    }
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) {
      onChange(parsed)
    }
  }

  const handleBlur = (): void => {
    if (draft === null) {
      return
    }
    const parsed = Number(draft)
    onChange(draft.trim() === '' || Number.isNaN(parsed) ? min : parsed)
    setDraft(null)
  }

  return (
    <input
      type="number"
      min={min}
      disabled={disabled}
      value={shown}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={handleBlur}
      onFocus={(event) => event.target.select()}
    />
  )
}
