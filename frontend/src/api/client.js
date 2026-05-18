import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Автоматически добавляем токен
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Если токен истёк — редиректим на логин
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const auth = {
  login: (email, password) => api.post('/api/auth/login', new URLSearchParams({ username: email, password })),
  me: () => api.get('/api/auth/me'),
}

export const companies = {
  list:   ()         => api.get('/api/companies/'),
  create: (data)     => api.post('/api/companies/', data),
  get:    (id)       => api.get(`/api/companies/${id}`),
  update: (id, data) => api.patch(`/api/companies/${id}`, data),
  delete: (id)       => api.delete(`/api/companies/${id}`),
}

export const scanner = {
  recognize: (companyId, formData) =>
    api.post(`/api/scanner/${companyId}/recognize`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  confirm: (companyId, data) =>
    api.post(`/api/scanner/${companyId}/confirm`, data),
  list: (companyId, postingStatus) =>
    api.get(`/api/scanner/${companyId}/list`, { params: { posting_status: postingStatus } }),
  fileUrl: (filePath) => {
    const base = import.meta.env.VITE_API_URL || ''
    return `${base}/api/scanner/file?path=${encodeURIComponent(filePath)}`
  },
}

export const posting = {
  autoAll:        (companyId)       => api.post(`/api/posting/auto-all?company_id=${companyId}`),
  auto:           (docId)           => api.post(`/api/posting/auto/${docId}`),
  journal:        (companyId, params) => api.get(`/api/posting/journal`, { params: { company_id: companyId, ...params } }),
  dailyReport:    (companyId, date) => api.get(`/api/posting/daily-report`, { params: { company_id: companyId, report_date: date } }),
  seedChart:      ()                => api.post(`/api/posting/seed-chart`),
  chartOfAccounts:(level)           => api.get(`/api/posting/chart-of-accounts`, { params: { level } }),
  review:         (entryId, data)   => api.patch(`/api/posting/journal/${entryId}/review`, data),
  deleteEntry:    (entryId)         => api.delete(`/api/posting/journal/${entryId}`),
  bulkDelete:     (ids)             => api.post('/api/posting/journal/bulk-delete', ids),
}

export const documents = {
  list: (companyId) => api.get(`/api/documents/${companyId}`),
  approve: (id) => api.patch(`/api/documents/${id}/approve`),
  delete: (id) => api.delete(`/api/documents/${id}`),
}

export const esf = {
  list: (companyId) => api.get(`/api/esf/${companyId}`),
  unlinked: (companyId) => api.get(`/api/esf/${companyId}/unlinked`),
  create: (companyId, data) => api.post(`/api/esf/${companyId}`, data),
  link: (esfId, docId) => api.patch(`/api/esf/${esfId}/link/${docId}`),
}

export const bank = {
  accounts: (companyId) => api.get(`/api/bank/${companyId}/accounts`),
  transactions: (companyId) => api.get(`/api/bank/${companyId}/transactions`),
  unmatched: (companyId) => api.get(`/api/bank/${companyId}/unmatched`),
  aiMatch: (companyId) => api.post(`/api/bank/${companyId}/ai-match`),
}

export const salary = {
  employees: (companyId) => api.get(`/api/salary/${companyId}/employees`),
  addEmployee: (companyId, data) => api.post(`/api/salary/${companyId}/employees`, data),
  fire: (companyId, empId) => api.patch(`/api/salary/${companyId}/employees/${empId}/fire`),
  payroll: (companyId) => api.get(`/api/salary/${companyId}/payroll`),
}

export const deadlines = {
  list: (companyId) => api.get(`/api/deadlines/${companyId}`),
  create: (companyId, data) => api.post(`/api/deadlines/${companyId}`, data),
  done: (id) => api.patch(`/api/deadlines/${id}/done`),
}

export const communications = {
  generate: (companyId, context) => api.post('/api/communications/generate', { company_id: companyId, context }),
  reminders: (companyId) => api.get(`/api/communications/${companyId}/reminders`),
}

export default api
