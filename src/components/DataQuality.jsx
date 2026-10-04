import { useMemo, useState } from 'react'
import { all } from '../lib/store.js'
import { qualityReport, assessObservation } from '../lib/dataQuality.js'
import { JsonModal } from './ui.jsx'

const RULES = {
  'decimal-scaling': { label: 'Decimal-separator scaling', sev: 'error', desc: 'average/min/max ≈ 10⁴ × median — e.g. water temperature average 198,000 °C. Values are auto-corrected before use.' },
  'implausible-range': { label: 'Physically implausible', sev: 'error', desc: 'Value outside the physically possible range for the indicator.' },
  'avg-outside-min-max': { label: 'Average outside [min, max]', sev: 'warning', desc: 'Summary statistics are internally inconsistent.' },
  'min-gt-max': { label: 'Minimum > maximum', sev: 'warning', desc: 'Summary statistics are internally inconsistent.' },
  'below-detection-limit': { label: 'Below detection limit', sev: 'info', desc: 'All samples < LOD; the average is an LOD/2 substitution. Treated as "< LOD", never as a measured value.' },
}

export default function DataQuality() {
  const observations = all('Observation')
  const rows = useMemo(() => qualityReport(observations), [observations])
  const [filter, setFilter] = useState('decimal-scaling')
  const [modal, setModal] = useState(null)

  const numeric = observations.filter((o) => assessObservation(o))
  const affected = new Set(rows.filter((r) => r.severity !== 'info').map((r) => r.id))
  const counts = rows.reduce((a, r) => ({ ...a, [r.rule]: (a[r.rule] || 0) + 1 }), {})
  const shown = rows.filter((r) => !filter || r.rule === filter)

  const outcome = {
    resourceType: 'OperationOutcome',
    id: 'aqualink-oah-ig-data-quality',
    issue: rows.map((r) => ({
      severity: r.severity === 'error' ? 'error' : r.severity === 'warning' ? 'warning' : 'information',
      code: r.severity === 'info' ? 'informational' : 'value',
      details: { text: `${RULES[r.rule]?.label}: ${r.message}${r.fix ? ` Fix: ${r.fix}` : ''}` },
      expression: [`Observation/${r.id}`],
    })),
  }

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <h1>Data quality guard</h1>
          <p className="muted">Every lab observation is checked before it can influence a risk score. Run against the official OneAquaHealth FHIR IG example data (hl7-eu/oah).</p>
        </div>
        <button className="btn" onClick={() => setModal(outcome)}>{'{ }'} Export as FHIR OperationOutcome</button>
      </div>

      <div className="stat-row">
        <div className="card stat"><b>{numeric.length}</b><span>numeric observations checked</span></div>
        <div className="card stat"><b style={{ color: 'var(--high)' }}>{affected.size}</b><span>with errors or inconsistencies ({Math.round((affected.size / numeric.length) * 100)}%)</span></div>
        <div className="card stat"><b>{counts['decimal-scaling'] || 0}</b><span>decimal-scaling errors auto-corrected</span></div>
        <div className="card stat"><b>{counts['below-detection-limit'] || 0}</b><span>below-detection-limit values handled as censored</span></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 12 }}>
        <b>Why this matters</b>
        <p className="small" style={{ marginTop: 4 }}>
          In the Almyros datasets the <code>average</code>, <code>minimum</code>, <code>maximum</code> and <code>std-dev</code> components are about 10,000× the
          <code> median</code> (e.g. pH 75,900; dissolved oxygen 56,500 mg/L), consistent with European decimal commas being dropped during CSV import.
          Any dashboard that reads <code>average</code> would raise false alarms or miss real ones. AquaLink detects the pattern, explains it, and uses a corrected, robust
          value — so a real signal like <b>dissolved oxygen falling from 8.65 to 5.65 mg/L (2018→2020)</b> is still visible.
        </p>
      </div>

      <div className="row wrap" style={{ marginBottom: 10 }}>
        {Object.entries(RULES).map(([k, v]) => (
          <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(filter === k ? null : k)}>
            {v.label} <span className={`badge ${v.sev}`}>{counts[k] || 0}</span>
          </button>
        ))}
      </div>
      {filter && <p className="small muted" style={{ marginBottom: 8 }}>{RULES[filter].desc}</p>}

      <div className="card">
        <table>
          <thead><tr><th>Observation</th><th>Indicator</th><th>Period</th><th>Issue</th><th>Suggested fix</th></tr></thead>
          <tbody>
            {shown.slice(0, 200).map((r, i) => (
              <tr key={i}>
                <td><button className="btn ghost" onClick={() => setModal(observations.find((o) => o.id === r.id))}>{r.id}</button></td>
                <td>{r.display}</td>
                <td className="muted">{r.year?.slice(0, 4)}</td>
                <td><span className={`badge ${r.severity}`}>{r.severity}</span> <span className="small">{r.message}</span></td>
                <td className="small">{r.fix || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <JsonModal title={modal.resourceType === 'OperationOutcome' ? 'Data quality — OperationOutcome' : `Observation ${modal.id}`} data={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
