import { PATHWAYS } from '../lib/riskEngine.js'

export default function About() {
  return (
    <div className="about">
      <h1 style={{ fontSize: 28 }}>AquaLink: from streams to systems</h1>
      <p className="muted" style={{ fontSize: 17, marginTop: 6 }}>
        Citizens already notice when a stream is sick. AquaLink turns those observations into standards-based One Health intelligence, so a public-health officer
        gets an early warning <i>before</i> people get sick.
      </p>

      <h2>The problem</h2>
      <ul>
        <li>Urban streams are rarely monitored: the most recent lab data we found for Almyros is from <b>2020</b>.</li>
        <li>Citizen-science apps collect useful observations, but they stay in ecology silos and never reach public-health systems.</li>
        <li>The links between ecosystem health and human health (One Health) are well known, but no tool computes them for a specific stream, today.</li>
      </ul>

      <h2>How it works</h2>
      <div className="flow">
        <div className="card"><b>1 · Citizen report</b>A 60-second guided checklist in plain language. Optional on-device photo assist pre-fills answers; the citizen confirms or corrects each one.</div>
        <div className="card"><b>2 · FHIR, natively</b>Each answer becomes an <code>ObservationIndicatorsOah</code> on a <code>LocationOah</code>, using the OAH indicator codes. Provenance records the human-in-the-loop AI.</div>
        <div className="card"><b>3 · One Health engine</b>Citizen signals + data-quality-checked lab data + OAH population health measures → hazard × exposure × vulnerability for 6 pathways.</div>
        <div className="card"><b>4 · Early warning</b>Ranked sites, explainable evidence, actions per audience, and a FHIR <code>RiskAssessment</code> any OAH-compatible system can consume.</div>
      </div>

      <h2>One Health pathways</h2>
      <table className="card">
        <thead><tr><th>Pathway</th><th>Mechanism</th><th>Linked OAH health indicators</th></tr></thead>
        <tbody>
          {Object.values(PATHWAYS).map((p) => (
            <tr key={p.title}><td><b>{p.icon} {p.title}</b></td><td>{p.summary}</td><td className="small">{p.health.map((h) => h.code).join(', ')}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 6 }}>
        Thresholds: EU Nitrates Directive (50 mg/L), EU priority-substance MAC-EQS (Dir. 2013/39/EU), dissolved oxygen &lt; 5–6 mg/L, conductivity &gt; 1500 µS/cm.
        Vulnerability is weighted using chronic-disease, mental-health and obesity prevalence from OAH HealthMeasure data.
      </p>

      <h2>Data</h2>
      <ul>
        <li><b>Official:</b> 451 resources from the OneAquaHealth FHIR IG examples (<a href="https://github.com/hl7-eu/oah" target="_blank" rel="noreferrer">hl7-eu/oah</a>): Almyros and Giofyros streams (Crete), Benevento air quality and population health, Oslo (Nordre Aker) population health.</li>
        <li><b>Demo:</b> two stream reaches (Calore in Benevento, Akerselva in Oslo) and 7 synthetic citizen reports, all tagged <code>aqualink-demo</code> / <code>synthetic-demo</code> and labelled in the UI.</li>
        <li><b>Data quality:</b> AquaLink found and auto-corrects 107 observations in the IG examples whose statistics are scaled about 10⁴× (decimal-separator import issue). See the Data quality tab.</li>
      </ul>

      <h2>Responsible AI</h2>
      <ul>
        <li>Photo assist runs on-device (no upload). It only <i>suggests</i>, shows its confidence and reason, and the citizen confirms every answer.</li>
        <li>Every AI-assisted answer carries a note ("suggested … confirmed/corrected by citizen"), and Provenance lists the software as <i>assembler</i>, not author.</li>
        <li>Risk scores are explainable decision support for officers, not diagnoses. Confidence drops when evidence is thin, and data gaps are shown explicitly.</li>
      </ul>

      <h2>Hackathon tracks</h2>
      <p>Primary: <b>Track 7: Digital Health Standards</b> (FHIR-native, OAH IG). Also covers Track 1 (plain-language UX), Track 2 (data-to-insight), Track 3 (human-in-the-loop AI), Track 5 (citizen levels) and Track 6 (early warning).</p>
    </div>
  )
}
