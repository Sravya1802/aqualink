// Turns a citizen report into FHIR R4 resources that follow the OneAquaHealth IG
// (ObservationIndicatorsOah on a LocationOah), plus a Provenance that records the
// human-in-the-loop AI assist, and a RiskAssessment for the One Health risk result.
import { AQUALINK, OAH, OAH_PROFILE, UCUM, QUESTIONS, OPTIONAL_MEASUREMENTS, oahCoding, questionById } from './codes.js'
import { get } from './store.js'

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
const citizenTag = { system: 'https://aqualink.app/tags', code: 'citizen-science', display: 'Citizen science observation' }
const SURVEY = { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey', display: 'Survey' }], text: 'Citizen science' }
const METHOD = { text: 'AquaLink guided visual stream assessment (citizen science)' }

export const APP_DEVICE = {
  resourceType: 'Device',
  id: 'Dev-AquaLink-PhotoAssist',
  status: 'active',
  manufacturer: 'AquaLink (OneAquaHealth IEEE Hackathon 2026)',
  deviceName: [{ name: 'AquaLink Photo Assist', type: 'user-friendly-name' }],
  type: { text: 'Software: on-device image heuristics that pre-fill citizen answers for human confirmation' },
  version: [{ value: '0.1.0' }],
}

function answerConcept(question, optionCode) {
  const opt = question.options.find((o) => o.code === optionCode)
  return {
    coding: [{ system: opt?.system || AQUALINK, code: optionCode, display: opt?.label }],
    text: opt?.label || optionCode,
  }
}

function assistNote(report, qid) {
  const s = report.photoAssist?.suggestions?.[qid]
  if (!s) return undefined
  const confirmed = JSON.stringify([].concat(report.answers[qid])) === JSON.stringify([].concat(s.answer))
  return [{ text: `Photo assist suggested "${s.answer}" (confidence ${s.confidence.toFixed(2)}): ${confirmed ? 'confirmed' : 'corrected'} by the citizen.` }]
}

function baseObservation(report, code) {
  return {
    resourceType: 'Observation',
    id: `aql-${uuid()}`,
    meta: { profile: [OAH_PROFILE.indicator], tag: [citizenTag, ...(report.demo ? [{ system: 'https://aqualink.app/tags', code: 'synthetic-demo', display: 'Synthetic demo report' }] : [])] },
    status: 'final',
    category: [SURVEY],
    code: { coding: [code], text: code.display },
    subject: { reference: `Location/${report.siteId}` },
    effectiveDateTime: report.createdAt,
    performer: [{ identifier: { system: 'https://aqualink.app/citizen', value: report.citizenId }, display: 'Citizen scientist (pseudonymous)' }],
    method: METHOD,
  }
}

export function buildReportResources(report) {
  const observations = []

  for (const q of QUESTIONS) {
    const answer = report.answers[q.id]
    if (answer == null || (Array.isArray(answer) && answer.length === 0)) continue

    if (q.id === 'wildlife') {
      // One observation per biodiversity indicator, recording presence or absence.
      for (const opt of q.options.filter((o) => o.oah)) {
        const present = answer.includes(opt.code)
        observations.push({
          ...baseObservation(report, oahCoding(opt.oah, opt.label)),
          valueCodeableConcept: { coding: [{ system: AQUALINK, code: present ? 'present' : 'absent' }], text: present ? 'Seen' : 'Not seen' },
        })
      }
      continue
    }

    const obs = baseObservation(report, q.code)
    if (q.multi) {
      const signs = answer.filter((a) => a !== 'none')
      obs.valueCodeableConcept = signs.length
        ? { coding: [{ system: AQUALINK, code: 'abnormal', display: 'Abnormal signs observed' }], text: `${signs.length} abnormal sign(s)` }
        : answerConcept(q, 'none')
      obs.component = signs.map((s) => ({ code: { coding: [q.code] }, valueCodeableConcept: answerConcept(q, s) }))
    } else {
      obs.valueCodeableConcept = answerConcept(q, answer)
    }
    const note = assistNote(report, q.id)
    if (note) obs.note = note
    observations.push(obs)
  }

  for (const m of OPTIONAL_MEASUREMENTS) {
    const v = report.measurements?.[m.id]
    if (v == null || v === '') continue
    observations.push({ ...baseObservation(report, m.code), valueQuantity: { value: Number(v), unit: m.unitLabel, system: UCUM, code: m.unit } })
  }

  const provenance = {
    resourceType: 'Provenance',
    id: `aql-prov-${uuid()}`,
    target: observations.map((o) => ({ reference: `Observation/${o.id}` })),
    recorded: report.createdAt,
    activity: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: 'CREATE' }] },
    agent: [
      {
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author', display: 'Author' }] },
        who: { identifier: { system: 'https://aqualink.app/citizen', value: report.citizenId }, display: 'Citizen scientist (pseudonymous)' },
      },
      ...(report.photoAssist
        ? [{
            type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'assembler', display: 'Assembler' }] },
            who: { reference: `Device/${APP_DEVICE.id}`, display: 'AquaLink Photo Assist (suggestions only, confirmed by human)' },
          }]
        : []),
    ],
  }

  return { observations, provenance }
}

// FHIR transaction bundle: PUT so re-syncing is idempotent.
export function transactionBundle(resources) {
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: resources.map((resource) => ({
      fullUrl: `${resource.resourceType}/${resource.id}`,
      resource,
      request: { method: 'PUT', url: `${resource.resourceType}/${resource.id}` },
    })),
  }
}

const RISK_PROB = 'http://terminology.hl7.org/CodeSystem/risk-probability'

export function buildRiskAssessment(site, result) {
  return {
    resourceType: 'RiskAssessment',
    id: `aql-risk-${site.id}`.slice(0, 64),
    meta: { tag: [{ system: 'https://aqualink.app/tags', code: 'one-health-risk', display: 'AquaLink One Health risk assessment' }] },
    status: 'final',
    method: { text: 'AquaLink One Health pathway engine v0.1 (hazard × exposure × vulnerability, explainable rules)' },
    code: { text: 'One Health risk from urban freshwater ecosystem condition' },
    subject: { reference: `Group/${groupIdFor(site)}`, display: `Residents and visitors near ${site.name}` },
    occurrenceDateTime: new Date().toISOString(),
    performer: { reference: `Device/${APP_DEVICE.id}`, display: 'AquaLink risk engine' },
    basis: result.basis.map((ref) => ({ reference: ref })),
    prediction: result.pathways.map((p) => ({
      outcome: {
        coding: p.health.map((h) => ({ system: OAH, code: h.code, display: h.display })),
        text: p.title,
      },
      qualitativeRisk: { coding: [{ system: RISK_PROB, code: p.level, display: p.level }] },
      probabilityDecimal: Math.round(p.score) / 100,
      rationale: p.evidence.map((e) => e.text).join('; ') || 'No hazard evidence.',
    })),
    mitigation: result.actions.map((a) => `[${a.audience}] ${a.text}`).join('\n'),
    note: [{ text: `Overall score ${result.score}/100 (${result.level}). Confidence: ${result.confidence}. Scores are decision support for public-health officers, not diagnoses.` }],
  }
}

export function groupIdFor(site) {
  if (site.city === 'Loc-Benevento') return 'Group-BN-All'
  if (site.city === 'Loc-Nordre-Aker') return 'Group-OS-All'
  return `aql-group-${site.id}`.slice(0, 64)
}

export function populationGroup(site) {
  // Reuse the official OAH population group when the city has one.
  const official = get(`Group/${groupIdFor(site)}`)
  if (official) return official
  return {
    resourceType: 'Group',
    id: groupIdFor(site),
    meta: { profile: [OAH_PROFILE.group] },
    type: 'person',
    actual: false,
    name: `Residents and visitors near ${site.name}`,
    characteristic: [{
      code: { coding: [{ system: 'http://snomed.info/sct', code: '20733006', display: 'Living place' }] },
      valueReference: { reference: `Location/${site.id}` },
      exclude: false,
    }],
  }
}

export { questionById }
