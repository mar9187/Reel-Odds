import React from 'react'
import ReactDOM from 'react-dom/client'
import Predict from './components/Predict.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <main style={{ maxWidth: '56rem', margin: '1rem auto', padding: '1rem' }}>
    <Predict />
  </main>
)