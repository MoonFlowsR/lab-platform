import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PlatformDialogHost from './platform-dialog.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <PlatformDialogHost />
  </StrictMode>,
)
