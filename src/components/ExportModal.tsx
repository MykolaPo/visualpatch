import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  ScanEye,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import {
  buildChangesJson,
  enhanceSpecWithAI,
  exportProjectZipBlob,
  generateMarkdownSpec,
  renderComparisonDataUrl,
  renderResultDataUrl,
} from '../utils/exportEngine';
import { validateAndReadImageFile } from '../utils/imageImporter';
import { compareImagesVisually, type VisualDiffResult } from '../utils/visualDiff';

interface ExportModalProps {
  initialTab: 'export' | 'control-room';
  onClose: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export const ExportModal: React.FC<ExportModalProps> = ({
  initialTab,
  onClose,
}) => {
  const project = useEditorStore((s) => s.project);
  const elements = useEditorStore((s) => s.elements);
  const operations = useEditorStore((s) => s.operations);
  const comments = useEditorStore((s) => s.comments);
  const splitPosition = useEditorStore((s) => s.splitPosition);
  const aiConfig = useEditorStore((s) => s.aiConfig);
  const setAiConfig = useEditorStore((s) => s.setAiConfig);
  const controlRoomConfig = useEditorStore((s) => s.controlRoomConfig);
  const setControlRoomConfig = useEditorStore((s) => s.setControlRoomConfig);

  const [tab, setTab] = useState<'export' | 'control-room' | 'verify'>(initialTab);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [crResult, setCrResult] = useState<{
    status: 'idle' | 'success' | 'error';
    message: string;
    url?: string;
    retryable?: boolean;
  }>({ status: 'idle', message: '' });

  const [dispatches, setDispatches] = useState<
    Array<{
      dispatchId: string;
      title: string;
      status: string;
      createdAt: string;
    }>
  >([]);
  const [selectedDispatchId, setSelectedDispatchId] = useState<string>('');
  const [diffResult, setDiffResult] = useState<VisualDiffResult | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const verifyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'verify') return;
    fetch('/api/control-room/dispatches')
      .then((r) => r.json())
      .then((d: { items?: Array<{ dispatchId: string; title: string; status: string; createdAt: string }> }) => {
        const items = d.items || [];
        setDispatches(items);
        if (items.length > 0 && !selectedDispatchId) {
          setSelectedDispatchId(items[items.length - 1].dispatchId);
        }
      })
      .catch(() => {});
  }, [tab, selectedDispatchId]);

  const baseMarkdown = useMemo(() => {
    if (!project) return '';
    return generateMarkdownSpec(project, elements, operations, comments);
  }, [project, elements, operations, comments]);

  const activeMarkdown = aiMarkdown ?? baseMarkdown;

  if (!project) return null;

  const safeSlug =
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё_-]+/gi, '-')
      .replace(/^-|-$/g, '') || 'visualpatch-project';

  const handleDownloadResultPng = async () => {
    setBusy(true);
    try {
      const url = await renderResultDataUrl(project, elements);
      downloadDataUrl(url, 'result.png');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadComparisonPng = async () => {
    setBusy(true);
    try {
      const url = await renderComparisonDataUrl(project, elements, splitPosition);
      downloadDataUrl(url, 'comparison.png');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadChangesJson = () => {
    const json = buildChangesJson(project, elements, operations, comments);
    downloadBlob(
      new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }),
      'changes.json'
    );
  };

  const handleDownloadMarkdown = () => {
    downloadBlob(new Blob([activeMarkdown], { type: 'text/markdown' }), 'task.md');
  };

  const handleDownloadProjectJson = () => {
    const snapshot = { project, elements, operations, comments };
    downloadBlob(
      new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }),
      'project.json'
    );
  };

  const handleDownloadZip = async () => {
    setBusy(true);
    try {
      const blob = await exportProjectZipBlob({
        project,
        elements,
        operations,
        comments,
      });
      downloadBlob(blob, `${safeSlug}.zip`);
    } finally {
      setBusy(false);
    }
  };

  const handleEnhanceAI = async () => {
    setBusy(true);
    try {
      const enhanced = await enhanceSpecWithAI(baseMarkdown, aiConfig);
      setAiMarkdown(enhanced);
    } catch (err) {
      setCrResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Ошибка AI-провайдера',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchControlRoom = async () => {
    setBusy(true);
    setCrResult({ status: 'idle', message: '' });
    try {
      const idempotencyKey = `${project.id}-${operations.length}-${comments.length}`;
      const res = await fetch('/api/control-room/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          projectId: project.id,
          targetProject: controlRoomConfig.targetProject,
          assignee: controlRoomConfig.assignee,
          title: `VisualPatch: ${project.name}`,
          description: activeMarkdown,
          sourceUrl: project.sourceUrl,
          operations,
          comments,
          acceptanceCriteria: [
            'Визуальное соответствие итоговому макету result.png',
            'Сохранение исходных цветов и шрифтов там, где не указано иное',
          ],
          controlRoomEndpoint: controlRoomConfig.endpoint,
          apiToken: controlRoomConfig.apiToken,
        }),
      });
      const data = (await res.json()) as {
        dispatchId?: string;
        status?: string;
        externalUrl?: string;
        error?: string;
        retryable?: boolean;
      };
      if (!res.ok) {
        setCrResult({
          status: 'error',
          message: data.error || `HTTP ${res.status}`,
          retryable: data.retryable,
        });
        return;
      }
      setCrResult({
        status: 'success',
        message:
          data.status === 'delivered'
            ? `Задача ${data.dispatchId} отправлена в Control Room.`
            : `Задача ${data.dispatchId} сохранена в локальной очереди Control Room.`,
        url: data.externalUrl,
      });
    } catch (err) {
      setCrResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Сетевая ошибка отправки',
        retryable: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 740,
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 48px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`vp-btn ${tab === 'export' ? 'vp-btn-active' : ''}`}
              onClick={() => setTab('export')}
            >
              <Download size={13} /> Экспорт результатов
            </button>
            <button
              className={`vp-btn ${tab === 'control-room' ? 'vp-btn-active' : ''}`}
              onClick={() => setTab('control-room')}
            >
              <Send size={13} /> Control Room
            </button>
            <button
              className={`vp-btn ${tab === 'verify' ? 'vp-btn-active' : ''}`}
              onClick={() => setTab('verify')}
              data-testid="modal-tab-verify"
            >
              <ScanEye size={13} /> Приёмка (Этап 6)
            </button>
          </div>
          <button className="vp-btn vp-btn-icon" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {tab === 'export' ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="vp-btn vp-btn-primary"
                  disabled={busy}
                  onClick={handleDownloadZip}
                  data-testid="export-zip-btn"
                >
                  <FolderArchive size={14} /> Скачать весь проект (.zip)
                </button>
                <button
                  className="vp-btn"
                  disabled={busy}
                  onClick={handleDownloadResultPng}
                  data-testid="export-result-png-btn"
                >
                  <ImageIcon size={14} /> result.png
                </button>
                <button
                  className="vp-btn"
                  disabled={busy}
                  onClick={() => downloadDataUrl(project.sourceImage, 'original.png')}
                >
                  <ImageIcon size={14} /> original.png
                </button>
                <button
                  className="vp-btn"
                  disabled={busy}
                  onClick={handleDownloadComparisonPng}
                >
                  <ImageIcon size={14} /> comparison.png
                </button>
                <button
                  className="vp-btn"
                  onClick={handleDownloadChangesJson}
                  data-testid="export-changes-json-btn"
                >
                  <FileCode2 size={14} /> changes.json
                </button>
                <button
                  className="vp-btn"
                  onClick={handleDownloadMarkdown}
                  data-testid="export-task-md-btn"
                >
                  <FileText size={14} /> task.md
                </button>
                <button className="vp-btn" onClick={handleDownloadProjectJson}>
                  <FileCode2 size={14} /> project.json
                </button>
              </div>

              {/* Optional AI Spec Enhancement */}
              <div
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: 'var(--bg-panel-elevated)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>AI-провайдер ТЗ:</span>
                  <select
                    className="vp-input"
                    style={{ width: 170 }}
                    value={aiConfig.mode}
                    onChange={(e) =>
                      setAiConfig({
                        mode: e.target.value as 'local' | 'ollama' | 'openai',
                      })
                    }
                  >
                    <option value="local">Без AI (локальный алгоритм)</option>
                    <option value="ollama">Локальный Ollama</option>
                    <option value="openai">Внешний OpenAI API</option>
                  </select>
                  {aiConfig.mode !== 'local' && (
                    <input
                      className="vp-input"
                      style={{ width: 150 }}
                      placeholder="Модель"
                      value={aiConfig.model}
                      onChange={(e) => setAiConfig({ model: e.target.value })}
                    />
                  )}
                  {aiConfig.mode === 'openai' && (
                    <input
                      type="password"
                      className="vp-input"
                      style={{ width: 170 }}
                      placeholder="API Key (не сохраняется в экспорт)"
                      value={aiConfig.apiKey}
                      onChange={(e) => setAiConfig({ apiKey: e.target.value })}
                    />
                  )}
                </div>
                {aiConfig.mode !== 'local' && (
                  <button
                    className="vp-btn"
                    disabled={busy}
                    onClick={handleEnhanceAI}
                  >
                    <Sparkles size={13} /> Улучшить ТЗ
                  </button>
                )}
              </div>

              {/* Markdown Preview */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span className="vp-label" style={{ margin: 0 }}>
                    Предпросмотр технического задания (task.md)
                  </span>
                  <button
                    className="vp-btn"
                    style={{ height: 24, fontSize: 11 }}
                    onClick={() => {
                      navigator.clipboard.writeText(activeMarkdown);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
                <pre
                  data-testid="markdown-preview"
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    lineHeight: 1.5,
                    maxHeight: 280,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {activeMarkdown}
                </pre>
              </div>
            </div>
          ) : tab === 'control-room' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Передайте подготовленное задание AI-агентам или разработчикам через адаптер Control Room. Ключи доступа хранятся только локально и не попадают в экспортируемые файлы.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="vp-label">Целевой проект</label>
                  <input
                    className="vp-input"
                    value={controlRoomConfig.targetProject}
                    onChange={(e) =>
                      setControlRoomConfig({ targetProject: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="vp-label">Исполнитель (необязательно)</label>
                  <input
                    className="vp-input"
                    placeholder="Напр.: ai-frontend-agent"
                    value={controlRoomConfig.assignee}
                    onChange={(e) =>
                      setControlRoomConfig({ assignee: e.target.value })
                    }
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="vp-label">
                    Control Room API Endpoint (оставьте пустым для локальной очереди)
                  </label>
                  <input
                    className="vp-input"
                    placeholder="https://control-room.example.com/api/tasks"
                    value={controlRoomConfig.endpoint}
                    onChange={(e) =>
                      setControlRoomConfig({ endpoint: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="vp-label">API Token</label>
                  <input
                    type="password"
                    className="vp-input"
                    placeholder="Bearer token"
                    value={controlRoomConfig.apiToken}
                    onChange={(e) =>
                      setControlRoomConfig({ apiToken: e.target.value })
                    }
                  />
                </div>
              </div>

              {crResult.status !== 'idle' && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background:
                      crResult.status === 'success'
                        ? 'rgba(16, 185, 129, 0.14)'
                        : 'rgba(239, 68, 68, 0.14)',
                    border: `1px solid ${
                      crResult.status === 'success'
                        ? 'rgba(16, 185, 129, 0.4)'
                        : 'rgba(239, 68, 68, 0.4)'
                    }`,
                    fontSize: 12,
                  }}
                >
                  <div>{crResult.message}</div>
                  {crResult.url && (
                    <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      Ссылка на задачу: {crResult.url}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  className="vp-btn vp-btn-primary"
                  disabled={busy}
                  onClick={handleDispatchControlRoom}
                  data-testid="dispatch-control-room-btn"
                >
                  <Send size={13} />
                  {crResult.status === 'error' && crResult.retryable
                    ? 'Повторить отправку'
                    : 'Отправить на реализацию'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Загрузите скриншот реализации от AI-агента или разработчика — система сравнит его с ожидаемым макетом <code>result.png</code>, выделит расхождения и позволит принять работу или создать корректирующую задачу.
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  className="vp-input"
                  style={{ flex: 1, minWidth: 200 }}
                  value={selectedDispatchId}
                  onChange={(e) => setSelectedDispatchId(e.target.value)}
                >
                  {dispatches.length === 0 ? (
                    <option value="">Нет отправленных задач (можно сверить локально)</option>
                  ) : (
                    dispatches.map((d) => (
                      <option key={d.dispatchId} value={d.dispatchId}>
                        {d.dispatchId} · {d.title} [{d.status}]
                      </option>
                    ))
                  )}
                </select>
                <button
                  className="vp-btn vp-btn-primary"
                  disabled={busy}
                  onClick={() => verifyInputRef.current?.click()}
                  data-testid="upload-agent-screenshot-btn"
                >
                  <Upload size={13} /> Загрузить скриншот результата
                </button>
                <input
                  ref={verifyInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    setVerifyMsg(null);
                    try {
                      const { dataUrl } = await validateAndReadImageFile(f);
                      const expectedUrl = await renderResultDataUrl(project, elements);
                      const diff = await compareImagesVisually(expectedUrl, dataUrl);
                      setDiffResult(diff);
                    } catch (err) {
                      setVerifyMsg(err instanceof Error ? err.message : 'Ошибка сравнения');
                    } finally {
                      setBusy(false);
                      e.target.value = '';
                    }
                  }}
                />
              </div>

              {diffResult && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div>
                      <strong>Совпадение с макетом: {diffResult.matchPercentage}%</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        Зон расхождения: {diffResult.regions.length} ({diffResult.mismatchPixels} px)
                      </div>
                    </div>
                  </div>

                  <img
                    src={diffResult.diffImageDataUrl}
                    alt="Visual diff"
                    style={{
                      width: '100%',
                      maxHeight: 240,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-canvas)',
                    }}
                  />

                  {diffResult.regions.length > 0 && (
                    <div style={{ maxHeight: 110, overflowY: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                      {diffResult.regions.map((r) => (
                        <div key={r.id}>
                          • {r.id} [{r.severity}]: X={r.x}, Y={r.y}, {r.width}×{r.height}px
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={2}
                    className="vp-textarea"
                    placeholder="Комментарий к приёмке или уточнения для корректирующей задачи..."
                    value={verifyNote}
                    onChange={(e) => setVerifyNote(e.target.value)}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      className="vp-btn"
                      disabled={busy}
                      onClick={async () => {
                        if (selectedDispatchId) {
                          await fetch(`/api/control-room/dispatches/${selectedDispatchId}/review`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ accepted: true, reviewNote: verifyNote }),
                          });
                        }
                        setVerifyMsg('Результат подтверждён пользователем (статус: accepted).');
                      }}
                    >
                      <CheckCircle2 size={13} /> Принять результат
                    </button>
                    <button
                      className="vp-btn vp-btn-primary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          if (selectedDispatchId) {
                            await fetch(`/api/control-room/dispatches/${selectedDispatchId}/review`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ accepted: false, reviewNote: verifyNote }),
                            });
                          }
                          const regionLines = diffResult.regions
                            .map((r) => `- ${r.id} (${r.severity}): X=${r.x}, Y=${r.y}, ${r.width}x${r.height}px`)
                            .join('\n');
                          const res = await fetch('/api/control-room/dispatch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              idempotencyKey: `followup-${project.id}-${Date.now()}`,
                              projectId: project.id,
                              targetProject: controlRoomConfig.targetProject,
                              assignee: controlRoomConfig.assignee,
                              title: `VisualPatch [Уточнение]: ${project.name}`,
                              description: `Совпадение с макетом: ${diffResult.matchPercentage}%\n\nОбнаруженные расхождения:\n${regionLines}\n\nКомментарий: ${verifyNote || 'Привести вёрстку к макету result.png'}`,
                              sourceUrl: project.sourceUrl,
                              operations: [],
                              comments: [],
                              controlRoomEndpoint: controlRoomConfig.endpoint,
                              apiToken: controlRoomConfig.apiToken,
                            }),
                          });
                          const data = (await res.json()) as { dispatchId?: string };
                          setVerifyMsg(`Создана корректирующая задача: ${data.dispatchId || 'ok'}`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Send size={13} /> Создать корректирующую задачу
                    </button>
                  </div>
                </div>
              )}

              {verifyMsg && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.14)',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    fontSize: 12,
                  }}
                >
                  {verifyMsg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
