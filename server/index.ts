import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const app = express();
const PORT = Number(process.env.PORT || 3100);

app.use(cors());
app.use(express.json({ limit: '30mb' }));

interface DispatchRecord {
  dispatchId: string;
  idempotencyKey: string;
  projectId: string;
  targetProject: string;
  assignee?: string;
  title: string;
  status: 'delivered' | 'queued_local' | 'completed' | 'accepted' | 'needs_revision';
  externalUrl?: string;
  reviewNote?: string;
  createdAt: string;
  updatedAt?: string;
}

const dispatchStore = new Map<string, DispatchRecord>();

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'visualpatch',
    version: '1.0.0',
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'visualpatch',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

function isPrivateOrUnsafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    const host = parsed.hostname.toLowerCase();
    if (host === '169.254.169.254' || host.endsWith('.internal')) return true;
    return false;
  } catch {
    return true;
  }
}

app.post('/api/control-room/dispatch', async (req, res) => {
  try {
    const {
      idempotencyKey,
      projectId,
      targetProject,
      assignee,
      title,
      description,
      operations,
      comments,
      sourceUrl,
      acceptanceCriteria,
      controlRoomEndpoint,
      apiToken,
    } = req.body ?? {};

    if (!title || typeof title !== 'string' || !projectId || typeof projectId !== 'string') {
      res.status(400).json({ error: 'Missing required fields: title and projectId' });
      return;
    }

    const dedupeKey = typeof idempotencyKey === 'string' && idempotencyKey.trim()
      ? idempotencyKey.trim()
      : crypto.createHash('sha256').update(`${projectId}:${title}:${operations?.length ?? 0}`).digest('hex');

    const existing = dispatchStore.get(dedupeKey);
    if (existing) {
      res.status(200).json({ ...existing, deduplicated: true });
      return;
    }

    const dispatchId = `vp-task-${crypto.randomUUID().slice(0, 8)}`;

    if (controlRoomEndpoint && typeof controlRoomEndpoint === 'string' && controlRoomEndpoint.trim()) {
      const endpoint = controlRoomEndpoint.trim();
      if (isPrivateOrUnsafeUrl(endpoint)) {
        res.status(400).json({ error: 'Invalid or unsafe Control Room endpoint URL' });
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': dedupeKey,
      };
      if (apiToken && typeof apiToken === 'string') {
        headers['Authorization'] = `Bearer ${apiToken}`;
      }

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          description,
          projectId: targetProject || projectId,
          assignee: assignee || undefined,
          sourceUrl: sourceUrl || undefined,
          operations: Array.isArray(operations) ? operations : [],
          comments: Array.isArray(comments) ? comments : [],
          acceptanceCriteria: Array.isArray(acceptanceCriteria) ? acceptanceCriteria : [],
        }),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        res.status(502).json({
          error: `Control Room returned HTTP ${upstream.status}`,
          details: text.slice(0, 500),
          retryable: upstream.status >= 500 || upstream.status === 429,
        });
        return;
      }

      const data = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
      const record: DispatchRecord = {
        dispatchId,
        idempotencyKey: dedupeKey,
        projectId,
        targetProject: targetProject || 'default',
        assignee,
        title,
        status: 'delivered',
        externalUrl: typeof data.url === 'string' ? data.url : undefined,
        createdAt: new Date().toISOString(),
      };
      dispatchStore.set(dedupeKey, record);
      res.status(201).json(record);
      return;
    }

    const record: DispatchRecord = {
      dispatchId,
      idempotencyKey: dedupeKey,
      projectId,
      targetProject: targetProject || 'local-queue',
      assignee,
      title,
      status: 'queued_local',
      externalUrl: `#/tasks/${dispatchId}`,
      createdAt: new Date().toISOString(),
    };
    dispatchStore.set(dedupeKey, record);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal server error',
      retryable: true,
    });
  }
});

app.get('/api/control-room/dispatches', (_req, res) => {
  res.status(200).json({ items: Array.from(dispatchStore.values()) });
});

app.get('/api/control-room/dispatches/:dispatchId', (req, res) => {
  const found = Array.from(dispatchStore.values()).find(
    (d) => d.dispatchId === req.params.dispatchId
  );
  if (!found) {
    res.status(404).json({ error: 'Dispatch not found' });
    return;
  }
  res.status(200).json(found);
});

app.post('/api/control-room/dispatches/:dispatchId/review', (req, res) => {
  const found = Array.from(dispatchStore.values()).find(
    (d) => d.dispatchId === req.params.dispatchId
  );
  if (!found) {
    res.status(404).json({ error: 'Dispatch not found' });
    return;
  }
  const { accepted, reviewNote } = req.body ?? {};
  found.status = accepted ? 'accepted' : 'needs_revision';
  found.reviewNote = typeof reviewNote === 'string' ? reviewNote : undefined;
  found.updatedAt = new Date().toISOString();
  res.status(200).json(found);
});

const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`VisualPatch server listening on http://localhost:${PORT}`);
});
