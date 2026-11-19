// Runs a logistic-regression model exported by ml/train_model.py. No server needed.
//
// Every input is optional. A blank numeric field is treated as an average value (it adds
// nothing to the log-odds) and a blank categorical field adds the average effect across your
// own history, so you can ask about any combination of weather, location, bait, lure, and rig.

const BASE = import.meta.env.BASE_URL
const MODEL_VERSION = 2

export async function loadModelIndex() {
  const res = await fetch(`${BASE}models/index.json`)
  if (!res.ok) throw new Error('No trained models found. Run ml/train_model.py first.')
  return res.json()
}

export async function loadModel(file) {
  const res = await fetch(`${BASE}models/${file}`)
  if (!res.ok) throw new Error(`Could not load model ${file}`)
  const model = await res.json()
  if (model.version !== MODEL_VERSION) throw new Error('This model is outdated. Re-run ml/train_model.py.')
  return model
}

const has = (v) => v !== undefined && v !== null && v !== '' && !Number.isNaN(v)

// Mirrors the feature engineering in train_model.py. hour is 0-24 local time, month is 1-12.
function numericFeatures(input) {
  const f = {}
  for (const k of ['air_temp_f', 'water_temp_f', 'pressure_inhg', 'wind_mph', 'cloud_cover_pct']) {
    if (has(input[k])) f[k] = Number(input[k])
  }
  if (has(input.hours) && input.hours > 0) f.log_hours = Math.log(input.hours)
  if (has(input.hour)) {
    f.hour_sin = Math.sin((2 * Math.PI * input.hour) / 24)
    f.hour_cos = Math.cos((2 * Math.PI * input.hour) / 24)
  }
  if (has(input.month)) {
    f.month_sin = Math.sin((2 * Math.PI * (input.month - 1)) / 12)
    f.month_cos = Math.cos((2 * Math.PI * (input.month - 1)) / 12)
  }
  if (has(input.moon_phase)) {
    f.moon_sin = Math.sin(2 * Math.PI * input.moon_phase)
    f.moon_cos = Math.cos(2 * Math.PI * input.moon_phase)
  }
  return f
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z))

/**
 * Chance of catching at least one fish in a setup like this.
 * Returns { probability, logit, contributions }; each contribution is a log-odds change
 * relative to an average setup, so Math.exp(value) is the odds multiplier.
 */
export function predictChance(model, input) {
  const feats = numericFeatures(input)
  const contributions = []
  let logit = model.intercept

  for (const t of model.numeric) {
    if (!(t.name in feats)) continue
    const c = (t.coef * (feats[t.name] - t.mean)) / t.scale
    logit += c
    contributions.push({ name: t.name, value: c })
  }
  for (const [col, spec] of Object.entries(model.categorical)) {
    const chosen = input[col]
    const entry = has(chosen) ? spec.categories[chosen] : undefined
    const c = entry ? entry.coef : spec.unspecified // unseen values fall back to the average
    logit += c
    if (has(chosen)) contributions.push({ name: `${col}: ${chosen}`, value: c })
  }
  return { probability: sigmoid(logit), logit, contributions }
}
