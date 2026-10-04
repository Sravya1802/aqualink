// Central validation for citizen reports: everything that enters the store or a FHIR
// bundle passes through here, whether it comes from the form or from localStorage.
import { QUESTIONS, OPTIONAL_MEASUREMENTS } from './codes.js'

const SITE_IDS = new Set([
  'Loc-Almyros', 'Loc-Giofyros', 'Loc-Giofyros-LowerReach', 'Loc-AquaLink-Calore', 'Loc-AquaLink-Akerselva',
])
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

export const isKnownSite = (id) => SITE_IDS.has(id)

// Returns an error message for one measurement value, or null if it is acceptable.
// Empty values are allowed (measurements are optional).
export function measurementError(id, raw) {
  if (raw == null || raw === '') return null
  const m = OPTIONAL_MEASUREMENTS.find((x) => x.id === id)
  if (!m) return `Unknown measurement "${id}".`
  const v = Number(raw)
  if (!Number.isFinite(v)) return `${m.label} must be a number.`
  if (v < m.min || v > m.max) return `${m.label} must be between ${m.min} and ${m.max} ${m.unitLabel}.`
  return null
}

// Validates the user-entered parts of a report. Returns a list of error messages.
export function validateReportInput({ siteId, answers, measurements, createdAt }) {
  const errors = []
  if (!isKnownSite(siteId)) errors.push(`Unknown site "${siteId}".`)

  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    errors.push('Answers are missing.')
  } else {
    for (const [qid, ans] of Object.entries(answers)) {
      const q = QUESTIONS.find((x) => x.id === qid)
      if (!q) { errors.push(`Unknown question "${qid}".`); continue }
      const codes = q.options.map((o) => o.code)
      const given = q.multi ? ans : [ans]
      if (q.multi && !Array.isArray(ans)) { errors.push(`"${qid}" expects a list of answers.`); continue }
      for (const a of given) if (!codes.includes(a)) errors.push(`"${a}" is not a valid answer to "${qid}".`)
      if (q.multi && ans.includes('none') && ans.length > 1) errors.push(`"${qid}" cannot combine "none" with other answers.`)
    }
  }

  for (const [id, raw] of Object.entries(measurements || {})) {
    const err = measurementError(id, raw)
    if (err) errors.push(err)
  }

  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) errors.push('Report time is not a valid date.')
  else if (t > Date.now() + FUTURE_TOLERANCE_MS) errors.push('Report time is in the future.')

  return errors
}

// Shape check for reports restored from localStorage. Anything that fails is dropped
// rather than allowed to crash the app.
export function isValidStoredReport(r) {
  return Boolean(
    r && typeof r === 'object' &&
    typeof r.id === 'string' &&
    typeof r.citizenId === 'string' &&
    validateReportInput(r).length === 0 &&
    r.resources && Array.isArray(r.resources.observations) && r.resources.provenance?.resourceType === 'Provenance' &&
    Array.isArray(r.resourceRefs),
  )
}
