import type { AllCharactersInfo, CharacterReference, Scene } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const PROJECT_ID_STORAGE_KEY = 'storyboardProjectId';

interface RequestOptions {
  method?: 'GET' | 'POST';
  payload?: unknown;
}

interface RequestWithStatus<T> {
  status: number;
  data: T;
}

interface JobStartResponse {
  jobId: string;
  projectId: string;
  status: 'running';
  message: string;
}

interface JobResultResponse {
  projectId?: string;
  status: 'running' | 'completed' | 'failed';
  message?: string;
  error?: string;
  scenes?: Scene[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getToken() {
  return localStorage.getItem('token') || '';
}

function getStoredProjectId() {
  return localStorage.getItem(PROJECT_ID_STORAGE_KEY);
}

function setStoredProjectId(projectId?: string | null) {
  if (projectId) localStorage.setItem(PROJECT_ID_STORAGE_KEY, projectId);
}

function getAuthHeaders(includeContentType = true) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getToken()}`,
  };
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function requestWithStatus<T>(path: string, options: RequestOptions = {}): Promise<RequestWithStatus<T>> {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE não configurado.');
  }

  const method = options.method || 'POST';
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getAuthHeaders(method !== 'GET'),
    body: method === 'GET' ? undefined : JSON.stringify(options.payload ?? {}),
  });

  const data = await response.json().catch(() => ({})) as T;
  return { status: response.status, data };
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { status, data } = await requestWithStatus<T & { error?: string; message?: string }>(path, options);

  if (status < 200 || status >= 300) {
    const message = data?.error || data?.message || 'Falha ao comunicar com o servidor.';
    throw new Error(message);
  }

  return data as T;
}

function parseSseEvent(block: string): { event: string; data: any } | null {
  if (!block.trim()) return null;

  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue;

    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (!dataLines.length) return null;

  try {
    return { event, data: JSON.parse(dataLines.join('')) };
  } catch {
    return null;
  }
}

async function streamStoryboardEvents(jobId: string, onProgress: (message: string) => void): Promise<void> {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE não configurado.');
  }

  const response = await fetch(`${API_BASE}/storyboard/jobs/${jobId}/events`, {
    method: 'GET',
    headers: getAuthHeaders(false),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data?.error || data?.message || 'Falha ao abrir canal de progresso.';
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Navegador não suporta stream de progresso.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const parsed = parseSseEvent(block);
      if (parsed) {
        if (parsed.data?.message) {
          onProgress(parsed.data.message);
        }

        if (parsed.event === 'failed') {
          throw new Error(parsed.data?.error || parsed.data?.message || 'Falha na geração do storyboard.');
        }

        if (parsed.event === 'completed') {
          return;
        }
      }

      separatorIndex = buffer.indexOf('\n\n');
    }
  }
}

async function waitForStoryboardResult(
  jobId: string,
  onProgress: (message: string) => void
): Promise<{ scenes: Scene[]; projectId?: string }> {
  const timeoutAt = Date.now() + 60 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const { status, data } = await requestWithStatus<JobResultResponse & { error?: string; message?: string }>(
      `/storyboard/jobs/${jobId}/result`,
      { method: 'GET' }
    );

    if (status === 202 || data.status === 'running') {
      if (data.message) onProgress(data.message);
      await sleep(2000);
      continue;
    }

    if (status >= 400 || data.status === 'failed') {
      throw new Error(data.error || data.message || 'Falha no processamento do storyboard.');
    }

    if (data.status === 'completed' && Array.isArray(data.scenes)) {
      return { scenes: data.scenes, projectId: data.projectId };
    }

    throw new Error('Resposta inválida do servidor ao obter resultado do job.');
  }

  throw new Error('Tempo limite excedido ao aguardar o resultado do storyboard.');
}

export async function regenerateSceneImage(
  visualDescription: string,
  characterReferences: CharacterReference[],
  allCharactersInfo: AllCharactersInfo,
  imageStyle: string,
  restrictionPrompt: string,
  _apiKey: string | null = null
): Promise<string> {
  const data = await requestJson<{ imageUrl: string }>(
    '/storyboard/regenerate-image',
    {
      method: 'POST',
      payload: {
        visualDescription,
        characterReferences,
        allCharactersInfo,
        imageStyle,
        restrictionPrompt,
      },
    }
  );

  if (!data?.imageUrl) {
    throw new Error('Resposta inválida do servidor ao regenerar imagem.');
  }

  return data.imageUrl;
}

export async function generateStoryboard(
  characterReferences: CharacterReference[],
  allCharactersInfo: AllCharactersInfo,
  scriptOrSrtContent: string,
  isSrt: boolean,
  imageStyle: string,
  restrictionPrompt: string,
  onProgress: (message: string) => void,
  delayBetweenScenes: number = 30000,
  pacing: number = 35,
  _apiKey: string | null = null
): Promise<Scene[]> {
  onProgress('Iniciando geração no servidor...');
  const projectId = getStoredProjectId();

  const started = await requestJson<JobStartResponse>('/storyboard/generate/start', {
    method: 'POST',
    payload: {
      characterReferences,
      allCharactersInfo,
      scriptOrSrtContent,
      isSrt,
      imageStyle,
      restrictionPrompt,
      delayBetweenScenes,
      pacing,
      projectId: projectId || undefined,
    },
  });

  setStoredProjectId(started.projectId);
  if (started.message) onProgress(started.message);

  try {
    await streamStoryboardEvents(started.jobId, onProgress);
  } catch (error: any) {
    const message = error?.message || 'Canal de progresso indisponível. Continuando monitoramento...';
    onProgress(message);
  }

  const result = await waitForStoryboardResult(started.jobId, onProgress);
  setStoredProjectId(result.projectId || started.projectId);
  onProgress('Storyboard completo!');
  return result.scenes;
}
