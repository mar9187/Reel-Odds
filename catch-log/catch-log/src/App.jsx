import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Auth from './components/Auth.jsx'
import Locations from './components/Locations.jsx'
import Predict from './components/Predict.jsx'

// Add new pages here as they get built (Log trip, History, Charts, Predict).
const TABS = [
  { id: 'locations', label: 'Locations', component: Locations },
  { id: 'predict', label: 'Predict', component: Predict }
]

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState(TABS[0].id)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  if (!session) return <Auth />

  const Page = TABS.find((t) => t.id === tab).component

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Catch Log</h1>
        <nav aria-label="Main">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main>
        <Page session={session} />
      </main>
    </div>
  )
}
