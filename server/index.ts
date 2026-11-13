import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

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

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fe80:') ||
    lower.startsWith('fc') ||
    lower.startsWith('fd')
  );
}

async function validatePublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Разрешены только протоколы http и https');
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Доступ к локальным адресам запрещён (SSRF protection)');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error('Доступ к внутренним IP-адресам запрещён (SSRF protection)');
    }
    return parsed;
  }
  const records = await dns.lookup(host, { all: true });
  if (records.length === 0) {
    throw new Error('Не удалось разрешить доменное имя');
  }
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new Error('Домен указывает на внутренний IP-адрес (SSRF protection)');
    }
  }
  return parsed;
}

function findChromeExecutable(): string | undefined {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p));
}

app.post('/api/capture-url', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) {
    res.status(400).json({ error: 'Укажите URL сайта' });
    return;
  }

  let targetUrl: URL;
  try {
    targetUrl = await validatePublicHttpUrl(rawUrl);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Некорректный URL',
    });
    return;
  }

  const executablePath = findChromeExecutable();
  if (!executablePath) {
    res.status(500).json({ error: 'Локальный браузер Chrome не найден на сервере' });
    return;
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));

    const response = await page.goto(targetUrl.toString(), {
      waitUntil: 'networkidle2',
      timeout: 20000,
    });

    if (response && response.status() >= 400) {
      res.status(422).json({
        error: `Сайт вернул HTTP ${response.status()} (${response.statusText() || 'доступ ограничен'}). Для защищённых сайтов используйте Chrome-расширение из папки extension/ или вставьте скриншот через Ctrl+V.`,
      });
      return;
    }

    // Dismiss common cookie / GDPR consent banners before capturing screenshot
    const dismissedCookie = await page.evaluate(() => {
      const acceptSelectors = [
        '#onetrust-accept-btn-handler',
        '.CybotCookiebotDialogBodyButtonAccept',
        '[id*="cookie" i] button[class*="accept" i]',
        '[class*="cookie" i] button[class*="accept" i]',
      ];
      for (const sel of acceptSelectors) {
        const btn = document.querySelector(sel) as HTMLElement | null;
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return true;
        }
      }

      const textMatch = /^(прийняти все|принять все|accept all|allow all|agree|необхідні|только необходимые|ок|ok|got it)$/i;
      const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
      for (const b of buttons) {
        const txt = ((b as HTMLElement).innerText || '').trim();
        if (textMatch.test(txt) && (b as HTMLElement).offsetParent !== null) {
          (b as HTMLElement).click();
          return true;
        }
      }

      let hid = false;
      const overlays = Array.from(document.querySelectorAll('[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="onetrust" i]'));
      for (const el of overlays) {
        const st = window.getComputedStyle(el);
        if (st.position === 'fixed' || st.position === 'sticky') {
          (el as HTMLElement).style.setProperty('display', 'none', 'important');
          hid = true;
        }
      }
      return hid;
    });

    if (dismissedCookie) {
      await new Promise((r) => setTimeout(r, 450));
    }

    const pageInfo = await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, input, textarea, select, img, h1, h2, h3, [role="button"]'
        )
      );

      const items: Array<{
        tag: string;
        type: string;
        name: string;
        x: number;
        y: number;
        width: number;
        height: number;
        domMetadata: Record<string, string>;
      }> = [];

      for (const node of candidates) {
        const rect = node.getBoundingClientRect();
        if (
          rect.width < 18 ||
          rect.height < 14 ||
          rect.right <= 0 ||
          rect.bottom <= 0 ||
          rect.left >= 1280 ||
          rect.top >= 800
        ) {
          continue;
        }
        const style = window.getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0'
        ) {
          continue;
        }

        const tag = node.tagName.toLowerCase();
        const rawText = (
          (node as HTMLElement).innerText ||
          node.getAttribute('placeholder') ||
          node.getAttribute('aria-label') ||
          node.getAttribute('alt') ||
          ''
        )
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40);

        const x = Math.max(0, Math.round(rect.left));
        const y = Math.max(0, Math.round(rect.top));
        const width = Math.min(1280 - x, Math.round(rect.width));
        const height = Math.min(800 - y, Math.round(rect.height));
        if (width < 16 || height < 12) continue;

        let selector = '';
        if (node.id) {
          selector = `#${CSS.escape(node.id)}`;
        } else {
          const parts: string[] = [];
          let cur: Element | null = node;
          while (cur && cur.nodeType === 1 && parts.length < 4) {
            let part = cur.tagName.toLowerCase();
            if (cur.classList && cur.classList.length > 0) {
              part += Array.from(cur.classList)
                .slice(0, 2)
                .map((c) => `.${CSS.escape(c)}`)
                .join('');
            }
            parts.unshift(part);
            cur = cur.parentElement;
          }
          selector = parts.join(' > ');
        }

        items.push({
          tag,
          type:
            tag === 'img'
              ? 'image'
              : tag === 'button' || node.getAttribute('role') === 'button'
              ? 'button'
              : tag.startsWith('h')
              ? 'text'
              : 'raster',
          name: rawText ? `${tag}: ${rawText}` : `${tag} #${items.length + 1}`,
          x,
          y,
          width,
          height,
          domMetadata: {
            selector,
            tag,
            backgroundColor: style.backgroundColor,
            color: style.color,
            fontSize: style.fontSize,
          },
        });
      }

      return {
        title: document.title || location.hostname,
        finalUrl: location.href,
        elements: items.slice(0, 45),
      };
    });

    const base64 = await page.screenshot({
      type: 'png',
      encoding: 'base64',
    });

    res.status(200).json({
      title: pageInfo.title,
      url: pageInfo.finalUrl,
      width: 1280,
      height: 800,
      screenshotDataUrl: `data:image/png;base64,${base64}`,
      domElements: pageInfo.elements,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Не удалось загрузить страницу',
    });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
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
