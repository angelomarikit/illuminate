import { supabase } from './supabase'

export type SupplyShortfall = {
  inventory_item_id?: string
  name: string
  sku?: string
  unit?: string
  required: number
  available: number
  reason?: string
}

export type CompleteWithSuppliesResult = {
  ok: boolean
  deducted?: boolean
  already_deducted?: boolean
  message?: string
  error?: string
  shortfalls?: SupplyShortfall[]
  lines?: { name: string; qty: number; unit?: string; stock_after?: number }[]
  usage_id?: string
}

function formatShortfalls(shortfalls: SupplyShortfall[] | undefined) {
  if (!shortfalls?.length) return ''
  return shortfalls
    .map((s) => {
      const unit = s.unit ? ` ${s.unit}` : ''
      if (s.reason) return `• ${s.name}: ${s.reason}`
      return `• ${s.name}: need ${s.required}${unit}, available ${s.available}${unit}`
    })
    .join('\n')
}

/** Complete appointment and deduct linked BOM supplies (idempotent). */
export async function completeAppointmentWithSupplies(
  appointmentId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('complete_appointment_with_supplies', {
    p_appointment_id: appointmentId,
  })

  if (error) {
    if (
      error.message.includes('complete_appointment_with_supplies') ||
      error.message.includes('schema cache') ||
      error.message.includes('Could not find the function')
    ) {
      // Migration not applied — fall back to status-only complete
      const { error: updErr } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointmentId)
      if (updErr) return { ok: false, error: updErr.message }
      return {
        ok: true,
        message:
          'Treatment completed. Run supabase/add_treatment_supply_deduction.sql to enable automatic supply deduction.',
      }
    }
    return { ok: false, error: error.message }
  }

  const result = (data ?? {}) as CompleteWithSuppliesResult
  if (!result.ok) {
    const detail = formatShortfalls(result.shortfalls)
    return {
      ok: false,
      error: [result.error || 'Could not complete treatment.', detail].filter(Boolean).join('\n'),
    }
  }

  return {
    ok: true,
    message: result.message || 'Treatment completed.',
  }
}
