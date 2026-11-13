import React from 'react';
import {
  ArrowLeft,
  Columns2,
  Download,
  Eye,
  Grid,
  Magnet,
  Maximize2,
  Redo2,
  Send,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';

interface TopBarProps {
  onOpenExport: (tab?: 'export' | 'control-room') => void;
  onFitZoom: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenExport, onFitZoom }) => {
  const project = useEditorStore((s) => s.project);
  const renameProject = useEditorStore((s) => s.renameProject);
  const closeProject = useEditorStore((s) => s.closeProject);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const undoCount = useEditorStore((s) => s.undoStack.length);
  const redoCount = useEditorStore((s) => s.redoStack.length);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const compareMode = useEditorStore((s) => s.compareMode);
  const setCompareMode = useEditorStore((s) => s.setCompareMode);
  const showGrid = useEditorStore((s) => s.showGrid);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const snapToGuides = useEditorStore((s) => s.snapToGuides);
  const toggleSnap = useEditorStore((s) => s.toggleSnap);
  const showDiffHighlights = useEditorStore((s) => s.showDiffHighlights);
  const toggleDiffHighlights = useEditorStore((s) => s.toggleDiffHighlights);
  const operationsCount = useEditorStore((s) => s.operations.length);

  if (!project) return null;

  return (
    <header
      style={{
        height: 46,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        gap: 8,
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {/* Left: Back + Project Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <button
          className="vp-btn vp-btn-icon"
          title="К списку проектов"
          onClick={closeProject}
          data-testid="back-to-projects-btn"
        >
          <ArrowLeft size={14} />
        </button>

        <input
          type="text"
          className="vp-input"
          aria-label="Название проекта"
          value={project.name}
          onChange={(e) => renameProject(e.target.value)}
          style={{ width: 170, fontWeight: 600 }}
        />

        <span
          className="hide-mobile"
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {project.canvasWidth}×{project.canvasHeight}
        </span>

        <div className="vp-divider" />

        <button
          className="vp-btn vp-btn-icon"
          title="Отменить (Ctrl+Z)"
          disabled={undoCount === 0}
          onClick={undo}
          data-testid="undo-btn"
        >
          <Undo2 size={14} />
        </button>
        <button
          className="vp-btn vp-btn-icon"
          title="Повторить (Ctrl+Shift+Z)"
          disabled={redoCount === 0}
          onClick={redo}
          data-testid="redo-btn"
        >
          <Redo2 size={14} />
        </button>
      </div>

      {/* Center: Before / After / Split */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div
          style={{
            display: 'inline-flex',
            background: 'var(--bg-app)',
            padding: 2,
            borderRadius: 7,
            border: '1px solid var(--border)',
          }}
        >
          <button
            className={`vp-btn ${compareMode === 'before' ? 'vp-btn-active' : ''}`}
            style={{ height: 24, border: 'none', padding: '0 8px' }}
            onClick={() => setCompareMode('before')}
            data-testid="mode-before-btn"
          >
            Оригинал
          </button>
          <button
            className={`vp-btn ${compareMode === 'after' ? 'vp-btn-active' : ''}`}
            style={{ height: 24, border: 'none', padding: '0 8px' }}
            onClick={() => setCompareMode('after')}
            data-testid="mode-after-btn"
          >
            Результат
          </button>
          <button
            className={`vp-btn ${compareMode === 'split' ? 'vp-btn-active' : ''}`}
            style={{ height: 24, border: 'none', padding: '0 8px' }}
            onClick={() => setCompareMode('split')}
            data-testid="mode-split-btn"
          >
            <Columns2 size={12} />
            Сравнение
          </button>
        </div>

        <button
          className={`vp-btn vp-btn-icon hide-mobile ${
            showDiffHighlights ? 'vp-btn-active' : ''
          }`}
          title={`Подсветка изменений (${operationsCount})`}
          onClick={toggleDiffHighlights}
        >
          <Eye size={13} />
        </button>
      </div>

      {/* Right: Zoom, Grid, Snap, Export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          className={`vp-btn vp-btn-icon hide-mobile ${showGrid ? 'vp-btn-active' : ''}`}
          title="Сетка"
          onClick={toggleGrid}
        >
          <Grid size={13} />
        </button>
        <button
          className={`vp-btn vp-btn-icon hide-mobile ${
            snapToGuides ? 'vp-btn-active' : ''
          }`}
          title="Привязка к направляющим"
          onClick={toggleSnap}
        >
          <Magnet size={13} />
        </button>

        <div className="vp-divider hide-mobile" />

        <div className="hide-mobile" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            className="vp-btn vp-btn-icon"
            title="Уменьшить"
            onClick={() => setZoom(zoom - 0.15)}
          >
            <ZoomOut size={13} />
          </button>
          <span
            style={{
              width: 42,
              textAlign: 'center',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="vp-btn vp-btn-icon"
            title="Увеличить"
            onClick={() => setZoom(zoom + 0.15)}
          >
            <ZoomIn size={13} />
          </button>
          <button
            className="vp-btn vp-btn-icon"
            title="Вписать в экран"
            onClick={onFitZoom}
          >
            <Maximize2 size={13} />
          </button>
        </div>

        <div className="vp-divider" />

        <button
          className="vp-btn hide-mobile"
          onClick={() => onOpenExport('control-room')}
          title="Отправить задачу в Control Room"
          data-testid="control-room-btn"
        >
          <Send size={13} />
          Control Room
        </button>

        <button
          className="vp-btn vp-btn-primary"
          onClick={() => onOpenExport('export')}
          data-testid="export-btn"
        >
          <Download size={13} />
          Экспорт
        </button>
      </div>
    </header>
  );
};
