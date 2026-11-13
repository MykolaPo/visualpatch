import JSZip from 'jszip';
import type {
  AIProviderConfig,
  CommentItem,
  Operation,
  Project,
  ProjectSnapshot,
  VisualElement,
} from '../types/editor';
import { loadImage } from './imageImporter';

function hasRasterMovedOrHidden(el: VisualElement): boolean {
  if (el.type !== 'raster' || !el.sourceCrop) return false;
  if (el.deleted || !el.visible) return true;
  return (
    Math.round(el.x) !== Math.round(el.sourceCrop.x) ||
    Math.round(el.y) !== Math.round(el.sourceCrop.y) ||
    Math.round(el.width) !== Math.round(el.sourceCrop.width) ||
    Math.round(el.height) !== Math.round(el.sourceCrop.height) ||
    Math.round(el.rotation) !== 0
  );
}

export async function renderResultDataUrl(
  project: Project,
  elements: VisualElement[]
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = project.canvasWidth;
  canvas.height = project.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D недоступен');

  const baseImg = await loadImage(project.sourceImage);
  ctx.drawImage(baseImg, 0, 0, project.canvasWidth, project.canvasHeight);

  // 1. Draw background restoration patches for moved/deleted/hidden raster elements
  for (const el of elements) {
    if (el.type === 'raster' && el.sourceCrop && hasRasterMovedOrHidden(el)) {
      if (el.bgRestoreMode === 'none') continue;
      const { x, y, width, height } = el.sourceCrop;
      if (el.bgRestoreMode === 'solid') {
        ctx.fillStyle = el.bgRestoreColor || '#ffffff';
        ctx.fillRect(x, y, width, height);
      } else if (el.bgRestoreDataUrl) {
        const patchImg = await loadImage(el.bgRestoreDataUrl);
        ctx.drawImage(patchImg, x, y, width, height);
      } else {
        ctx.fillStyle = el.bgRestoreColor || '#ffffff';
        ctx.fillRect(x, y, width, height);
      }
    }
  }

  // 2. Draw active visible elements sorted by zIndex
  const visibleElements = elements
    .filter((e) => !e.deleted && e.visible)
    .sort((a, b) => a.zIndex - b.zIndex);

  for (const el of visibleElements) {
    ctx.save();
    ctx.globalAlpha = el.styles.opacity ?? 1;
    ctx.translate(el.x, el.y);
    if (el.rotation) {
      ctx.rotate((el.rotation * Math.PI) / 180);
    }

    if ((el.type === 'raster' || el.type === 'image') && el.imageDataUrl) {
      const elImg = await loadImage(el.imageDataUrl);
      ctx.drawImage(elImg, 0, 0, el.width, el.height);
    } else if (el.type === 'rect' || el.type === 'container' || el.type === 'button') {
      const r = el.styles.borderRadius ?? (el.type === 'button' ? 6 : 0);
      ctx.beginPath();
      ctx.roundRect(0, 0, el.width, el.height, r);
      if (el.styles.fill) {
        ctx.fillStyle = el.styles.fill;
        ctx.fill();
      }
      if (el.styles.stroke && (el.styles.strokeWidth ?? 1) > 0) {
        ctx.strokeStyle = el.styles.stroke;
        ctx.lineWidth = el.styles.strokeWidth ?? 1;
        ctx.stroke();
      }
      if (el.content) {
        ctx.fillStyle = el.styles.color || '#ffffff';
        ctx.font = `${el.styles.fontWeight || '600'} ${el.styles.fontSize || 14}px ${
          el.styles.fontFamily || 'Inter, sans-serif'
        }`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.content, el.width / 2, el.height / 2);
      }
    } else if (el.type === 'text') {
      ctx.fillStyle = el.styles.color || '#0f172a';
      ctx.font = `${el.styles.fontWeight || '500'} ${el.styles.fontSize || 16}px ${
        el.styles.fontFamily || 'Inter, sans-serif'
      }`;
      ctx.textBaseline = 'top';
      ctx.fillText(el.content || '', 0, 0);
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

export async function renderComparisonDataUrl(
  project: Project,
  elements: VisualElement[],
  splitRatio = 0.5
): Promise<string> {
  const resultUrl = await renderResultDataUrl(project, elements);
  const [origImg, resImg] = await Promise.all([
    loadImage(project.sourceImage),
    loadImage(resultUrl),
  ]);

  const w = project.canvasWidth;
  const h = project.canvasHeight;
  const splitX = Math.round(w * splitRatio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Left: Original
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, h);
  ctx.clip();
  ctx.drawImage(origImg, 0, 0, w, h);
  ctx.restore();

  // Right: Result
  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, w - splitX, h);
  ctx.clip();
  ctx.drawImage(resImg, 0, 0, w, h);
  ctx.restore();

  // Divider line
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(splitX - 2, 0, 4, h);

  return canvas.toDataURL('image/png');
}

function formatOpDescription(op: Operation): string {
  const name = op.elementName || op.elementId;
  const b = op.before as Record<string, unknown> | null;
  const a = op.after as Record<string, unknown> | null;

  switch (op.type) {
    case 'MOVE':
      return `Элемент **${name}** перемещён: с \`X=${b?.x}, Y=${b?.y}\` на \`X=${a?.x}, Y=${a?.y}\`. Сохранить первоначальные размеры и стили.`;
    case 'RESIZE':
      return `Элемент **${name}** изменён по размеру: с \`${b?.width}×${b?.height} px\` на \`${a?.width}×${a?.height} px\` (позиция \`X=${a?.x}, Y=${a?.y}\`).`;
    case 'CREATE':
      return `Создан новый элемент **${name}** (тип: \`${a?.type || 'element'}\`, позиция: \`X=${a?.x}, Y=${a?.y}\`, размер: \`${a?.width}×${a?.height} px\`).`;
    case 'DELETE':
      return `Удалён элемент **${name}** (исходная позиция: \`X=${b?.x}, Y=${b?.y}\`, размер: \`${b?.width}×${b?.height} px\`). Освободившуюся область восстановить согласно фону.`;
    case 'HIDE':
      return `Изменена видимость элемента **${name}**: \`visible=${String(a?.visible)}\`.`;
    case 'DUPLICATE':
      return `Дублирован элемент **${name}** в позицию \`X=${a?.x}, Y=${a?.y}\`.`;
    case 'EDIT_TEXT':
      return `Изменён текст элемента **${name}**: с «${String(b?.content ?? '')}» на «${String(a?.content ?? '')}».`;
    case 'CHANGE_STYLE':
      return `Обновлены стили элемента **${name}**: \`${JSON.stringify(a?.styles ?? a)}\`.`;
    case 'CHANGE_ORDER':
      return `Изменён порядок слоёв (zIndex) элемента **${name}**: с \`${b?.zIndex}\` на \`${a?.zIndex}\`.`;
    case 'GROUP':
      return `Сгруппированы элементы в контейнер **${name}**.`;
    case 'UNGROUP':
      return `Разгруппирован контейнер **${name}**.`;
    case 'ADD_COMMENT':
      return `Добавлен комментарий к **${name}**: «${String(a?.text ?? '')}».`;
    default:
      return `Операция ${op.type} над **${name}**.`;
  }
}

export function generateMarkdownSpec(
  project: Project,
  elements: VisualElement[],
  operations: Operation[],
  comments: CommentItem[]
): string {
  const activeElements = elements.filter((e) => !e.deleted);
  const deletedElements = elements.filter((e) => e.deleted);

  const lines: string[] = [
    `# Техническое задание: ${project.name}`,
    '',
    `**Ссылка на сайт:** ${project.sourceUrl || 'Не указана'}  `,
    `**Разрешение макета:** ${project.canvasWidth} × ${project.canvasHeight} px  `,
    `**Дата формирования:** ${new Date().toISOString()}  `,
    '',
    '## 1. Цель изменений',
    'Внести визуальные правки в существующий интерфейс согласно приложенному итоговому макету (`result.png`) и списку операций, сохраняя исходный дизайн, цвета, шрифты и стили там, где не указано иное.',
    '',
    '## 2. Исходные и итоговые материалы',
    '- Исходное состояние: `original.png`',
    '- Желаемый результат: `result.png`',
    '- Структурированный diff: `changes.json`',
    '',
    `## 3. Перечень элементов (${activeElements.length} активных, ${deletedElements.length} удалённых)`,
    '',
    '| ID | Название | Тип | Позиция (X, Y) | Размер (W × H) | CSS-селектор / Статус |',
    '|---|---|---|---|---|---|',
    ...elements.map((el) => {
      const status = el.deleted ? 'Удалён' : el.visible ? 'Активен' : 'Скрыт';
      const selector = el.domMetadata?.selector ? `\`${el.domMetadata.selector}\` · ` : '';
      return `| \`${el.id}\` | ${el.name} | \`${el.type}\` | ${Math.round(el.x)}, ${Math.round(el.y)} | ${Math.round(el.width)} × ${Math.round(el.height)} | ${selector}${status} |`;
    }),
    '',
    `## 4. Детальное описание операций (${operations.length})`,
    '',
  ];

  if (operations.length === 0) {
    lines.push('_Операции редактирования пока не зафиксированы._');
  } else {
    operations.forEach((op, index) => {
      lines.push(`### Изменение №${index + 1} (${op.type})`);
      lines.push(formatOpDescription(op));
      lines.push('');
    });
  }

  lines.push(`## 5. Комментарии пользователя (${comments.length})`);
  lines.push('');
  if (comments.length === 0) {
    lines.push('_Комментарии не добавлены._');
  } else {
    comments.forEach((c, idx) => {
      const linked = elements.find((e) => e.id === c.elementId);
      const targetLabel = linked ? `${linked.name} (\`${linked.id}\`)` : `Координаты (${Math.round(c.x)}, ${Math.round(c.y)})`;
      lines.push(`${idx + 1}. **[${c.priority || 'medium'}]** ${targetLabel}: «${c.text}»`);
    });
  }

  lines.push('');
  lines.push('## 6. Ограничения');
  lines.push('- Сохранять действующую цветовую палитру, типографику и отступы, если изменение не указано явно.');
  lines.push('- Не изменять расположение несвязанных элементов интерфейса.');
  lines.push('- Все координаты приведены относительно исходного разрешения скриншота.');
  lines.push('');
  lines.push('## 7. Критерии приёмки');
  lines.push('- Визуальное соответствие итоговому макету `result.png`.');
  lines.push('- Все перечисленные операции и комментарии выполнены без регрессий вёрстки.');
  lines.push('- Корректное отображение на десктопе и адаптивных разрешениях.');
  lines.push('');

  return lines.join('\n');
}

export function buildChangesJson(
  project: Project,
  elements: VisualElement[],
  operations: Operation[],
  comments: CommentItem[]
) {
  return {
    schemaVersion: project.schemaVersion,
    project: {
      id: project.id,
      name: project.name,
      sourceUrl: project.sourceUrl,
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      updatedAt: project.updatedAt,
    },
    summary: {
      totalElements: elements.length,
      activeElements: elements.filter((e) => !e.deleted && e.visible).length,
      deletedElements: elements.filter((e) => e.deleted).length,
      operationsCount: operations.length,
      commentsCount: comments.length,
    },
    elements: elements.map(({ imageDataUrl: _img, bgRestoreDataUrl: _bg, ...rest }) => rest),
    operations,
    comments,
  };
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

export async function exportProjectZipBlob(snapshot: ProjectSnapshot): Promise<Blob> {
  const zip = new JSZip();
  const { project, elements, operations, comments } = snapshot;

  const resultDataUrl = await renderResultDataUrl(project, elements);
  const taskMd = generateMarkdownSpec(project, elements, operations, comments);
  const changes = buildChangesJson(project, elements, operations, comments);

  zip.file('original.png', dataUrlToBase64(project.sourceImage), { base64: true });
  zip.file('result.png', dataUrlToBase64(resultDataUrl), { base64: true });
  zip.file('changes.json', JSON.stringify(changes, null, 2));
  zip.file('task.md', taskMd);
  zip.file('project.json', JSON.stringify(snapshot, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

export async function importProjectFromFile(file: File): Promise<ProjectSnapshot> {
  if (file.name.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file);
    const projectFile = zip.file('project.json');
    if (!projectFile) {
      throw new Error('В ZIP-архиве отсутствует файл project.json');
    }
    const text = await projectFile.async('string');
    const parsed = JSON.parse(text) as ProjectSnapshot;
    if (!parsed?.project?.id || !parsed?.project?.sourceImage) {
      throw new Error('Некорректная структура project.json');
    }
    return parsed;
  }

  const text = await file.text();
  const parsed = JSON.parse(text) as ProjectSnapshot;
  if (!parsed?.project?.id || !parsed?.project?.sourceImage) {
    throw new Error('Некорректный JSON-файл проекта');
  }
  return parsed;
}

export async function enhanceSpecWithAI(
  baseMarkdown: string,
  config: AIProviderConfig
): Promise<string> {
  if (config.mode === 'local') {
    return baseMarkdown;
  }

  const prompt = `Ты — технический менеджер. Улучши формулировки технического задания для разработчика на основе этого документа, не меняя числа, координаты, идентификаторы и ограничения:\n\n${baseMarkdown}`;

  if (config.mode === 'ollama') {
    const endpoint = config.endpoint.replace(/\/$/, '') || 'http://localhost:11434';
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model || 'llama3.1',
        prompt,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`Ollama вернула ошибку HTTP ${res.status}`);
    const data = (await res.json()) as { response?: string };
    return data.response?.trim() || baseMarkdown;
  }

  const endpoint = config.endpoint.replace(/\/$/, '') || 'https://api.openai.com/v1';
  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`AI API вернул ошибку HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() || baseMarkdown;
}
