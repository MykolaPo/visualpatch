import React, { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Circle as KonvaCircle,
  Group as KonvaGroup,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Text as KonvaText,
  Transformer,
} from 'react-konva';
import {
  Copy,
  Maximize,
  MessageSquarePlus,
  Move,
  Trash2,
  Type,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import type { VisualElement } from '../types/editor';
import {
  cropPolygonRegion,
  findSmartElementBounds,
  type Point,
} from '../utils/smartSelect';

function useHtmlImage(src?: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) {
      setImg(null);
      return;
    }
    let active = true;
    const image = new window.Image();
    image.onload = () => {
      if (active) setImg(image);
    };
    image.src = src;
    return () => {
      active = false;
    };
  }, [src]);
  return img;
}

const RasterNode: React.FC<{
  el: VisualElement;
  draggable: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => void;
}> = ({
  el,
  draggable,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  onContextMenu,
}) => {
  const img = useHtmlImage(el.imageDataUrl);
  if (!img) return null;
  return (
    <KonvaImage
      id={el.id}
      name="vp-element"
      image={img}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.styles.opacity ?? 1}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
      onContextMenu={onContextMenu}
    />
  );
};

const BgPatchNode: React.FC<{ el: VisualElement }> = ({ el }) => {
  const patchImg = useHtmlImage(el.bgRestoreDataUrl);
  if (!el.sourceCrop || el.bgRestoreMode === 'none') return null;
  const { x, y, width, height } = el.sourceCrop;

  if (el.bgRestoreMode === 'solid' || !patchImg) {
    return (
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={el.bgRestoreColor || '#ffffff'}
        listening={false}
      />
    );
  }

  return (
    <KonvaImage
      image={patchImg}
      x={x}
      y={y}
      width={width}
      height={height}
      listening={false}
    />
  );
};

interface CanvasWorkspaceProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({ containerRef }) => {
  const project = useEditorStore((s) => s.project);
  const elements = useEditorStore((s) => s.elements);
  const comments = useEditorStore((s) => s.comments);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelectedIds = useEditorStore((s) => s.setSelectedIds);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const compareMode = useEditorStore((s) => s.compareMode);
  const splitPosition = useEditorStore((s) => s.splitPosition);
  const setSplitPosition = useEditorStore((s) => s.setSplitPosition);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const pan = useEditorStore((s) => s.pan);
  const setPan = useEditorStore((s) => s.setPan);
  const showGrid = useEditorStore((s) => s.showGrid);
  const snapToGuides = useEditorStore((s) => s.snapToGuides);
  const showComments = useEditorStore((s) => s.showComments);
  const showDiffHighlights = useEditorStore((s) => s.showDiffHighlights);
  const detectedRegions = useEditorStore((s) => s.detectedRegions);
  const acceptDetectedRegion = useEditorStore((s) => s.acceptDetectedRegion);

  const createRasterElement = useEditorStore((s) => s.createRasterElement);
  const createNativeElement = useEditorStore((s) => s.createNativeElement);
  const moveElements = useEditorStore((s) => s.moveElements);
  const resizeElement = useEditorStore((s) => s.resizeElement);
  const updateElementProps = useEditorStore((s) => s.updateElementProps);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const updateBgRestore = useEditorStore((s) => s.updateBgRestore);
  const addComment = useEditorStore((s) => s.addComment);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const [size, setSize] = useState({ width: 900, height: 600 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [drawBox, setDrawBox] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [guides, setGuides] = useState<Array<{ points: number[]; label?: string; lx?: number; ly?: number }>>([]);
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [freehandPoints, setFreehandPoints] = useState<Point[] | null>(null);
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [commentDraft, setCommentDraft] = useState<{
    elementId: string | null;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    elementId: string;
  } | null>(null);

  const baseImg = useHtmlImage(project?.sourceImage);

  // Measure viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: Math.max(200, Math.floor(entry.contentRect.width)),
          height: Math.max(200, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  // Space key for pan
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Attach Transformer to selected nodes
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;

    if (compareMode === 'before') {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const nodes = selectedIds
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, elements, compareMode]);

  const activeElements = useMemo(
    () =>
      elements
        .filter((e) => !e.deleted && e.visible)
        .sort((a, b) => a.zIndex - b.zIndex),
    [elements]
  );

  const rasterPatches = useMemo(
    () =>
      elements.filter((el) => {
        if (el.type !== 'raster' || !el.sourceCrop) return false;
        if (el.deleted || !el.visible) return true;
        return (
          Math.round(el.x) !== Math.round(el.sourceCrop.x) ||
          Math.round(el.y) !== Math.round(el.sourceCrop.y) ||
          Math.round(el.width) !== Math.round(el.sourceCrop.width) ||
          Math.round(el.height) !== Math.round(el.sourceCrop.height) ||
          Math.round(el.rotation) !== 0
        );
      }),
    [elements]
  );

  if (!project) return null;

  const isPanMode = activeTool === 'hand' || spacePressed;

  const getPointerInCanvas = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return {
      x: (pos.x - pan.x) / zoom,
      y: (pos.y - pan.y) / zoom,
    };
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    setContextMenu(null);
    if (isPanMode || compareMode === 'before') return;

    const pt = getPointerInCanvas();
    if (!pt) return;

    if (activeTool === 'crop' || activeTool === 'rect') {
      setDrawBox({
        startX: pt.x,
        startY: pt.y,
        x: pt.x,
        y: pt.y,
        width: 0,
        height: 0,
      });
      return;
    }

    if (activeTool === 'smart-brush' || activeTool === 'lasso') {
      setFreehandPoints([{ x: pt.x, y: pt.y }]);
      return;
    }

    if (activeTool === 'text') {
      createNativeElement('text', pt.x, pt.y, 180, 34, 'Новый текст');
      return;
    }

    if (activeTool === 'comment') {
      const targetId = e.target.id();
      const linked = elements.find((el) => el.id === targetId && !el.deleted);
      setCommentDraft({
        elementId: linked ? linked.id : null,
        x: pt.x,
        y: pt.y,
        text: '',
      });
      return;
    }

    // Clicked empty background -> start marquee selection
    if (e.target === stageRef.current || e.target.name() === 'vp-base-image') {
      setSelectedIds([]);
      if (activeTool === 'select') {
        setMarquee({
          startX: pt.x,
          startY: pt.y,
          x: pt.x,
          y: pt.y,
          width: 0,
          height: 0,
        });
      }
    }
  };

  const handleStageMouseMove = () => {
    const pt = getPointerInCanvas();
    if (!pt) return;

    if (freehandPoints) {
      setFreehandPoints((prev) => (prev ? [...prev, { x: pt.x, y: pt.y }] : null));
      return;
    }

    if (marquee) {
      const x = Math.min(marquee.startX, pt.x);
      const y = Math.min(marquee.startY, pt.y);
      const width = Math.abs(pt.x - marquee.startX);
      const height = Math.abs(pt.y - marquee.startY);
      setMarquee({ ...marquee, x, y, width, height });
      return;
    }

    if (!drawBox) return;
    const x = Math.min(drawBox.startX, pt.x);
    const y = Math.min(drawBox.startY, pt.y);
    const width = Math.abs(pt.x - drawBox.startX);
    const height = Math.abs(pt.y - drawBox.startY);
    setDrawBox({ ...drawBox, x, y, width, height });
  };

  const handleStageMouseUp = async () => {
    if (freehandPoints) {
      const pts = freehandPoints;
      setFreehandPoints(null);
      if (pts.length < 2) return;

      if (activeTool === 'smart-brush') {
        const smartCrop = await findSmartElementBounds(project.sourceImage, pts);
        if (smartCrop) {
          await createRasterElement(smartCrop, 'Умный фрагмент');
        }
      } else if (activeTool === 'lasso') {
        const poly = await cropPolygonRegion(project.sourceImage, pts);
        if (poly) {
          await createRasterElement(
            poly.crop,
            'Лассо-фрагмент',
            'raster',
            undefined,
            poly.imageDataUrl
          );
        }
      }
      return;
    }

    if (marquee) {
      const box = marquee;
      setMarquee(null);
      if (box.width >= 6 && box.height >= 6) {
        const hits = activeElements
          .filter(
            (el) =>
              !el.locked &&
              el.x < box.x + box.width &&
              el.x + el.width > box.x &&
              el.y < box.y + box.height &&
              el.y + el.height > box.y
          )
          .map((el) => el.id);
        if (hits.length > 0) setSelectedIds(hits);
      }
      return;
    }

    if (!drawBox) return;
    const box = drawBox;
    setDrawBox(null);
    if (box.width < 8 || box.height < 8) return;

    if (activeTool === 'crop') {
      const clampedX = Math.max(0, box.x);
      const clampedY = Math.max(0, box.y);
      const clampedW = Math.min(project.canvasWidth - clampedX, box.width);
      const clampedH = Math.min(project.canvasHeight - clampedY, box.height);
      if (clampedW >= 8 && clampedH >= 8) {
        await createRasterElement({
          x: clampedX,
          y: clampedY,
          width: clampedW,
          height: clampedH,
        });
      }
    } else if (activeTool === 'rect') {
      createNativeElement('rect', box.x, box.y, box.width, box.height);
    }
  };

  const handleElementDragMove = (
    el: VisualElement,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    if (!snapToGuides) {
      setGuides([]);
      return;
    }
    const node = e.target;
    let nx = node.x();
    let ny = node.y();
    const threshold = 6;
    const nextGuides: Array<{ points: number[]; label?: string; lx?: number; ly?: number }> = [];

    const xTargets = [0, project.canvasWidth / 2, project.canvasWidth];
    const yTargets = [0, project.canvasHeight / 2, project.canvasHeight];
    for (const other of activeElements) {
      if (other.id === el.id) continue;
      xTargets.push(other.x, other.x + other.width / 2, other.x + other.width);
      yTargets.push(other.y, other.y + other.height / 2, other.y + other.height);
    }

    for (const tx of xTargets) {
      if (Math.abs(nx - tx) < threshold) {
        nx = tx;
        nextGuides.push({ points: [tx, 0, tx, project.canvasHeight] });
        break;
      }
      if (Math.abs(nx + el.width - tx) < threshold) {
        nx = tx - el.width;
        nextGuides.push({ points: [tx, 0, tx, project.canvasHeight] });
        break;
      }
    }

    for (const ty of yTargets) {
      if (Math.abs(ny - ty) < threshold) {
        ny = ty;
        nextGuides.push({ points: [0, ty, project.canvasWidth, ty] });
        break;
      }
      if (Math.abs(ny + el.height - ty) < threshold) {
        ny = ty - el.height;
        nextGuides.push({ points: [0, ty, project.canvasWidth, ty] });
        break;
      }
    }

    // Visible spacing distances (px) to nearest horizontal/vertical neighbor
    let bestH: { dist: number; points: number[]; lx: number; ly: number } | null = null;
    let bestV: { dist: number; points: number[]; lx: number; ly: number } | null = null;

    for (const other of activeElements) {
      if (other.id === el.id) continue;
      const vOverlap = ny < other.y + other.height && ny + el.height > other.y;
      if (vOverlap) {
        const cy = Math.round((Math.max(ny, other.y) + Math.min(ny + el.height, other.y + other.height)) / 2);
        if (nx >= other.x + other.width) {
          const d = Math.round(nx - (other.x + other.width));
          if (d > 0 && (!bestH || d < bestH.dist)) {
            bestH = { dist: d, points: [other.x + other.width, cy, nx, cy], lx: (other.x + other.width + nx) / 2, ly: cy - 12 };
          }
        } else if (other.x >= nx + el.width) {
          const d = Math.round(other.x - (nx + el.width));
          if (d > 0 && (!bestH || d < bestH.dist)) {
            bestH = { dist: d, points: [nx + el.width, cy, other.x, cy], lx: (nx + el.width + other.x) / 2, ly: cy - 12 };
          }
        }
      }

      const hOverlap = nx < other.x + other.width && nx + el.width > other.x;
      if (hOverlap) {
        const cx = Math.round((Math.max(nx, other.x) + Math.min(nx + el.width, other.x + other.width)) / 2);
        if (ny >= other.y + other.height) {
          const d = Math.round(ny - (other.y + other.height));
          if (d > 0 && (!bestV || d < bestV.dist)) {
            bestV = { dist: d, points: [cx, other.y + other.height, cx, ny], lx: cx + 6, ly: (other.y + other.height + ny) / 2 };
          }
        } else if (other.y >= ny + el.height) {
          const d = Math.round(other.y - (ny + el.height));
          if (d > 0 && (!bestV || d < bestV.dist)) {
            bestV = { dist: d, points: [cx, ny + el.height, cx, other.y], lx: cx + 6, ly: (ny + el.height + other.y) / 2 };
          }
        }
      }
    }

    if (bestH) nextGuides.push({ points: bestH.points, label: `${bestH.dist}px`, lx: bestH.lx, ly: bestH.ly });
    if (bestV) nextGuides.push({ points: bestV.points, label: `${bestV.dist}px`, lx: bestV.lx, ly: bestV.ly });

    node.x(nx);
    node.y(ny);
    setGuides(nextGuides);
  };

  const handleElementDragEnd = (
    el: VisualElement,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    setGuides([]);
    moveElements([{ id: el.id, x: e.target.x(), y: e.target.y() }]);
  };

  const handleTransformEnd = (
    el: VisualElement,
    e: Konva.KonvaEventObject<Event>
  ) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    resizeElement(
      el.id,
      node.x(),
      node.y(),
      Math.max(8, el.width * scaleX),
      Math.max(8, el.height * scaleY),
      node.rotation()
    );
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    if (!e.evt.ctrlKey && !e.evt.metaKey) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.08;
    const oldScale = zoom;
    const newScale =
      e.evt.deltaY < 0
        ? Math.min(4, oldScale * scaleBy)
        : Math.max(0.15, oldScale / scaleBy);

    const mousePointTo = {
      x: (pointer.x - pan.x) / oldScale,
      y: (pointer.y - pan.y) / oldScale,
    };

    setZoom(newScale);
    setPan({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const singleSelected =
    selectedIds.length === 1
      ? activeElements.find((e) => e.id === selectedIds[0])
      : undefined;

  const splitX = Math.round(project.canvasWidth * splitPosition);

  const renderElementNode = (el: VisualElement) => {
    const draggable = activeTool === 'select' && !el.locked && compareMode !== 'before';
    const onSelect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (activeTool === 'comment') return;
      e.cancelBubble = true;
      const evt = e.evt as MouseEvent;
      if (evt.shiftKey) {
        setSelectedIds(
          selectedIds.includes(el.id)
            ? selectedIds.filter((id) => id !== el.id)
            : [...selectedIds, el.id]
        );
      } else {
        setSelectedIds([el.id]);
      }
    };
    const onContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      e.cancelBubble = true;
      setSelectedIds([el.id]);
      setContextMenu({
        x: e.evt.clientX,
        y: e.evt.clientY,
        elementId: el.id,
      });
    };

    if (el.type === 'raster' || el.type === 'image') {
      return (
        <RasterNode
          key={el.id}
          el={el}
          draggable={draggable}
          onSelect={onSelect}
          onDragMove={(ev) => handleElementDragMove(el, ev)}
          onDragEnd={(ev) => handleElementDragEnd(el, ev)}
          onTransformEnd={(ev) => handleTransformEnd(el, ev)}
          onContextMenu={onContextMenu}
        />
      );
    }

    if (el.type === 'text') {
      return (
        <KonvaText
          key={el.id}
          id={el.id}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rotation={el.rotation}
          text={el.content || ''}
          fontSize={el.styles.fontSize || 18}
          fontFamily={el.styles.fontFamily || 'Inter, sans-serif'}
          fontStyle={el.styles.fontWeight || '600'}
          fill={el.styles.color || '#0f172a'}
          opacity={el.styles.opacity ?? 1}
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onDblClick={() =>
            setInlineEdit({
              id: el.id,
              value: el.content || '',
              x: el.x * zoom + pan.x,
              y: el.y * zoom + pan.y,
              width: el.width * zoom,
              height: el.height * zoom,
            })
          }
          onDragMove={(ev) => handleElementDragMove(el, ev)}
          onDragEnd={(ev) => handleElementDragEnd(el, ev)}
          onTransformEnd={(ev) => handleTransformEnd(el, ev)}
          onContextMenu={onContextMenu}
        />
      );
    }

    if (el.type === 'group') {
      return (
        <Rect
          key={el.id}
          id={el.id}
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rotation={el.rotation}
          stroke={el.styles.stroke || '#6366f1'}
          strokeWidth={1.5}
          dash={[5, 4]}
          fill="rgba(99,102,241,0.04)"
          draggable={draggable}
          onClick={onSelect}
          onTap={onSelect}
          onDragMove={(ev) => handleElementDragMove(el, ev)}
          onDragEnd={(ev) => handleElementDragEnd(el, ev)}
          onTransformEnd={(ev) => handleTransformEnd(el, ev)}
          onContextMenu={onContextMenu}
        />
      );
    }

    // rect / container / button
    return (
      <KonvaGroup
        key={el.id}
        id={el.id}
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rotation={el.rotation}
        opacity={el.styles.opacity ?? 1}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={() => {
          if (el.type === 'button') {
            setInlineEdit({
              id: el.id,
              value: el.content || '',
              x: el.x * zoom + pan.x,
              y: el.y * zoom + pan.y,
              width: el.width * zoom,
              height: el.height * zoom,
            });
          }
        }}
        onDragMove={(ev) => handleElementDragMove(el, ev)}
        onDragEnd={(ev) => handleElementDragEnd(el, ev)}
        onTransformEnd={(ev) => handleTransformEnd(el, ev)}
        onContextMenu={onContextMenu}
      >
        <Rect
          width={el.width}
          height={el.height}
          fill={el.styles.fill || '#e2e8f0'}
          stroke={el.styles.stroke}
          strokeWidth={el.styles.strokeWidth ?? 0}
          cornerRadius={el.styles.borderRadius ?? 6}
        />
        {el.content && (
          <KonvaText
            width={el.width}
            height={el.height}
            text={el.content}
            fontSize={el.styles.fontSize || 14}
            fontStyle={el.styles.fontWeight || '600'}
            fill={el.styles.color || '#ffffff'}
            align="center"
            verticalAlign="middle"
          />
        )}
      </KonvaGroup>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
        cursor: isPanMode
          ? 'grab'
          : activeTool === 'crop' ||
            activeTool === 'rect' ||
            activeTool === 'comment' ||
            activeTool === 'smart-brush' ||
            activeTool === 'lasso'
          ? 'crosshair'
          : 'default',
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={pan.x}
        y={pan.y}
        scaleX={zoom}
        scaleY={zoom}
        draggable={isPanMode}
        onDragEnd={(e) => {
          if (e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onWheel={handleWheel}
      >
        {/* Base Screenshot Layer */}
        <Layer>
          {baseImg && (
            <KonvaImage
              name="vp-base-image"
              image={baseImg}
              x={0}
              y={0}
              width={project.canvasWidth}
              height={project.canvasHeight}
            />
          )}
        </Layer>

        {/* Edited Result Layer (clipped in split mode, hidden in before mode) */}
        {compareMode !== 'before' && (
          <Layer
            clipX={compareMode === 'split' ? splitX : 0}
            clipY={0}
            clipWidth={
              compareMode === 'split'
                ? project.canvasWidth - splitX
                : project.canvasWidth
            }
            clipHeight={project.canvasHeight}
          >
            {rasterPatches.map((el) => (
              <BgPatchNode key={`patch_${el.id}`} el={el} />
            ))}
            {activeElements.map(renderElementNode)}
          </Layer>
        )}

        {/* Overlay Layer: Grid, Guides, Transformer, Detected Regions, Comments, Split Divider */}
        <Layer>
          {showGrid && (
            <>
              {Array.from(
                { length: Math.floor(project.canvasWidth / 40) },
                (_, i) => (
                  <Line
                    key={`gx_${i}`}
                    points={[(i + 1) * 40, 0, (i + 1) * 40, project.canvasHeight]}
                    stroke="rgba(148,163,184,0.16)"
                    strokeWidth={1 / zoom}
                    listening={false}
                  />
                )
              )}
              {Array.from(
                { length: Math.floor(project.canvasHeight / 40) },
                (_, i) => (
                  <Line
                    key={`gy_${i}`}
                    points={[0, (i + 1) * 40, project.canvasWidth, (i + 1) * 40]}
                    stroke="rgba(148,163,184,0.16)"
                    strokeWidth={1 / zoom}
                    listening={false}
                  />
                )
              )}
            </>
          )}

          {showDiffHighlights &&
            elements.map((el) => {
              const color = el.deleted
                ? '#ef4444'
                : !el.sourceCrop
                ? '#10b981'
                : '#f59e0b';
              return (
                <Rect
                  key={`diff_${el.id}`}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  stroke={color}
                  strokeWidth={2 / zoom}
                  dash={[6, 4]}
                  listening={false}
                />
              );
            })}

          {detectedRegions.map((reg) => (
            <KonvaGroup
              key={reg.id}
              x={reg.x}
              y={reg.y}
              onClick={() => acceptDetectedRegion(reg.id)}
            >
              <Rect
                width={reg.width}
                height={reg.height}
                stroke="#6366f1"
                strokeWidth={1.5 / zoom}
                dash={[4, 3]}
                fill="rgba(99, 102, 241, 0.1)"
              />
            </KonvaGroup>
          ))}

          {guides.map((g, i) => (
            <KonvaGroup key={`guide_${i}`} listening={false}>
              <Line
                points={g.points}
                stroke="#ec4899"
                strokeWidth={1.2 / zoom}
                dash={[4, 3]}
              />
              {g.label && g.lx !== undefined && g.ly !== undefined && (
                <KonvaText
                  x={g.lx}
                  y={g.ly}
                  text={g.label}
                  fontSize={11 / zoom}
                  fontStyle="bold"
                  fill="#ec4899"
                />
              )}
            </KonvaGroup>
          ))}

          {marquee && (
            <Rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              stroke="#6366f1"
              strokeWidth={1.2 / zoom}
              fill="rgba(99,102,241,0.12)"
              dash={[4, 3]}
              listening={false}
            />
          )}

          {freehandPoints && freehandPoints.length >= 2 && (
            <Line
              points={freehandPoints.flatMap((p) => [p.x, p.y])}
              stroke={activeTool === 'smart-brush' ? '#10b981' : '#6366f1'}
              strokeWidth={(activeTool === 'smart-brush' ? 14 : 2) / zoom}
              opacity={activeTool === 'smart-brush' ? 0.45 : 0.95}
              lineCap="round"
              lineJoin="round"
              closed={activeTool === 'lasso'}
              fill={activeTool === 'lasso' ? 'rgba(99,102,241,0.15)' : undefined}
              listening={false}
            />
          )}

          {drawBox && (
            <Rect
              x={drawBox.x}
              y={drawBox.y}
              width={drawBox.width}
              height={drawBox.height}
              stroke="#6366f1"
              strokeWidth={2 / zoom}
              fill="rgba(99,102,241,0.15)"
              listening={false}
            />
          )}

          {showComments &&
            comments.map((c, idx) => (
              <KonvaGroup
                key={c.id}
                x={c.x}
                y={c.y}
                onClick={(e) => {
                  e.cancelBubble = true;
                  if (c.elementId) setSelectedIds([c.elementId]);
                }}
              >
                <KonvaCircle
                  radius={11 / zoom}
                  fill={c.status === 'resolved' ? '#10b981' : '#f59e0b'}
                  stroke="#ffffff"
                  strokeWidth={2 / zoom}
                />
                <KonvaText
                  x={-5 / zoom}
                  y={-6 / zoom}
                  text={String(idx + 1)}
                  fontSize={11 / zoom}
                  fontStyle="bold"
                  fill="#0f172a"
                />
              </KonvaGroup>
            ))}

          {compareMode === 'split' && (
            <Line
              points={[splitX, 0, splitX, project.canvasHeight]}
              stroke="#6366f1"
              strokeWidth={3 / zoom}
              listening={false}
            />
          )}

          <Transformer
            ref={trRef}
            rotateEnabled={true}
            anchorSize={8}
            borderStroke="#6366f1"
            anchorStroke="#6366f1"
            anchorFill="#ffffff"
          />
        </Layer>
      </Stage>

      {/* Split Comparison Slider Bar */}
      {compareMode === 'split' && (
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-strong)',
            borderRadius: 999,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 30,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Оригинал</span>
          <input
            type="range"
            min={5}
            max={95}
            value={Math.round(splitPosition * 100)}
            onChange={(e) => setSplitPosition(Number(e.target.value) / 100)}
            style={{ width: 160 }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Результат</span>
        </div>
      )}

      {/* Compact Floating Action Bar under Selected Element */}
      {singleSelected && compareMode !== 'before' && !inlineEdit && (
        <div
          data-testid="floating-action-bar"
          style={{
            position: 'absolute',
            left: Math.max(
              12,
              Math.min(size.width - 420, singleSelected.x * zoom + pan.x)
            ),
            top: Math.max(
              10,
              Math.min(
                size.height - 46,
                (singleSelected.y + singleSelected.height) * zoom + pan.y + 10
              )
            ),
            background: 'var(--bg-panel-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 4,
            boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
            zIndex: 28,
          }}
        >
          <button
            className="vp-btn"
            style={{ height: 24, padding: '0 6px', fontSize: 11 }}
            title="Переместить"
            onClick={() => setActiveTool('select')}
          >
            <Move size={12} />
            Переместить
          </button>
          <button
            className="vp-btn"
            style={{ height: 24, padding: '0 6px', fontSize: 11 }}
            title="Размер (используйте маркеры)"
            onClick={() => setActiveTool('select')}
          >
            <Maximize size={12} />
            Размер
          </button>
          {singleSelected.type === 'raster' && singleSelected.sourceCrop && (
            <>
              <div className="vp-divider" style={{ height: 14 }} />
              <button
                className={`vp-btn ${
                  (singleSelected.bgRestoreMode || 'sample') !== 'none'
                    ? 'vp-btn-active'
                    : ''
                }`}
                style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                title="Восстановить/заменить фон под вырезанным элементом"
                onClick={() => updateBgRestore(singleSelected.id, 'sample')}
                data-testid="fab-bg-replace"
              >
                Фон: Авто
              </button>
              <button
                className={`vp-btn ${
                  singleSelected.bgRestoreMode === 'solid' ? 'vp-btn-active' : ''
                }`}
                style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                title="Залить исходную область фоновым цветом"
                onClick={() => updateBgRestore(singleSelected.id, 'solid')}
                data-testid="fab-bg-solid"
              >
                Цвет
              </button>
              <button
                className={`vp-btn ${
                  singleSelected.bgRestoreMode === 'none' ? 'vp-btn-active' : ''
                }`}
                style={{ height: 24, padding: '0 6px', fontSize: 11 }}
                title="Не менять фон под исходной позицией"
                onClick={() => updateBgRestore(singleSelected.id, 'none')}
                data-testid="fab-bg-none"
              >
                Не менять
              </button>
              <div className="vp-divider" style={{ height: 14 }} />
            </>
          )}
          {(singleSelected.type === 'text' || singleSelected.type === 'button') && (
            <button
              className="vp-btn"
              style={{ height: 24, padding: '0 6px', fontSize: 11 }}
              onClick={() =>
                setInlineEdit({
                  id: singleSelected.id,
                  value: singleSelected.content || '',
                  x: singleSelected.x * zoom + pan.x,
                  y: singleSelected.y * zoom + pan.y,
                  width: singleSelected.width * zoom,
                  height: singleSelected.height * zoom,
                })
              }
            >
              <Type size={12} />
              Текст
            </button>
          )}
          <button
            className="vp-btn"
            style={{ height: 24, padding: '0 6px', fontSize: 11 }}
            onClick={duplicateSelected}
            data-testid="fab-duplicate"
          >
            <Copy size={12} />
            Дублировать
          </button>
          <button
            className="vp-btn"
            style={{ height: 24, padding: '0 6px', fontSize: 11, color: '#fca5a5' }}
            onClick={deleteSelected}
            data-testid="fab-delete"
          >
            <Trash2 size={12} />
            Удалить
          </button>
          <button
            className="vp-btn"
            style={{ height: 24, padding: '0 6px', fontSize: 11 }}
            onClick={() =>
              setCommentDraft({
                elementId: singleSelected.id,
                x: singleSelected.x + singleSelected.width,
                y: singleSelected.y,
                text: '',
              })
            }
            data-testid="fab-comment"
          >
            <MessageSquarePlus size={12} />
            Комментарий
          </button>
        </div>
      )}

      {/* Inline Text Editor */}
      {inlineEdit && (
        <input
          autoFocus
          className="vp-input"
          value={inlineEdit.value}
          onChange={(e) => setInlineEdit({ ...inlineEdit, value: e.target.value })}
          onBlur={() => {
            updateElementProps(inlineEdit.id, { content: inlineEdit.value }, 'EDIT_TEXT');
            setInlineEdit(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              updateElementProps(inlineEdit.id, { content: inlineEdit.value }, 'EDIT_TEXT');
              setInlineEdit(null);
            } else if (e.key === 'Escape') {
              setInlineEdit(null);
            }
          }}
          style={{
            position: 'absolute',
            left: inlineEdit.x,
            top: inlineEdit.y,
            width: Math.max(140, inlineEdit.width),
            height: Math.max(30, inlineEdit.height),
            zIndex: 35,
          }}
        />
      )}

      {/* Comment Draft Popover */}
      {commentDraft && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(12, Math.min(size.width - 260, commentDraft.x * zoom + pan.x)),
            top: Math.max(12, Math.min(size.height - 140, commentDraft.y * zoom + pan.y)),
            width: 240,
            background: 'var(--bg-panel-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: 10,
            zIndex: 36,
            boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            Новый комментарий
          </div>
          <textarea
            autoFocus
            rows={3}
            className="vp-textarea"
            placeholder="Например: Уменьшить отступ, сохранить цвета..."
            value={commentDraft.text}
            onChange={(e) => setCommentDraft({ ...commentDraft, text: e.target.value })}
            data-testid="comment-draft-input"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button className="vp-btn" onClick={() => setCommentDraft(null)}>
              Отмена
            </button>
            <button
              className="vp-btn vp-btn-primary"
              onClick={() => {
                if (commentDraft.text.trim()) {
                  addComment(
                    commentDraft.elementId,
                    commentDraft.x,
                    commentDraft.y,
                    commentDraft.text
                  );
                }
                setCommentDraft(null);
              }}
              data-testid="comment-draft-submit"
            >
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            width: 170,
            background: 'var(--bg-panel-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: 4,
            zIndex: 60,
            boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
            display: 'grid',
            gap: 2,
          }}
        >
          <button
            className="vp-btn"
            style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent' }}
            onClick={() => {
              duplicateSelected();
              setContextMenu(null);
            }}
          >
            <Copy size={12} /> Дублировать (Ctrl+D)
          </button>
          <button
            className="vp-btn"
            style={{ justifyContent: 'flex-start', border: 'none', background: 'transparent' }}
            onClick={() => {
              const el = activeElements.find((e) => e.id === contextMenu.elementId);
              if (el) {
                setCommentDraft({
                  elementId: el.id,
                  x: el.x + el.width,
                  y: el.y,
                  text: '',
                });
              }
              setContextMenu(null);
            }}
          >
            <MessageSquarePlus size={12} /> Комментарий
          </button>
          <button
            className="vp-btn"
            style={{
              justifyContent: 'flex-start',
              border: 'none',
              background: 'transparent',
              color: '#fca5a5',
            }}
            onClick={() => {
              deleteSelected();
              setContextMenu(null);
            }}
          >
            <Trash2 size={12} /> Удалить (Del)
          </button>
        </div>
      )}
    </div>
  );
};
