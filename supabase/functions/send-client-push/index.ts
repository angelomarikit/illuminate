-- Deno Edge Function: send Expo push when a client_notification is created.
-- Deploy: supabase functions deploy send-client-push --no-verify-jwt
-- Then add a Database Webhook on public.client_notifications INSERT → this function.
-- Or call from SQL with pg_net / supabase_functions.http_request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

type NoticeRow = {
  id: string
  user_id: string
  kind: string
  title: string
  body: string
  href: string
  appointment_id: string | null
  notice_key: string
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const payload = await req.json()
    // Supports Database Webhook shape or direct { record }
    const record = (payload?.record ?? payload?.new ?? payload) as NoticeRow
    if (!record?.user_id || !record?.title) {
      return Response.json({ ok: false, error: 'Missing notification record' }, { status: 400 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: tokens, error } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', record.user_id)

    if (error) {
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    const pushTokens = (tokens ?? []).map((t) => t.token).filter(Boolean)
    if (!pushTokens.length) {
      return Response.json({ ok: true, sent: 0, reason: 'no_tokens' })
    }

    const messages = pushTokens.map((to) => ({
      to,
      sound: 'default',
      title: record.title,
      body: record.body,
      data: {
        noticeKey: record.notice_key,
        kind: record.kind,
        href: record.href || '/(tabs)/appointments',
        appointmentId: record.appointment_id,
      },
    }))

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const expoJson = await expoRes.json()
    return Response.json({ ok: true, sent: messages.length, expo: expoJson })
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
})
