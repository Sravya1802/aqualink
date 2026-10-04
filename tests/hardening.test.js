import { describe, it, expect, beforeEach } from 'vitest'
import { SITES, replaceReports, parseStoredReports } from '../src/lib/store.js'
import { assessSite } from '../src/lib/riskEngine.js'
import { makeReport } from '../src/lib/seed.js'
import { validateReportInput, measurementError, isKnownSite } from '../src/lib/reportValidation.js'
import { syncBundle, buildRiskAssessment } from '../src/lib/fhirBuilders.js'

const site = (id) => SITES.find((s) => s.id === id)
const bad = { foam: ['sewage-smell', 'foam'], riparianVegetation: '0-20-percent', 'filamentous-algae': 'lots', hydrology: 'stagnant', diptera: 'many', ticks: 'none', wildlife: ['none'] }
const now = () => new Date().toISOString()

beforeEach(() => replaceReports([]))

describe('independent evidence', () => {
  it('one citizen submitting three times does not create high confidence', () => {
    replaceReports([1, 2, 3].map(() => makeReport({ siteId: 'Loc-AquaLink-Calore', answers: bad, citizenId: 'same-person' })))
    const res = assessSite(site('Loc-AquaLink-Calore'))
    expect(res.citizen.n).toBe(1)
    expect(res.citizen.submissions).toBe(3)
    expect(res.confidence).not.toBe('high')
  })
  it("only a citizen's latest report counts", () => {
    const healthy = { ...bad, foam: ['none'], hydrology: 'flowing', diptera: 'none', 'filamentous-algae': 'none' }
    const old = makeReport({ siteId: 'Loc-AquaLink-Calore', answers: bad, citizenId: 'a', createdAt: new Date(Date.now() - 3600e3).toISOString() })
    const latest = makeReport({ siteId: 'Loc-AquaLink-Calore', answers: healthy, citizenId: 'a' })
    replaceReports([old, latest])
    const wb = assessSite(site('Loc-AquaLink-Calore')).pathways.find((p) => p.key === 'waterborne')
    expect(wb.evidence.some((e) => /sewage/.test(e.text))).toBe(false)
  })
})

describe('insufficient evidence is not low risk', () => {
  it('pathways nothing can detect are marked insufficient, not low', () => {
    const res = assessSite(site('Loc-Almyros')) // lab data only, no citizen reports
    const tick = res.pathways.find((p) => p.key === 'tick')
    expect(tick.level).toBe('insufficient')
    expect(res.gaps.some((g) => /No data here can detect/.test(g))).toBe(true)
    expect(res.actions.every((a) => a.level !== 'insufficient')).toBe(true)
  })
  it('a citizen report makes every pathway assessable', () => {
    replaceReports([makeReport({ siteId: 'Loc-Almyros', answers: bad, citizenId: 'x' })])
    expect(assessSite(site('Loc-Almyros')).pathways.every((p) => p.level !== 'insufficient')).toBe(true)
  })
  it('RiskAssessment does not assign a risk level to insufficient pathways', () => {
    const res = assessSite(site('Loc-Almyros'))
    const ra = buildRiskAssessment(site('Loc-Almyros'), res)
    const tick = ra.prediction.find((p) => p.outcome.text === 'Tick-borne disease')
    expect(tick.qualitativeRisk).toBeUndefined()
    expect(tick.rationale).toMatch(/Insufficient evidence/)
  })
  it('old lab results are down-weighted and say so', () => {
    const chem = assessSite(site('Loc-Almyros')).pathways.find((p) => p.key === 'chemical')
    const nickel = chem.evidence.find((e) => /Nickel/.test(e.text))
    expect(nickel.text).toMatch(/2020 \(older data, weight ×0.4\)/)
    expect(nickel.weight).toBeCloseTo(0.35 * 0.4, 5)
  })
})

describe('input validation', () => {
  it('rejects out-of-range and non-numeric measurements', () => {
    expect(measurementError('waterTemperature', 999)).toMatch(/between/)
    expect(measurementError('pH', 'abc')).toMatch(/number/)
    expect(measurementError('pH', 7.2)).toBeNull()
    expect(measurementError('pH', '')).toBeNull()
    expect(() => makeReport({ siteId: 'Loc-AquaLink-Calore', answers: bad, measurements: { waterTemperature: 999 } })).toThrow(/Invalid report/)
  })
  it('rejects unknown sites, answers and future timestamps', () => {
    expect(validateReportInput({ siteId: 'nowhere', answers: bad, createdAt: now() })).toContain('Unknown site "nowhere".')
    expect(validateReportInput({ siteId: 'Loc-Almyros', answers: { foam: ['lava'] }, createdAt: now() }).join()).toMatch(/not a valid answer/)
    expect(validateReportInput({ siteId: 'Loc-Almyros', answers: { foam: ['none', 'foam'] }, createdAt: now() }).join()).toMatch(/cannot combine/)
    expect(validateReportInput({ siteId: 'Loc-Almyros', answers: bad, createdAt: '2099-01-01T00:00:00Z' }).join()).toMatch(/future/)
  })
  it('the known-site list matches the dashboard sites', () => {
    expect(SITES.every((s) => isKnownSite(s.id))).toBe(true)
  })
})

describe('corrupt storage', () => {
  it('drops malformed saved data instead of crashing', () => {
    expect(parseStoredReports('not json')).toEqual([])
    expect(parseStoredReports('{"a":1}')).toEqual([])
    expect(parseStoredReports('[null, 3, {"id":"x"}]')).toEqual([])
    const good = makeReport({ siteId: 'Loc-Almyros', answers: bad, citizenId: 'x' })
    expect(parseStoredReports(JSON.stringify([good, { ...good, siteId: 'nowhere' }]))).toHaveLength(1)
  })
})

describe('sync bundles', () => {
  it('never syncs demo reports and includes every referenced resource', () => {
    const real = makeReport({ siteId: 'Loc-AquaLink-Akerselva', answers: bad, citizenId: 'x' })
    const demo = makeReport({ siteId: 'Loc-AquaLink-Calore', answers: bad, demo: true })
    const { bundle, reportsSent, demoSkipped } = syncBundle([real, demo])
    expect(reportsSent).toBe(1)
    expect(demoSkipped).toBe(1)
    const urls = new Set(bundle.entry.map((e) => e.fullUrl))
    // Every reference in the bundle must resolve inside it.
    const refs = JSON.stringify(bundle).match(/"reference":"([A-Za-z]+\/[^"]+)"/g).map((m) => m.split('"')[3])
    for (const ref of refs) expect(urls.has(ref), ref).toBe(true)
    expect(urls.has(`Observation/${demo.resources.observations[0].id}`)).toBe(false)
  })
})
