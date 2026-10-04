// One Health risk engine: risk = hazard × exposure × vulnerability, per exposure pathway.
// Every point of score is traceable to a piece of evidence (citizen report, lab result or
// population health measure) so officers can see *why*, not just *what*.
import { HEALTH } from './codes.js'
import { assessObservation, codeOf, yearOf } from './dataQuality.js'
import { labObservations, healthObservations, reportsFor, get } from './store.js'

const h = (...codes) => codes.map((code) => ({ code, display: HEALTH[code] }))

export const PATHWAYS = {
  waterborne: {
    title: 'Waterborne infection',
    icon: '🦠',
    summary: 'Sewage or organic pollution → contact with water → gut infections',
    health: h('gastrointestinal', 'escherichia-coli', 'campylobacter', 'cryptosporidium', 'giarda', 'salmonella'),
  },
  algae: {
    title: 'Harmful algal bloom',
    icon: '🟢',
    summary: 'Excess nutrients + warm still water → algal toxins',
    health: h('gastrointestinal', 'accidental-poisoning'),
  },
  vector: {
    title: 'Mosquito-borne disease',
    icon: '🦟',
    summary: 'Stagnant warm pools → mosquito breeding → e.g. West Nile virus',
    health: h('infective-and-parasitic'),
  },
  tick: {
    title: 'Tick-borne disease',
    icon: '🕷️',
    summary: 'Ticks in riverside vegetation → Lyme disease',
    health: h('borrelia'),
  },
  chemical: {
    title: 'Chemical contamination',
    icon: '⚗️',
    summary: 'Metals, hydrocarbons or salts above environmental quality standards',
    health: h('accidental-poisoning', 'long-term-disease'),
  },
  wellbeing: {
    title: 'Lost green-blue health benefits',
    icon: '🧠',
    summary: 'Degraded, unpleasant streams → people stop walking there → mental and physical health',
    health: h('mental-health', 'no-physical-activity'),
  },
}

// EU Environmental Quality Standards (Directive 2013/39/EU, MAC-EQS, µg/L) and common
// freshwater guide values. Used for evidence, never as a diagnosis.
const EQS_UG = { 'lead-dissolved': 14, 'cadmium-dissolved': 1.5, 'mercury-dissolved': 0.07, 'nickel-dissolved': 34, 'arsenic-dissolved': 10 }

const levelOf = (score) => (score >= 55 ? 'high' : score >= 25 ? 'moderate' : 'low')
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Latest corrected value + series per lab code.
export function labSummary(site) {
  const out = {}
  for (const obs of labObservations(site)) {
    const a = assessObservation(obs)
    if (!a || a.value == null) continue
    const code = codeOf(obs) === '703421000' ? 'waterTemperature' : codeOf(obs)
    const year = yearOf(obs)
    const entry = (out[code] ||= { code, display: obs.code?.text || obs.code?.coding?.[0]?.display, unit: a.unit, series: [] })
    entry.series.push({ date: year, value: a.value, censored: a.censored, detectionLimit: a.detectionLimit, issues: a.issues, ref: `Observation/${obs.id}` })
  }
  for (const e of Object.values(out)) {
    e.series.sort((x, y) => x.date.localeCompare(y.date))
    e.latest = e.series[e.series.length - 1]
  }
  return out
}

// Share of recent citizen reports that gave each answer.
function citizenSummary(siteId) {
  const reports = reportsFor(siteId)
  if (!reports.length) return { n: 0, share: () => 0, reports }
  const newest = new Date(reports[0].createdAt).getTime()
  const recent = reports.filter((r) => newest - new Date(r.createdAt).getTime() <= 30 * 864e5)
  const share = (qid, code) => recent.filter((r) => [].concat(r.answers[qid] ?? []).includes(code)).length / recent.length
  return { n: recent.length, share, reports: recent }
}

function healthContext(site) {
  const obs = healthObservations(site)
  const by = {}
  for (const o of obs) {
    const code = codeOf(o)
    const v = o.valueQuantity?.value
    if (v == null) continue
    ;(by[code] ||= { code, display: o.code?.coding?.[0]?.display, values: [], refs: [] })
    by[code].values.push(v)
    by[code].refs.push(`Observation/${o.id}`)
  }
  for (const e of Object.values(by)) e.mean = e.values.reduce((a, b) => a + b, 0) / e.values.length
  return by
}

export function assessSite(site) {
  const labs = labSummary(site)
  const cit = citizenSummary(site.id)
  const health = healthContext(site)
  const ev = Object.fromEntries(Object.keys(PATHWAYS).map((k) => [k, []]))
  const basis = new Set()
  const gaps = []

  const add = (pathway, weight, text, source, refs = []) => {
    ev[pathway].push({ weight, text, source })
    refs.forEach((r) => basis.add(r))
  }
  const pct = (s) => `${Math.round(s * cit.n)} of ${cit.n} recent report${cit.n > 1 ? 's' : ''}`
  const citRefs = cit.reports.flatMap((r) => r.resourceRefs || [])

  // ---- Citizen evidence (weighted by share of agreeing reports) ----
  if (cit.n) {
    citRefs.forEach((r) => basis.add(r))
    const c = (qid, code, pathway, w, label) => {
      const s = cit.share(qid, code)
      if (s > 0) add(pathway, w * s, `${pct(s)}: ${label}`, 'citizen')
    }
    c('foam', 'sewage-smell', 'waterborne', 0.45, 'sewage or rotten smell')
    c('foam', 'foam', 'waterborne', 0.2, 'foam on the surface')
    c('foam', 'colour', 'waterborne', 0.1, 'unusual water colour')
    c('hydrology', 'stagnant', 'waterborne', 0.15, 'still, stagnant pools')
    c('filamentous-algae', 'lots', 'algae', 0.5, 'heavy algae / green water')
    c('filamentous-algae', 'some', 'algae', 0.2, 'some filamentous algae')
    c('foam', 'colour', 'algae', 0.1, 'unusual water colour')
    c('hydrology', 'stagnant', 'algae', 0.15, 'still water favours blooms')
    c('hydrology', 'slow', 'algae', 0.05, 'slow flow')
    c('diptera', 'many', 'vector', 0.5, 'many mosquito larvae / flies')
    c('diptera', 'few', 'vector', 0.2, 'a few mosquito larvae / flies')
    c('hydrology', 'stagnant', 'vector', 0.25, 'still pools = breeding habitat')
    c('hydrology', 'slow', 'vector', 0.1, 'slow water')
    c('ticks', 'present', 'tick', 0.6, 'ticks found near the bank')
    c('foam', 'oil-sheen', 'chemical', 0.35, 'oily sheen on the water')
    c('foam', 'colour', 'chemical', 0.15, 'unusual water colour')
    c('riparianVegetation', '0-20-percent', 'wellbeing', 0.4, 'banks almost bare')
    c('riparianVegetation', '21-40-percent', 'wellbeing', 0.2, 'banks patchy')
    c('foam', 'sewage-smell', 'wellbeing', 0.15, 'unpleasant smell deters visitors')
    c('wildlife', 'none', 'wellbeing', 0.15, 'no fish, frogs or birds seen')
    c('hydrology', 'dry', 'wellbeing', 0.1, 'dry stream bed')
    const dense = cit.share('riparianVegetation', '61-80-percent') + cit.share('riparianVegetation', '81-100-percent')
    if (cit.share('ticks', 'present') > 0 && dense > 0) add('tick', 0.15 * dense, 'dense bank vegetation is tick habitat', 'citizen')

    const temps = cit.reports.map((r) => Number(r.measurements?.waterTemperature)).filter((t) => !Number.isNaN(t) && t > 0)
    if (temps.length) {
      const t = Math.max(...temps)
      if (t > 25) { add('vector', 0.2, `citizen-measured water ${t} °C (> 25 °C)`, 'citizen'); add('algae', 0.2, `water ${t} °C favours blooms`, 'citizen'); add('waterborne', 0.1, `warm water ${t} °C helps bacteria survive`, 'citizen') }
      else if (t > 20) { add('vector', 0.1, `citizen-measured water ${t} °C (> 20 °C)`, 'citizen'); add('algae', 0.1, `water ${t} °C`, 'citizen') }
    }
  } else {
    gaps.push('No citizen reports yet for this site — launch a "first report" challenge.')
  }

  // ---- Lab / sensor evidence (data-quality corrected) ----
  const L = (code) => labs[code]?.latest
  const ref = (code) => [labs[code].latest.ref]
  if (L('nitrate')?.value > 50) add('waterborne', 0.25, `nitrate ${L('nitrate').value} mg/L > 50 mg/L (EU Nitrates Directive)`, 'lab', ref('nitrate'))
  else if (L('nitrate')?.value > 25) add('algae', 0.1, `nitrate ${L('nitrate').value} mg/L (elevated nutrients)`, 'lab', ref('nitrate'))
  if (L('ammonium')?.value > 0.5) add('waterborne', 0.3, `ammonium ${L('ammonium').value} mg/L > 0.5 mg/L (sewage marker)`, 'lab', ref('ammonium'))
  if (L('total-phosphates')?.value > 0.1) add('algae', 0.3, `total phosphates ${L('total-phosphates').value} mg/L > 0.1 mg/L`, 'lab', ref('total-phosphates'))
  const doS = labs['dissolved-oxygen']
  if (doS) {
    const last = doS.latest.value
    if (last < 5) add('waterborne', 0.3, `dissolved oxygen ${last} mg/L < 5 mg/L (organic pollution)`, 'lab', ref('dissolved-oxygen'))
    else if (last < 6) add('waterborne', 0.15, `dissolved oxygen ${last} mg/L is low (< 6 mg/L)`, 'lab', ref('dissolved-oxygen'))
    const peak = Math.max(...doS.series.slice(-3).map((p) => p.value))
    if (peak > 0 && (peak - last) / peak > 0.25) add('waterborne', 0.1, `dissolved oxygen fell ${Math.round(((peak - last) / peak) * 100)}% in recent years (${peak} → ${last} mg/L)`, 'lab', ref('dissolved-oxygen'))
  }
  const temp = L('waterTemperature')
  if (temp?.value > 25) { add('vector', 0.2, `water temperature ${temp.value} °C`, 'lab', ref('waterTemperature')); add('algae', 0.2, `water temperature ${temp.value} °C`, 'lab', ref('waterTemperature')) }
  else if (temp?.value > 20) add('vector', 0.1, `water temperature ${temp.value} °C`, 'lab', ref('waterTemperature'))
  const ec = L('conductivity')?.value != null ? L('conductivity').value * 1000 : L('electrical-conductivity')?.value
  const ecCode = L('conductivity') ? 'conductivity' : 'electrical-conductivity'
  if (ec > 1500) add('chemical', 0.25, `conductivity ${Math.round(ec)} µS/cm > 1500 µS/cm (high salinity: seawater intrusion or urban runoff)`, 'lab', ref(ecCode))
  for (const [code, eqs] of Object.entries(EQS_UG)) {
    const p = L(code)
    if (!p) continue
    if (p.censored) {
      if (p.detectionLimit > eqs) gaps.push(`${labs[code].display}: lab detection limit (${p.detectionLimit} µg/L) is above the EU standard (${eqs} µg/L) — results cannot rule out exceedance.`)
    } else if (p.value > eqs) add('chemical', 0.35, `${labs[code].display} ${p.value} µg/L > EU MAC-EQS ${eqs} µg/L (Dir. 2013/39/EU)`, 'lab', ref(code))
  }
  const years = Object.values(labs).map((l) => l.latest.date).sort()
  const newestLab = years[years.length - 1]
  if (newestLab && new Date().getFullYear() - Number(newestLab.slice(0, 4)) >= 3) gaps.push(`Most recent lab data is from ${newestLab.slice(0, 4)} — citizen reports are the only current signal.`)
  if (!newestLab) gaps.push('No lab or sensor data for this site.')

  // ---- Vulnerability from population health (OAH HealthMeasure observations) ----
  const mean = (code) => health[code]?.mean
  const chronic = Math.max(mean('long-term-disease') ?? 0, mean('diabate-copd-cvd') ?? 0, mean('cvd') ?? 0, mean('diabetes') ?? 0)
  const mental = Math.max(mean('mental-health') ?? 0, mean('no-physical-activity') ?? 0)
  const obesity = Math.max(mean('obesity') ?? 0, mean('bmi-above-30') ?? 0)
  const vulnInfect = 1 + clamp((chronic - 10) / 100, 0, 0.3)
  const vulnWell = 1 + clamp((mental - 5) / 50, 0, 0.2) + clamp((obesity - 10) / 100, 0, 0.1)
  const healthUsed = Object.values(health)
  healthUsed.forEach((e) => e.refs.forEach((r) => basis.add(r)))
  if (!healthUsed.length) gaps.push('No population health data linked — connect the local health registry via OAH HealthMeasure observations to weight risk by vulnerability.')

  const loc = get(`Location/${site.id}`)
  const exposure = /urban|city/i.test(`${loc?.description} ${loc?.name}`) ? 1 : 0.8

  const vuln = { waterborne: vulnInfect, algae: vulnInfect, vector: vulnInfect, tick: 1, chemical: vulnInfect, wellbeing: vulnWell }
  const pathways = Object.entries(PATHWAYS).map(([key, def]) => {
    const evidence = ev[key].sort((a, b) => b.weight - a.weight)
    const hazard = clamp(evidence.reduce((s, e) => s + e.weight, 0), 0, 1)
    const score = clamp(Math.round(100 * hazard * exposure * vuln[key]), 0, 100)
    return { key, ...def, hazard, exposure, vulnerability: vuln[key], score, level: levelOf(score), evidence }
  }).sort((a, b) => b.score - a.score)

  const top = pathways[0]
  const score = top.score
  const level = levelOf(score)
  const sources = (cit.n ? 1 : 0) + (newestLab ? 1 : 0) + (healthUsed.length ? 1 : 0)
  const confidence = cit.n >= 3 && sources >= 2 ? 'high' : cit.n >= 1 || sources >= 2 ? 'medium' : 'low'

  const protective = []
  if (cit.n) {
    const dense = cit.share('riparianVegetation', '61-80-percent') + cit.share('riparianVegetation', '81-100-percent')
    if (dense >= 0.5) protective.push('Mostly green banks — natural filter and an attractive place to walk.')
    const wild = ['fish', 'amphibians', 'birds'].filter((w) => cit.share('wildlife', w) > 0)
    if (wild.length) protective.push(`Wildlife reported: ${wild.join(', ')} — a sign of a functioning ecosystem.`)
  }

  return {
    site, score, level, confidence, pathways, labs, health, citizen: { n: cit.n }, exposure,
    vulnerability: { infection: vulnInfect, wellbeing: vulnWell, chronic, mental, obesity },
    gaps, protective, actions: actionsFor(pathways, cit.n), basis: [...basis], alert: level === 'high' || pathways.filter((p) => p.level !== 'low').length >= 2,
  }
}

const ACTIONS = {
  waterborne: [
    ['Public health', 'Issue a no-contact advisory (no wading, swimming or dogs) and request E. coli / enterococci sampling within 48 h.'],
    ['Water utility', 'Inspect upstream outfalls and combined-sewer overflows.'],
    ['Citizens', 'Avoid touching the water; wash hands after visits; keep dogs out.'],
  ],
  algae: [
    ['Public health', 'Test for cyanotoxins and post bloom warning signs.'],
    ['Citizens', 'Keep children and dogs away from green or scummy water.'],
  ],
  vector: [
    ['Vector control', 'Inspect still pools for larvae; apply larval source management.'],
    ['Citizens', 'Use repellent at dusk; empty standing water nearby.'],
  ],
  tick: [
    ['Parks', 'Mow path edges and add "check for ticks" signs.'],
    ['Citizens', 'Do a tick check after riverside walks.'],
  ],
  chemical: [
    ['Environment agency', 'Collect lab samples for metals / hydrocarbons and trace the source.'],
    ['Citizens', 'Report the exact spot and time; avoid contact.'],
  ],
  wellbeing: [
    ['City planning', 'Prioritise riparian planting and a clean-up as a nature-based solution.'],
    ['Community', 'Run a citizen planting / clean-up day to bring people back to the stream.'],
  ],
}

function actionsFor(pathways, n) {
  const out = []
  for (const p of pathways.filter((x) => x.level !== 'low')) {
    for (const [audience, text] of ACTIONS[p.key]) out.push({ audience, text, pathway: p.key, level: p.level })
  }
  if (n < 3) out.push({ audience: 'Citizen science team', text: 'Launch a 7-day reporting challenge here to raise confidence (need ≥ 3 independent reports).', pathway: 'data', level: 'info' })
  return out
}
