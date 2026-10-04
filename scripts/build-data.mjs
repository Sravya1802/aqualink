// Builds src/data/oah-bundle.json from the compiled OneAquaHealth FHIR IG examples.
//
// Usage:
//   git clone https://github.com/hl7-eu/oah.git && cd oah && npx fsh-sushi .
//   OAH_IG_DIR=/path/to/oah node scripts/build-data.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const igDir = process.env.OAH_IG_DIR
if (!igDir) {
  console.error('Set OAH_IG_DIR to a local clone of github.com/hl7-eu/oah (after running sushi).')
  process.exit(1)
}

const resourcesDir = join(igDir, 'fsh-generated', 'resources')
const KEEP = new Set(['Location', 'Observation', 'Group', 'Organization', 'Device'])

const entries = readdirSync(resourcesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(resourcesDir, f), 'utf8')))
  .filter((r) => KEEP.has(r.resourceType))
  .map((resource) => ({ fullUrl: `${resource.resourceType}/${resource.id}`, resource }))

const bundle = {
  resourceType: 'Bundle',
  id: 'oah-ig-examples',
  type: 'collection',
  meta: {
    source: 'https://github.com/hl7-eu/oah',
    tag: [{ system: 'https://aqualink.app/tags', code: 'oah-ig-example', display: 'Official OAH IG example data' }],
  },
  timestamp: new Date().toISOString(),
  entry: entries,
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'oah-bundle.json'), JSON.stringify(bundle))

const counts = entries.reduce((acc, e) => ({ ...acc, [e.resource.resourceType]: (acc[e.resource.resourceType] || 0) + 1 }), {})
console.log(`Wrote ${entries.length} resources`, counts)
