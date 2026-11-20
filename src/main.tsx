import { createRoot } from 'react-dom/client'
import '@fontsource/spectral/latin-600.css'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import { App } from './workspace/App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
