import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CompanyMenu from './pages/CompanyMenu'
import Scanner from './pages/Scanner'
import Journal from './pages/Journal'
import './index.css'

const PrivateRoute = ({ children }) => {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/company/:id" element={<PrivateRoute><CompanyMenu /></PrivateRoute>} />
      <Route path="/company/:companyId/scanner" element={<PrivateRoute><Scanner /></PrivateRoute>} />
      <Route path="/company/:companyId/journal" element={<PrivateRoute><Journal /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  </BrowserRouter>
)
