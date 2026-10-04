// In-memory FHIR store: official OAH IG example data + AquaLink demo reaches + citizen
// reports persisted in localStorage. Everything the UI shows is derived from FHIR resources.
import bundle from '../data/oah-bundle.json'
import { OAH_PROFILE } from './codes.js'

const byType = {}
const byRef = {}
function index(resource) {
  ;(byType[resource.resourceType] ||= []).push(resource)
  byRef[`${resource.resourceType}/${resource.id}`] = resource
}
bundle.entry.forEach((e) => index(e.resource))

const SCT_CITY = { system: 'http://snomed.info/sct', code: '288520005', display: 'City environment' }
const demoTag = { system: 'https://aqualink.app/tags', code: 'aqualink-demo', display: 'AquaLink demo resource (not official OAH data)' }

function location(id, name, description, lat, lng, partOf) {
  return {
    resourceType: 'Location',
    id,
    meta: { profile: [OAH_PROFILE.location], tag: [demoTag] },
    identifier: [{ system: 'https://oneaquahealth.eu/location-id', value: id.toLowerCase() }],
    name,
    description,
    mode: 'instance',
    type: [{ coding: [SCT_CITY] }],
    position: { latitude: lat, longitude: lng },
    ...(partOf && { partOf: { reference: partOf } }),
  }
}

// Stream reaches in OAH cities that have health data but no stream observations yet.
// Coordinates are real river locations; the Location resources themselves are ours.
const DEMO_LOCATIONS = [
  location('Loc-AquaLink-Calore', 'Fiume Calore — Ponte Vanvitelli', 'Calore river reach in Benevento city centre (AquaLink citizen-science site).', 41.1336, 14.7696, 'Location/Loc-Benevento'),
  location('Loc-AquaLink-Akerselva', 'Akerselva — Nydalen', 'Akerselva river reach in Nordre Aker, Oslo (AquaLink citizen-science site).', 59.9497, 10.7657, 'Location/Loc-Nordre-Aker'),
]
DEMO_LOCATIONS.forEach(index)

// The dashboard shows stream sites. Each site knows which Location ids hold its own
// observations and which city its population health context comes from.
export const SITES = [
  { id: 'Loc-Almyros', name: 'Almyros stream', place: 'Heraklion, Crete (GR)', city: 'Almyros', locIds: ['Loc-Almyros', 'Almyros'] },
  { id: 'Loc-Giofyros', name: 'Giofyros river', place: 'Heraklion, Crete (GR)', city: 'Giofyros', locIds: ['Loc-Giofyros', 'Giofyros'] },
  { id: 'Loc-Giofyros-LowerReach', name: 'Giofyros — lower reach', place: 'Heraklion, Crete (GR)', city: 'Giofyros', locIds: ['Loc-Giofyros-LowerReach'] },
  { id: 'Loc-AquaLink-Calore', name: 'Fiume Calore', place: 'Benevento (IT)', city: 'Loc-Benevento', locIds: ['Loc-AquaLink-Calore'] },
  { id: 'Loc-AquaLink-Akerselva', name: 'Akerselva', place: 'Nordre Aker, Oslo (NO)', city: 'Loc-Nordre-Aker', locIds: ['Loc-AquaLink-Akerselva'] },
].map((s) => {
  const loc = byRef[`Location/${s.id}`]
  return { ...s, lat: loc.position.latitude, lng: loc.position.longitude, official: !s.id.startsWith('Loc-AquaLink') }
})

export const get = (ref) => byRef[ref]
export const all = (type) => byType[type] || []
export const officialBundle = bundle

// Location ids that roll up to a city root (via Location.partOf), including the root.
export function cityLocationIds(rootId) {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const l of all('Location')) {
      const parent = l.partOf?.reference?.split('/')[1]
      if (parent && ids.has(parent) && !ids.has(l.id)) { ids.add(l.id); grew = true }
    }
  }
  return ids
}

const subjectId = (obs) => obs.subject?.reference?.split('/')[1]
const profileOf = (obs) => obs.meta?.profile?.[0]

export function labObservations(site) {
  const ids = new Set(site.locIds)
  return all('Observation').filter((o) => ids.has(subjectId(o)) && profileOf(o) !== OAH_PROFILE.healthMeasure)
}

export function healthObservations(site) {
  const ids = cityLocationIds(site.city)
  return all('Observation').filter((o) => ids.has(subjectId(o)) && profileOf(o) === OAH_PROFILE.healthMeasure)
}

export function airObservations(site) {
  const ids = cityLocationIds(site.city)
  return all('Observation').filter((o) => ids.has(subjectId(o)) && o.code?.coding?.[0]?.system?.endsWith('air-parameters'))
}

// ---- Citizen reports (localStorage) ----
const KEY = 'aqualink.reports.v1'
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
let reports = load()
const listeners = new Set()

export const getReports = () => reports
export const reportsFor = (siteId) => reports.filter((r) => r.siteId === siteId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
export function addReport(report) {
  reports = [report, ...reports]
  try { localStorage.setItem(KEY, JSON.stringify(reports)) } catch { /* storage unavailable — keep in memory */ }
  listeners.forEach((fn) => fn())
}
export function replaceReports(next) {
  reports = next
  try { localStorage.setItem(KEY, JSON.stringify(reports)) } catch { /* ignore */ }
  listeners.forEach((fn) => fn())
}
export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const demoLocations = DEMO_LOCATIONS
