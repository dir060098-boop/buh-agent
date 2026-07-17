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
  stats:   (id)       => api.get(`/api/companies/${id}/stats`),
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
  seedChart:      ()                => api.post(`/api/posting/seed-chart`),
  chartOfAccounts:(level)           => api.get(`/api/posting/chart-of-accounts`, { params: { level } }),
  review:         (entryId, data)   => api.patch(`/api/posting/journal/${entryId}/review`, data),
  deleteEntry:    (entryId)         => api.delete(`/api/posting/journal/${entryId}`),
  bulkDelete:     (ids)             => api.post('/api/posting/journal/bulk-delete', ids),
  periodPreview:  (companyId, year, month) =>
    api.get(`/api/posting/period-preview`, { params: { company_id: companyId, year, month } }),
  closePeriod:    (companyId, year, month) =>
    api.post(`/api/posting/close-period?company_id=${companyId}`, { year, month }),
  reopenPeriod:   (companyId, year, month) =>
    api.post(`/api/posting/reopen-period?company_id=${companyId}`, { year, month }),
  closedPeriods:  (companyId) =>
    api.get(`/api/posting/closed-periods`, { params: { company_id: companyId } }),
  journalStats:   (companyId, params) =>
    api.get(`/api/posting/journal-stats`, { params: { company_id: companyId, ...params } }),
  trialBalance:   (companyId, params) =>
    api.get(`/api/posting/trial-balance`, { params: { company_id: companyId, ...params } }),
  trialBalanceExport: (companyId, params) => {
    const base  = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const qs    = new URLSearchParams({ company_id: companyId, ...params }).toString()
    return fetch(`${base}/api/posting/trial-balance/export?${qs}`,
      { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.detail || 'Ошибка экспорта')
        }
        return r.blob()
      })
      .then(blob => {
        const link = document.createElement('a')
        link.href  = URL.createObjectURL(blob)
        link.download = 'ОСВ.xlsx'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
}

export const documents = {
  getById: (id)              => api.get(`/api/documents/doc/${id}`),
  list: (companyId, params)  => api.get(`/api/documents/${companyId}`, { params }),
  approve: (id)              => api.patch(`/api/documents/${id}/approve`),
  delete: (id)               => api.delete(`/api/documents/${id}`),
  export1c: (companyId, params) => {
    const base  = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const qs    = new URLSearchParams(params).toString()
    const url   = `${base}/api/documents/${companyId}/export-1c${qs ? '?' + qs : ''}`
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.detail || 'Ошибка экспорта')
        }
        return r.blob()
      })
      .then(blob => {
        const link = document.createElement('a')
        link.href  = URL.createObjectURL(blob)
        link.download = 'Документы_для_1С.xlsx'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
  exportCounterparties: (companyId) => {
    const base  = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const url   = `${base}/api/documents/${companyId}/export-counterparties`
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.detail || 'Ошибка экспорта')
        }
        return r.blob()
      })
      .then(blob => {
        const link = document.createElement('a')
        link.href  = URL.createObjectURL(blob)
        link.download = 'Контрагенты_для_1С.xlsx'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
}

export const esf = {
  list:       (companyId, params)           => api.get(`/api/esf/${companyId}`, { params }),
  book:       (companyId, params)           => api.get(`/api/esf/${companyId}/book`, { params }),
  exportBook: (companyId, params) => {
    const base = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const qs = new URLSearchParams({ ...params }).toString()
    const url = `${base}/api/esf/${companyId}/book/export${qs ? '?' + qs : ''}`
    const a = document.createElement('a'); a.href = url
    // Передаём токен через заголовок нельзя в <a href>, используем fetch+blob
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = params.direction === 'outgoing' ? 'Книга_продаж.xlsx' : 'Книга_покупок.xlsx'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
  create:     (companyId, data)             => api.post(`/api/esf/${companyId}`, data),
  delete:     (companyId, esfId)            => api.delete(`/api/esf/${companyId}/${esfId}`),
  accept:     (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/accept`),
  unaccept:   (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unaccept`),
  linkTx:     (companyId, esfId, txId)      => api.patch(`/api/esf/${companyId}/${esfId}/link-tx/${txId}`),
  unlinkTx:   (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unlink-tx`),
  linkDoc:    (companyId, esfId, docId)     => api.patch(`/api/esf/${companyId}/${esfId}/link-doc/${docId}`),
  unlinkDoc:  (companyId, esfId)            => api.patch(`/api/esf/${companyId}/${esfId}/unlink-doc`),
  exportXml: (companyId, params) => {
    const base  = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const qs    = new URLSearchParams(params).toString()
    const url   = `${base}/api/esf/${companyId}/export-xml${qs ? '?' + qs : ''}`
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const dir  = params.direction === 'outgoing' ? 'iskhodyashchie' : 'vkhodyashchie'
        const link = document.createElement('a')
        link.href  = URL.createObjectURL(blob)
        link.download = `esf_${dir}.xml`
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
}

export const nomenclature = {
  items:      (companyId, params)       => api.get(`/api/nomenclature/${companyId}/items`, { params }),
  createItem: (companyId, data)         => api.post(`/api/nomenclature/${companyId}/items`, data),
  updateItem: (companyId, itemId, data) => api.patch(`/api/nomenclature/${companyId}/items/${itemId}`, data),
  aliases:    (companyId, itemId)       => api.get(`/api/nomenclature/${companyId}/items/${itemId}/aliases`),
  deleteAlias:(companyId, aliasId)      => api.delete(`/api/nomenclature/${companyId}/aliases/${aliasId}`),
  lines:      (companyId, params)       => api.get(`/api/nomenclature/${companyId}/lines`, { params }),
  stats:      (companyId)               => api.get(`/api/nomenclature/${companyId}/stats`),
  link:       (companyId, lineId, data) => api.post(`/api/nomenclature/${companyId}/lines/${lineId}/link`, data),
  unlink:     (companyId, lineId)       => api.post(`/api/nomenclature/${companyId}/lines/${lineId}/unlink`),
  bulkLink:   (companyId, data)         => api.post(`/api/nomenclature/${companyId}/lines/bulk-link`, data),
  bulkAccept: (companyId, data)         => api.post(`/api/nomenclature/${companyId}/lines/bulk-accept`, data),
  createFromLine: (companyId, lineId, data) => api.post(`/api/nomenclature/${companyId}/lines/${lineId}/create-item`, data),
}

export const bank = {
  accounts:          (companyId)            => api.get(`/api/bank/${companyId}/accounts`),
  export1c: (companyId, params) => {
    const base  = api.defaults.baseURL || ''
    const token = localStorage.getItem('token')
    const qs    = new URLSearchParams(params).toString()
    const url   = `${base}/api/bank/${companyId}/export-1c${qs ? '?' + qs : ''}`
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.detail || 'Ошибка экспорта')
        }
        return r.blob()
      })
      .then(blob => {
        const link = document.createElement('a')
        link.href  = URL.createObjectURL(blob)
        link.download = 'kl_to_1c.txt'
        link.click()
        URL.revokeObjectURL(link.href)
      })
  },
  createAccount:     (companyId, data)      => api.post(`/api/bank/${companyId}/accounts`, data),
  deleteAccount:     (accountId)            => api.delete(`/api/bank/accounts/${accountId}`),
  transactions:      (companyId, params)    => api.get(`/api/bank/${companyId}/transactions`, { params }),
  addTransaction:    (companyId, data)      => api.post(`/api/bank/${companyId}/transactions`, data),
  deleteTransaction: (txId)                 => api.delete(`/api/bank/transactions/${txId}`),
  matchTransaction:  (txId, { docId, esfId } = {}) =>
    api.patch(`/api/bank/transactions/${txId}/match`, null,
      { params: { ...(docId ? { doc_id: docId } : {}), ...(esfId ? { esf_id: esfId } : {}) } }),
  matchCandidates:   (txId, companyId)       => api.get(`/api/bank/transactions/${txId}/match-candidates`, { params: { company_id: companyId } }),
  importStatement:    (companyId, accountId, file) => {
    const fd = new FormData()
    fd.append('account_id', accountId)
    fd.append('file', file)
    return api.post(`/api/bank/${companyId}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  clearTransactions:  (companyId, accountId) =>
    api.delete(`/api/bank/${companyId}/accounts/${accountId}/transactions`),
  updateTransaction:  (txId, data)           => api.patch(`/api/bank/transactions/${txId}`, data),
  autoPostAll:        (companyId, accountId) =>
    api.post(`/api/bank/${companyId}/auto-post-all`, null,
      { params: accountId ? { account_id: accountId } : {} }),
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
  done: (id, notes) => api.patch(`/api/deadlines/${id}/done`, { notes: notes || '' }),
  calendarAll: (daysAhead) => api.get(`/api/deadlines/calendar/all`, { params: { days_ahead: daysAhead || 30 } }),
}

export const communications = {
  // AI-чат
  history:        (companyId)        => api.get(`/api/communications/${companyId}/chat`),
  chat:           (companyId, data)  => api.post(`/api/communications/${companyId}/chat`, data),
  clearHistory:   (companyId)        => api.delete(`/api/communications/${companyId}/chat`),
  // Письма клиенту
  generateClientMsg: (companyId, data) => api.post(`/api/communications/${companyId}/client-message`, data),
  clientMessages:    (companyId)       => api.get(`/api/communications/${companyId}/client-messages`),
  // Legacy
  reminders: (companyId) => api.get(`/api/communications/${companyId}/reminders`),
}

export { api }
export default api
