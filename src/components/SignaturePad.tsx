import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './SignaturePad.css'

export function SignaturePad({
  label,
  value,
  locked,
  onChange,
}: {
  label: string
  value: string
  locked?: boolean
  onChange: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const width = parent.clientWidth
    const height = 160
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, width, height)
      img.src = value
    }
  }, [value])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (locked) return
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || locked) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !last.current) return
    const next = pos(e)
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    last.current = next
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    if (locked) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
    onChange('')
  }

  return (
    <div className="sig-pad-block">
      <div className="sig-pad-label-row">
        <label>{label}</label>
        {!locked ? (
          <button className="btn btn-ghost btn-sm" type="button" onClick={clear}>
            Reset
          </button>
        ) : (
          <span className="sig-pad-muted">Confirmed</span>
        )}
      </div>
      <div className={`sig-pad-frame ${locked ? 'is-locked' : ''}`}>
        <canvas
          ref={canvasRef}
          className="sig-pad-canvas"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
    </div>
  )
}
