import type { Scene } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export interface StoryboardProjectSummary {
  id: string;
  userId: string;
  title: string;
  status: 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardProjectDetail extends StoryboardProjectSummary {
  inputJson?: any;
  resultJson?: any;
}

function getAuthHeaders(includeContentType = true) {
  const token = localStorage.getItem('token') || '';
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (includeContentType) headers['Content-Type'] = 'application/json';
  return headers;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE não configurado.');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(options.method !== 'GET'),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Erro ao comunicar com o servidor.');
  }
  return data as T;
}

export async function listProjects(): Promise<StoryboardProjectSummary[]> {
  return apiRequest<StoryboardProjectSummary[]>('/projects', { method: 'GET' });
}

export async function getProject(projectId: string): Promise<StoryboardProjectDetail> {
  return apiRequest<StoryboardProjectDetail>(`/projects/${projectId}`, { method: 'GET' });
}

export async function updateProject(
  projectId: string,
  payload: {
    title?: string;
    inputJson?: unknown;
    resultJson?: { scenes: Scene[] } | unknown;
    lastError?: string | null;
  }
): Promise<StoryboardProjectDetail> {
  return apiRequest<StoryboardProjectDetail>(`/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}
