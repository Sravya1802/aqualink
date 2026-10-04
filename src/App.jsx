import { useEffect, useState, useSyncExternalStore } from 'react'
import Dashboard from './components/Dashboard.jsx'
import ReportWizard from './components/ReportWizard.jsx'
import DataQuality from './components/DataQuality.jsx'
import FhirTab from './components/FhirTab.jsx'
import About from './components/About.jsx'
import { getReports, subscribe } from './lib/store.js'
import { ensureSeed } from './lib/seed.js'

ensureSeed()

const TABS = [
  ['dashboard', 'Officer dashboard'],
  ['report', 'Citizen report'],
  ['quality', 'Data quality'],
  ['fhir', 'FHIR & interoperability'],
  ['about', 'How it works'],
]

const tabFromHash = () => {
  const [tab, arg] = window.location.hash.replace('#/', '').split('/')
  return { tab: TABS.some(([t]) => t === tab) ? tab : 'dashboard', arg }
}

export default function App() {
  const [route, setRoute] = useState(tabFromHash)
  const reports = useSyncExternalStore(subscribe, getReports)

  useEffect(() => {
    const onHash = () => setRoute(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (tab, arg) => { window.location.hash = `#/${tab}${arg ? `/${arg}` : ''}` }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/dashboard">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          <span><b>AquaLink</b><small>From streams to systems · One Health</small></span>
        </a>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab ${route.tab === id ? 'active' : ''}`} onClick={() => go(id)}>{label}</button>
          ))}
        </nav>
        <span className="spacer" />
        <span className="pill" title="Citizen reports stored on this device">📝 {reports.length} citizen reports</span>
        <span className="pill" title="Built on the OneAquaHealth FHIR Implementation Guide">HL7 FHIR R4 · OAH IG</span>
      </header>
      <main>
        {route.tab === 'dashboard' && <Dashboard siteId={route.arg} onSelect={(id) => go('dashboard', id)} onReport={(id) => go('report', id)} />}
        {route.tab === 'report' && <ReportWizard initialSite={route.arg} onDone={(id) => go('dashboard', id)} />}
        {route.tab === 'quality' && <DataQuality />}
        {route.tab === 'fhir' && <FhirTab />}
        {route.tab === 'about' && <About />}
      </main>
    </>
  )
}
