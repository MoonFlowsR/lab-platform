import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.jsx'
import PlatformDialogHost from './shared/components/platform-dialog.jsx'

import { platformSettings } from './shared/lib/platform-settings.js'

document.title = platformSettings.title;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PlatformDialogHost />
  </StrictMode>,
)

import './styles/refinement.css';
