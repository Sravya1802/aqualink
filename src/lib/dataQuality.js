// Plausibility and consistency checks for OAH lab observations.
//
// The official IG examples carry summary statistics as components (average, min, max,
// median, std-dev). In several Almyros datasets the average/min/max are ~10^4 times the
// median (e.g. water temperature average 198000 °C, median 19.8 °C) — consistent with a
// decimal-separator problem during CSV import. We detect that, explain it, and fall back
// to a corrected, robust value instead of silently using garbage.

const STAT = 'http://terminology.hl7.org/CodeSystem/observation-statistics'

// Physically plausible ranges in the unit the IG uses for each code.
const RANGES = {
  waterTemperature: [-2, 45],
  703421000: [-2, 45], // SNOMED "Temperature of water"
  ph: [0, 14],
  pH: [0, 14],
  'dissolved-oxygen': [0, 20],
  nitrate: [0, 500],
  nitrite: [0, 50],
  ammonium: [0, 100],
  'total-phosphates': [0, 50],
  chloride: [0, 25000],
  sulphate: [0, 10000],
  sodium: [0, 15000],
  potassium: [0, 1000],
  calcium: [0, 2000],
  magnesium: [0, 2000],
  carbonates: [0, 1000],
  'hydrogen-carbonate-bicarbonate-hco3': [0, 2000],
  'electrical-conductivity': [0, 60000],
  conductivity: [0, 60],
  benzene: [0, 100],
  no2: [0, 500],
  o3: [0, 500],
  pm10: [0, 500],
  'pm2-5': [0, 500],
}
const METAL = /-dissolved$|chromium-6-plus/
const rangeFor = (code) => RANGES[code] || (METAL.test(code) ? [0, 5000] : null)

export const codeOf = (obs) => obs.code?.coding?.[0]?.code
export const displayOf = (obs) => obs.code?.text || obs.code?.coding?.[0]?.display || codeOf(obs)

export function statsOf(obs) {
  const out = {}
  for (const c of obs.component || []) {
    const coding = c.code?.coding?.[0]
    if (coding?.system === STAT && c.valueQuantity) out[coding.code] = c.valueQuantity
  }
  return out
}

const near = (a, b, tol = 0.35) => Math.abs(a - b) <= Math.abs(b) * tol

// Returns { value, unit, source, issues[] } for any numeric observation.
export function assessObservation(obs) {
  const code = codeOf(obs)
  const range = rangeFor(code)
  const issues = []

  if (obs.valueQuantity) {
    const q = obs.valueQuantity
    if (range && (q.value < range[0] || q.value > range[1])) {
      issues.push({ severity: 'error', rule: 'implausible-range', message: `Value ${q.value} ${q.unit || ''} is outside the plausible range ${range[0]}–${range[1]}.` })
    }
    return { value: q.value, unit: q.unit || q.code, source: 'value', issues }
  }

  const s = statsOf(obs)
  const unit = (s.median || s.average || s.maximum)?.unit
  const med = s.median?.value
  const avg = s.average?.value
  const min = s.minimum?.value
  const max = s.maximum?.value
  if (med == null && avg == null) return null

  // 1. Decimal-separator scaling: average vs median differ by a clean power of ten.
  let scale = 1
  if (avg != null && med != null && med > 0 && avg / med >= 500) {
    const k = Math.round(Math.log10(avg / med))
    if (k >= 3 && near(avg / 10 ** k, med, 0.6)) scale = 10 ** k
  }
  if (scale === 1 && range && avg != null && avg > range[1]) {
    // No usable median (e.g. median 0) — find the smallest power of ten that makes it plausible.
    for (let k = 3; k <= 6; k++) if (avg / 10 ** k <= range[1]) { scale = 10 ** k; break }
  }
  if (scale > 1) {
    issues.push({
      severity: 'error',
      rule: 'decimal-scaling',
      message: `average/min/max are ≈10^${Math.log10(scale)} × the expected magnitude (average ${avg} ${unit || ''} vs median ${med ?? 'n/a'}). Likely a decimal-separator error during import.`,
      fix: `Divide average, minimum, maximum and std-dev by ${scale.toLocaleString()}.`,
    })
  }

  const cAvg = avg != null ? avg / scale : null
  const cMin = min != null ? min / scale : null
  const cMax = max != null ? max / scale : null

  // 2. Internal consistency after correction.
  if (cMin != null && cMax != null && cMin > cMax) {
    issues.push({ severity: 'warning', rule: 'min-gt-max', message: `minimum (${cMin}) is greater than maximum (${cMax}).` })
  }
  if (cAvg != null && cMax != null && cMin != null && cMax >= cMin && (cAvg > cMax * 1.001 || cAvg < cMin * 0.999)) {
    const censored = cMin === cMax && near(cAvg, cMin / 2, 0.05)
    issues.push(
      censored
        ? { severity: 'info', rule: 'below-detection-limit', message: `All samples appear below the detection limit (${cMin} ${unit || ''}); average is the LOD/2 substitution. Treat as "< ${cMin}", not a measured concentration.` }
        : { severity: 'warning', rule: 'avg-outside-min-max', message: `average (${cAvg}) is outside [minimum ${cMin}, maximum ${cMax}].` },
    )
  }

  // 3. Range check on the value we will actually use.
  const value = med ?? cAvg
  if (range && (value < range[0] || value > range[1])) {
    issues.push({ severity: 'error', rule: 'implausible-range', message: `Value ${value} ${unit || ''} is outside the plausible range ${range[0]}–${range[1]}.` })
  }

  const censoredFlag = issues.some((i) => i.rule === 'below-detection-limit')
  return { value, unit, source: med != null ? 'median' : scale > 1 ? 'average (corrected)' : 'average', censored: censoredFlag, detectionLimit: censoredFlag ? cMin : undefined, issues }
}

export function qualityReport(observations) {
  const rows = []
  for (const obs of observations) {
    const a = assessObservation(obs)
    if (!a) continue
    for (const issue of a.issues) rows.push({ id: obs.id, code: codeOf(obs), display: displayOf(obs), subject: obs.subject?.reference, year: yearOf(obs), ...issue })
  }
  return rows
}

export const yearOf = (obs) => (obs.effectiveDateTime || obs.effectivePeriod?.start || '').slice(0, 10)
