import { create } from 'zustand';
import type {
  AIProviderConfig,
  BgRestoreMode,
  CommentItem,
  CompareMode,
  ControlRoomConfig,
  DetectedRegion,
  ElementType,
  Operation,
  OperationType,
  Project,
  ProjectSnapshot,
  SourceCrop,
  ToolType,
  VisualElement,
} from '../types/editor';
import {
  createBackgroundPatchDataUrl,
  cropImageRegion,
} from '../utils/imageImporter';
import { saveProjectSnapshot } from '../utils/storage';

interface HistoryFrame {
  elements: VisualElement[];
  comments: CommentItem[];
  operations: Operation[];
}

interface EditorState {
  project: Project | null;
  elements: VisualElement[];
  operations: Operation[];
  comments: CommentItem[];
  undoStack: HistoryFrame[];
  redoStack: HistoryFrame[];

  selectedIds: string[];
  clipboard: VisualElement[];
  activeTool: ToolType;
  compareMode: CompareMode;
  splitPosition: number;
  zoom: number;
  pan: { x: number; y: number };
  showGrid: boolean;
  snapToGuides: boolean;
  showComments: boolean;
  showDiffHighlights: boolean;

  detectedRegions: DetectedRegion[];
  isDetecting: boolean;
  notice: string | null;

  aiConfig: AIProviderConfig;
  controlRoomConfig: ControlRoomConfig;

  setNotice: (msg: string | null) => void;
  setActiveTool: (tool: ToolType) => void;
  setCompareMode: (mode: CompareMode) => void;
  setSplitPosition: (pos: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  toggleCommentsVisibility: () => void;
  toggleDiffHighlights: () => void;
  setSelectedIds: (ids: string[]) => void;

  createProjectFromImage: (
    name: string,
    sourceUrl: string,
    sourceImage: string,
    width: number,
    height: number,
    initialDomElements?: Array<{
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      domMetadata?: Record<string, string>;
    }>
  ) => Promise<void>;
  loadSnapshot: (snapshot: ProjectSnapshot) => void;
  closeProject: () => void;
  renameProject: (name: string, sourceUrl?: string) => void;

  createRasterElement: (
    crop: SourceCrop,
    name?: string,
    type?: ElementType,
    confidence?: number,
    customImageDataUrl?: string
  ) => Promise<VisualElement | null>;
  createNativeElement: (
    type: ElementType,
    x: number,
    y: number,
    width: number,
    height: number,
    content?: string,
    imageDataUrl?: string
  ) => VisualElement | null;

  moveElements: (
    moves: Array<{ id: string; x: number; y: number }>
  ) => void;
  resizeElement: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation?: number
  ) => void;
  updateElementProps: (
    id: string,
    patch: Partial<VisualElement>,
    opType?: OperationType
  ) => void;
  updateBgRestore: (
    id: string,
    mode: BgRestoreMode,
    color?: string
  ) => Promise<void>;

  deleteSelected: () => void;
  duplicateSelected: () => void;
  toggleVisibility: (id: string) => void;
  toggleLock: (id: string) => void;
  reorderElement: (
    id: string,
    direction: 'up' | 'down' | 'front' | 'back'
  ) => void;
  alignSelected: (
    alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;

  copySelected: () => void;
  pasteClipboard: () => void;

  addComment: (
    elementId: string | null,
    x: number,
    y: number,
    text: string,
    priority?: 'low' | 'medium' | 'high'
  ) => void;
  toggleCommentStatus: (id: string) => void;
  deleteComment: (id: string) => void;

  setDetectedRegions: (regions: DetectedRegion[]) => void;
  setIsDetecting: (val: boolean) => void;
  acceptDetectedRegion: (regionId: string) => Promise<void>;
  dismissDetectedRegion: (regionId: string) => void;
  mergeDetectedRegions: (regionIds: string[]) => void;
  splitDetectedRegion: (regionId: string, axis?: 'horizontal' | 'vertical') => void;
  acceptAllDetected: () => Promise<void>;

  undo: () => void;
  redo: () => void;

  setAiConfig: (cfg: Partial<AIProviderConfig>) => void;
  setControlRoomConfig: (cfg: Partial<ControlRoomConfig>) => void;
}

const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(state: EditorState) {
  if (!state.project) return;
  const snapshot: ProjectSnapshot = {
    project: { ...state.project, updatedAt: new Date().toISOString() },
    elements: state.elements,
    operations: state.operations,
    comments: state.comments,
  };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProjectSnapshot(snapshot).catch(() => {
      // IndexedDB quota or private mode fallback
    });
  }, 250);
}

function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: null,
  elements: [],
  operations: [],
  comments: [],
  undoStack: [],
  redoStack: [],

  selectedIds: [],
  clipboard: [],
  activeTool: 'select',
  compareMode: 'after',
  splitPosition: 0.5,
  zoom: 1,
  pan: { x: 0, y: 0 },
  showGrid: false,
  snapToGuides: true,
  showComments: true,
  showDiffHighlights: false,

  detectedRegions: [],
  isDetecting: false,
  notice: null,

  aiConfig: loadLocalJson<AIProviderConfig>('vp_ai_config', {
    mode: 'local',
    endpoint: 'http://localhost:11434',
    model: 'llama3.1',
    apiKey: '',
  }),
  controlRoomConfig: loadLocalJson<ControlRoomConfig>('vp_cr_config', {
    endpoint: '',
    targetProject: 'richnachas-web',
    assignee: '',
    apiToken: '',
  }),

  setNotice: (msg) => set({ notice: msg }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setCompareMode: (mode) => set({ compareMode: mode }),
  setSplitPosition: (pos) => set({ splitPosition: Math.max(0.05, Math.min(0.95, pos)) }),
  setZoom: (zoom) => set({ zoom: Math.max(0.15, Math.min(4, zoom)) }),
  setPan: (pan) => set({ pan }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleSnap: () => set((s) => ({ snapToGuides: !s.snapToGuides })),
  toggleCommentsVisibility: () => set((s) => ({ showComments: !s.showComments })),
  toggleDiffHighlights: () => set((s) => ({ showDiffHighlights: !s.showDiffHighlights })),
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  createProjectFromImage: async (
    name,
    sourceUrl,
    sourceImage,
    width,
    height,
    initialDomElements
  ) => {
    const now = new Date().toISOString();
    const project: Project = {
      id: uid('proj'),
      name: name || 'Новый проект',
      sourceUrl: sourceUrl || '',
      sourceImage,
      canvasWidth: width,
      canvasHeight: height,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };

    const initialElements: VisualElement[] = [];
    if (initialDomElements && initialDomElements.length > 0) {
      for (let i = 0; i < initialDomElements.length; i++) {
        const item = initialDomElements[i];
        const crop = {
          x: Math.round(item.x),
          y: Math.round(item.y),
          width: Math.round(item.width),
          height: Math.round(item.height),
        };
        if (crop.width < 12 || crop.height < 10) continue;
        const [imageDataUrl, patch] = await Promise.all([
          cropImageRegion(sourceImage, crop),
          createBackgroundPatchDataUrl(sourceImage, crop, 'sample'),
        ]);
        initialElements.push({
          id: uid('el'),
          projectId: project.id,
          parentId: null,
          type: 'raster',
          name: item.name,
          x: crop.x,
          y: crop.y,
          width: crop.width,
          height: crop.height,
          rotation: 0,
          zIndex: i + 1,
          visible: true,
          locked: false,
          styles: { opacity: 1 },
          sourceCrop: crop,
          imageDataUrl,
          bgRestoreMode: 'sample',
          bgRestoreColor: patch.dominantColor,
          bgRestoreDataUrl: patch.dataUrl,
          domMetadata: item.domMetadata,
        });
      }
    }

    set({
      project,
      elements: initialElements,
      operations: [],
      comments: [],
      undoStack: [],
      redoStack: [],
      selectedIds: [],
      detectedRegions: [],
      activeTool: 'select',
      compareMode: 'after',
      zoom: 1,
      pan: { x: 0, y: 0 },
      notice:
        initialElements.length > 0
          ? `Страница захвачена: извлечено ${initialElements.length} DOM-элементов с CSS-селекторами.`
          : null,
    });
    await saveProjectSnapshot({
      project,
      elements: initialElements,
      operations: [],
      comments: [],
    });
  },

  loadSnapshot: (snapshot) => {
    set({
      project: snapshot.project,
      elements: snapshot.elements || [],
      operations: snapshot.operations || [],
      comments: snapshot.comments || [],
      undoStack: [],
      redoStack: [],
      selectedIds: [],
      detectedRegions: [],
      activeTool: 'select',
      compareMode: 'after',
      zoom: 1,
      pan: { x: 0, y: 0 },
      notice: null,
    });
  },

  closeProject: () =>
    set({
      project: null,
      elements: [],
      operations: [],
      comments: [],
      undoStack: [],
      redoStack: [],
      selectedIds: [],
      detectedRegions: [],
    }),

  renameProject: (name, sourceUrl) => {
    set((s) => {
      if (!s.project) return s;
      const updated: Project = {
        ...s.project,
        name,
        sourceUrl: sourceUrl !== undefined ? sourceUrl : s.project.sourceUrl,
        updatedAt: new Date().toISOString(),
      };
      const next = { ...s, project: updated };
      schedulePersist(next);
      return { project: updated };
    });
  },

  createRasterElement: async (crop, name, _type, confidence, customImageDataUrl) => {
    const state = get();
    if (!state.project) return null;
    if (crop.width < 4 || crop.height < 4) return null;

    const imageDataUrl =
      customImageDataUrl || (await cropImageRegion(state.project.sourceImage, crop));
    const patch = await createBackgroundPatchDataUrl(
      state.project.sourceImage,
      crop,
      'sample'
    );

    const maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const el: VisualElement = {
      id: uid('el'),
      projectId: state.project.id,
      parentId: null,
      type: 'raster',
      name: name || `Фрагмент #${state.elements.length + 1}`,
      x: Math.round(crop.x),
      y: Math.round(crop.y),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
      rotation: 0,
      zIndex: maxZ + 1,
      visible: true,
      locked: false,
      styles: { opacity: 1 },
      sourceCrop: {
        x: Math.round(crop.x),
        y: Math.round(crop.y),
        width: Math.round(crop.width),
        height: Math.round(crop.height),
      },
      imageDataUrl,
      bgRestoreMode: 'sample',
      bgRestoreColor: patch.dominantColor,
      bgRestoreDataUrl: patch.dataUrl,
      confidence,
    };

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: el.id,
      elementName: el.name,
      type: 'CREATE',
      before: null,
      after: { type: el.type, x: el.x, y: el.y, width: el.width, height: el.height },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const frame: HistoryFrame = {
        elements: s.elements,
        comments: s.comments,
        operations: s.operations,
      };
      const nextElements = [...s.elements, el];
      const nextOps = [...s.operations, op];
      const nextState = {
        ...s,
        elements: nextElements,
        operations: nextOps,
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: [el.id],
        activeTool: 'select' as ToolType,
        notice: patch.isComplexBg
          ? 'Сложный фон: при перемещении или удалении возможны визуальные артефакты. Можно выбрать заливку цветом в правой панели.'
          : s.notice,
      };
      schedulePersist(nextState);
      return nextState;
    });

    return el;
  },

  createNativeElement: (type, x, y, width, height, content, imageDataUrl) => {
    const state = get();
    if (!state.project) return null;

    const maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const defaultName =
      type === 'text'
        ? 'Текст'
        : type === 'button'
        ? 'Кнопка'
        : type === 'image'
        ? 'Изображение'
        : 'Прямоугольник';

    const el: VisualElement = {
      id: uid('el'),
      projectId: state.project.id,
      parentId: null,
      type,
      name: `${defaultName} #${state.elements.length + 1}`,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.max(20, Math.round(width)),
      height: Math.max(20, Math.round(height)),
      rotation: 0,
      zIndex: maxZ + 1,
      visible: true,
      locked: false,
      content:
        content ??
        (type === 'text' ? 'Новый текст' : type === 'button' ? 'Кнопка' : undefined),
      imageDataUrl,
      styles:
        type === 'text'
          ? { color: '#0f172a', fontSize: 18, fontWeight: '600', opacity: 1 }
          : type === 'button'
          ? {
              fill: '#2563eb',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: '600',
              borderRadius: 8,
              opacity: 1,
            }
          : {
              fill: '#e2e8f0',
              stroke: '#94a3b8',
              strokeWidth: 1,
              borderRadius: 6,
              opacity: 1,
            },
    };

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: el.id,
      elementName: el.name,
      type: 'CREATE',
      before: null,
      after: { type: el.type, x: el.x, y: el.y, width: el.width, height: el.height },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const frame: HistoryFrame = {
        elements: s.elements,
        comments: s.comments,
        operations: s.operations,
      };
      const nextState = {
        ...s,
        elements: [...s.elements, el],
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: [el.id],
        activeTool: 'select' as ToolType,
      };
      schedulePersist(nextState);
      return nextState;
    });

    return el;
  },

  moveElements: (moves) => {
    const state = get();
    if (!state.project || moves.length === 0) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const moveMap = new Map(moves.map((m) => [m.id, m]));
    const newOps: Operation[] = [];

    // Propagate delta to children if a parent group/container is moved
    const deltaMap = new Map<string, { dx: number; dy: number }>();
    for (const el of state.elements) {
      const target = moveMap.get(el.id);
      if (target) {
        const dx = Math.round(target.x) - el.x;
        const dy = Math.round(target.y) - el.y;
        if (dx !== 0 || dy !== 0) {
          deltaMap.set(el.id, { dx, dy });
        }
      }
    }
    if (deltaMap.size === 0) return;

    const nextElements = state.elements.map((el) => {
      const direct = deltaMap.get(el.id);
      const parentDelta = el.parentId ? deltaMap.get(el.parentId) : undefined;
      const d = direct || parentDelta;
      if (!d || el.locked) return el;

      const nx = el.x + d.dx;
      const ny = el.y + d.dy;
      if (direct) {
        newOps.push({
          id: uid('op'),
          projectId: state.project!.id,
          elementId: el.id,
          elementName: el.name,
          type: 'MOVE',
          before: { x: el.x, y: el.y },
          after: { x: nx, y: ny },
          timestamp: new Date().toISOString(),
        });
      }
      return { ...el, x: nx, y: ny };
    });

    if (newOps.length === 0) return;

    set((s) => {
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, ...newOps],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  resizeElement: (id, x, y, width, height, rotation) => {
    const state = get();
    if (!state.project) return;
    const target = state.elements.find((e) => e.id === id);
    if (!target || target.locked) return;

    const nx = Math.round(x);
    const ny = Math.round(y);
    const nw = Math.max(8, Math.round(width));
    const nh = Math.max(8, Math.round(height));
    const nrot = rotation !== undefined ? Math.round(rotation) : target.rotation;

    if (
      nx === target.x &&
      ny === target.y &&
      nw === target.width &&
      nh === target.height &&
      nrot === target.rotation
    ) {
      return;
    }

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: target.id,
      elementName: target.name,
      type: 'RESIZE',
      before: {
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
        rotation: target.rotation,
      },
      after: { x: nx, y: ny, width: nw, height: nh, rotation: nrot },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const nextElements = s.elements.map((e) =>
        e.id === id
          ? { ...e, x: nx, y: ny, width: nw, height: nh, rotation: nrot }
          : e
      );
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  updateElementProps: (id, patch, opType) => {
    const state = get();
    if (!state.project) return;
    const target = state.elements.find((e) => e.id === id);
    if (!target) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const resolvedOpType: OperationType =
      opType ||
      (patch.content !== undefined
        ? 'EDIT_TEXT'
        : patch.styles !== undefined
        ? 'CHANGE_STYLE'
        : patch.visible !== undefined
        ? 'HIDE'
        : 'CHANGE_STYLE');

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: target.id,
      elementName: target.name,
      type: resolvedOpType,
      before: {
        content: target.content,
        styles: target.styles,
        visible: target.visible,
        name: target.name,
      },
      after: patch as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const nextElements = s.elements.map((e) =>
        e.id === id
          ? {
              ...e,
              ...patch,
              styles: patch.styles ? { ...e.styles, ...patch.styles } : e.styles,
            }
          : e
      );
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  updateBgRestore: async (id, mode, color) => {
    const state = get();
    if (!state.project) return;
    const target = state.elements.find((e) => e.id === id);
    if (!target || !target.sourceCrop) return;

    const patch = await createBackgroundPatchDataUrl(
      state.project.sourceImage,
      target.sourceCrop,
      mode,
      color || target.bgRestoreColor
    );

    set((s) => {
      const nextElements = s.elements.map((e) =>
        e.id === id
          ? {
              ...e,
              bgRestoreMode: mode,
              bgRestoreColor: patch.dominantColor,
              bgRestoreDataUrl: patch.dataUrl,
            }
          : e
      );
      const nextState = {
        ...s,
        elements: nextElements,
        notice:
          mode === 'ai'
            ? 'Локальный AI-inpainting использует адаптивное сэмплирование фона (внешний AI API не требуется).'
            : patch.isComplexBg && mode === 'sample'
            ? 'Сложный фон: возможны визуальные артефакты.'
            : null,
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  deleteSelected: () => {
    const state = get();
    if (!state.project || state.selectedIds.length === 0) return;

    const toDelete = state.elements.filter(
      (e) => state.selectedIds.includes(e.id) && !e.deleted && !e.locked
    );
    if (toDelete.length === 0) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const deleteSet = new Set(toDelete.map((e) => e.id));
    const newOps: Operation[] = toDelete.map((el) => ({
      id: uid('op'),
      projectId: state.project!.id,
      elementId: el.id,
      elementName: el.name,
      type: 'DELETE',
      before: { x: el.x, y: el.y, width: el.width, height: el.height },
      after: { deleted: true },
      timestamp: new Date().toISOString(),
    }));

    set((s) => {
      const nextElements = s.elements.map((e) =>
        deleteSet.has(e.id) ? { ...e, deleted: true, visible: false } : e
      );
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, ...newOps],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  duplicateSelected: () => {
    const state = get();
    if (!state.project || state.selectedIds.length === 0) return;

    const targets = state.elements.filter(
      (e) => state.selectedIds.includes(e.id) && !e.deleted
    );
    if (targets.length === 0) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    let maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const clones: VisualElement[] = [];
    const ops: Operation[] = [];

    for (const el of targets) {
      maxZ += 1;
      const clone: VisualElement = {
        ...el,
        id: uid('el'),
        name: `${el.name} (копия)`,
        x: el.x + 20,
        y: el.y + 20,
        zIndex: maxZ,
        locked: false,
        sourceCrop: undefined, // clone does not erase original source spot
        bgRestoreDataUrl: undefined,
      };
      clones.push(clone);
      ops.push({
        id: uid('op'),
        projectId: state.project.id,
        elementId: clone.id,
        elementName: clone.name,
        type: 'DUPLICATE',
        before: { sourceId: el.id },
        after: { x: clone.x, y: clone.y },
        timestamp: new Date().toISOString(),
      });
    }

    set((s) => {
      const nextState = {
        ...s,
        elements: [...s.elements, ...clones],
        operations: [...s.operations, ...ops],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: clones.map((c) => c.id),
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  toggleVisibility: (id) => {
    const state = get();
    if (!state.project) return;
    const el = state.elements.find((e) => e.id === id);
    if (!el) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const nextVisible = !el.visible;
    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: el.id,
      elementName: el.name,
      type: 'HIDE',
      before: { visible: el.visible },
      after: { visible: nextVisible },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const nextElements = s.elements.map((item) =>
        item.id === id ? { ...item, visible: nextVisible } : item
      );
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  toggleLock: (id) => {
    set((s) => {
      const nextElements = s.elements.map((e) =>
        e.id === id ? { ...e, locked: !e.locked } : e
      );
      const nextState = { ...s, elements: nextElements };
      schedulePersist(nextState);
      return { elements: nextElements };
    });
  },

  reorderElement: (id, direction) => {
    const state = get();
    if (!state.project) return;
    const active = state.elements
      .filter((e) => !e.deleted)
      .sort((a, b) => a.zIndex - b.zIndex);
    const idx = active.findIndex((e) => e.id === id);
    if (idx < 0) return;

    const el = active[idx];
    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const reordered = [...active];
    reordered.splice(idx, 1);
    if (direction === 'front') reordered.push(el);
    else if (direction === 'back') reordered.unshift(el);
    else if (direction === 'up') reordered.splice(Math.min(active.length - 1, idx + 1), 0, el);
    else if (direction === 'down') reordered.splice(Math.max(0, idx - 1), 0, el);

    const zMap = new Map(reordered.map((item, i) => [item.id, i + 1]));
    const nextZ = zMap.get(id) ?? el.zIndex;

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: el.id,
      elementName: el.name,
      type: 'CHANGE_ORDER',
      before: { zIndex: el.zIndex },
      after: { zIndex: nextZ },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const nextElements = s.elements.map((item) =>
        zMap.has(item.id) ? { ...item, zIndex: zMap.get(item.id)! } : item
      );
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  alignSelected: (alignment) => {
    const state = get();
    if (!state.project || state.selectedIds.length === 0) return;
    const selected = state.elements.filter(
      (e) => state.selectedIds.includes(e.id) && !e.deleted && !e.locked
    );
    if (selected.length === 0) return;

    const refBox =
      selected.length === 1
        ? {
            minX: 0,
            minY: 0,
            maxX: state.project.canvasWidth,
            maxY: state.project.canvasHeight,
          }
        : {
            minX: Math.min(...selected.map((e) => e.x)),
            minY: Math.min(...selected.map((e) => e.y)),
            maxX: Math.max(...selected.map((e) => e.x + e.width)),
            maxY: Math.max(...selected.map((e) => e.y + e.height)),
          };

    const moves = selected.map((el) => {
      let nx = el.x;
      let ny = el.y;
      if (alignment === 'left') nx = refBox.minX;
      if (alignment === 'right') nx = refBox.maxX - el.width;
      if (alignment === 'center') nx = (refBox.minX + refBox.maxX - el.width) / 2;
      if (alignment === 'top') ny = refBox.minY;
      if (alignment === 'bottom') ny = refBox.maxY - el.height;
      if (alignment === 'middle') ny = (refBox.minY + refBox.maxY - el.height) / 2;
      return { id: el.id, x: Math.round(nx), y: Math.round(ny) };
    });

    get().moveElements(moves);
  },

  groupSelected: () => {
    const state = get();
    if (!state.project || state.selectedIds.length < 2) return;
    const targets = state.elements.filter(
      (e) => state.selectedIds.includes(e.id) && !e.deleted
    );
    if (targets.length < 2) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const minX = Math.min(...targets.map((e) => e.x));
    const minY = Math.min(...targets.map((e) => e.y));
    const maxX = Math.max(...targets.map((e) => e.x + e.width));
    const maxY = Math.max(...targets.map((e) => e.y + e.height));
    const minZ = Math.min(...targets.map((e) => e.zIndex));

    const groupEl: VisualElement = {
      id: uid('grp'),
      projectId: state.project.id,
      parentId: null,
      type: 'group',
      name: `Группа (${targets.length})`,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      rotation: 0,
      zIndex: Math.max(1, minZ - 1),
      visible: true,
      locked: false,
      styles: { stroke: '#6366f1', strokeWidth: 1, opacity: 1 },
    };

    const childIds = new Set(targets.map((t) => t.id));
    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: groupEl.id,
      elementName: groupEl.name,
      type: 'GROUP',
      before: { children: targets.map((t) => t.id) },
      after: { groupId: groupEl.id },
      timestamp: new Date().toISOString(),
    };

    set((s) => {
      const nextElements = [
        ...s.elements.map((e) =>
          childIds.has(e.id) ? { ...e, parentId: groupEl.id } : e
        ),
        groupEl,
      ];
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: [groupEl.id],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  ungroupSelected: () => {
    const state = get();
    if (!state.project || state.selectedIds.length === 0) return;
    const groups = state.elements.filter(
      (e) =>
        state.selectedIds.includes(e.id) &&
        (e.type === 'group' || e.type === 'container') &&
        !e.deleted
    );
    if (groups.length === 0) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const groupIds = new Set(groups.map((g) => g.id));
    const freedChildIds: string[] = [];
    const ops: Operation[] = groups.map((g) => ({
      id: uid('op'),
      projectId: state.project!.id,
      elementId: g.id,
      elementName: g.name,
      type: 'UNGROUP',
      before: { groupId: g.id },
      after: null,
      timestamp: new Date().toISOString(),
    }));

    set((s) => {
      const nextElements = s.elements
        .filter((e) => !groupIds.has(e.id))
        .map((e) => {
          if (e.parentId && groupIds.has(e.parentId)) {
            freedChildIds.push(e.id);
            return { ...e, parentId: null };
          }
          return e;
        });
      const nextState = {
        ...s,
        elements: nextElements,
        operations: [...s.operations, ...ops],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: freedChildIds,
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  copySelected: () => {
    const state = get();
    const items = state.elements.filter(
      (e) => state.selectedIds.includes(e.id) && !e.deleted
    );
    if (items.length > 0) {
      set({ clipboard: items });
    }
  },

  pasteClipboard: () => {
    const state = get();
    if (!state.project || state.clipboard.length === 0) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    let maxZ = state.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const pasted: VisualElement[] = [];
    const ops: Operation[] = [];

    for (const item of state.clipboard) {
      maxZ += 1;
      const clone: VisualElement = {
        ...item,
        id: uid('el'),
        name: `${item.name} (вставка)`,
        x: item.x + 24,
        y: item.y + 24,
        zIndex: maxZ,
        locked: false,
        sourceCrop: undefined,
        bgRestoreDataUrl: undefined,
      };
      pasted.push(clone);
      ops.push({
        id: uid('op'),
        projectId: state.project.id,
        elementId: clone.id,
        elementName: clone.name,
        type: 'CREATE',
        before: null,
        after: { type: clone.type, x: clone.x, y: clone.y, width: clone.width, height: clone.height },
        timestamp: new Date().toISOString(),
      });
    }

    set((s) => {
      const nextState = {
        ...s,
        elements: [...s.elements, ...pasted],
        operations: [...s.operations, ...ops],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        selectedIds: pasted.map((p) => p.id),
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  addComment: (elementId, x, y, text, priority = 'medium') => {
    const state = get();
    if (!state.project || !text.trim()) return;

    const frame: HistoryFrame = {
      elements: state.elements,
      comments: state.comments,
      operations: state.operations,
    };

    const linkedEl = elementId
      ? state.elements.find((e) => e.id === elementId)
      : null;

    const comment: CommentItem = {
      id: uid('cmt'),
      projectId: state.project.id,
      elementId,
      x: Math.round(x),
      y: Math.round(y),
      text: text.trim(),
      status: 'open',
      priority,
      createdAt: new Date().toISOString(),
    };

    const op: Operation = {
      id: uid('op'),
      projectId: state.project.id,
      elementId: elementId || 'canvas',
      elementName: linkedEl?.name || 'Холст',
      type: 'ADD_COMMENT',
      before: null,
      after: { text: comment.text, priority: comment.priority },
      timestamp: comment.createdAt,
    };

    set((s) => {
      const nextState = {
        ...s,
        comments: [...s.comments, comment],
        operations: [...s.operations, op],
        undoStack: [...s.undoStack, frame],
        redoStack: [],
        activeTool: 'select' as ToolType,
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  toggleCommentStatus: (id) => {
    set((s) => {
      const nextComments = s.comments.map((c) =>
        c.id === id
          ? { ...c, status: (c.status === 'open' ? 'resolved' : 'open') as 'open' | 'resolved' }
          : c
      );
      const nextState = { ...s, comments: nextComments };
      schedulePersist(nextState);
      return { comments: nextComments };
    });
  },

  deleteComment: (id) => {
    set((s) => {
      const nextComments = s.comments.filter((c) => c.id !== id);
      const nextState = { ...s, comments: nextComments };
      schedulePersist(nextState);
      return { comments: nextComments };
    });
  },

  setDetectedRegions: (regions) => set({ detectedRegions: regions }),
  setIsDetecting: (val) => set({ isDetecting: val }),

  acceptDetectedRegion: async (regionId) => {
    const state = get();
    const region = state.detectedRegions.find((r) => r.id === regionId);
    if (!region) return;
    await state.createRasterElement(
      { x: region.x, y: region.y, width: region.width, height: region.height },
      region.suggestedName,
      region.suggestedType,
      region.confidence
    );
    set((s) => ({
      detectedRegions: s.detectedRegions.filter((r) => r.id !== regionId),
    }));
  },

  dismissDetectedRegion: (regionId) => {
    set((s) => ({
      detectedRegions: s.detectedRegions.filter((r) => r.id !== regionId),
    }));
  },

  mergeDetectedRegions: (regionIds) => {
    set((s) => {
      const targets = s.detectedRegions.filter((r) => regionIds.includes(r.id));
      if (targets.length < 2) return s;
      const minX = Math.min(...targets.map((r) => r.x));
      const minY = Math.min(...targets.map((r) => r.y));
      const maxX = Math.max(...targets.map((r) => r.x + r.width));
      const maxY = Math.max(...targets.map((r) => r.y + r.height));
      const avgConf =
        targets.reduce((sum, r) => sum + r.confidence, 0) / targets.length;
      const merged: DetectedRegion = {
        id: `det_merged_${Date.now().toString(36)}`,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        confidence: Number(avgConf.toFixed(2)),
        suggestedType: 'container',
        suggestedName: `Объединённый блок (${targets.length})`,
      };
      const idSet = new Set(regionIds);
      return {
        detectedRegions: [
          merged,
          ...s.detectedRegions.filter((r) => !idSet.has(r.id)),
        ],
      };
    });
  },

  splitDetectedRegion: (regionId, axis) => {
    set((s) => {
      const target = s.detectedRegions.find((r) => r.id === regionId);
      if (!target) return s;
      const splitAxis =
        axis ?? (target.width >= target.height ? 'vertical' : 'horizontal');
      if (splitAxis === 'vertical' && target.width >= 20) {
        const w1 = Math.floor(target.width / 2);
        const w2 = target.width - w1;
        const left: DetectedRegion = {
          ...target,
          id: `${target.id}_a`,
          width: w1,
          suggestedName: `${target.suggestedName} (1)`,
        };
        const right: DetectedRegion = {
          ...target,
          id: `${target.id}_b`,
          x: target.x + w1,
          width: w2,
          suggestedName: `${target.suggestedName} (2)`,
        };
        return {
          detectedRegions: s.detectedRegions.flatMap((r) =>
            r.id === regionId ? [left, right] : [r]
          ),
        };
      }
      if (target.height >= 20) {
        const h1 = Math.floor(target.height / 2);
        const h2 = target.height - h1;
        const top: DetectedRegion = {
          ...target,
          id: `${target.id}_a`,
          height: h1,
          suggestedName: `${target.suggestedName} (1)`,
        };
        const bottom: DetectedRegion = {
          ...target,
          id: `${target.id}_b`,
          y: target.y + h1,
          height: h2,
          suggestedName: `${target.suggestedName} (2)`,
        };
        return {
          detectedRegions: s.detectedRegions.flatMap((r) =>
            r.id === regionId ? [top, bottom] : [r]
          ),
        };
      }
      return s;
    });
  },

  acceptAllDetected: async () => {
    const state = get();
    const list = [...state.detectedRegions];
    for (const region of list) {
      await get().createRasterElement(
        { x: region.x, y: region.y, width: region.width, height: region.height },
        region.suggestedName,
        region.suggestedType,
        region.confidence
      );
    }
    set({ detectedRegions: [] });
  },

  undo: () => {
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const prev = s.undoStack[s.undoStack.length - 1];
      const currentFrame: HistoryFrame = {
        elements: s.elements,
        comments: s.comments,
        operations: s.operations,
      };
      const nextState = {
        ...s,
        elements: prev.elements,
        comments: prev.comments,
        operations: prev.operations,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, currentFrame],
        selectedIds: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  redo: () => {
    set((s) => {
      if (s.redoStack.length === 0) return s;
      const nextFrame = s.redoStack[s.redoStack.length - 1];
      const currentFrame: HistoryFrame = {
        elements: s.elements,
        comments: s.comments,
        operations: s.operations,
      };
      const nextState = {
        ...s,
        elements: nextFrame.elements,
        comments: nextFrame.comments,
        operations: nextFrame.operations,
        undoStack: [...s.undoStack, currentFrame],
        redoStack: s.redoStack.slice(0, -1),
        selectedIds: [],
      };
      schedulePersist(nextState);
      return nextState;
    });
  },

  setAiConfig: (cfg) => {
    set((s) => {
      const next = { ...s.aiConfig, ...cfg };
      try {
        localStorage.setItem('vp_ai_config', JSON.stringify(next));
      } catch {
        // ignore
      }
      return { aiConfig: next };
    });
  },

  setControlRoomConfig: (cfg) => {
    set((s) => {
      const next = { ...s.controlRoomConfig, ...cfg };
      try {
        localStorage.setItem('vp_cr_config', JSON.stringify(next));
      } catch {
        // ignore
      }
      return { controlRoomConfig: next };
    });
  },
}));
