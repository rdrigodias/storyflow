import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const port = 3200 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret';
const databaseUrl =
  process.env.DATABASE_URL || 'postgresql://user:password@127.0.0.1:5432/storyflow?schema=public';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});
let serverProcess;
let serverLogs = '';
let databaseReady = false;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  const timeoutMs = 15000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }

  throw new Error(`Server did not start in time.\nLogs:\n${serverLogs}`);
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const content = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', jwtSecret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

async function createAuthUser(label = 'integration') {
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `${label}-${uniqueId}@example.com`;
  const password = '123456';

  const registerResponse = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const registerBody = await registerResponse.json();

  assert.equal(registerResponse.status, 200);
  assert.equal(registerBody.success, true);
  assert.ok(registerBody.user?.id);
  assert.ok(registerBody.user?.role);

  const token = signJwt({
    id: registerBody.user.id,
    role: registerBody.user.role,
    iat: Math.floor(Date.now() / 1000),
  });

  return {
    user: registerBody.user,
    token,
  };
}

async function createProject(token, payload = { title: 'Projeto Integração' }) {
  const createProjectResponse = await fetch(`${baseUrl}/projects`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const createdProject = await createProjectResponse.json();

  assert.equal(createProjectResponse.status, 200);
  assert.ok(createdProject.id);

  return createdProject;
}

async function updateUserStatus(userId, status) {
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });
}

function buildStoryboardPayload(scriptOrSrtContent) {
  return {
    characterReferences: [],
    allCharactersInfo: [],
    scriptOrSrtContent,
    isSrt: false,
    imageStyle: 'Filme Realista',
    restrictionPrompt: '',
    delayBetweenScenes: 0,
    pacing: 35,
  };
}

function buildRegenerateImagePayload() {
  return {
    visualDescription: 'Cena de teste para regeneracao',
    characterReferences: [],
    allCharactersInfo: [],
    imageStyle: 'Filme Realista',
    restrictionPrompt: '',
  };
}

async function waitForJobResult(token, jobId, timeoutMs = 15000) {
  const timeoutAt = Date.now() + timeoutMs;

  while (Date.now() < timeoutAt) {
    const response = await fetch(`${baseUrl}/storyboard/jobs/${jobId}/result`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();

    if (response.status === 202 || body?.status === 'running') {
      await sleep(100);
      continue;
    }

    return { status: response.status, body };
  }

  throw new Error(`Timeout aguardando resultado do job ${jobId}`);
}

function parseSseBlock(block) {
  if (!block.trim()) return null;

  let event = 'message';
  const dataLines = [];

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
    return {
      event,
      data: JSON.parse(dataLines.join('')),
    };
  } catch {
    return null;
  }
}

async function collectSseEvents(token, jobId, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/storyboard/jobs/${jobId}/events`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        `Falha ao abrir stream SSE (${response.status}): ${body.error || body.message || 'erro desconhecido'}`
      );
    }

    if (!response.body) {
      throw new Error('Resposta SSE sem body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const events = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const parsed = parseSseBlock(block);
        if (parsed) {
          events.push(parsed);
          if (parsed.event === 'completed' || parsed.event === 'failed') {
            return events;
          }
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    return events;
  } finally {
    clearTimeout(timeout);
  }
}

before(async () => {
  serverProcess = spawn('node', ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: jwtSecret,
      STORYBOARD_MOCK_MODE: '1',
      DATABASE_URL: databaseUrl,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });

  await waitForServerReady();
  const readyResponse = await fetch(`${baseUrl}/ready`);
  databaseReady = readyResponse.status === 200;
});

after(async () => {
  await prisma.$disconnect().catch(() => {});

  if (!serverProcess) return;
  if (serverProcess.exitCode !== null) return;

  serverProcess.kill('SIGTERM');
  await Promise.race([
    once(serverProcess, 'exit'),
    sleep(5000).then(() => {
      if (serverProcess.exitCode === null) {
        serverProcess.kill('SIGKILL');
      }
    }),
  ]);
});

test('GET /health should return service status', async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'storyflow-backend');
  assert.ok(typeof body.timestamp === 'string');
});

test('GET /ready should return ready or not_ready', async () => {
  const response = await fetch(`${baseUrl}/ready`);
  const body = await response.json();

  assert.ok([200, 503].includes(response.status));
  assert.ok(['ready', 'not_ready'].includes(body.status));
  assert.ok(typeof body.timestamp === 'string');
});

test('GET /projects without token should be unauthorized', async () => {
  const response = await fetch(`${baseUrl}/projects`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.error || body.message);
});

test('POST /storyboard/generate/start without token should fail auth', async () => {
  const response = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.error || body.message);
});

test('POST /storyboard/generate without token should fail auth', async () => {
  const response = await fetch(`${baseUrl}/storyboard/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.error || body.message);
});

test('POST /storyboard/regenerate-image without token should fail auth', async () => {
  const response = await fetch(`${baseUrl}/storyboard/regenerate-image`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.error || body.message);
});

test('GET /admin/users without token should be unauthorized', async () => {
  const response = await fetch(`${baseUrl}/admin/users`);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.message || body.error);
});

test('GET /admin/users with non-admin role should be forbidden', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'USER',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/admin/users`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.ok(body.message || body.error);
});

test('POST /admin/change-plan without token should be unauthorized', async () => {
  const response = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      newPlan: 'PLAN_30_DAYS',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.ok(body.message || body.error);
});

test('POST /admin/change-plan with non-admin role should be forbidden', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'USER',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      newPlan: 'PLAN_30_DAYS',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.ok(body.message || body.error);
});

test('POST /admin/change-plan should return 400 when payload is incomplete', async () => {
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.message || body.error);
});

test('POST /admin/change-plan should return 400 for invalid plan', async () => {
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      newPlan: 'PLANO_INVALIDO',
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.message || body.error);
});

test('GET /admin/users should return users list for admin role when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user } = await createAuthUser('integration-admin-users-success');
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/admin/users`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some((listedUser) => listedUser.email === user.email));
});

test('POST /admin/change-plan should update user plan for admin role when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user } = await createAuthUser('integration-admin-change-plan-success');
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const changePlanResponse = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      newPlan: 'PLAN_3_MONTHS',
    }),
  });
  const changePlanBody = await changePlanResponse.json();

  assert.equal(changePlanResponse.status, 200);
  assert.ok(changePlanBody.message);

  const usersResponse = await fetch(`${baseUrl}/admin/users`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  });
  const usersBody = await usersResponse.json();

  assert.equal(usersResponse.status, 200);
  assert.ok(Array.isArray(usersBody));

  const updatedUser = usersBody.find((listedUser) => listedUser.email === user.email);
  assert.ok(updatedUser);
  assert.equal(updatedUser.plan, 'PLAN_3_MONTHS');
  assert.equal(updatedUser.status, 'ACTIVE');
});

test('project routes should return 400 for invalid projectId format', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });
  const invalidProjectId = 'invalid-project-id';

  const getResponse = await fetch(`${baseUrl}/projects/${invalidProjectId}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const getBody = await getResponse.json();
  assert.equal(getResponse.status, 400);
  assert.ok(getBody.error);

  const updateResponse = await fetch(`${baseUrl}/projects/${invalidProjectId}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: 'Nao deve atualizar' }),
  });
  const updateBody = await updateResponse.json();
  assert.equal(updateResponse.status, 400);
  assert.ok(updateBody.error);

  const deleteResponse = await fetch(`${baseUrl}/projects/${invalidProjectId}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const deleteBody = await deleteResponse.json();
  assert.equal(deleteResponse.status, 400);
  assert.ok(deleteBody.error);
});

test('storyboard job endpoints should return 404 when job does not exist', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });
  const missingJobId = 'job-not-found';

  const resultResponse = await fetch(`${baseUrl}/storyboard/jobs/${missingJobId}/result`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const resultBody = await resultResponse.json();
  assert.equal(resultResponse.status, 404);
  assert.ok(resultBody.error);

  const eventsResponse = await fetch(`${baseUrl}/storyboard/jobs/${missingJobId}/events`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const eventsBody = await eventsResponse.json();
  assert.equal(eventsResponse.status, 404);
  assert.ok(eventsBody.error);
});

test('POST /projects should return 400 for invalid payload', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/projects`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: '' }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /storyboard/generate/start should return 400 for missing required fields', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /storyboard/generate/start should return 400 for invalid pacing range', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...buildStoryboardPayload('Conteudo minimo valido para schema base.'),
      pacing: 5,
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /storyboard/generate should return 400 for missing required fields', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/storyboard/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('POST /storyboard/regenerate-image should return 400 for missing required fields', async () => {
  const token = signJwt({
    id: 'synthetic-user-id',
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
  });

  const response = await fetch(`${baseUrl}/storyboard/regenerate-image`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error);
});

test('authenticated user should create and list projects when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user, token } = await createAuthUser('integration-create-list');
  const createdProject = await createProject(token, { title: 'Projeto Integração' });

  assert.equal(createdProject.title, 'Projeto Integração');
  assert.equal(createdProject.userId, user.id);

  const listProjectsResponse = await fetch(`${baseUrl}/projects`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const projects = await listProjectsResponse.json();

  assert.equal(listProjectsResponse.status, 200);
  assert.ok(Array.isArray(projects));
  assert.ok(projects.some((project) => project.id === createdProject.id));
});

test('authenticated user should update project fields when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-update');
  const createdProject = await createProject(token, { title: 'Projeto Antes' });

  const updatePayload = {
    title: 'Projeto Depois',
    resultJson: {
      scenes: [{ sceneNumber: 1, visualDescription: 'Cena de teste', imageUrl: 'https://example.com/image.png' }],
    },
    lastError: null,
  };

  const updateResponse = await fetch(`${baseUrl}/projects/${createdProject.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });
  const updatedProject = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updatedProject.title, 'Projeto Depois');
  assert.ok(Array.isArray(updatedProject.resultJson?.scenes));
  assert.equal(updatedProject.resultJson.scenes.length, 1);

  const getResponse = await fetch(`${baseUrl}/projects/${createdProject.id}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  const fetchedProject = await getResponse.json();

  assert.equal(getResponse.status, 200);
  assert.equal(fetchedProject.title, 'Projeto Depois');
});

test('authenticated user should delete own project when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-delete');
  const createdProject = await createProject(token, { title: 'Projeto Para Excluir' });

  const deleteResponse = await fetch(`${baseUrl}/projects/${createdProject.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  const deleteBody = await deleteResponse.json();

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteBody.success, true);

  const getAfterDeleteResponse = await fetch(`${baseUrl}/projects/${createdProject.id}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
  const getAfterDeleteBody = await getAfterDeleteResponse.json();

  assert.equal(getAfterDeleteResponse.status, 404);
  assert.ok(getAfterDeleteBody.error);
});

test('user should not update project from another user when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const owner = await createAuthUser('integration-owner');
  const outsider = await createAuthUser('integration-outsider');
  const project = await createProject(owner.token, { title: 'Projeto Privado' });

  const forbiddenUpdateResponse = await fetch(`${baseUrl}/projects/${project.id}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${outsider.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: 'Tentativa Indevida' }),
  });
  const forbiddenUpdateBody = await forbiddenUpdateResponse.json();

  assert.equal(forbiddenUpdateResponse.status, 403);
  assert.ok(forbiddenUpdateBody.error);
});

test('user should not read project from another user when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const owner = await createAuthUser('integration-read-owner');
  const outsider = await createAuthUser('integration-read-outsider');
  const project = await createProject(owner.token, { title: 'Projeto Privado Leitura' });

  const forbiddenGetResponse = await fetch(`${baseUrl}/projects/${project.id}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${outsider.token}`,
    },
  });
  const forbiddenGetBody = await forbiddenGetResponse.json();

  assert.equal(forbiddenGetResponse.status, 403);
  assert.ok(forbiddenGetBody.error);
});

test('user should not delete project from another user when DB is ready', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const owner = await createAuthUser('integration-delete-owner');
  const outsider = await createAuthUser('integration-delete-outsider');
  const project = await createProject(owner.token, { title: 'Projeto Privado Exclusao' });

  const forbiddenDeleteResponse = await fetch(`${baseUrl}/projects/${project.id}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${outsider.token}`,
    },
  });
  const forbiddenDeleteBody = await forbiddenDeleteResponse.json();

  assert.equal(forbiddenDeleteResponse.status, 403);
  assert.ok(forbiddenDeleteBody.error);

  const ownerGetResponse = await fetch(`${baseUrl}/projects/${project.id}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${owner.token}`,
    },
  });
  const ownerGetBody = await ownerGetResponse.json();

  assert.equal(ownerGetResponse.status, 200);
  assert.equal(ownerGetBody.id, project.id);
});

test('storyboard async job should complete successfully in mock mode', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-job-success');

  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Cena um. Cena dois. Cena tres.')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);
  assert.ok(startBody.projectId);
  assert.equal(startBody.status, 'running');

  const jobResult = await waitForJobResult(token, startBody.jobId);
  assert.equal(jobResult.status, 200);
  assert.equal(jobResult.body.status, 'completed');
  assert.equal(jobResult.body.projectId, startBody.projectId);
  assert.ok(Array.isArray(jobResult.body.scenes));
  assert.ok(jobResult.body.scenes.length > 0);

  const projectResponse = await fetch(`${baseUrl}/projects/${startBody.projectId}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const projectBody = await projectResponse.json();

  assert.equal(projectResponse.status, 200);
  assert.equal(projectBody.status, 'COMPLETED');
  assert.ok(Array.isArray(projectBody.resultJson?.scenes));
});

test('storyboard async job should fail with mocked failure marker', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-job-fail');

  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('__MOCK_FAIL__ forcar erro no job')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);
  assert.ok(startBody.projectId);

  const jobResult = await waitForJobResult(token, startBody.jobId);
  assert.equal(jobResult.status, 400);
  assert.equal(jobResult.body.status, 'failed');
  assert.ok(jobResult.body.error || jobResult.body.message);

  const projectResponse = await fetch(`${baseUrl}/projects/${startBody.projectId}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  const projectBody = await projectResponse.json();

  assert.equal(projectResponse.status, 200);
  assert.equal(projectBody.status, 'FAILED');
  assert.ok(typeof projectBody.lastError === 'string');
});

test('storyboard events stream should emit completed event in mock mode', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-sse-success');
  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Primeira cena. Segunda cena.')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);

  const events = await collectSseEvents(token, startBody.jobId);
  assert.ok(events.length >= 2);
  assert.ok(events.some((evt) => evt.event === 'progress'));
  assert.ok(events.some((evt) => evt.event === 'completed'));

  const completed = events.find((evt) => evt.event === 'completed');
  assert.ok(completed);
  assert.equal(completed.data.projectId, startBody.projectId);
  assert.equal(completed.data.status, 'completed');
});

test('storyboard events stream should emit failed event in mock mode', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-sse-fail');
  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('__MOCK_FAIL__ falha sse')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);

  const events = await collectSseEvents(token, startBody.jobId);
  assert.ok(events.length >= 1);
  assert.ok(events.some((evt) => evt.event === 'failed'));

  const failed = events.find((evt) => evt.event === 'failed');
  assert.ok(failed);
  assert.equal(failed.data.projectId, startBody.projectId);
  assert.equal(failed.data.status, 'failed');
  assert.ok(failed.data.error || failed.data.message);
});

test('storyboard events stream should deny access for another user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const owner = await createAuthUser('integration-sse-owner');
  const outsider = await createAuthUser('integration-sse-outsider');

  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${owner.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Cena privada um. Cena privada dois.')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/jobs/${startBody.jobId}/events`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${outsider.token}`,
    },
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error);
});

test('storyboard job result should deny access for another user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const owner = await createAuthUser('integration-result-owner');
  const outsider = await createAuthUser('integration-result-outsider');

  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${owner.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Cena privada resultado um. Cena privada resultado dois.')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/jobs/${startBody.jobId}/result`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${outsider.token}`,
    },
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error);
});

test('storyboard job result should require auth token', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { token } = await createAuthUser('integration-result-auth');
  const startResponse = await fetch(`${baseUrl}/storyboard/generate/start`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Cena auth resultado um. Cena auth resultado dois.')),
  });
  const startBody = await startResponse.json();

  assert.equal(startResponse.status, 200);
  assert.ok(startBody.jobId);

  const unauthorizedResponse = await fetch(`${baseUrl}/storyboard/jobs/${startBody.jobId}/result`, {
    method: 'GET',
  });
  const unauthorizedBody = await unauthorizedResponse.json();

  assert.equal(unauthorizedResponse.status, 401);
  assert.ok(unauthorizedBody.error || unauthorizedBody.message);
});

test('storyboard generate should deny banned user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user, token } = await createAuthUser('integration-generate-banned');
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const banResponse = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      newPlan: 'BAN_USER',
    }),
  });
  const banBody = await banResponse.json();
  assert.equal(banResponse.status, 200);
  assert.ok(banBody.message);

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Teste de geracao bloqueada por banimento.')),
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error || forbiddenBody.message);
});

test('storyboard regenerate-image should deny banned user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user, token } = await createAuthUser('integration-regenerate-banned');
  const adminToken = signJwt({
    id: 'synthetic-admin-id',
    role: 'ADMIN',
    iat: Math.floor(Date.now() / 1000),
  });

  const banResponse = await fetch(`${baseUrl}/admin/change-plan`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      newPlan: 'BAN_USER',
    }),
  });
  const banBody = await banResponse.json();
  assert.equal(banResponse.status, 200);
  assert.ok(banBody.message);

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/regenerate-image`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRegenerateImagePayload()),
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error || forbiddenBody.message);
});

test('storyboard generate should deny expired user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user, token } = await createAuthUser('integration-generate-expired');
  await updateUserStatus(user.id, 'EXPIRED');

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildStoryboardPayload('Teste de geracao bloqueada por expiracao.')),
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error || forbiddenBody.message);
});

test('storyboard regenerate-image should deny expired user', async (t) => {
  if (!databaseReady) t.skip('Database not ready in this environment.');

  const { user, token } = await createAuthUser('integration-regenerate-expired');
  await updateUserStatus(user.id, 'EXPIRED');

  const forbiddenResponse = await fetch(`${baseUrl}/storyboard/regenerate-image`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildRegenerateImagePayload()),
  });
  const forbiddenBody = await forbiddenResponse.json();

  assert.equal(forbiddenResponse.status, 403);
  assert.ok(forbiddenBody.error || forbiddenBody.message);
});
