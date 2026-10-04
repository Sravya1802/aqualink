import { useMemo, useState } from 'react'
import { QUESTIONS, OPTIONAL_MEASUREMENTS } from '../lib/codes.js'
import { SITES, addReport, getReports } from '../lib/store.js'
import { makeReport } from '../lib/seed.js'
import { analyzePhoto } from '../lib/photoAssist.js'
import { assessSite } from '../lib/riskEngine.js'
import { transactionBundle, syncBundle } from '../lib/fhirBuilders.js'
import { postTransaction, getBase } from '../lib/fhirServer.js'
import { checkAll } from '../lib/validate.js'
import { measurementError, isKnownSite } from '../lib/reportValidation.js'
import { JsonModal } from './ui.jsx'

function citizenId() {
  try {
    let id = localStorage.getItem('aqualink.citizenId')
    if (!id) { id = `cit-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('aqualink.citizenId', id) }
    return id
  } catch { return 'cit-anonymous' }
}

const LEVELS = [[0, 'Stream Spotter', '🔍'], [3, 'Stream Guardian', '🛡️'], [10, 'River Champion', '🏆']]

export default function ReportWizard({ initialSite, onDone }) {
  const [step, setStep] = useState(0)
  // Unknown site ids (e.g. a mistyped #/report/<id> link) fall back to a default site.
  const [siteId, setSiteId] = useState(isKnownSite(initialSite) ? initialSite : SITES[3].id)
  const [answers, setAnswers] = useState({})
  const [measurements, setMeasurements] = useState({})
  const [photo, setPhoto] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [photoError, setPhotoError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null)

  const total = QUESTIONS.length + 2 // site/photo + questions + measurements
  const q = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1] : null

  const onPhoto = async (file) => {
    if (!file) return
    setPhotoError(null)
    if (!file.type.startsWith('image/')) {
      setPhotoError('That file is not an image. Please choose a photo (JPEG, PNG, HEIC…).')
      return
    }
    setAnalyzing(true)
    try {
      const result = await analyzePhoto(file)
      setPhoto(result)
      // Pre-fill only questions the citizen has not answered yet; they confirm each one.
      setAnswers((prev) => {
        const next = { ...prev }
        for (const [qid, s] of Object.entries(result.suggestions)) if (next[qid] == null) next[qid] = s.answer
        return next
      })
    } catch {
      setPhotoError("We couldn't read that photo. You can try another one, or just answer the questions yourself.")
    } finally {
      setAnalyzing(false)
    }
  }

  const choose = (opt) => {
    if (!q.multi) return setAnswers({ ...answers, [q.id]: opt.code })
    const cur = [].concat(answers[q.id] || []).filter((c) => c !== 'none')
    const next = opt.code === 'none' ? ['none'] : cur.includes(opt.code) ? cur.filter((c) => c !== opt.code) : [...cur, opt.code]
    setAnswers({ ...answers, [q.id]: next.length ? next : ['none'] })
  }

  const measurementErrors = Object.fromEntries(OPTIONAL_MEASUREMENTS.map((m) => [m.id, measurementError(m.id, measurements[m.id])]).filter(([, e]) => e))
  const submit = () => {
    try {
      const report = makeReport({ siteId, answers, measurements, photoAssist: photo, citizenId: citizenId() })
      addReport(report)
      setSubmitted(report)
    } catch (e) {
      setSubmitError(e.message)
    }
  }

  if (submitted) return <Done report={submitted} onDone={onDone} />

  const site = SITES.find((s) => s.id === siteId)
  const suggestion = q && photo?.suggestions?.[q.id]

  return (
    <div className="wizard">
      <div className="progress"><i style={{ width: `${(step / total) * 100}%` }} /></div>

      {step === 0 && (
        <div className="card card-pad">
          <div className="q-term">Step 1 · Where are you?</div>
          <h2 className="q-title">Choose your stream</h2>
          <div className="site-pick" style={{ margin: '12px 0' }}>
            {SITES.map((s) => (
              <button key={s.id} className={`option ${siteId === s.id ? 'selected' : ''}`} onClick={() => setSiteId(s.id)}>
                <span className="ic">📍</span><span><b>{s.name}</b><div className="small muted">{s.place}</div></span>
              </button>
            ))}
          </div>
          <div className="q-term" style={{ marginTop: 12 }}>Optional · Photo assist</div>
          <label className="drop">
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            {photoError ? <span className="cross">⚠️ {photoError}</span> : analyzing ? 'Analysing on your device…' : photo ? <img src={photo.preview} alt="Your stream photo" /> : <>📷 <b>Take or upload a photo of the stream</b><br /><span className="small">Analysed on your device — nothing is uploaded. We'll suggest answers; you confirm them.</span></>}
          </label>
        </div>
      )}

      {q && (
        <div className="card card-pad">
          <div className="q-term">Question {step} of {QUESTIONS.length} · {q.term}</div>
          <h2 className="q-title">{q.icon} {q.plain}</h2>
          {q.multi && <p className="small muted">Select all that apply.</p>}
          {suggestion && (
            <div className="assist" style={{ marginTop: 10 }}>
              🤖 <b>Photo assist suggests:</b> {[].concat(suggestion.answer).map((a) => q.options.find((o) => o.code === a)?.label).join(', ')}{' '}
              <span className="muted">(confidence {Math.round(suggestion.confidence * 100)}%)</span> — {suggestion.reason} <b>Please confirm or change it.</b>
            </div>
          )}
          <div className="options">
            {q.options.map((opt) => {
              const sel = [].concat(answers[q.id] ?? []).includes(opt.code)
              const isAi = suggestion && [].concat(suggestion.answer).includes(opt.code)
              return (
                <button key={opt.code} className={`option ${sel ? 'selected' : ''}`} onClick={() => choose(opt)}>
                  <span className="ic">{opt.icon}</span>{opt.label}
                  {isAi && <span className="ai">AI suggestion</span>}
                </button>
              )
            })}
          </div>
          <div className="why">💡 <b>Why it matters for health:</b> {q.why}</div>
        </div>
      )}

      {step === QUESTIONS.length + 1 && (
        <div className="card card-pad">
          <div className="q-term">Optional · If you have a thermometer or pH strip</div>
          <h2 className="q-title">🧪 Any measurements?</h2>
          {OPTIONAL_MEASUREMENTS.map((m) => (
            <label key={m.id} style={{ display: 'block', margin: '12px 0' }}>
              <span className="small"><b>{m.label}</b> ({m.unitLabel})</span>
              <input className="input" type="number" min={m.min} max={m.max} step={m.step} value={measurements[m.id] ?? ''} placeholder="Skip if unknown"
                onChange={(e) => { setSubmitError(null); setMeasurements({ ...measurements, [m.id]: e.target.value === '' ? undefined : e.target.value }) }} />
              {measurementErrors[m.id] && <span className="small cross">{measurementErrors[m.id]}</span>}
            </label>
          ))}
          <div className="why">Your answers become standards-based health data (HL7 FHIR, OneAquaHealth profile) that city health officers can use straight away.</div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
        {step < total - 1 ? (
          <button className="btn primary" disabled={q && answers[q.id] == null} onClick={() => setStep(step + 1)}>
            {step === 0 ? `Start at ${site.name} →` : suggestion ? 'Confirm & next →' : 'Next →'}
          </button>
        ) : (
          <button className="btn primary" onClick={submit} disabled={Object.keys(measurementErrors).length > 0}>Submit report ✓</button>
        )}
      </div>
      {submitError && <p className="small cross" style={{ textAlign: 'center', marginTop: 10 }}>{submitError}</p>}
      {q && <p className="small muted" style={{ textAlign: 'center', marginTop: 10 }}>Not sure? Pick the closest answer — several reports together make the picture reliable.</p>}
    </div>
  )
}

function Done({ report, onDone }) {
  const [modal, setModal] = useState(false)
  const [sync, setSync] = useState(null)
  const site = SITES.find((s) => s.id === report.siteId)
  const result = useMemo(() => assessSite(site), [site])
  const mine = getReports().filter((r) => r.citizenId === report.citizenId).length
  const level = [...LEVELS].reverse().find(([min]) => mine >= min)
  const nextLevel = LEVELS.find(([min]) => min > mine)
  const resources = [...report.resources.observations, report.resources.provenance]
  const validation = checkAll(report.resources.observations)

  const send = async () => {
    setSync({ state: 'sending' })
    try {
      const res = await postTransaction(syncBundle([report]).bundle)
      setSync({ state: 'ok', n: res.entry?.length })
    } catch (e) {
      setSync({ state: 'error', msg: e.message })
    }
  }

  return (
    <div className="wizard">
      <div className="card card-pad done">
        <div className="big">{level[2]}</div>
        <h2 className="q-title">Thank you, {level[1]}!</h2>
        <p className="muted">You have filed {mine} report{mine > 1 ? 's' : ''}{nextLevel ? ` — ${nextLevel[0] - mine} more to become ${nextLevel[1]} ${nextLevel[2]}` : ''}.</p>

        <div className="card card-pad" style={{ textAlign: 'left', margin: '16px 0', background: 'var(--surface-2)', boxShadow: 'none' }}>
          <b>What your report means for {site.name}</b>
          <p style={{ margin: '6px 0' }}>
            One Health risk is now <span className={`badge ${result.level}`}>{result.level} · {result.score}/100</span>, mainly from <b>{result.pathways[0].icon} {result.pathways[0].title.toLowerCase()}</b>.
          </p>
          <p className="small muted">{result.pathways[0].summary}.</p>
          {result.protective.map((p, i) => <p key={i} className="small">🌿 {p}</p>)}
        </div>

        <p className="small">
          Your report became <b>{resources.length} FHIR resources</b> ({report.resources.observations.length} OAH indicator Observations + 1 Provenance).{' '}
          Profile checks: <span className="check">{validation.passed}/{validation.total} passed</span>.
        </p>
        <div className="row wrap" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn" onClick={() => setModal(true)}>{'{ }'} View FHIR</button>
          <button className="btn" onClick={send} disabled={sync?.state === 'sending'}>☁️ Send to FHIR server</button>
          <button className="btn primary" onClick={() => onDone(site.id)}>See it on the dashboard →</button>
        </div>
        {sync && (
          <p className="small" style={{ marginTop: 10 }}>
            {sync.state === 'sending' && `Sending to ${getBase()}…`}
            {sync.state === 'ok' && <span className="check">✓ Stored on {getBase()} ({sync.n} entries)</span>}
            {sync.state === 'error' && <span className="cross">✗ {sync.msg}</span>}
          </p>
        )}
      </div>
      {modal && <JsonModal title="Citizen report — FHIR transaction" data={transactionBundle(resources)} onClose={() => setModal(false)} />}
    </div>
  )
}
