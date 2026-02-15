import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';

const port = 3200 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret';
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

before(async () => {
  serverProcess = spawn('node', ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET: jwtSecret,
      STORYBOARD_MOCK_MODE: '1',
      DATABASE_URL:
        process.env.DATABASE_URL || 'postgresql://user:password@127.0.0.1:5432/storyflow?schema=public',
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
