import 'dotenv/config';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { Prisma, PrismaClient, ProjectStatus, Status } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import bcrypt from 'bcryptjs';
import {
  generateStoryboard as generateStoryboardWithGemini,
  regenerateSceneImage as regenerateSceneImageWithGemini,
  type Scene as StoryboardScene,
} from './services/storyboardService';

const prisma = new PrismaClient();
const app = Fastify({
  logger: true,
  bodyLimit: 25 * 1024 * 1024,
});
const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '12h';
const serverPort = Number(process.env.PORT || 3001);

if (!jwtSecret) {
  throw new Error('JWT_SECRET is required');
}



// CORS
app.register(cors, {
  origin: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
});
/* =========================
   JWT CONFIG
========================= */
app.register(jwt, {
  secret: jwtSecret,
});

app.get('/health', async (_request: any, reply: any) => {
  return reply.send({
    status: 'ok',
    service: 'storyflow-backend',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (_request: any, reply: any) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return reply.send({
      status: 'ready',
      database: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return reply.code(503).send({
      status: 'not_ready',
      database: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});



/* =========================
   AUTH ROUTES (LOGIN/REGISTER/ME)
========================= */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  whatsapp: z.string().trim().min(1).max(30).optional(),
  plan: z.enum(['PLAN_30_DAYS', 'PLAN_3_MONTHS', 'PLAN_6_MONTHS', 'PLAN_1_YEAR']).optional().default('PLAN_30_DAYS'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const characterReferenceSchema = z.object({
  name: z.string().min(1),
  base64Image: z.string().min(1),
  mimeType: z.string().min(1),
  characteristic: z.string().optional(),
  context: z.string().optional(),
});

const characterInfoSchema = z.object({
  name: z.string().min(1),
  characteristic: z.string().optional(),
  context: z.string().optional(),
});

const generateStoryboardSchema = z.object({
  characterReferences: z.array(characterReferenceSchema).max(30),
  allCharactersInfo: z.array(characterInfoSchema).max(50),
  scriptOrSrtContent: z.string().min(1),
  isSrt: z.boolean(),
  imageStyle: z.string().min(1),
  restrictionPrompt: z.string().optional().default(''),
  delayBetweenScenes: z.number().int().min(0).max(60000).optional().default(30000),
  pacing: z.number().int().min(10).max(120).optional().default(35),
  projectId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

const regenerateSceneImageSchema = z.object({
  visualDescription: z.string().min(1),
  characterReferences: z.array(characterReferenceSchema).max(30),
  allCharactersInfo: z.array(characterInfoSchema).max(50),
  imageStyle: z.string().min(1),
  restrictionPrompt: z.string().optional().default(''),
});

const projectCreateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  inputJson: z.unknown().optional(),
});

const projectUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    inputJson: z.unknown().optional(),
    resultJson: z.unknown().optional(),
    lastError: z.string().nullable().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Nenhum campo para atualizar.',
  });

const projectIdParamSchema = z.object({
  projectId: z.string().uuid(),
});

type GenerateStoryboardPayload = z.infer<typeof generateStoryboardSchema>;

async function getUserForGemini(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      googleApiKey: true,
    },
  });

  if (!user) {
    return { ok: false as const, code: 404, error: 'Usuário não encontrado.' };
  }

  if (user.status === Status.BANNED || user.status === Status.EXPIRED) {
    return { ok: false as const, code: 403, error: 'Conta sem permissão para gerar conteúdo.' };
  }

  if (process.env.STORYBOARD_MOCK_MODE === '1') {
    return {
      ok: true as const,
      user: {
        ...user,
        googleApiKey: user.googleApiKey || 'mock-key',
      },
    };
  }

  if (!user.googleApiKey) {
    return {
      ok: false as const,
      code: 400,
      error: 'API Key não configurada. Clique em "Configurar API Key" para continuar.',
    };
  }

  return { ok: true as const, user };
}

async function getProjectForUser(projectId: string, requestUser: any) {
  const project = await prisma.storyboardProject.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return { ok: false as const, code: 404, error: 'Projeto não encontrado.' };
  }

  const isOwner = project.userId === requestUser.id;
  const isAdmin = requestUser.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return { ok: false as const, code: 403, error: 'Acesso negado ao projeto.' };
  }

  return { ok: true as const, project };
}

function buildStoryboardInputSnapshot(payload: GenerateStoryboardPayload) {
  return {
    allCharactersInfo: payload.allCharactersInfo,
    characterReferences: payload.characterReferences.map((char) => ({
      name: char.name,
      mimeType: char.mimeType,
      characteristic: char.characteristic || null,
      context: char.context || null,
      hasReferenceImage: true,
    })),
    scriptOrSrtContent: payload.scriptOrSrtContent,
    isSrt: payload.isSrt,
    imageStyle: payload.imageStyle,
    restrictionPrompt: payload.restrictionPrompt || '',
    delayBetweenScenes: payload.delayBetweenScenes,
    pacing: payload.pacing,
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  // Remove undefined values and guarantees valid JSON for Prisma Json fields.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaNullableJson(
  value: unknown
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return toPrismaJson(value);
}

function isUnauthorizedError(error: any): boolean {
  return (
    error?.statusCode === 401 ||
    (typeof error?.code === 'string' && error.code.startsWith('FST_JWT_'))
  );
}

function sendError(
  reply: any,
  statusCode: number,
  message: string,
  extra: Record<string, unknown> = {}
) {
  return reply.code(statusCode).send({
    error: message,
    message,
    ...extra,
  });
}

type StoryboardJobStatus = 'running' | 'completed' | 'failed';
type StoryboardJobEvent = 'progress' | 'completed' | 'failed';

interface StoryboardJob {
  id: string;
  userId: string;
  projectId: string;
  status: StoryboardJobStatus;
  message: string;
  createdAt: number;
  updatedAt: number;
  scenes?: StoryboardScene[];
  error?: string;
  clients: Set<any>;
  cleanupTimer?: NodeJS.Timeout;
}

const storyboardJobs = new Map<string, StoryboardJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function writeSseEvent(rawReply: any, event: StoryboardJobEvent, payload: Record<string, unknown>) {
  rawReply.write(`event: ${event}\n`);
  rawReply.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastJobEvent(
  job: StoryboardJob,
  event: StoryboardJobEvent,
  payload: Record<string, unknown>
) {
  for (const client of job.clients) {
    try {
      writeSseEvent(client, event, payload);
    } catch {
      job.clients.delete(client);
    }
  }
}

function scheduleJobCleanup(job: StoryboardJob) {
  if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => {
    storyboardJobs.delete(job.id);
  }, JOB_TTL_MS);
}

function notifyJobProgress(job: StoryboardJob, message: string) {
  job.message = message;
  job.updatedAt = Date.now();
  broadcastJobEvent(job, 'progress', {
    status: job.status,
    message: job.message,
    updatedAt: job.updatedAt,
  });
}

async function finishJobSuccess(job: StoryboardJob, scenes: StoryboardScene[]) {
  job.status = 'completed';
  job.scenes = scenes;
  job.message = 'Storyboard completo!';
  job.updatedAt = Date.now();

  broadcastJobEvent(job, 'completed', {
    projectId: job.projectId,
    status: job.status,
    message: job.message,
    updatedAt: job.updatedAt,
    sceneCount: scenes.length,
  });

  for (const client of job.clients) {
    try {
      client.end();
    } catch {}
  }
  job.clients.clear();

  await prisma.storyboardProject.update({
    where: { id: job.projectId },
    data: {
      status: ProjectStatus.COMPLETED,
      resultJson: toPrismaJson({ scenes }),
      lastError: null,
    },
  }).catch(() => {});

  scheduleJobCleanup(job);
}

async function finishJobFailure(job: StoryboardJob, error: string) {
  job.status = 'failed';
  job.error = error;
  job.message = error;
  job.updatedAt = Date.now();

  broadcastJobEvent(job, 'failed', {
    projectId: job.projectId,
    status: job.status,
    message: job.message,
    error: job.error,
    updatedAt: job.updatedAt,
  });

  for (const client of job.clients) {
    try {
      client.end();
    } catch {}
  }
  job.clients.clear();

  await prisma.storyboardProject.update({
    where: { id: job.projectId },
    data: {
      status: ProjectStatus.FAILED,
      lastError: error,
    },
  }).catch(() => {});

  scheduleJobCleanup(job);
}

function canAccessJob(requestUser: any, job: StoryboardJob) {
  return requestUser?.id === job.userId || requestUser?.role === 'ADMIN';
}

// REGISTER
app.post('/register', async (request: any, reply: any) => {
  try {
    const { email, password, whatsapp, plan } = registerSchema.parse(request.body);

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return sendError(reply, 400, 'Email já cadastrado.');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: passwordHash,
        whatsapp: whatsapp || null,
        role: 'USER',
        status: Status.PENDING,
        plan,
        expiresAt: null,
      },
      select: {
        id: true,
        email: true,
        whatsapp: true,
        role: true,
        status: true,
        plan: true,
        expiresAt: true,
        googleApiKey: true,
      },
    });

    return reply.send({ success: true, user });
  } catch (error: any) {
    return sendError(reply, 400, error?.message || 'Falha no registro.');
  }
});

// LOGIN
app.post('/login', async (request: any, reply: any) => {
  try {
    const { email, password } = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return sendError(reply, 400, 'Credenciais inválidas.');
    }

    if (user.status && String(user.status).toUpperCase() === 'BANNED') {
      return sendError(reply, 403, 'Usuário banido.');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return sendError(reply, 400, 'Credenciais inválidas.');
    }

    
    // BLOQUEIO: usuário precisa estar aprovado/ativo
    if (user.status !== Status.ACTIVE) {
      return sendError(reply, 403, 'Sua conta está em análise. Aguarde aprovação do administrador.', {
        status: user.status,
      });
    }


    const token = app.jwt.sign({ id: user.id, role: user.role }, { expiresIn: jwtExpiresIn });

      return reply.send({
        token,
        user: {
        email: user.email,
        role: user.role,
        status: user.status,
        plan: user.plan,
        expiresAt: user.expiresAt,
        googleApiKey: user.googleApiKey,
      },
    });
  } catch (error: any) {
    return sendError(reply, 400, error?.message || 'Falha no login.');
  }
});

// ME
app.get('/me', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const user = await prisma.user.findUnique({ where: { id: request.user.id } });
    if (!user) return sendError(reply, 404, 'User not found');

    return reply.send({
      email: user.email,
      role: user.role,
      status: user.status,
      plan: user.plan,
      expiresAt: user.expiresAt,
      googleApiKey: user.googleApiKey,
    });
  } catch {
    return sendError(reply, 401, 'Unauthorized');
  }
});
/* =========================
   AUTH DECORATOR
========================= */
app.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch {
    return sendError(reply, 401, 'Unauthorized');
  }
});

/* =========================
   GOOGLE API KEY VALIDATION
========================= */
async function validateGoogleApiKey(apiKey: string) {
  // Validação por formato (bloqueia e-mail/texto aleatório)
  const cleanKey = String(apiKey || '').trim();
  const looksLikeGoogleKey = /^AIza[0-9A-Za-z\-_]{30,}$/.test(cleanKey);

  if (!looksLikeGoogleKey) {
    return { valid: false as const, reason: 'INVALID_KEY' };
  }

  // (Opcional) Se quiser validar "de verdade" chamando Google, precisa instalar libs e lidar com quotas.
  // Por enquanto: formato OK = aceita.
  return { valid: true as const };
}

/* =========================
   SAVE USER API KEY
========================= */
app.put(
  '/user/apikey', async (request: any, reply: any) => {
      const apiKey = (request.body as any)?.apiKey;

      await request.jwtVerify();


    if (!apiKey || typeof apiKey !== 'string') {
      return sendError(reply, 400, 'API Key é obrigatória');
    }

    const cleanKey = apiKey.trim();
    const validation = await validateGoogleApiKey(cleanKey);

    if (!validation.valid) {
      switch (validation.reason) {
        case 'INVALID_KEY':
          return sendError(reply, 400, 'Chave inválida. Verifique no Google AI Studio.');
        case 'MODEL_NOT_SUPPORTED':
          return sendError(reply, 500, 'Erro interno: modelo não suportado para validação.');
        case 'QUOTA_EXCEEDED':
          return sendError(reply, 429, 'Quota excedida ou billing ausente no Google Cloud.');
        case 'PERMISSION_DENIED':
          return sendError(reply, 403, 'Chave válida, mas com restrição de IP/referrer/API.');
        default:
          return sendError(reply, 500, 'Erro temporário ao validar a chave. Tente novamente.');
      }
    }

    await prisma.user.update({
      where: { id: request.user.id },
      data: { googleApiKey: cleanKey },
    });

    return reply.send({ success: true });
  }
);

/* =========================
   PROJECT ROUTES
========================= */
app.get('/projects', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();

    const where = request.user?.role === 'ADMIN' ? {} : { userId: request.user.id };
    const projects = await prisma.storyboardProject.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    });

    return reply.send(projects);
  } catch {
    return sendError(reply, 401, 'Unauthorized');
  }
});

app.get('/projects/:projectId', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const { projectId } = projectIdParamSchema.parse(request.params);
    const result = await getProjectForUser(projectId, request.user);

    if (!result.ok) {
      return sendError(reply, result.code, result.error);
    }

    return reply.send(result.project);
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao carregar projeto.');
  }
});

app.post('/projects', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const payload = projectCreateSchema.parse(request.body || {});

    const project = await prisma.storyboardProject.create({
      data: {
        userId: request.user.id,
        title: payload.title || 'Projeto sem título',
        status: ProjectStatus.DRAFT,
        inputJson: toPrismaNullableJson(payload.inputJson),
      },
    });

    return reply.send(project);
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao criar projeto.');
  }
});

app.put('/projects/:projectId', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const { projectId } = projectIdParamSchema.parse(request.params);
    const payload = projectUpdateSchema.parse(request.body || {});
    const result = await getProjectForUser(projectId, request.user);

    if (!result.ok) {
      return sendError(reply, result.code, result.error);
    }

    const updateData: Prisma.StoryboardProjectUpdateInput = {};
    if (payload.title !== undefined) updateData.title = payload.title;
    if (payload.inputJson !== undefined) updateData.inputJson = toPrismaNullableJson(payload.inputJson);
    if (payload.resultJson !== undefined) updateData.resultJson = toPrismaNullableJson(payload.resultJson);
    if (payload.lastError !== undefined) updateData.lastError = payload.lastError;

    const project = await prisma.storyboardProject.update({
      where: { id: projectId },
      data: updateData,
    });

    return reply.send(project);
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao atualizar projeto.');
  }
});

app.delete('/projects/:projectId', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const { projectId } = projectIdParamSchema.parse(request.params);
    const result = await getProjectForUser(projectId, request.user);

    if (!result.ok) {
      return sendError(reply, result.code, result.error);
    }

    await prisma.storyboardProject.delete({ where: { id: projectId } });
    return reply.send({ success: true });
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao excluir projeto.');
  }
});

/* =========================
   STORYBOARD ROUTES (GEMINI SERVER-SIDE)
========================= */
app.post('/storyboard/generate', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();

    const payload = generateStoryboardSchema.parse(request.body);
    const { projectId: _projectId, title: _title, ...generationPayload } = payload;
    const userResult = await getUserForGemini(request.user.id);
    if (!userResult.ok) {
      return sendError(reply, userResult.code, userResult.error);
    }

    const scenes = await generateStoryboardWithGemini({
      ...generationPayload,
      apiKey: userResult.user.googleApiKey!,
    });

    return reply.send({ scenes });
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao gerar storyboard.');
  }
});

app.post('/storyboard/regenerate-image', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();

    const payload = regenerateSceneImageSchema.parse(request.body);
    const userResult = await getUserForGemini(request.user.id);
    if (!userResult.ok) {
      return sendError(reply, userResult.code, userResult.error);
    }

    const imageUrl = await regenerateSceneImageWithGemini({
      ...payload,
      apiKey: userResult.user.googleApiKey!,
    });

    return reply.send({ imageUrl });
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao regenerar imagem.');
  }
});

app.post('/storyboard/generate/start', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();

    const payload = generateStoryboardSchema.parse(request.body);
    const { projectId, title, ...generationPayload } = payload;
    const userResult = await getUserForGemini(request.user.id);
    if (!userResult.ok) {
      return sendError(reply, userResult.code, userResult.error);
    }

    const inputSnapshot = buildStoryboardInputSnapshot(payload);

    let projectRecord;
    if (projectId) {
      const projectResult = await getProjectForUser(projectId, request.user);
      if (!projectResult.ok) {
        return sendError(reply, projectResult.code, projectResult.error);
      }

      projectRecord = await prisma.storyboardProject.update({
        where: { id: projectId },
        data: {
          ...(title ? { title } : {}),
          status: ProjectStatus.PROCESSING,
          inputJson: toPrismaJson(inputSnapshot),
          lastError: null,
        },
      });
    } else {
      projectRecord = await prisma.storyboardProject.create({
        data: {
          userId: request.user.id,
          title: title || 'Projeto sem título',
          status: ProjectStatus.PROCESSING,
          inputJson: toPrismaJson(inputSnapshot),
          lastError: null,
        },
      });
    }

    const job: StoryboardJob = {
      id: randomUUID(),
      userId: request.user.id,
      projectId: projectRecord.id,
      status: 'running',
      message: 'Job criado. Iniciando processamento...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      clients: new Set(),
    };
    storyboardJobs.set(job.id, job);

    // Fire-and-forget: execução do job em background
    void (async () => {
      try {
        notifyJobProgress(job, 'Preparando geração do storyboard...');
        const scenes = await generateStoryboardWithGemini({
          ...generationPayload,
          apiKey: userResult.user.googleApiKey!,
          onProgress: (message) => notifyJobProgress(job, message),
        });
        await finishJobSuccess(job, scenes);
      } catch (error: any) {
        await finishJobFailure(job, error?.message || 'Falha no job de geração de storyboard.');
      }
    })();

    return reply.send({
      jobId: job.id,
      projectId: job.projectId,
      status: job.status,
      message: job.message,
    });
  } catch (error: any) {
    if (isUnauthorizedError(error)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, error?.message || 'Falha ao iniciar geração de storyboard.');
  }
});

app.get('/storyboard/jobs/:jobId/events', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const { jobId } = request.params as { jobId: string };
    const job = storyboardJobs.get(jobId);

    if (!job) {
      return sendError(reply, 404, 'Job não encontrado.');
    }
    if (!canAccessJob(request.user, job)) {
      return sendError(reply, 403, 'Acesso negado ao job.');
    }

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    writeSseEvent(raw, 'progress', {
      projectId: job.projectId,
      status: job.status,
      message: job.message,
      updatedAt: job.updatedAt,
    });

    if (job.status === 'completed') {
      writeSseEvent(raw, 'completed', {
        projectId: job.projectId,
        status: job.status,
        message: job.message,
        updatedAt: job.updatedAt,
        sceneCount: job.scenes?.length || 0,
      });
      raw.end();
      return;
    }

    if (job.status === 'failed') {
      writeSseEvent(raw, 'failed', {
        projectId: job.projectId,
        status: job.status,
        message: job.message,
        error: job.error,
        updatedAt: job.updatedAt,
      });
      raw.end();
      return;
    }

    const heartbeat = setInterval(() => {
      try {
        raw.write(': ping\n\n');
      } catch {}
    }, 15000);

    job.clients.add(raw);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      job.clients.delete(raw);
    });
  } catch {
    if (!reply.sent) {
      return sendError(reply, 401, 'Unauthorized');
    }
  }
});

app.get('/storyboard/jobs/:jobId/result', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    const { jobId } = request.params as { jobId: string };
    const job = storyboardJobs.get(jobId);

    if (!job) {
      return sendError(reply, 404, 'Job não encontrado.');
    }
    if (!canAccessJob(request.user, job)) {
      return sendError(reply, 403, 'Acesso negado ao job.');
    }

    if (job.status === 'running') {
      return reply.code(202).send({
        projectId: job.projectId,
        status: job.status,
        message: job.message,
        updatedAt: job.updatedAt,
      });
    }

    if (job.status === 'failed') {
      return reply.code(400).send({
        projectId: job.projectId,
        status: job.status,
        message: job.message,
        error: job.error || 'Falha no job.',
        updatedAt: job.updatedAt,
      });
    }

    return reply.send({
      projectId: job.projectId,
      status: job.status,
      message: job.message,
      scenes: job.scenes || [],
      updatedAt: job.updatedAt,
    });
  } catch {
    return sendError(reply, 401, 'Unauthorized');
  }
});

/* =========================
   START SERVER
========================= */
const start = async () => {
  try {
    await app.listen({ port: serverPort, host: '0.0.0.0' });
    console.log(`Server running on port ${serverPort}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};
/* =========================
   ADMIN ROUTES
========================= */

app.get('/admin/users', async (req: any, reply: any) => {
  try {
    await req.jwtVerify();

    if (req.user?.role !== 'ADMIN') {
      return sendError(reply, 403, 'Acesso Negado');
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        plan: true,
        status: true,
        expiresAt: true,
        role: true,
        whatsapp: true,
        googleApiKey: true,
        createdAt: true,
      },
    });

    return reply.send(users);
  } catch {
    return sendError(reply, 401, 'Unauthorized');
  }
});

app.post('/admin/change-plan', async (req: any, reply: any) => {
  try {
    await req.jwtVerify();

    if (req.user?.role !== 'ADMIN') {
      return sendError(reply, 403, 'Acesso Negado');
    }

    const { email, newPlan } = req.body || {};
    if (!email || !newPlan) {
      return sendError(reply, 400, 'email e newPlan obrigatórios');
    }

    if (newPlan === 'BAN_USER') {
      await prisma.user.update({
        where: { email },
        data: { status: Status.BANNED },
      });
      return reply.send({ message: 'Usuário banido' });
    }

    const plans: Record<string, number> = {
      MENSAL: 30,
      ANUAL: 365,
      PLAN_30_DAYS: 30,
      PLAN_3_MONTHS: 90,
      PLAN_6_MONTHS: 180,
      PLAN_1_YEAR: 365,
    };

    const days = plans[newPlan];
    if (!days) {
      return sendError(reply, 400, 'Plano inválido');
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + days);

    await prisma.user.update({
      where: { email },
      data: {
        plan: newPlan,
        status: Status.ACTIVE,
        expiresAt: expires,
      } as any,
    });

    return reply.send({ message: 'Plano atualizado' });
  } catch (e: any) {
    if (isUnauthorizedError(e)) {
      return sendError(reply, 401, 'Unauthorized');
    }
    return sendError(reply, 400, e.message);
  }
});

start();
