import { useEffect, useMemo, useState } from 'react'
import { loadModel, loadModelIndex, predictChance } from '../lib/predict'
import './predict.css'

const NUMERIC_FIELDS = [
  { key: 'water_temp_f', term: 'water_temp_f', label: 'Water temp (°F)', min: 32, max: 100, step: 1 },
  { key: 'air_temp_f', term: 'air_temp_f', label: 'Air temp (°F)', min: -10, max: 120, step: 1 },
  { key: 'pressure_inhg', term: 'pressure_inhg', label: 'Pressure (inHg)', min: 28, max: 31, step: 0.01 },
  { key: 'wind_mph', term: 'wind_mph', label: 'Wind (mph)', min: 0, max: 60, step: 1 },
  { key: 'cloud_cover_pct', term: 'cloud_cover_pct', label: 'Cloud cover (%)', min: 0, max: 100, step: 5 },
]

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`,
}))
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  .map((label, i) => ({ value: i + 1, label }))
const MOON = [
  ['New moon', 0], ['Waxing crescent', 0.125], ['First quarter', 0.25], ['Waxing gibbous', 0.375],
  ['Full moon', 0.5], ['Waning gibbous', 0.625], ['Last quarter', 0.75], ['Waning crescent', 0.875],
].map(([label, value]) => ({ value, label }))

const CATEGORY_LABELS = {
  location: 'Location', rig: 'Rig', lure_type: 'Lure', lure_color: 'Lure color', bait: 'Bait', precipitation: 'Precipitation',
}
const NONE_LABELS = { rig: 'No rig', lure_type: 'No lure', lure_color: 'No color', bait: 'No bait' }
const SUGGEST = ['rig', 'lure_type', 'lure_color', 'bait', 'location']
const MIN_SHARE = 0.03 // ignore options with under 3% of your logged fishing hours

const FACTOR_LABELS = {
  water_temp_f: 'Water temp', air_temp_f: 'Air temp', pressure_inhg: 'Pressure', wind_mph: 'Wind',
  cloud_cover_pct: 'Cloud cover', log_hours: 'Trip length', hour_sin: 'Time of day', hour_cos: 'Time of day',
  month_sin: 'Time of year', month_cos: 'Time of year', moon_sin: 'Moon phase', moon_cos: 'Moon phase',
}

const optionLabel = (key, value) => (value === '(none)' ? NONE_LABELS[key] || 'None' : value)
const pct = (p) => (p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)
const oddsMultiplier = (logOdds) => `×${Math.exp(logOdds).toFixed(2)}`

function categoryOptions(model, key) {
  const spec = model.categorical[key]
  if (!spec) return []
  return Object.entries(spec.categories).sort((a, b) => b[1].share - a[1].share).map(([value, e]) => ({ value, share: e.share }))
}

// Merge sin/cos pairs into one factor and label everything for display.
function factorRows(contributions) {
  const merged = new Map()
  for (const c of contributions) {
    const [col, ...rest] = c.name.split(': ')
    const label = rest.length ? `${CATEGORY_LABELS[col] || col}: ${optionLabel(col, rest.join(': '))}` : FACTOR_LABELS[c.name] || c.name
    merged.set(label, (merged.get(label) || 0) + c.value)
  }
  return [...merged].map(([label, value]) => ({ label, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

function toInput(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw)) if (v !== '' && v !== undefined) out[k] = NUMERIC_KEYS.has(k) ? Number(v) : v
  return out
}
const NUMERIC_KEYS = new Set([...NUMERIC_FIELDS.map((f) => f.key), 'hour', 'month', 'moon_phase'])

/** Loads the trained models and lets the person choose a species. */
export default function Predict() {
  const [index, setIndex] = useState(null)
  const [file, setFile] = useState('')
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    loadModelIndex()
      .then((list) => {
        setIndex(list)
        if (list.length) setFile(list[0].file)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!file) return
    setModel(null)
    loadModel(file).then(setModel).catch((e) => setError(e.message))
  }, [file])

  if (error) return <p role="alert" className="note error">{error}</p>
  if (!index) return <p className="muted">Loading models…</p>
  if (index.length === 0)
    return <p className="muted">No models were trained yet. Log more trips, then run <code>ml/train_model.py</code>.</p>

  return (
    <section className="pd">
      <h2>Predict</h2>
      <label className="pd-species">
        Species
        <select value={file} onChange={(e) => setFile(e.target.value)}>
          {index.map((m) => (
            <option key={m.file} value={m.file}>{m.species}</option>
          ))}
        </select>
      </label>
      {model ? <PredictPanel key={file} model={model} /> : <p className="muted">Loading model…</p>}
    </section>
  )
}

/** Inputs and results for one model. Leave any field blank to use your average. */
export function PredictPanel({ model, initial = {} }) {
  const [raw, setRaw] = useState(initial)
  const [hours, setHours] = useState('3')
  const set = (key) => (e) => setRaw((r) => ({ ...r, [key]: e.target.value }))

  const has = (term) => model.numeric.some((t) => t.name === term)
  const catOptions = (key) => categoryOptions(model, key)
  const showCat = (key) => catOptions(key).filter((o) => o.value !== '(none)').length > 0

  const tripHours = Math.max(0.5, Number(hours) || 3)
  const conditions = useMemo(() => toInput(raw), [raw])
  const input = useMemo(() => ({ ...conditions, hours: tripHours }), [conditions, tripHours])
  const average = useMemo(() => predictChance(model, { hours: tripHours }).probability, [model, tripHours])
  const result = useMemo(() => predictChance(model, input), [model, input])
  const rows = useMemo(() => factorRows(result.contributions), [result])
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.value)))
  const [minHours, maxHours] = model.hours_range
  const outOfRange = tripHours < minHours * 0.8 || tripHours > maxHours * 1.2
  const target = model.species === 'All species' ? 'fish' : model.species.toLowerCase()

  const suggestions = useMemo(() => {
    const out = []
    for (const key of SUGGEST) {
      const options = categoryOptions(model, key).filter((o) => o.share >= MIN_SHARE)
      if (options.length < 2) continue
      const ranked = options
        .map((o) => ({ ...o, probability: predictChance(model, { ...input, [key]: o.value }).probability }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 3)
      out.push({ key, ranked })
    }
    return out
  }, [model, input])

  const m = model.metrics
  const weak = m.cv_auc < 0.6 || m.cv_log_loss >= m.baseline_log_loss
  const t = model.trained_on

  const field = (label, control, key) => (
    <label className="pd-field" key={key}>
      <span>{label}</span>
      {control}
    </label>
  )
  const select = (key, options, anyLabel = 'Any') => (
    <select value={raw[key] ?? ''} onChange={set(key)}>
      <option value="">{anyLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
  const catSelect = (key) =>
    showCat(key) &&
    field(CATEGORY_LABELS[key], select(key, catOptions(key).map((o) => ({ value: o.value, label: optionLabel(key, o.value) }))))

  return (
    <div className="pd-grid">
      <form className="pd-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Conditions</legend>
          {NUMERIC_FIELDS.filter((f) => has(f.term)).map((f) =>
            field(f.label, (
              <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step}
                value={raw[f.key] ?? ''} onChange={set(f.key)} placeholder="Any" />
            ), f.key))}
          {catSelect('precipitation')}
          {has('hour_sin') && field('Time of day', select('hour', HOURS))}
          {has('month_sin') && field('Month', select('month', MONTHS))}
          {has('moon_sin') && field('Moon phase', select('moon_phase', MOON))}
        </fieldset>
        <fieldset>
          <legend>Where and how</legend>
          {catSelect('location')}
          {catSelect('rig')}
          {catSelect('lure_type')}
          {catSelect('lure_color')}
          {catSelect('bait')}
        </fieldset>
        <fieldset>
          <legend>Trip</legend>
          {field('Hours on the water', (
            <input type="number" min="0.5" max="24" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          ))}
        </fieldset>
        <button type="button" className="link" onClick={() => setRaw({})}>Clear all inputs</button>
      </form>

      <div className="pd-results" aria-live="polite">
        {weak && (
          <p className="pd-banner" role="note">
            This model is barely better than guessing your overall success rate. Treat the numbers as rough until you log more trips.
          </p>
        )}
        <div className="pd-headline">
          <div>
            <div className="pd-big">{pct(result.probability)}</div>
            <div className="muted">
              chance of at least one {target} in {tripHours} {tripHours === 1 ? 'hour' : 'hours'}
            </div>
          </div>
        </div>
        <p className="muted">
          {Object.keys(conditions).length > 0
            ? `A typical ${tripHours}-hour setup of yours is ${pct(average)}.`
            : `That is your average for a ${tripHours}-hour setup. Fill in conditions to see what changes.`}
          {outOfRange && ` You have only logged setups of ${minHours}–${maxHours} hours, so treat this one as a stretch.`}
        </p>

        {rows.length > 0 && (
          <>
            <h3>What is driving this</h3>
            <ul className="pd-bars">
              {rows.map((r) => (
                <li key={r.label}>
                  <span className="pd-bar-label">{r.label}</span>
                  <span className="pd-track" aria-hidden="true">
                    <span className={r.value >= 0 ? 'pd-bar pos' : 'pd-bar neg'} style={{ width: `${(Math.abs(r.value) / maxAbs) * 50}%` }} />
                  </span>
                  <span className="pd-bar-value">{oddsMultiplier(r.value)}</span>
                </li>
              ))}
            </ul>
            <p className="muted pd-small">
              How each factor changes your odds of a catch versus an average setup. Above ×1.00 helps, below hurts.
            </p>
          </>
        )}

        {suggestions.length > 0 && (
          <>
            <h3>What to try under these conditions</h3>
            <div className="pd-suggest">
              {suggestions.map(({ key, ranked }) => (
                <div key={key}>
                  <h4>{CATEGORY_LABELS[key]}</h4>
                  <ol>
                    {ranked.map((o) => (
                      <li key={o.value} className={raw[key] === o.value ? 'chosen' : undefined}>
                        {optionLabel(key, o.value)} <span className="muted">{pct(o.probability)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
            <p className="muted pd-small">Only options covering at least 3% of your fishing hours are ranked.</p>
          </>
        )}

        <p className="muted pd-small">
          Based on {t.setups} setups across {t.trips} trips ({t.hours} hours); {t.successes} caught at least one{' '}
          {target}. Cross-validated AUC {m.cv_auc.toFixed(2)} (0.50 is guessing).
        </p>
      </div>
    </div>
  )
}
