import { describe, it, expect, beforeEach } from 'vitest'
import { all, SITES, replaceReports } from '../src/lib/store.js'
import { assessObservation, qualityReport } from '../src/lib/dataQuality.js'
import { assessSite } from '../src/lib/riskEngine.js'
import { makeReport } from '../src/lib/seed.js'
import { checkAll } from '../src/lib/validate.js'
import { buildRiskAssessment } from '../src/lib/fhirBuilders.js'

const obs = (id) => all('Observation').find((o) => o.id === id)
const site = (id) => SITES.find((s) => s.id === id)

describe('data quality guard', () => {
  it('detects decimal-separator scaling and recovers the real value', () => {
    const a = assessObservation(obs('Obs-Almyros-DissolvedOxygen-2020'))
    expect(a.issues.some((i) => i.rule === 'decimal-scaling')).toBe(true)
    expect(a.value).toBeCloseTo(5.65, 2)
  })
  it('treats all-below-detection-limit results as censored, not measured', () => {
    const a = assessObservation(obs('Obs-Almyros-LeadDissolved-2019'))
    expect(a.censored).toBe(true)
    expect(a.detectionLimit).toBe(5) // LOD 5 µg/L, average 2.5 = LOD/2
  })
  it('leaves clean data alone', () => {
    const a = assessObservation(obs('Obs-Almyros-Ammonium-2018'))
    expect(a.issues).toHaveLength(0)
  })
  it('flags >100 scaled observations in the official IG examples', () => {
    const rows = qualityReport(all('Observation'))
    expect(rows.filter((r) => r.rule === 'decimal-scaling').length).toBeGreaterThan(100)
  })
})

describe('citizen report → FHIR', () => {
  const answers = { foam: ['sewage-smell', 'foam'], riparianVegetation: '0-20-percent', 'filamentous-algae': 'lots', hydrology: 'stagnant', diptera: 'many', ticks: 'none', wildlife: ['none'] }
  it('emits OAH indicator Observations that pass profile checks, plus Provenance', () => {
    const r = makeReport({ siteId: 'Loc-AquaLink-Calore', answers, measurements: { waterTemperature: 26 } })
    const v = checkAll(r.resources.observations)
    expect(v.passed).toBe(v.total)
    expect(v.total).toBe(6 + 3 + 1) // 6 questions, 3 wildlife indicators, 1 measurement
    expect(r.resources.provenance.target).toHaveLength(v.total)
  })

  describe('risk engine', () => {
    beforeEach(() => replaceReports([]))
    it('raises a high waterborne warning from agreeing citizen reports', () => {
      replaceReports([1, 2, 3].map((i) => makeReport({ siteId: 'Loc-AquaLink-Calore', answers, citizenId: `cit-${i}` })))
      const res = assessSite(site('Loc-AquaLink-Calore'))
      expect(res.level).toBe('high')
      expect(res.alert).toBe(true)
      expect(res.confidence).toBe('high')
      expect(res.pathways.find((p) => p.key === 'waterborne').level).toBe('high')
    })
    it('stays low for a healthy stream and reports protective factors', () => {
      const healthy = { foam: ['none'], riparianVegetation: '81-100-percent', 'filamentous-algae': 'none', hydrology: 'flowing', diptera: 'none', ticks: 'none', wildlife: ['fish', 'birds'] }
      replaceReports([makeReport({ siteId: 'Loc-AquaLink-Akerselva', answers: healthy })])
      const res = assessSite(site('Loc-AquaLink-Akerselva'))
      expect(res.level).toBe('low')
      expect(res.protective.length).toBeGreaterThan(0)
    })
    it('uses corrected lab data: Almyros nickel above EU MAC-EQS', () => {
      const res = assessSite(site('Loc-Almyros'))
      const chem = res.pathways.find((p) => p.key === 'chemical')
      expect(chem.evidence.some((e) => /Nickel/.test(e.text))).toBe(true)
      expect(res.gaps.some((g) => /Mercury/.test(g))).toBe(true)
    })
    it('produces a FHIR RiskAssessment with one prediction per pathway', () => {
      const res = assessSite(site('Loc-Almyros'))
      const ra = buildRiskAssessment(site('Loc-Almyros'), res)
      expect(ra.resourceType).toBe('RiskAssessment')
      expect(ra.prediction).toHaveLength(6)
      expect(ra.prediction.every((p) => p.probabilityDecimal === undefined)).toBe(true)
      expect(ra.prediction.some((p) => /not a calibrated probability/.test(p.rationale))).toBe(true)
      expect(ra.basis.length).toBeGreaterThan(0)
    })
  })
})
