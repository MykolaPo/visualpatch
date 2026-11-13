import React, { useEffect, useRef, useState } from 'react';
import {
  ClipboardPaste,
  FolderOpen,
  ImagePlus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import { generateRichnachasDemoScreenshot } from '../utils/demoGenerator';
import { importProjectFromFile } from '../utils/exportEngine';
import { validateAndReadImageFile } from '../utils/imageImporter';
import {
  deleteSavedProject,
  listSavedProjects,
  loadProjectSnapshot,
  type SavedProjectMeta,
} from '../utils/storage';

export const StartScreen: React.FC = () => {
  const createProjectFromImage = useEditorStore((s) => s.createProjectFromImage);
  const loadSnapshot = useEditorStore((s) => s.loadSnapshot);

  const [savedProjects, setSavedProjects] = useState<SavedProjectMeta[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const refreshProjects = async () => {
    try {
      const list = await listSavedProjects();
      setSavedProjects(list);
    } catch {
      // IndexedDB unavailable
    }
  };

  useEffect(() => {
    refreshProjects();
  }, []);

  const handleImageFile = async (file: File) => {
    setError(null);
    try {
      const { dataUrl, width, height } = await validateAndReadImageFile(file);
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'Новый проект';
      await createProjectFromImage(baseName, sourceUrl.trim(), dataUrl, width, height);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки изображения');
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleImageFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const handleDemo = async () => {
    setError(null);
    const { dataUrl, width, height } = generateRichnachasDemoScreenshot();
    await createProjectFromImage(
      'Річ на час — Главная',
      'https://richnachas.com',
      dataUrl,
      width,
      height
    );
  };

  const handleOpenSaved = async (id: string) => {
    setError(null);
    const snap = await loadProjectSnapshot(id);
    if (!snap) {
      setError('Не удалось загрузить сохранённый проект.');
      return;
    }
    loadSnapshot(snap);
  };

  const handleDeleteSaved = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSavedProject(id);
    refreshProjects();
  };

  const handleImportProject = async (file: File) => {
    setError(null);
    try {
      const snap = await importProjectFromFile(file);
      loadSnapshot(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта проекта');
    }
  };

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--bg-app)',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          if (file.name.endsWith('.json') || file.name.endsWith('.zip')) {
            handleImportProject(file);
          } else {
            handleImageFile(file);
          }
        }
      }}
    >
      <div style={{ width: '100%', maxWidth: 820 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 15,
                color: '#fff',
              }}
            >
              VP
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>VisualPatch</h1>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Визуальный редактор интерфейсов → ТЗ для разработчиков и AI-агентов
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="vp-btn"
              onClick={() => projectInputRef.current?.click()}
              data-testid="import-project-btn"
            >
              <FolderOpen size={14} />
              Импорт JSON / ZIP
            </button>
            <button
              className="vp-btn vp-btn-primary"
              onClick={handleDemo}
              data-testid="demo-richnachas-btn"
            >
              <Sparkles size={14} />
              Демо: richnachas.com
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 14,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 12,
            padding: '36px 24px',
            background: isDragging ? 'var(--accent-soft)' : 'var(--bg-panel)',
            textAlign: 'center',
            transition: 'all 0.15s',
            marginBottom: 20,
          }}
        >
          <ImagePlus
            size={34}
            style={{ color: 'var(--accent)', marginBottom: 10 }}
          />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
            Загрузите скриншот интерфейса
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
            Перетащите PNG, JPEG или WebP сюда, выберите файл или нажмите{' '}
            <kbd
              style={{
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--bg-panel-elevated)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Ctrl+V
            </kbd>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              maxWidth: 500,
              margin: '0 auto 14px',
            }}
          >
            <input
              type="url"
              className="vp-input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="URL сайта (необязательно, напр. https://richnachas.com)"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
            <button
              className="vp-btn vp-btn-primary"
              onClick={() => imageInputRef.current?.click()}
              data-testid="upload-image-btn"
            >
              <Upload size={14} />
              Выбрать файл
            </button>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--text-muted)',
            }}
          >
            <ClipboardPaste size={13} />
            Работает локально в браузере · Без обязательного AI API
          </div>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImageFile(f);
          }}
        />
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,.zip"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportProject(f);
          }}
        />

        {savedProjects.length > 0 && (
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 10,
              }}
            >
              Сохранённые проекты (локально в IndexedDB)
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {savedProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleOpenSaved(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {p.canvasWidth}×{p.canvasHeight}px · {p.elementCount} эл. ·{' '}
                      {p.operationCount} операций ·{' '}
                      {new Date(p.updatedAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <button
                    className="vp-btn vp-btn-icon"
                    title="Удалить проект"
                    onClick={(e) => handleDeleteSaved(e, p.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
