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
const TIMEOUT_MS = 20000

// fetch with a timeout and readable network errors.
async function request(url, options = {}) {
  try {
    return await fetch(url, { ...options, headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    if (e.name === 'TimeoutError') throw new Error(`FHIR server did not respond within ${TIMEOUT_MS / 1000} s.`)
    throw new Error(`Could not reach the FHIR server (${e.message}). Check the URL and your connection.`)
  }
}

export async function postTransaction(bundle, base = getBase()) {
  const res = await request(base, { method: 'POST', body: JSON.stringify(bundle) })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.issue?.map((i) => i.diagnostics).join('; ') || res.statusText
    throw new Error(`FHIR server ${res.status}: ${msg}`)
  }
  return body
}

export async function searchCitizenObservations(locationId, base = getBase()) {
  const url = `${base}/Observation?subject=Location/${encodeURIComponent(locationId)}&_tag=https://aqualink.app/tags|citizen-science&_count=50&_sort=-date`
  const res = await request(url)
  if (!res.ok) throw new Error(`FHIR server ${res.status}`)
  return res.json()
}

export async function ping(base = getBase()) {
  const res = await request(`${base}/metadata?_summary=true`)
  if (!res.ok) throw new Error(`FHIR server ${res.status}`)
  const cs = await res.json()
  return { fhirVersion: cs.fhirVersion, software: cs.software?.name, version: cs.software?.version }
}
