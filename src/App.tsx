import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { ExportModal } from './components/ExportModal';
import { LeftToolbar } from './components/LeftToolbar';
import { RightInspector } from './components/RightInspector';
import { StartScreen } from './components/StartScreen';
import { TopBar } from './components/TopBar';
import { useEditorStore } from './store/useEditorStore';

export const App: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const elements = useEditorStore((s) => s.elements);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setPan = useEditorStore((s) => s.setPan);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const copySelected = useEditorStore((s) => s.copySelected);
  const pasteClipboard = useEditorStore((s) => s.pasteClipboard);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroupSelected = useEditorStore((s) => s.ungroupSelected);
  const moveElements = useEditorStore((s) => s.moveElements);
  const notice = useEditorStore((s) => s.notice);
  const setNotice = useEditorStore((s) => s.setNotice);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const [exportModal, setExportModal] = useState<'export' | 'control-room' | null>(
    null
  );

  const handleFitZoom = useCallback(() => {
    if (!project || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const pad = 40;
    const scaleX = (rect.width - pad) / project.canvasWidth;
    const scaleY = (rect.height - pad) / project.canvasHeight;
    const nextZoom = Math.max(0.15, Math.min(1.5, Math.min(scaleX, scaleY)));
    const panX = Math.round((rect.width - project.canvasWidth * nextZoom) / 2);
    const panY = Math.round((rect.height - project.canvasHeight * nextZoom) / 2);
    setZoom(nextZoom);
    setPan({ x: Math.max(12, panX), y: Math.max(12, panY) });
  }, [project, setZoom, setPan]);

  useEffect(() => {
    if (project) {
      const t = setTimeout(handleFitZoom, 30);
      return () => clearTimeout(t);
    }
  }, [project?.id, handleFitZoom]);

  // Global editor keyboard shortcuts (Section 3.3)
  useEffect(() => {
    if (!project) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelected();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelected();
        else groupSelected();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelectedIds(
          elements.filter((el) => !el.deleted && !el.locked).map((el) => el.id)
        );
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        setActiveTool('select');
        return;
      }

      if (
        selectedIds.length > 0 &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const moves = elements
          .filter((el) => selectedIds.includes(el.id) && !el.deleted && !el.locked)
          .map((el) => ({ id: el.id, x: el.x + dx, y: el.y + dy }));
        moveElements(moves);
        return;
      }

      if (!ctrl) {
        const k = e.key.toLowerCase();
        if (k === 'v') setActiveTool('select');
        else if (k === 'h') setActiveTool('hand');
        else if (k === 'r') setActiveTool('crop');
        else if (k === 't') setActiveTool('text');
        else if (k === 'b') setActiveTool('rect');
        else if (k === 'c') setActiveTool('comment');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    project,
    elements,
    selectedIds,
    undo,
    redo,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    deleteSelected,
    groupSelected,
    ungroupSelected,
    setSelectedIds,
    setActiveTool,
    moveElements,
  ]);

  if (!project) {
    return <StartScreen />;
  }

  return (
    <div className="editor-shell">
      <TopBar
        onOpenExport={(tab) => setExportModal(tab || 'export')}
        onFitZoom={handleFitZoom}
      />

      {notice && (
        <div
          style={{
            padding: '6px 12px',
            background: 'rgba(99, 102, 241, 0.14)',
            borderBottom: '1px solid rgba(99, 102, 241, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <span>{notice}</span>
          <button
            className="vp-btn vp-btn-icon"
            style={{ width: 22, height: 22 }}
            onClick={() => setNotice(null)}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="editor-body">
        <LeftToolbar />
        <CanvasWorkspace containerRef={canvasContainerRef} />
        <RightInspector />
      </div>

      {exportModal && (
        <ExportModal
          initialTab={exportModal}
          onClose={() => setExportModal(null)}
        />
      )}
    </div>
  );
};

export default App;
