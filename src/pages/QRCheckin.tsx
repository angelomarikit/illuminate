import { useCallback, useEffect, useState } from 'react'
import { QrCode } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatusMessage } from '../components/StatusMessage'
import { useBranch } from '../context/BranchContext'
import { supabase } from '../lib/supabase'
import { isUuid } from '../lib/utils'
import type { Appointment } from '../types'
import './qr.css'

export function QRCheckin() {
  const { branchId, branchName } = useBranch()
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('Waiting for QR scan or booking code...')
  const [error, setError] = useState('')
  const [queue, setQueue] = useState<Appointment[]>([])

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10)
    let q = supabase
      .from('appointments')
      .select('*')
      .eq('appointment_date', today)
      .neq('status', 'completed')
      .order('appointment_time')
    if (isUuid(branchId)) q = q.eq('branch_id', branchId)
    const { data, error: err } = await q
    if (err) {
      setError(err.message)
      return
    }
    setQueue(
      data?.map((row) => ({
        id: row.id,
        customerName: row.customer_name,
        serviceName: row.service_name,
        staffName: row.staff_name ?? '',
        date: row.appointment_date,
        time: String(row.appointment_time).slice(0, 5),
        durationMin: row.duration_min,
        status: row.status,
        branchId: row.branch_id ?? '',
        type: row.type,
      })) ?? [],
    )
  }, [branchId])

  useEffect(() => {
    load()
  }, [load])

  async function checkIn(raw?: string) {
    setError('')
    const needle = (raw ?? code).trim().toLowerCase()
    if (!needle) {
      setMessage('Enter a booking code or client name.')
      return
    }

    const match = queue.find(
      (a) =>
        a.id.toLowerCase() === needle ||
        a.id.toLowerCase().startsWith(needle) ||
        a.customerName.toLowerCase().includes(needle),
    )

    if (!match) {
      setMessage('No matching booking found for this branch today.')
      return
    }

    const { error: err } = await supabase
      .from('appointments')
      .update({ status: 'checked-in' })
      .eq('id', match.id)

    if (err) {
      setError(err.message)
      return
    }

    setMessage(`${match.customerName} checked in for ${match.serviceName} at ${match.time}.`)
    setCode('')
    await load()
  }

  return (
    <div>
      <PageHeader
        kicker="Arrivals"
        title="QR Check-in"
        subtitle={`Scan client booking QR codes for ${branchName}. Supports walk-in code entry when phones are unavailable.`}
      />

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="grid-2">
        <div className="panel qr-panel">
          <div className="panel-body">
            <div className="qr-visual">
              <QrCode size={88} strokeWidth={1.25} />
              <p>Align booking QR within the frame</p>
            </div>
            <div className="field" style={{ marginTop: 18 }}>
              <label>Or enter booking code / client name</label>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. client name or appointment id"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    checkIn()
                  }
                }}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 12 }}
              type="button"
              onClick={() => checkIn()}
            >
              Check In Client
            </button>
            <p className="qr-message">{message}</p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Arrival Queue</h2>
          </div>
          <div className="panel-body">
            {queue.length === 0 ? (
              <div className="empty-state">No arrivals queued for today.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Client</th>
                      <th>Service</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((apt) => (
                      <tr key={apt.id}>
                        <td>{apt.time}</td>
                        <td>{apt.customerName}</td>
                        <td>{apt.serviceName}</td>
                        <td>
                          <span className="badge">{apt.status}</span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => checkIn(apt.customerName)}
                          >
                            Check in
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
