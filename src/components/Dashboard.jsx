import { useMemo, useState, useSyncExternalStore } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { SITES, getReports, subscribe, reportsFor, get } from '../lib/store.js'
import { assessSite } from '../lib/riskEngine.js'
import { buildRiskAssessment, supportingResources, transactionBundle } from '../lib/fhirBuilders.js'
import { questionById } from '../lib/codes.js'
import { Gauge, Sparkline, JsonModal, LEVEL_COLOR, download, fmtDate, fmtNum } from './ui.jsx'

export default function Dashboard({ siteId, onSelect, onReport }) {
  const reports = useSyncExternalStore(subscribe, getReports)
  const results = useMemo(() => SITES.map(assessSite).sort((a, b) => b.score - a.score), [reports]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = results.find((r) => r.site.id === siteId) || results[0]

  return (
    <div className="dash">
      <aside className="dash-left">
        <div className="map">
          <MapContainer bounds={SITES.map((s) => [s.lat, s.lng])} boundsOptions={{ padding: [30, 30] }} style={{ height: '100%' }} scrollWheelZoom={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            {results.map((r) => (
              <CircleMarker key={r.site.id} center={[r.site.lat, r.site.lng]} radius={r.site.id === current.site.id ? 11 : 8}
                pathOptions={{ color: '#fff', weight: 2, fillColor: LEVEL_COLOR[r.level], fillOpacity: 0.95 }}
                eventHandlers={{ click: () => onSelect(r.site.id) }}>
                <Tooltip>{r.site.name}: {r.score} ({r.level})</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div className="section-title" style={{ margin: '4px 0 0' }}>Sites ranked by One Health risk</div>
        <div className="site-list">
          {results.map((r) => (
            <button key={r.site.id} className={`site-item ${r.site.id === current.site.id ? 'active' : ''}`} onClick={() => onSelect(r.site.id)}>
              <span className={`score-dot ${r.level}`}>{r.level === 'insufficient' ? '—' : r.score}</span>
              <span className="grow">
                <b>{r.site.name}</b>
                <div className="small muted">{r.site.place}</div>
                <div className="small muted">{r.pathways[0].icon} {r.pathways[0].title} · {r.citizen.n} citizen{r.citizen.n === 1 ? '' : 's'}</div>
              </span>
              {r.alert && <span title="Early warning">🚨</span>}
            </button>
          ))}
        </div>
      </aside>
      <SitePanel key={current.site.id} r={current} onReport={onReport} />
    </div>
  )
}

function SitePanel({ r, onReport }) {
  const [modal, setModal] = useState(null)
  const site = r.site
  const top = r.pathways[0]
  const siteReports = reportsFor(site.id)
  const loc = get(`Location/${site.id}`)

  const riskResource = () => buildRiskAssessment(site, r)
  const exportBundle = () => {
    const resources = [...supportingResources([site.id]), riskResource(), ...siteReports.flatMap((x) => [...x.resources.observations, x.resources.provenance])]
    download(`aqualink-${site.id}-transaction.json`, transactionBundle(resources))
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {r.alert && (
        <div className={`alert ${r.level === 'high' ? '' : 'moderate'}`}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div>
            <b>Early warning — {top.title.toLowerCase()} risk is {top.level} at {site.name}</b>
            <span className="small">{top.summary}. {r.actions[0] && `First action: ${r.actions[0].text}`}</span>
          </div>
        </div>
      )}

      <div className="card card-pad">
        <div className="panel-head">
          <Gauge score={r.score} level={r.level} />
          <div className="grow">
            <div className="row wrap">
              <h2>{site.name}</h2>
              <span className={`badge ${r.level}`}>{r.level === 'insufficient' ? 'insufficient evidence' : `${r.level} risk`}</span>
              <span className="badge info">confidence: {r.confidence}</span>
              {site.official ? <span className="tag">OAH IG location</span> : <span className="badge demo">AquaLink demo reach</span>}
            </div>
            <p className="muted">{site.place} · {loc?.description}</p>
            <p className="small muted" style={{ marginTop: 4 }}>
              Score = hazard × exposure ({r.exposure}) × population vulnerability (×{r.vulnerability.infection.toFixed(2)} infection, ×{r.vulnerability.wellbeing.toFixed(2)} wellbeing). Highest pathway shown.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn primary" onClick={() => onReport(site.id)}>📝 Report at this site</button>
            <button className="btn" onClick={() => setModal({ title: `RiskAssessment ${site.id}`, data: riskResource() })}>{'{ }'} FHIR RiskAssessment</button>
            <button className="btn" onClick={exportBundle}>⬇ FHIR transaction bundle</button>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><b>{r.citizen.n}</b><span>independent citizens (30 days){r.citizen.submissions > r.citizen.n ? ` · ${r.citizen.submissions} reports` : ''}</span></div>
          <div className="kpi"><b>{Object.keys(r.labs).length}</b><span>lab / sensor indicators</span></div>
          <div className="kpi"><b>{Object.keys(r.health).length}</b><span>population health measures</span></div>
          <div className="kpi"><b>{r.basis.length}</b><span>FHIR resources as evidence</span></div>
        </div>
      </div>

      <div className="section-title">One Health pathways — from stream signal to human health outcome</div>
      <div className="pathways">
        {r.pathways.map((p) => (
          <div key={p.key} className={`pathway ${p.level}`}>
            <div className="row">
              <h4 className="grow"><span>{p.icon}</span>{p.title}</h4>
              <span className={`badge ${p.level}`}>{p.level === 'insufficient' ? 'no data' : p.score}</span>
            </div>
            <p className="small muted">{p.summary}</p>
            <div className="bar"><i style={{ width: `${p.score}%`, background: LEVEL_COLOR[p.level] }} /></div>
            {p.level === 'insufficient' ? (
              <p className="small muted">Not assessed: nothing at this site can detect this pathway yet. Citizen reports would — no data is not the same as low risk.</p>
            ) : p.evidence.length ? (
              <ul className="evidence">
                {p.evidence.slice(0, 5).map((e, i) => (
                  <li key={i}><span className={`src ${e.source}`}>{e.source}</span><span>{e.text}</span></li>
                ))}
              </ul>
            ) : <p className="small muted">No hazard signals.</p>}
            <div className="health-links" title="Linked OAH health indicators (HealthIndicatorsOahVs)">
              {p.health.map((h) => <span key={h.code}>{h.code}</span>)}
            </div>
          </div>
        ))}
      </div>

      {r.actions.length > 0 && (
        <>
          <div className="section-title">Recommended actions</div>
          <div className="card">
            <table>
              <thead><tr><th>Who</th><th>Action</th><th>Why</th></tr></thead>
              <tbody>
                {r.actions.map((a, i) => (
                  <tr key={i}><td><b>{a.audience}</b></td><td>{a.text}</td><td><span className={`badge ${a.level}`}>{a.pathway === 'data' ? 'more data' : `${a.pathway} · ${a.level}`}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="two-col">
        <div>
          <div className="section-title">Lab & sensor data (data-quality corrected)</div>
          <div className="card">
            {Object.keys(r.labs).length ? (
              <table>
                <thead><tr><th>Indicator</th><th>Latest</th><th>Year</th><th>Trend</th></tr></thead>
                <tbody>
                  {Object.values(r.labs).sort((a, b) => a.display.localeCompare(b.display)).map((l) => {
                    const issues = l.series.flatMap((p) => p.issues).filter((i) => i.severity !== 'info')
                    return (
                      <tr key={l.code}>
                        <td>{l.display} {issues.length > 0 && <span className="dq-flag" title={`${issues.length} data-quality issue(s) auto-corrected:\n${issues[0].message}`}>⚑</span>}</td>
                        <td>{l.latest.censored ? `< ${l.latest.detectionLimit}` : fmtNum(l.latest.value)} <span className="muted small">{l.unit}</span></td>
                        <td className="muted">{l.latest.date.slice(0, 4)}</td>
                        <td><Sparkline points={l.series} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="card-pad muted">No lab data for this reach yet — citizen reports are the only signal. That is exactly the gap AquaLink fills.</p>}
          </div>
        </div>
        <div>
          <div className="section-title">Population health context (OAH HealthMeasure)</div>
          <div className="card">
            {Object.keys(r.health).length ? (
              <table>
                <thead><tr><th>Health indicator</th><th>Mean</th><th>Groups</th></tr></thead>
                <tbody>
                  {Object.values(r.health).map((h) => (
                    <tr key={h.code}><td>{h.display}</td><td><b>{h.mean.toFixed(1)}%</b></td><td className="muted">{h.values.length}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="card-pad muted">No population health data linked to this city in the OAH dataset.</p>}
          </div>
          {(r.gaps.length > 0 || r.protective.length > 0) && (
            <>
              <div className="section-title">Data gaps & protective factors</div>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {r.protective.map((p, i) => <p key={`p${i}`} className="small">🌿 {p}</p>)}
                {r.gaps.map((g, i) => <p key={i} className="small">⚠️ {g}</p>)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="section-title">Citizen reports</div>
      <div className="card">
        {siteReports.length ? (
          <table>
            <thead><tr><th>When</th><th>Observations</th><th>FHIR</th></tr></thead>
            <tbody>
              {siteReports.map((rep) => (
                <tr key={rep.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(rep.createdAt)} {rep.demo && <span className="badge demo">demo</span>}</td>
                  <td>
                    <div className="row wrap" style={{ gap: 4 }}>
                      {Object.entries(rep.answers).flatMap(([qid, ans]) => [].concat(ans).map((a) => {
                        const opt = questionById[qid]?.options.find((o) => o.code === a)
                        return opt && a !== 'none' ? <span key={qid + a} className="tag">{opt.icon} {opt.label}</span> : null
                      }))}
                      {rep.measurements?.waterTemperature && <span className="tag">🌡 {rep.measurements.waterTemperature} °C</span>}
                      {rep.photoAssist && <span className="tag">📷 photo-assisted</span>}
                    </div>
                  </td>
                  <td><button className="btn ghost" onClick={() => setModal({ title: `Citizen report ${rep.id.slice(0, 8)}`, data: transactionBundle([...rep.resources.observations, rep.resources.provenance]) })}>{rep.resources.observations.length + 1} resources</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="card-pad muted">No reports yet. <button className="btn ghost" onClick={() => onReport(site.id)}>Be the first →</button></p>}
      </div>

      {modal && <JsonModal title={modal.title} data={modal.data} onClose={() => setModal(null)} />}
    </section>
  )
}
