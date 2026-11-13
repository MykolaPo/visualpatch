import React, { useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crop,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  Layers,
  Lock,
  MessageSquare,
  MousePointer2,
  ScanSearch,
  Scissors,
  Square,
  Type,
  Unlock,
  X,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import type { ToolType } from '../types/editor';
import { detectVisualElements } from '../utils/elementDetector';
import { validateAndReadImageFile } from '../utils/imageImporter';

export const LeftToolbar: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const elements = useEditorStore((s) => s.elements);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const toggleVisibility = useEditorStore((s) => s.toggleVisibility);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  const showComments = useEditorStore((s) => s.showComments);
  const toggleCommentsVisibility = useEditorStore((s) => s.toggleCommentsVisibility);
  const createNativeElement = useEditorStore((s) => s.createNativeElement);
  const detectedRegions = useEditorStore((s) => s.detectedRegions);
  const isDetecting = useEditorStore((s) => s.isDetecting);
  const setIsDetecting = useEditorStore((s) => s.setIsDetecting);
  const setDetectedRegions = useEditorStore((s) => s.setDetectedRegions);
  const acceptDetectedRegion = useEditorStore((s) => s.acceptDetectedRegion);
  const dismissDetectedRegion = useEditorStore((s) => s.dismissDetectedRegion);
  const mergeDetectedRegions = useEditorStore((s) => s.mergeDetectedRegions);
  const splitDetectedRegion = useEditorStore((s) => s.splitDetectedRegion);
  const acceptAllDetected = useEditorStore((s) => s.acceptAllDetected);
  const setNotice = useEditorStore((s) => s.setNotice);

  const [showLayers, setShowLayers] = useState(false);
  const [selectedDetectedIds, setSelectedDetectedIds] = useState<string[]>([]);
  const imgInputRef = useRef<HTMLInputElement>(null);

  if (!project) return null;

  const tools: Array<{ id: ToolType; label: string; icon: React.ReactNode }> = [
    { id: 'select', label: 'Выделение (V)', icon: <MousePointer2 size={15} /> },
    { id: 'hand', label: 'Перемещение холста (H / Space)', icon: <Hand size={15} /> },
    { id: 'crop', label: 'Вырезать элемент со скриншота (R)', icon: <Crop size={15} /> },
    { id: 'text', label: 'Добавить текст (T)', icon: <Type size={15} /> },
    { id: 'rect', label: 'Добавить прямоугольник (B)', icon: <Square size={15} /> },
    { id: 'comment', label: 'Добавить комментарий (C)', icon: <MessageSquare size={15} /> },
  ];

  const handleAutoDetect = async () => {
    setIsDetecting(true);
    setNotice(null);
    try {
      const regions = await detectVisualElements(project.sourceImage);
      setDetectedRegions(regions);
      setShowLayers(true);
      if (regions.length === 0) {
        setNotice('Автоматический анализ не нашёл контрастных блоков. Используйте ручное выделение (R).');
      } else {
        setNotice(`Обнаружено ${regions.length} визуальных блоков. Подтвердите нужные в панели слоёв.`);
      }
    } catch {
      setNotice('Ошибка анализа изображения.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleInsertImage = async (file: File) => {
    try {
      const { dataUrl, width, height } = await validateAndReadImageFile(file);
      const maxW = Math.min(320, width);
      const scale = maxW / width;
      createNativeElement(
        'image',
        Math.round(project.canvasWidth / 2 - maxW / 2),
        Math.round(project.canvasHeight / 2 - (height * scale) / 2),
        Math.round(maxW),
        Math.round(height * scale),
        undefined,
        dataUrl
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Ошибка вставки изображения');
    }
  };

  const activeElements = elements
    .filter((e) => !e.deleted)
    .sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div style={{ display: 'flex', height: '100%', flexShrink: 0, zIndex: 20 }}>
      {/* Narrow icon toolbar */}
      <aside
        style={{
          width: 46,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 6,
        }}
      >
        {tools.map((t) => (
          <button
            key={t.id}
            className={`vp-btn vp-btn-icon ${activeTool === t.id ? 'vp-btn-active' : ''}`}
            title={t.label}
            onClick={() => setActiveTool(t.id)}
            data-testid={`tool-${t.id}`}
          >
            {t.icon}
          </button>
        ))}

        <button
          className="vp-btn vp-btn-icon"
          title="Вставить изображение"
          onClick={() => imgInputRef.current?.click()}
          data-testid="tool-image"
        >
          <ImageIcon size={15} />
        </button>

        <input
          ref={imgInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleInsertImage(f);
            e.target.value = '';
          }}
        />

        <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '2px 0' }} />

        <button
          className={`vp-btn vp-btn-icon ${isDetecting ? 'vp-btn-active' : ''}`}
          title="Автоматическое распознавание блоков (CV)"
          disabled={isDetecting}
          onClick={handleAutoDetect}
          data-testid="tool-autodetect"
        >
          <ScanSearch size={15} />
        </button>

        <button
          className={`vp-btn vp-btn-icon ${showComments ? 'vp-btn-active' : ''}`}
          title="Показать/скрыть маркеры комментариев"
          onClick={toggleCommentsVisibility}
        >
          <MessageSquare size={14} />
        </button>

        <div style={{ flex: 1 }} />

        <button
          className={`vp-btn vp-btn-icon ${showLayers ? 'vp-btn-active' : ''}`}
          title="Слои и распознанные блоки"
          onClick={() => setShowLayers((v) => !v)}
          data-testid="toggle-layers-btn"
        >
          <Layers size={15} />
        </button>
      </aside>

      {/* Collapsible Layers / Detected Regions Drawer */}
      {showLayers && (
        <aside
          className="left-drawer"
          style={{
            width: 240,
            background: 'var(--bg-panel)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <div
            style={{
              height: 36,
              padding: '0 10px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>Слои ({activeElements.length})</span>
            <button
              className="vp-btn vp-btn-icon"
              style={{ width: 24, height: 24 }}
              onClick={() => setShowLayers(false)}
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {detectedRegions.length > 0 && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 8,
                  borderRadius: 8,
                  background: 'var(--accent-soft)',
                  border: '1px solid var(--accent)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span>Найдено: {detectedRegions.length}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {selectedDetectedIds.length >= 2 && (
                      <button
                        className="vp-btn"
                        style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                        onClick={() => {
                          mergeDetectedRegions(selectedDetectedIds);
                          setSelectedDetectedIds([]);
                        }}
                      >
                        Объединить
                      </button>
                    )}
                    <button
                      className="vp-btn vp-btn-primary"
                      style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                      onClick={acceptAllDetected}
                    >
                      Принять все
                    </button>
                    <button
                      className="vp-btn"
                      style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                      onClick={() => {
                        setDetectedRegions([]);
                        setSelectedDetectedIds([]);
                      }}
                    >
                      Скрыть
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {detectedRegions.map((reg) => {
                    const checked = selectedDetectedIds.includes(reg.id);
                    return (
                      <div
                        key={reg.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 4,
                          padding: '4px 6px',
                          borderRadius: 5,
                          background: 'var(--bg-panel)',
                          fontSize: 11,
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            minWidth: 0,
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedDetectedIds((prev) =>
                                e.target.checked
                                  ? [...prev, reg.id]
                                  : prev.filter((id) => id !== reg.id)
                              )
                            }
                          />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {reg.suggestedName}{' '}
                            <span style={{ color: 'var(--text-muted)' }}>
                              {Math.round(reg.confidence * 100)}%
                            </span>
                          </span>
                        </label>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button
                            className="vp-btn vp-btn-icon"
                            style={{ width: 20, height: 20 }}
                            title="Разделить блок пополам"
                            onClick={() => splitDetectedRegion(reg.id)}
                          >
                            <Scissors size={11} />
                          </button>
                          <button
                            className="vp-btn vp-btn-icon"
                            style={{ width: 20, height: 20 }}
                            title="Подтвердить элемент"
                            onClick={() => acceptDetectedRegion(reg.id)}
                          >
                            <Check size={11} />
                          </button>
                          <button
                            className="vp-btn vp-btn-icon"
                            style={{ width: 20, height: 20 }}
                            title="Отклонить"
                            onClick={() => dismissDetectedRegion(reg.id)}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeElements.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  padding: '12px 6px',
                  textAlign: 'center',
                }}
              >
                Нет элементов. Выберите инструмент «Вырезать» (R) или «Автораспознавание».
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {activeElements.map((el) => {
                  const isSel = selectedIds.includes(el.id);
                  return (
                    <div
                      key={el.id}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          setSelectedIds(
                            isSel
                              ? selectedIds.filter((id) => id !== el.id)
                              : [...selectedIds, el.id]
                          );
                        } else {
                          setSelectedIds([el.id]);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        padding: '5px 7px',
                        borderRadius: 6,
                        background: isSel ? 'var(--accent-soft)' : 'var(--bg-panel-elevated)',
                        border: `1px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <div
                        style={{
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: 12,
                          paddingLeft: el.parentId ? 10 : 0,
                          opacity: el.visible ? 1 : 0.45,
                        }}
                      >
                        {el.name}
                      </div>
                      <div
                        style={{ display: 'flex', gap: 2, flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="vp-btn vp-btn-icon"
                          style={{ width: 22, height: 22, border: 'none' }}
                          title={el.visible ? 'Скрыть' : 'Показать'}
                          onClick={() => toggleVisibility(el.id)}
                        >
                          {el.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          className="vp-btn vp-btn-icon"
                          style={{ width: 22, height: 22, border: 'none' }}
                          title={el.locked ? 'Разблокировать' : 'Заблокировать'}
                          onClick={() => toggleLock(el.id)}
                        >
                          {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}
      {!showLayers && detectedRegions.length > 0 && (
        <button
          className="vp-btn"
          style={{
            position: 'absolute',
            left: 54,
            top: 8,
            zIndex: 25,
            background: 'var(--accent)',
            color: '#fff',
          }}
          onClick={() => setShowLayers(true)}
        >
          Найдено блоков: {detectedRegions.length}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
};
