import { useState, useSyncExternalStore } from 'react'
import { getReports, subscribe, SITES, demoLocations } from '../lib/store.js'
import { syncBundle } from '../lib/fhirBuilders.js'
import { checkAll } from '../lib/validate.js'
import { getBase, setBase, ping, postTransaction, searchCitizenObservations, DEFAULT_BASE } from '../lib/fhirServer.js'
import { resetDemo } from '../lib/seed.js'
import { OAH_PROFILE } from '../lib/codes.js'
import { JsonModal } from './ui.jsx'

const PROFILES = [
  ['Observation (citizen indicators)', OAH_PROFILE.indicator, 'Every citizen answer → one Observation on a LocationOah, coded with the OAH indicator code system'],
  ['Observation (lab statistics)', OAH_PROFILE.withComponent, 'Read from the IG examples; components carry average / median / min / max'],
  ['Observation (health measure)', OAH_PROFILE.healthMeasure, 'Population health context (Benevento, Oslo) used as vulnerability weighting'],
  ['Location', OAH_PROFILE.location, 'Stream reaches, linked to the city via Location.partOf'],
  ['Group', OAH_PROFILE.group, 'Population at risk — subject of the RiskAssessment'],
  ['Provenance (core R4)', 'http://hl7.org/fhir/R4/provenance.html', 'Citizen = author, AquaLink Photo Assist = assembler → AI involvement is auditable'],
  ['RiskAssessment (core R4)', 'http://hl7.org/fhir/R4/riskassessment.html', 'One prediction per One Health pathway, outcome coded with OAH health indicators'],
]

export default function FhirTab() {
  const reports = useSyncExternalStore(subscribe, getReports)
  const [base, setBaseState] = useState(getBase())
  const [status, setStatus] = useState(null)
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)

  const observations = reports.flatMap((r) => r.resources.observations)
  const validation = checkAll(observations)

  const run = async (label, fn) => {
    setBusy(true)
    setStatus({ label, state: 'running' })
    try { setStatus({ label, state: 'ok', detail: await fn() }) } catch (e) { setStatus({ label, state: 'error', detail: e.message }) } finally { setBusy(false) }
  }

  const syncAll = () => run('Sync', async () => {
    const { bundle, reportsSent, demoSkipped } = syncBundle(reports, SITES.map((s) => s.id))
    const res = await postTransaction(bundle, base)
    return `${res.entry?.length ?? 0} resources stored: ${reportsSent} citizen report(s) plus sites, populations and device${demoSkipped ? ` (${demoSkipped} synthetic demo reports are never synced)` : ''}.`
  })

  const roundTrip = () => run('Round-trip search', async () => {
    const site = SITES.find((s) => s.id === 'Loc-AquaLink-Calore')
    const b = await searchCitizenObservations(site.id, base)
    setModal({ title: `GET Observation?subject=Location/${site.id}&_tag=citizen-science`, data: b })
    return `${b.total ?? b.entry?.length ?? 0} citizen Observations found on the server for ${site.name}.`
  })

  const sample = observations[0]

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <h1>FHIR & interoperability</h1>
          <p className="muted">AquaLink speaks the OneAquaHealth FHIR Implementation Guide natively — no custom API, no lock-in. Any OAH city can plug it in.</p>
        </div>
      </div>

      <div className="stat-row">
        <div className="card stat"><b>{observations.length}</b><span>citizen Observations generated</span></div>
        <div className="card stat"><b className="check">{validation.passed}/{validation.total}</b><span>pass OAH profile structural checks</span></div>
        <div className="card stat"><b>7</b><span>FHIR resource types / profiles used</span></div>
        <div className="card stat"><b>451</b><span>official OAH IG example resources loaded</span></div>
      </div>

      <div className="section-title">FHIR server</div>
      <div className="card card-pad">
        <div className="row wrap">
          <input className="input grow" value={base} onChange={(e) => setBaseState(e.target.value)} style={{ minWidth: 260 }} />
          <button className="btn" onClick={() => { setBase(base); run('Ping', async () => { const m = await ping(base); return `FHIR ${m.fhirVersion} · ${m.software ?? ''} ${m.version ?? ''}` }) }} disabled={busy}>Test connection</button>
          <button className="btn primary" onClick={() => { setBase(base); syncAll() }} disabled={busy}>☁️ Sync all reports (transaction)</button>
          <button className="btn" onClick={roundTrip} disabled={busy}>🔎 Round-trip search</button>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Default: {DEFAULT_BASE} (public HAPI test server — don't send personal data). Point it at the OAH FHIR sandbox or a city server to go live.</p>
        {status && (
          <p className="small" style={{ marginTop: 8 }}>
            <b>{status.label}:</b>{' '}
            {status.state === 'running' && 'working…'}
            {status.state === 'ok' && <span className="check">✓ {status.detail}</span>}
            {status.state === 'error' && <span className="cross">✗ {status.detail}</span>}
          </p>
        )}
      </div>

      <div className="section-title">Profiles & resources</div>
      <div className="card">
        <table>
          <thead><tr><th>Resource</th><th>Profile / spec</th><th>How AquaLink uses it</th></tr></thead>
          <tbody>
            {PROFILES.map(([name, url, how]) => (
              <tr key={name}><td><b>{name}</b></td><td><a href={url.replace('http://hl7.eu/fhir/ig/oah/StructureDefinition/', 'https://build.fhir.org/ig/hl7-eu/oah/StructureDefinition-') + (url.includes('hl7.eu') ? '.html' : '')} target="_blank" rel="noreferrer"><code>{url.split('/').pop()}</code></a></td><td className="small">{how}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">Profile conformance of citizen observations</div>
      <div className="card">
        <table>
          <thead><tr><th>Rule (ObservationIndicatorsOah)</th><th>Result</th></tr></thead>
          <tbody>
            {(validation.results[0]?.checks || []).map((c, i) => {
              const okAll = validation.results.every((r) => r.checks[i].ok)
              return <tr key={c.rule}><td>{c.rule}</td><td>{okAll ? <span className="check">✓ all {validation.total}</span> : <span className="cross">✗ some failed</span>}</td></tr>
            })}
          </tbody>
        </table>
        <p className="small muted card-pad">Structural checks in-app. For full terminology validation run the HL7 FHIR Validator with <code>-ig hl7.eu.fhir.oah</code>.</p>
      </div>

      <div className="row wrap" style={{ marginTop: 14 }}>
        {sample && <button className="btn" onClick={() => setModal({ title: 'Sample citizen Observation', data: sample })}>{'{ }'} Sample citizen Observation</button>}
        <button className="btn" onClick={() => setModal({ title: 'AquaLink demo Locations', data: demoLocations })}>{'{ }'} Demo Locations</button>
        <button className="btn" onClick={() => setModal({ title: 'Provenance (human-in-the-loop AI)', data: reports.find((r) => r.photoAssist)?.resources.provenance || reports[0]?.resources.provenance })}>{'{ }'} Provenance</button>
        <span className="grow" />
        <button className="btn" onClick={() => confirm('Delete all reports on this device and restore the demo reports?') && resetDemo()}>↺ Reset demo data</button>
      </div>

      {modal && <JsonModal title={modal.title} data={modal.data} onClose={() => setModal(null)} />}
    </div>
  )
}
