import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const WATER_TYPES = ['lake', 'reservoir', 'river', 'creek', 'pond', 'other']

// First working slice: proves auth, inserts, reads, and row-level security end to end.
export default function Locations() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [waterType, setWaterType] = useState('lake')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('locations').select('*').order('name')
    if (error) setError(error.message)
    else setRows(data)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e) {
    e.preventDefault()
    setError('')
    // user_id is filled in by the database default (auth.uid()).
    const { error } = await supabase.from('locations').insert({ name: name.trim(), water_type: waterType })
    if (error) setError(error.message)
    else {
      setName('')
      load()
    }
  }

  return (
    <section>
      <h2>Locations</h2>
      <form className="row" onSubmit={add}>
        <input
          placeholder="Lake or spot name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-label="Location name"
        />
        <select value={waterType} onChange={(e) => setWaterType(e.target.value)} aria-label="Water type">
          {WATER_TYPES.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <button className="primary">Add location</button>
      </form>
      {error && <p role="alert" className="note error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">No locations yet. Add the first place you fish.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Water</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.water_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
