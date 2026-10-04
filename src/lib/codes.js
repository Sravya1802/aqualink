// Terminology from the OneAquaHealth FHIR IG (hl7.eu.fhir.oah) plus the plain-language
// citizen questions that map onto it.

export const OAH = 'http://hl7.eu/fhir/ig/oah/CodeSystem/temporarySystem-oah-eu'
export const OAH_PROFILE = {
  indicator: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-indicators-oah',
  healthMeasure: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-health-measure-oah',
  withComponent: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/observation-with-component-oah',
  location: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/location-oah',
  group: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/group-oah',
}
export const AQUALINK = 'https://aqualink.app/fhir/CodeSystem/citizen-answer'
export const UCUM = 'http://unitsofmeasure.org'

export const oahCoding = (code, display) => ({ system: OAH, code, display })

// Each question is one OAH indicator. `plain` is what citizens see; `term` is the
// scientific concept it maps to, so we teach the vocabulary instead of hiding it.
export const QUESTIONS = [
  {
    id: 'foam',
    code: oahCoding('foam', 'Foam/colour/smell'),
    icon: '🫧',
    plain: 'Does the water look or smell unusual?',
    term: 'Foam / colour / smell',
    why: 'Foam, odd colours or a sewage smell often mean wastewater is entering the stream — the main route for gut infections like E. coli or Campylobacter.',
    multi: true,
    options: [
      { code: 'none', label: 'Looks and smells normal', icon: '✅' },
      { code: 'foam', label: 'Foam on the surface', icon: '🫧' },
      { code: 'colour', label: 'Unusual colour', icon: '🎨' },
      { code: 'sewage-smell', label: 'Sewage or rotten smell', icon: '🤢' },
      { code: 'oil-sheen', label: 'Oily rainbow sheen', icon: '🌈' },
    ],
  },
  {
    id: 'riparianVegetation',
    code: oahCoding('riparianVegetation', 'Riparian vegetation'),
    icon: '🌳',
    plain: 'How much of the bank is covered by plants?',
    term: 'Riparian vegetation cover',
    why: 'Plants along the banks filter runoff, shade the water and make the stream a place people want to walk — linked to better mental health and more physical activity.',
    options: [
      { code: '0-20-percent', label: 'Almost bare (0–20%)', icon: '🟫', system: OAH },
      { code: '21-40-percent', label: 'Patchy (21–40%)', icon: '🌱', system: OAH },
      { code: '41-60-percent', label: 'About half (41–60%)', icon: '🌿', system: OAH },
      { code: '61-80-percent', label: 'Mostly green (61–80%)', icon: '🌳', system: OAH },
      { code: '81-100-percent', label: 'Fully green (81–100%)', icon: '🌲', system: OAH },
    ],
  },
  {
    id: 'filamentous-algae',
    code: oahCoding('filamentous-algae', 'Filamentous algae'),
    icon: '🟢',
    plain: 'Do you see green slime or stringy algae in the water?',
    term: 'Filamentous algae (eutrophication sign)',
    why: 'Thick algae means too many nutrients (often from fertiliser or sewage). Some blooms produce toxins harmful to people, dogs and fish.',
    options: [
      { code: 'none', label: 'None', icon: '💧' },
      { code: 'some', label: 'A little', icon: '🟩' },
      { code: 'lots', label: 'A lot / water looks green', icon: '🟢' },
    ],
  },
  {
    id: 'hydrology',
    code: oahCoding('hydrology', 'Hydrology of the stream'),
    icon: '🌊',
    plain: 'How is the water moving?',
    term: 'Hydrology / flow type',
    why: 'Still, warm pools are where mosquitoes breed and where bacteria build up.',
    options: [
      { code: 'flowing', label: 'Flowing well', icon: '🌊' },
      { code: 'slow', label: 'Slow', icon: '〰️' },
      { code: 'stagnant', label: 'Still pools', icon: '🟦' },
      { code: 'dry', label: 'Dry bed', icon: '🏜️' },
    ],
  },
  {
    id: 'diptera',
    code: oahCoding('diptera', 'Diptera'),
    icon: '🦟',
    plain: 'Do you see mosquito larvae or swarms of small flies?',
    term: 'Diptera (Culicidae / Psychodidae)',
    why: 'Mosquitoes and sandflies can carry diseases such as West Nile virus. Seeing them early lets the city act before a season starts.',
    options: [
      { code: 'none', label: 'None', icon: '✅' },
      { code: 'few', label: 'A few', icon: '🦟' },
      { code: 'many', label: 'Many', icon: '⚠️' },
    ],
  },
  {
    id: 'ticks',
    code: oahCoding('ticks', 'Ticks'),
    icon: '🕷️',
    plain: 'Did you find ticks in the grass near the stream?',
    term: 'Ticks (Ixodes spp.)',
    why: 'Ticks in riverside grass can transmit Lyme disease (Borrelia).',
    options: [
      { code: 'none', label: 'No', icon: '✅' },
      { code: 'present', label: 'Yes', icon: '🕷️' },
    ],
  },
  {
    id: 'wildlife',
    code: oahCoding('birds', 'Birds'),
    icon: '🐸',
    plain: 'Which animals did you see? (good news counts too!)',
    term: 'Biodiversity indicators — fish, amphibians, birds',
    why: 'Fish, frogs and water birds only thrive in healthy streams. They are a sign the ecosystem is working.',
    multi: true,
    options: [
      { code: 'none', label: 'None', icon: '➖' },
      { code: 'fish', label: 'Fish', icon: '🐟', oah: 'fish' },
      { code: 'amphibians', label: 'Frogs / newts', icon: '🐸', oah: 'amphibians' },
      { code: 'birds', label: 'Water birds', icon: '🦆', oah: 'birds' },
    ],
  },
]

export const OPTIONAL_MEASUREMENTS = [
  { id: 'waterTemperature', code: oahCoding('waterTemperature', 'Water temperature'), label: 'Water temperature', unit: 'Cel', unitLabel: '°C', min: -2, max: 45, step: 0.1 },
  { id: 'pH', code: oahCoding('pH', 'pH'), label: 'pH (test strip)', unit: '[pH]', unitLabel: 'pH', min: 0, max: 14, step: 0.1 },
]

// Health indicators from HealthIndicatorsOahVs that our pathways can point to.
export const HEALTH = {
  gastrointestinal: '% of people with Cases of Gastrointestinal diseases',
  campylobacter: '% of people with Campylobacter',
  cryptosporidium: '% of people with Cryptosporidium',
  'escherichia-coli': '% of people with Escherichia Coli',
  giarda: '% of people with Giarda',
  salmonella: '% of people with Salmonella',
  borrelia: '% of people with Borrelia Burgdoferi',
  'infective-and-parasitic': '% of deaths due to infective and parasitic diseases',
  'accidental-poisoning': '% of deaths due to accidental poisoning',
  'mental-health': '% of people experience with mental health issues',
  'no-physical-activity': '% of people not engaging in physical activity',
  'long-term-disease': '% of people with long-term disease',
}

export const questionById = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]))
