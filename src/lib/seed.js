// Synthetic demo reports so the dashboard tells a story on first load. They are tagged
// `synthetic-demo` in FHIR and labelled "Demo" in the UI; real reports replace them.
import { buildReportResources } from './fhirBuilders.js'
import { getReports, replaceReports } from './store.js'

const ago = (hours) => new Date(Date.now() - hours * 3600e3).toISOString()

const DEMO = [
  { siteId: 'Loc-AquaLink-Calore', h: 50, answers: { foam: ['foam', 'sewage-smell'], riparianVegetation: '21-40-percent', 'filamentous-algae': 'some', hydrology: 'stagnant', diptera: 'few', ticks: 'none', wildlife: ['none'] }, measurements: { waterTemperature: 23.5 } },
  { siteId: 'Loc-AquaLink-Calore', h: 26, answers: { foam: ['sewage-smell'], riparianVegetation: '21-40-percent', 'filamentous-algae': 'some', hydrology: 'slow', diptera: 'many', ticks: 'none', wildlife: ['birds'] }, measurements: {} },
  { siteId: 'Loc-AquaLink-Calore', h: 3, answers: { foam: ['foam', 'sewage-smell', 'colour'], riparianVegetation: '0-20-percent', 'filamentous-algae': 'lots', hydrology: 'stagnant', diptera: 'many', ticks: 'none', wildlife: ['none'] }, measurements: { waterTemperature: 25.8, pH: 8.4 } },
  { siteId: 'Loc-AquaLink-Akerselva', h: 70, answers: { foam: ['none'], riparianVegetation: '81-100-percent', 'filamentous-algae': 'none', hydrology: 'flowing', diptera: 'none', ticks: 'present', wildlife: ['fish', 'birds'] }, measurements: { waterTemperature: 9.2 } },
  { siteId: 'Loc-AquaLink-Akerselva', h: 20, answers: { foam: ['none'], riparianVegetation: '61-80-percent', 'filamentous-algae': 'none', hydrology: 'flowing', diptera: 'none', ticks: 'none', wildlife: ['fish', 'amphibians', 'birds'] }, measurements: {} },
  { siteId: 'Loc-Giofyros', h: 30, answers: { foam: ['colour'], riparianVegetation: '21-40-percent', 'filamentous-algae': 'lots', hydrology: 'slow', diptera: 'few', ticks: 'none', wildlife: ['birds'] }, measurements: { waterTemperature: 24.1 } },
  { siteId: 'Loc-Giofyros-LowerReach', h: 8, answers: { foam: ['oil-sheen', 'colour'], riparianVegetation: '0-20-percent', 'filamentous-algae': 'some', hydrology: 'stagnant', diptera: 'many', ticks: 'none', wildlife: ['none'] }, measurements: { waterTemperature: 26.4 } },
]

export function makeReport({ siteId, answers, measurements, photoAssist, demo = false, createdAt = new Date().toISOString(), citizenId }) {
  const report = {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now()),
    siteId,
    createdAt,
    citizenId: citizenId || 'demo-citizen',
    answers,
    measurements: measurements || {},
    photoAssist: photoAssist ? { suggestions: photoAssist.suggestions } : undefined,
    demo,
  }
  const { observations, provenance } = buildReportResources(report)
  report.resources = { observations, provenance }
  report.resourceRefs = observations.map((o) => `Observation/${o.id}`)
  return report
}

export function ensureSeed() {
  if (getReports().length) return
  replaceReports(DEMO.map((d, i) => makeReport({ ...d, demo: true, createdAt: ago(d.h), citizenId: `demo-${(i % 3) + 1}` })))
}

export function resetDemo() {
  replaceReports([])
  ensureSeed()
}
