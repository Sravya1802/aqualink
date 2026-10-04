import { useEffect } from 'react'

export const LEVEL_COLOR = { high: '#c2352b', moderate: '#b8730a', low: '#2c8a4b', insufficient: '#8a9a9f' }

export function Gauge({ score, level }) {
  const r = 38, c = 2 * Math.PI * r
  return (
    <svg className="gauge" viewBox="0 0 92 92" role="img" aria-label={`Risk score ${score} of 100`}>
      <circle cx="46" cy="46" r={r} fill="none" stroke="#eef4f5" strokeWidth="9" />
      <circle cx="46" cy="46" r={r} fill="none" stroke={LEVEL_COLOR[level]} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 46 46)" />
      <text x="46" y="50" textAnchor="middle" fontSize="24" fontWeight="800" fill="#13262b">{level === 'insufficient' ? '—' : score}</text>
      <text x="46" y="65" textAnchor="middle" fontSize="9" fill="#5b7076">/ 100</text>
    </svg>
  )
}

export function Sparkline({ points, width = 90, height = 24 }) {
  if (!points || points.length < 2) return <span className="muted small">—</span>
  const vals = points.map((p) => p.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (width - 4) + 2, height - 2 - ((p.value - min) / span) * (height - 4)])
  return (
    <svg className="spark" width={width} height={height} aria-hidden="true">
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke="#0f8f9c" strokeWidth="1.8" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2" fill={points[i].censored ? '#fff' : '#0f8f9c'} stroke="#0f8f9c" />)}
    </svg>
  )
}

export function JsonModal({ title, data, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!data) return null
  const text = JSON.stringify(data, null, 2)
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <b className="grow">{title}</b>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
          <button className="btn" onClick={() => download(`${title.replace(/\W+/g, '-').toLowerCase()}.json`, data)}>Download</button>
          <button className="btn" onClick={onClose}>Close</button>
        </header>
        <pre>{text}</pre>
      </div>
    </div>
  )
}

export function download(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/fhir+json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const fmtDate = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const fmtNum = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Number(v.toPrecision(3)).toString())
