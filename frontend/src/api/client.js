import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://buh-agent-production.up.railway.app',
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
  list:    ()         => api.get('/api/companies/'),
  create:  (data)     => api.post('/api/companies/', data),
  get:     (id)       => api.get(`/api/companies/${id}`),
  update:  (id, data) => api.patch(`/api/companies/${id}`, data),
  delete:  (id)       => api.delete(`/api/companies/${id}`),
  summary: ()         => api.get('/api/companies/dashboard/summary'),
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
  previewPosting: (companyId, recognition) =>
    api.post(`/api/scanner/${companyId}/preview-posting`, recognition),
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
  getById: (id)              => api.get(`/api/documents/doc/${id}`),
  list: (companyId, params)  => api.get(`/api/documents/${companyId}`, { params }),
  approve: (id)              => api.patch(`/api/documents/${id}/approve`),
  delete: (id)               => api.delete(`/api/documents/${id}`),
}

export const esf = {
  list:       (companyId, params)           => api.get(`/api/esf/${companyId}`, { params }),
  book:       (companyId, params)           => api.get(`/api/esf/${companyId}/book`, { params }),
  create:     (companyId, data)             => api.post(`/api/esf/${companyId}`, data),
  delete:     (companyId, esfId)            => api.delete(`/api/esf/${companyId}/${esfId}`),
  accept:     (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/accept`),
  unaccept:   (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unaccept`),
  linkTx:     (companyId, esfId, txId)      => api.patch(`/api/esf/${companyId}/${esfId}/link-tx/${txId}`),
  unlinkTx:   (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unlink-tx`),
  linkDoc:    (companyId, esfId, docId)     => api.patch(`/api/esf/${companyId}/${esfId}/link-doc/${docId}`),
  unlinkDoc:  (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unlink-doc`),
}

export const bank = {
  accounts:          (companyId)            => api.get(`/api/bank/${companyId}/accounts`),
  createAccount:     (companyId, data)      => api.post(`/api/bank/${companyId}/accounts`, data),
  deleteAccount:     (accountId)            => api.delete(`/api/bank/accounts/${accountId}`),
  transactions:      (companyId, params)    => api.get(`/api/bank/${companyId}/transactions`, { params }),
  addTransaction:    (companyId, data)      => api.post(`/api/bank/${companyId}/transactions`, data),
  deleteTransaction: (txId)                 => api.delete(`/api/bank/transactions/${txId}`),
  matchTransaction:  (txId, docId)          => api.patch(`/api/bank/transactions/${txId}/match`, null, { params: { doc_id: docId } }),
  importStatement:   (companyId, accountId, file) => {
    const fd = new FormData()
    fd.append('account_id', accountId)
    fd.append('file', file)
    return api.post(`/api/bank/${companyId}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

export const salary = {
  employees:      (companyId)              => api.get(`/api/salary/${companyId}/employees`),
  addEmployee:    (companyId, data)        => api.post(`/api/salary/${companyId}/employees`, data),
  updateEmployee: (companyId, empId, data) => api.patch(`/api/salary/${companyId}/employees/${empId}`, data),
  fire:           (companyId, empId)       => api.patch(`/api/salary/${companyId}/employees/${empId}/fire`),
  deleteEmployee: (companyId, empId)       => api.delete(`/api/salary/${companyId}/employees/${empId}`),
  payroll:        (companyId)              => api.get(`/api/salary/${companyId}/payroll`),
  runPayroll:     (companyId, data)        => api.post(`/api/salary/${companyId}/payroll/run`, data),
  history:        (companyId)              => api.get(`/api/salary/${companyId}/payroll/history`),
  getRun:         (companyId, runId)       => api.get(`/api/salary/${companyId}/payroll/run/${runId}`),
  deleteRun:      (companyId, runId)       => api.delete(`/api/salary/${companyId}/payroll/run/${runId}`),
  paySalary:      (companyId, runId, data) => api.post(`/api/salary/${companyId}/payroll/run/${runId}/pay`, data),
  payTaxes:       (companyId, runId, data) => api.post(`/api/salary/${companyId}/payroll/run/${runId}/pay-taxes`, data),
  payAdvance:     (companyId, runId, data) => api.post(`/api/salary/${companyId}/payroll/run/${runId}/advance`, data),
  exportRun:      (companyId, runId)       => api.get(`/api/salary/${companyId}/payroll/run/${runId}/export`, { responseType: 'blob' }),
  // Отпуска / больничные
  leaves:         (companyId)              => api.get(`/api/salary/${companyId}/leaves`),
  addLeave:       (companyId, data)        => api.post(`/api/salary/${companyId}/leaves`, data),
  deleteLeave:    (companyId, leaveId)     => api.delete(`/api/salary/${companyId}/leaves/${leaveId}`),
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

export { api }
export default api
