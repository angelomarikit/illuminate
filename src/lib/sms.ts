import { supabase } from './supabase'

export type SmsInvokeAction =
  | 'send_test'
  | 'send_confirmation'
  | 'send_due_reminders'
  | 'check_secrets'

export type SmsInvokeResult = {
  ok?: boolean
  skipped?: boolean
  reason?: string
  error?: string
  logId?: string
  referenceId?: string
  phone?: string
  sent?: number
}

/** Call the send-sms Edge Function. Failures are returned, not thrown. */
export async function invokeSendSms(
  action: SmsInvokeAction,
  payload: Record<string, unknown> = {},
): Promise<SmsInvokeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('send-sms', {
      body: { action, ...payload },
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    return (data ?? { ok: false, error: 'Empty response' }) as SmsInvokeResult
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'SMS invoke failed' }
  }
}

/** Fire-and-forget confirmation SMS after booking is confirmed. */
export function queueConfirmationSms(appointmentId: string) {
  if (!appointmentId) return
  void invokeSendSms('send_confirmation', { appointmentId })
}
