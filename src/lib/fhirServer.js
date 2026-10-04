// Minimal FHIR REST client. Defaults to the public HAPI R4 test server; any R4 server
// (e.g. the OAH sandbox) can be configured in the FHIR tab.
const KEY = 'aqualink.fhirBase'
export const DEFAULT_BASE = 'https://hapi.fhir.org/baseR4'

export function getBase() {
  try { return localStorage.getItem(KEY) || DEFAULT_BASE } catch { return DEFAULT_BASE }
}
export function setBase(url) {
  try { localStorage.setItem(KEY, url) } catch { /* ignore */ }
}

const headers = { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' }

export async function postTransaction(bundle, base = getBase()) {
  const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(bundle) })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.issue?.map((i) => i.diagnostics).join('; ') || res.statusText
    throw new Error(`FHIR server ${res.status}: ${msg}`)
  }
  return body
}

export async function searchCitizenObservations(locationId, base = getBase()) {
  const url = `${base}/Observation?subject=Location/${encodeURIComponent(locationId)}&_tag=https://aqualink.app/tags|citizen-science&_count=50&_sort=-date`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`FHIR server ${res.status}`)
  return res.json()
}

export async function ping(base = getBase()) {
  const res = await fetch(`${base}/metadata?_summary=true`, { headers })
  if (!res.ok) throw new Error(`FHIR server ${res.status}`)
  const cs = await res.json()
  return { fhirVersion: cs.fhirVersion, software: cs.software?.name, version: cs.software?.version }
}
