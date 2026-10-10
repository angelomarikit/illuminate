// Deno Edge Function: send booking SMS via Itexmo
// Deploy via Dashboard (paste this file) or: supabase functions deploy send-sms --no-verify-jwt
// Secrets: ITEXMO_EMAIL, ITEXMO_PASSWORD, ITEXMO_API_CODE [, ITEXMO_SENDER_ID]
//
// Body actions:
//   { action: "send_test", phone, templateKind?: "confirmation"|"reminder", message? }
//   { action: "send_confirmation", appointmentId }
//   { action: "send_due_reminders" }  // cron / scheduled

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
// Trim — Dashboard secrets often get a trailing newline that breaks Itexmo auth.
const ITEXMO_EMAIL = (Deno.env.get('ITEXMO_EMAIL') ?? '').trim()
const ITEXMO_PASSWORD = (Deno.env.get('ITEXMO_PASSWORD') ?? '').trim()
const ITEXMO_API_CODE = (Deno.env.get('ITEXMO_API_CODE') ?? '').trim()
const ITEXMO_SENDER_ID = (Deno.env.get('ITEXMO_SENDER_ID') ?? '').trim()

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-authorization, prefer',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SmsKind = 'confirmation' | 'reminder' | 'test'

type SmsSettings = {
  confirmation_enabled: boolean
  reminder_enabled: boolean
  reminder_minutes_before: number
  confirmation_template: string
  reminder_template: string
}

type AppointmentRow = {
  id: string
  customer_name: string
  service_name: string
  appointment_date: string
  appointment_time: string
  customer_phone: string | null
  status: string
  branch_id: string | null
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders })
}

/** Normalize PH mobiles to 09XXXXXXXXX when possible. */
function normalizePhone(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 11 && digits.startsWith('09')) return digits
  if (digits.length === 12 && digits.startsWith('639')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  if (digits.length === 13 && digits.startsWith('6309')) return digits.slice(2)
  return digits.length >= 10 ? digits : null
}

function formatTime(hhmm: string): string {
  const [hs, ms = '00'] = String(hhmm).slice(0, 5).split(':')
  let h = Number(hs)
  if (!Number.isFinite(h)) return hhmm
  const period = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${ms} ${period}`
}

function formatDate(iso: string): string {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fillTemplate(
  template: string,
  vars: { name: string; service: string; date: string; time: string; branch: string },
) {
  return template
    .replaceAll('{name}', vars.name)
    .replaceAll('{service}', vars.service)
    .replaceAll('{date}', vars.date)
    .replaceAll('{time}', vars.time)
    .replaceAll('{branch}', vars.branch)
    // Strip characters that force UTF-16 / rejection on Itexmo GSM-7BIT
    .replace(/[^\x20-\x7E\n\r]/g, '')
    .trim()
}

function itexmoErrorMessage(parsed: Record<string, unknown>, text: string, status: number) {
  return String(
    parsed.Message ||
      parsed.message ||
      parsed.Error ||
      text ||
      `Itexmo HTTP ${status}`,
  )
}

function isCredentialError(msg: string) {
  const m = msg.toLowerCase()
  return m.includes('credential') || m.includes('do not match') || m.includes('unauthorized')
}

async function postItexmoBroadcast(
  body: Record<string, unknown>,
  useBasicAuth: boolean,
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (useBasicAuth) {
    const basicBytes = new TextEncoder().encode(`${ITEXMO_EMAIL}:${ITEXMO_PASSWORD}`)
    let basicBinary = ''
    for (const b of basicBytes) basicBinary += String.fromCharCode(b)
    headers.Authorization = `Basic ${btoa(basicBinary)}`
  }

  const res = await fetch('https://api.itexmo.com/api/broadcast', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch {
    parsed = { raw: text }
  }
  return { res, text, parsed }
}

const LEGACY_ERRORS: Record<string, string> = {
  '1': 'Invalid number',
  '2': 'Number prefix not supported',
  '3': 'Invalid ApiCode',
  '4': 'Maximum messages per day reached',
  '5': 'Maximum allowed characters reached',
  '6': 'System offline',
  '7': 'Expired ApiCode',
  '8': 'Itexmo error — try again later',
  '9': 'Invalid parameters',
  '10': 'Recipient blocked (flooding)',
  '11': 'Recipient temporarily blocked',
  '12': 'Invalid priority request for this ApiCode',
  '13': 'Invalid or unregistered Sender ID',
}

function interpretLegacyBody(text: string, status: number) {
  const trimmed = text.trim()
  // Success can be "0" or numeric 0
  if (trimmed === '0') {
    return { ok: true as const, referenceId: `legacy-${Date.now()}`, raw: trimmed }
  }
  // Some gateways wrap JSON
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    if (parsed.Error === false || parsed.Result === '0' || parsed.Result === 0) {
      return {
        ok: true as const,
        referenceId: String(parsed.ReferenceId || parsed.Result || `legacy-${Date.now()}`),
        raw: trimmed,
      }
    }
    const msg = String(parsed.Message || parsed.message || trimmed)
    return { ok: false as const, error: msg, raw: trimmed }
  } catch {
    // not JSON
  }
  if (!trimmed) {
    return {
      ok: false as const,
      error:
        `Empty response (HTTP ${status}). Itexmo often needs ApiCode + passwd — set ITEXMO_PASSWORD secret and redeploy.`,
      raw: trimmed,
    }
  }
  return {
    ok: false as const,
    error: LEGACY_ERRORS[trimmed] || `Legacy Itexmo error: ${trimmed.slice(0, 200)}`,
    raw: trimmed,
  }
}

/** Classic php_api — fields 1=phone, 2=message, 3=apicode, passwd=dashboard password. */
async function sendItexmoLegacy(phone: string, message: string) {
  if (!ITEXMO_API_CODE) {
    throw new Error('Missing ITEXMO_API_CODE secret.')
  }
  if (!ITEXMO_PASSWORD) {
    throw new Error(
      'Missing ITEXMO_PASSWORD. Legacy Itexmo requires ApiCode + passwd (your dashboard password).',
    )
  }

  const form = new URLSearchParams()
  form.set('1', phone)
  form.set('2', message)
  form.set('3', ITEXMO_API_CODE)
  form.set('passwd', ITEXMO_PASSWORD)
  // Some docs also accept email/username alongside passwd
  if (ITEXMO_EMAIL) {
    form.set('email', ITEXMO_EMAIL)
    form.set('Email', ITEXMO_EMAIL)
  }

  const attempts: Array<{ label: string; run: () => Promise<Response> }> = [
    {
      label: 'POST form',
      run: () =>
        fetch('https://www.itexmo.com/php_api/api.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/plain, application/json, */*',
            'Cache-Control': 'no-cache',
          },
          body: form.toString(),
        }),
    },
    {
      label: 'GET query',
      run: () =>
        fetch(`https://www.itexmo.com/php_api/api.php?${form.toString()}`, {
          method: 'GET',
          headers: { Accept: 'text/plain, application/json, */*' },
        }),
    },
  ]

  const errors: string[] = []
  for (const attempt of attempts) {
    const res = await attempt.run()
    const text = await res.text()
    const result = interpretLegacyBody(text, res.status)
    if (result.ok) {
      return { referenceId: result.referenceId, raw: { Result: result.raw, mode: attempt.label } }
    }
    errors.push(`${attempt.label}: ${result.error}`)
    // Don't retry GET if we got a real numeric error code
    if (result.raw && LEGACY_ERRORS[result.raw.trim()]) {
      throw new Error(result.error)
    }
  }

  throw new Error(errors.join(' | '))
}

async function sendItexmo(phone: string, message: string, clientId?: string) {
  if (!ITEXMO_EMAIL || !ITEXMO_PASSWORD || !ITEXMO_API_CODE) {
    throw new Error(
      'Missing ITEXMO_EMAIL / ITEXMO_PASSWORD / ITEXMO_API_CODE secrets on the Edge Function.',
    )
  }

  // Per Itexmo Api Docs broadcast body + Basic Auth (Email must be real email).
  const senderId = ITEXMO_SENDER_ID || 'ITM.TEST3' // docs: optional; ITM.TEST3 if Trial

  const makeBody = (withSender: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      ApiCode: ITEXMO_API_CODE,
      Email: ITEXMO_EMAIL,
      Password: ITEXMO_PASSWORD,
      Recipients: [phone],
      Message: message,
    }
    if (withSender) body.SenderId = senderId
    if (clientId) body.ClientId = clientId.slice(0, 50)
    return body
  }

  // Docs require Basic Auth on every request
  let { res, text, parsed } = await postItexmoBroadcast(makeBody(true), true)
  let msg = itexmoErrorMessage(parsed, text, res.status)
  let failed = !res.ok || parsed.Error === true || parsed.error === true

  // Retry without SenderId if sender/auth-related failure
  if (failed && (/authorization|sender/i.test(msg) || msg.includes('13'))) {
    ;({ res, text, parsed } = await postItexmoBroadcast(makeBody(false), true))
    msg = itexmoErrorMessage(parsed, text, res.status)
    failed = !res.ok || parsed.Error === true || parsed.error === true
  }

  if (failed) {
    if (isCredentialError(msg)) {
      throw new Error(
        `${msg} — Email secret is "${ITEXMO_EMAIL}" (passwordLen=${ITEXMO_PASSWORD.length}, apiCode=${ITEXMO_API_CODE}). ` +
          'Confirm ITEXMO_PASSWORD matches that email account (illuminateaestheticscenter@gmail.com).',
      )
    }
    if (/authorization/i.test(msg)) {
      throw new Error(
        `${msg} — Login/email is OK; Itexmo is blocking this request (often IP whitelist error 21). ` +
          'Email support@itexmo.com: please disable IP whitelisting for ApiCode PR-ILLUM594659_XXQTI so cloud servers (Supabase Edge) can call api.itexmo.com/api/broadcast. ' +
          `Tried SenderId=${senderId} as well.`,
      )
    }
    throw new Error(msg)
  }

  const referenceId = String(
    parsed.ReferenceId || parsed.referenceId || parsed.Result || '',
  )
  return { referenceId, raw: parsed }
}

async function requireElevatedOrService(req: Request) {
  const authHeader = req.headers.get('Authorization') || ''
  const isService =
    authHeader === `Bearer ${SERVICE_ROLE}` ||
    req.headers.get('x-sms-cron-secret') === Deno.env.get('SMS_CRON_SECRET')

  if (isService && SERVICE_ROLE) {
    return { admin: createClient(SUPABASE_URL, SERVICE_ROLE), elevated: true as const }
  }

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    throw new Error('Unauthorized')
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = String((profile as { role?: string } | null)?.role || '')
  if (role !== 'Owner' && role !== 'Admin') {
    throw new Error('Only Owner or Admin can send SMS from this endpoint.')
  }
  return { admin, elevated: true as const }
}

async function loadSettings(admin: ReturnType<typeof createClient>): Promise<SmsSettings> {
  const { data, error } = await admin.from('sms_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) {
    return {
      confirmation_enabled: true,
      reminder_enabled: true,
      reminder_minutes_before: 60,
      confirmation_template:
        'Hi {name}, your {service} is confirmed on {date} at {time}. - Illuminate Medical Aesthetics',
      reminder_template:
        'Reminder: {name}, your {service} is coming up ({date} {time}). See you soon! - Illuminate',
    }
  }
  return data as SmsSettings
}

async function branchName(
  admin: ReturnType<typeof createClient>,
  branchId: string | null,
): Promise<string> {
  if (!branchId) return 'Illuminate'
  const { data } = await admin.from('branches').select('name').eq('id', branchId).maybeSingle()
  return String((data as { name?: string } | null)?.name || 'Illuminate')
}

async function logAndSend(
  admin: ReturnType<typeof createClient>,
  opts: {
    kind: SmsKind
    phone: string
    message: string
    customerName?: string
    appointmentId?: string | null
    scheduledFor?: string | null
  },
) {
  const phone = normalizePhone(opts.phone)
  if (!phone) throw new Error('Invalid phone number')

  const { data: logRow, error: logErr } = await admin
    .from('sms_logs')
    .insert({
      appointment_id: opts.appointmentId || null,
      customer_name: opts.customerName || null,
      phone,
      kind: opts.kind,
      message: opts.message,
      status: 'queued',
      scheduled_for: opts.scheduledFor || null,
    })
    .select('id')
    .single()

  if (logErr) throw new Error(logErr.message)
  const logId = (logRow as { id: string }).id

  try {
    const result = await sendItexmo(phone, opts.message, logId.replace(/-/g, '').slice(0, 50))
    await admin
      .from('sms_logs')
      .update({
        status: 'sent',
        itexmo_reference_id: result.referenceId || null,
        sent_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', logId)
    return { ok: true, logId, referenceId: result.referenceId, phone }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Send failed'
    await admin
      .from('sms_logs')
      .update({ status: 'failed', error: msg })
      .eq('id', logId)
    return { ok: false, logId, error: msg, phone }
  }
}

Deno.serve(async (req) => {
  // Must return 2xx before any auth — browsers fail CORS if preflight is 401/404.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405)
    }

    const { admin } = await requireElevatedOrService(req)
    const body = (await req.json()) as {
      action?: string
      phone?: string
      message?: string
      templateKind?: 'confirmation' | 'reminder'
      appointmentId?: string
    }

    const action = body.action || 'send_test'
    const settings = await loadSettings(admin)

    if (action === 'check_secrets') {
      return json({
        ok: true,
        login: ITEXMO_EMAIL,
        loginLength: ITEXMO_EMAIL.length,
        passwordLength: ITEXMO_PASSWORD.length,
        apiCode: ITEXMO_API_CODE,
        hasSenderId: Boolean(ITEXMO_SENDER_ID),
        mode: (Deno.env.get('ITEXMO_USE_V5') ?? '').trim() === '1' ? 'v5' : 'legacy-apicode',
      })
    }

    if (action === 'send_test') {
      const phone = body.phone || ''
      let message = (body.message || '').trim()
      if (!message) {
        const kind = body.templateKind === 'reminder' ? 'reminder' : 'confirmation'
        const template =
          kind === 'reminder' ? settings.reminder_template : settings.confirmation_template
        message = fillTemplate(template, {
          name: 'Client',
          service: 'Service',
          date: formatDate(new Date().toISOString().slice(0, 10)),
          time: '10:00 AM',
          branch: 'Illuminate',
        })
      }
      if (!message) return json({ ok: false, error: 'Message is empty' }, 400)
      const result = await logAndSend(admin, {
        kind: 'test',
        phone,
        message,
        customerName: 'Test',
      })
      return json(result, result.ok ? 200 : 502)
    }

    if (action === 'send_confirmation') {
      if (!settings.confirmation_enabled) {
        return json({ ok: true, skipped: true, reason: 'confirmation_disabled' })
      }
      const appointmentId = body.appointmentId
      if (!appointmentId) return json({ ok: false, error: 'appointmentId required' }, 400)

      const { data: apt, error: aptErr } = await admin
        .from('appointments')
        .select(
          'id, customer_name, service_name, appointment_date, appointment_time, customer_phone, status, branch_id',
        )
        .eq('id', appointmentId)
        .maybeSingle()
      if (aptErr) return json({ ok: false, error: aptErr.message }, 500)
      if (!apt) return json({ ok: false, error: 'Appointment not found' }, 404)

      const row = apt as AppointmentRow
      if (!row.customer_phone) {
        return json({ ok: false, error: 'Appointment has no phone number' }, 400)
      }

      // Avoid duplicate successful confirmations
      const { data: existing } = await admin
        .from('sms_logs')
        .select('id')
        .eq('appointment_id', row.id)
        .eq('kind', 'confirmation')
        .eq('status', 'sent')
        .limit(1)
        .maybeSingle()
      if (existing) {
        return json({ ok: true, skipped: true, reason: 'already_sent' })
      }

      const branch = await branchName(admin, row.branch_id)
      const message = fillTemplate(settings.confirmation_template, {
        name: row.customer_name || 'Client',
        service: row.service_name || 'appointment',
        date: formatDate(row.appointment_date),
        time: formatTime(String(row.appointment_time)),
        branch,
      })

      const result = await logAndSend(admin, {
        kind: 'confirmation',
        phone: row.customer_phone,
        message,
        customerName: row.customer_name,
        appointmentId: row.id,
      })
      return json(result, result.ok ? 200 : 502)
    }

    if (action === 'send_due_reminders') {
      if (!settings.reminder_enabled) {
        return json({ ok: true, skipped: true, reason: 'reminder_disabled', sent: 0 })
      }

      const minutes = Math.max(5, Number(settings.reminder_minutes_before) || 60)
      const now = new Date()
      // Window: appointments whose start is between now and now+lead, with a small past grace
      const windowStart = new Date(now.getTime() - 5 * 60 * 1000)
      const windowEnd = new Date(now.getTime() + minutes * 60 * 1000)

      const fromDate = windowStart.toISOString().slice(0, 10)
      const toDate = windowEnd.toISOString().slice(0, 10)

      const { data: apts, error: listErr } = await admin
        .from('appointments')
        .select(
          'id, customer_name, service_name, appointment_date, appointment_time, customer_phone, status, branch_id',
        )
        .in('status', ['confirmed', 'checked-in', 'walk-in'])
        .gte('appointment_date', fromDate)
        .lte('appointment_date', toDate)
        .not('customer_phone', 'is', null)

      if (listErr) return json({ ok: false, error: listErr.message }, 500)

      const candidates = ((apts as AppointmentRow[]) || []).filter((row) => {
        const time = String(row.appointment_time).slice(0, 8)
        const start = new Date(`${row.appointment_date}T${time.length === 5 ? `${time}:00` : time}`)
        if (Number.isNaN(start.getTime())) return false
        return start >= windowStart && start <= windowEnd
      })

      const results: unknown[] = []
      for (const row of candidates) {
        const { data: existing } = await admin
          .from('sms_logs')
          .select('id')
          .eq('appointment_id', row.id)
          .eq('kind', 'reminder')
          .eq('status', 'sent')
          .limit(1)
          .maybeSingle()
        if (existing) continue

        const branch = await branchName(admin, row.branch_id)
        const message = fillTemplate(settings.reminder_template, {
          name: row.customer_name || 'Client',
          service: row.service_name || 'appointment',
          date: formatDate(row.appointment_date),
          time: formatTime(String(row.appointment_time)),
          branch,
        })

        const time = String(row.appointment_time).slice(0, 8)
        const startIso = new Date(
          `${row.appointment_date}T${time.length === 5 ? `${time}:00` : time}`,
        ).toISOString()

        const result = await logAndSend(admin, {
          kind: 'reminder',
          phone: row.customer_phone || '',
          message,
          customerName: row.customer_name,
          appointmentId: row.id,
          scheduledFor: startIso,
        })
        results.push({ appointmentId: row.id, ...result })
      }

      return json({
        ok: true,
        checked: candidates.length,
        sent: results.filter((r) => (r as { ok?: boolean }).ok).length,
        results,
      })
    }

    return json({ ok: false, error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    const status = msg === 'Unauthorized' || msg.includes('Only Owner') ? 401 : 500
    return json({ ok: false, error: msg }, status)
  }
})
