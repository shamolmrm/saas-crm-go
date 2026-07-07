import axios, { type AxiosError } from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401, try to refresh the token once
let refreshPromise: Promise<string | null> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retried?: boolean }
    if (error.response?.status === 401 && !original._retried) {
      original._retried = true

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null })
      }

      const newToken = await refreshPromise
      if (newToken) {
        original.headers = original.headers ?? {}
        original.headers['Authorization'] = `Bearer ${newToken}`
        return api.request(original)
      } else {
        // Refresh failed — redirect to login
        clearTokens()
        if (typeof window !== 'undefined') window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

// ── Token management (localStorage) ──────────────────────────────────────────
// Access token is short-lived (15m). Refresh token is 7 days.
// Never put these in cookies without proper SameSite / Secure / HttpOnly config.
// For v0, localStorage is acceptable. Phase 1a can move to httpOnly cookies.

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

export function setTokens(accessToken: string, refreshToken?: string) {
  localStorage.setItem('access_token', accessToken)
  if (refreshToken) localStorage.setItem('refresh_token', refreshToken)
}

export function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null

  try {
    const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken })
    setTokens(data.accessToken, data.refreshToken)
    return data.accessToken
  } catch {
    clearTokens()
    return null
  }
}

// ── Typed API helpers ─────────────────────────────────────────────────────────

export interface Contact {
  id: string; name: string; email?: string; phone?: string
  company?: string; jobTitle?: string; notes?: string; createdAt: string
  aiSummary?: string; aiSummaryAt?: string
  _count?: { deals: number }
}
export interface Deal {
  id: string; title: string; value?: number; currency: string
  status: 'OPEN' | 'WON' | 'LOST'; position: number
  stageId: string; pipelineId: string
  contact?: { id: string; name: string; email?: string }
  stage?: { id: string; name: string; position: number }
  owner?: { id: string; name: string; avatarUrl?: string }
}
export interface PipelineStage {
  id: string; name: string; position: number
  deals: Deal[]
}
export interface Pipeline {
  id: string; name: string; isDefault: boolean
  stages: PipelineStage[]
}

export const contactsApi = {
  list:   (params?: Record<string, string>) => api.get<{ contacts: Contact[]; total: number }>('/contacts', { params }),
  get:    (id: string) => api.get<Contact & { deals: Deal[]; activities: unknown[] }>(`/contacts/${id}`),
  create: (data: Partial<Contact>)  => api.post<Contact>('/contacts', data),
  update: (id: string, data: Partial<Contact>) => api.patch<Contact>(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  aiSummary:   (id: string) => api.post<{ summary: string }>(`/ai/contact-summary/${id}`),
  logActivity: (id: string, data: { type: string; subject?: string; body?: string }) =>
    api.post(`/contacts/${id}/activities`, data),
}

export const dealsApi = {
  list:   (params?: Record<string, string>) => api.get<Deal[]>('/deals', { params }),
  board:  (pipelineId: string) => api.get<Pipeline>(`/deals/board/${pipelineId}`),
  get:    (id: string)  => api.get<Deal>(`/deals/${id}`),
  create: (data: Partial<Deal>) => api.post<Deal>('/deals', data),
  update: (id: string, data: Partial<Deal>) => api.patch<Deal>(`/deals/${id}`, data),
  move:   (id: string, stageId: string, newPosition: number) =>
    api.patch(`/deals/${id}/move`, { stageId, newPosition }),
  delete: (id: string) => api.delete(`/deals/${id}`),
}

export const pipelineApi = {
  list:   () => api.get<Pipeline[]>('/pipeline'),
  create: (data: { name: string }) => api.post<Pipeline>('/pipeline', data),
  delete: (id: string) => api.delete(`/pipeline/${id}`),
}

export const aiApi = {
  search: (query: string) => api.post<{ answer: string; results: unknown[] }>('/ai/search', { query }),
}
