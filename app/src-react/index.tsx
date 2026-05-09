/**
 * TechEcho Pro - React Entry Point
 * 
 * This React app mirrors index.html exactly.
 * Can be compiled by Taro to both H5 and WeChat Mini Program.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Import global styles
import './styles/global.scss'

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
