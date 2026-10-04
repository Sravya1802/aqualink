// Structural checks against the required elements of the OAH profiles we emit.
// (Full terminology/profile validation: run the HL7 FHIR Validator with hl7.eu.fhir.oah.)
import { OAH_PROFILE } from './codes.js'

export function checkIndicatorObservation(obs) {
  const checks = [
    ['meta.profile = observation-indicators-oah', obs.meta?.profile?.includes(OAH_PROFILE.indicator)],
    ['status = final', obs.status === 'final'],
    ['code present (OAH indicator code system)', Boolean(obs.code?.coding?.[0]?.code)],
    ['subject → Location (LocationOah)', /^Location\//.test(obs.subject?.reference || '')],
    ['effective[x] present', Boolean(obs.effectiveDateTime || obs.effectivePeriod)],
    ['performer 1..*', (obs.performer || []).length > 0],
    ['value[x] is CodeableConcept or Quantity', Boolean(obs.valueCodeableConcept || obs.valueQuantity)],
    ['every component has value[x]', (obs.component || []).every((c) => c.valueCodeableConcept || c.valueQuantity || c.valueString)],
  ]
  return checks.map(([rule, ok]) => ({ rule, ok }))
}

export function checkAll(observations) {
  const results = observations.map((o) => ({ id: o.id, code: o.code?.coding?.[0]?.code, checks: checkIndicatorObservation(o) }))
  const failed = results.filter((r) => r.checks.some((c) => !c.ok))
  return { results, passed: results.length - failed.length, total: results.length }
}
