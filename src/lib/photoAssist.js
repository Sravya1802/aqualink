// On-device photo assist. Runs entirely in the browser (no upload, no API key): it reads
// pixel colours and turns them into *suggested* answers with a confidence and a reason.
// The citizen always confirms or corrects each suggestion — the human stays in the loop.

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max ? d / max : 0, max]
}

function classify(h, s, v) {
  if (s < 0.12 && v > 0.82) return 'white'
  if (v < 0.15) return 'dark'
  if (h >= 65 && h < 170 && s > 0.22 && v > 0.18) return 'green'
  if (h >= 18 && h < 55 && s > 0.25 && v < 0.75) return 'brown'
  if (h >= 170 && h < 250 && s > 0.15) return 'blue'
  return 'other'
}

export async function analyzePhoto(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const W = 160
    const H = Math.max(1, Math.round((img.height / img.width) * W))
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, W, H)
    const { data } = ctx.getImageData(0, 0, W, H)

    // Upper 55% ≈ banks and vegetation, lower 45% ≈ water surface (typical stream photo).
    const split = Math.round(H * 0.55)
    const count = (y0, y1) => {
      const c = { white: 0, dark: 0, green: 0, brown: 0, blue: 0, other: 0 }
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4
          c[classify(...rgbToHsv(data[i], data[i + 1], data[i + 2]))]++
        }
      }
      const n = (y1 - y0) * W || 1
      return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]))
    }
    const all = count(0, H)
    const bank = count(0, split)
    const water = count(split, H)

    const suggestions = {}
    const green = Math.max(all.green, bank.green)
    const veg = green < 0.1 ? '0-20-percent' : green < 0.25 ? '21-40-percent' : green < 0.45 ? '41-60-percent' : green < 0.65 ? '61-80-percent' : '81-100-percent'
    suggestions.riparianVegetation = { answer: veg, confidence: 0.55 + Math.min(0.2, Math.abs(green - 0.35)), reason: `${Math.round(green * 100)}% of the bank area is vegetation-green.` }

    const algae = water.green > 0.35 ? 'lots' : water.green > 0.15 ? 'some' : 'none'
    suggestions['filamentous-algae'] = { answer: algae, confidence: algae === 'none' ? 0.5 : 0.6, reason: `${Math.round(water.green * 100)}% of the water area is green.` }

    const signs = []
    if (water.white > 0.08) signs.push('foam')
    if (water.brown > 0.35) signs.push('colour')
    suggestions.foam = signs.length
      ? { answer: signs, confidence: 0.55, reason: [water.white > 0.08 && `${Math.round(water.white * 100)}% white patches on the water (possible foam)`, water.brown > 0.35 && `${Math.round(water.brown * 100)}% brown/turbid water`].filter(Boolean).join('; ') + '.' }
      : { answer: ['none'], confidence: 0.4, reason: 'No foam-like white patches or strong discolouration detected. Smell cannot be seen — please check yourself.' }

    return { suggestions, stats: { all, bank, water }, preview: canvas.toDataURL('image/jpeg', 0.7) }
  } finally {
    URL.revokeObjectURL(url)
  }
}
