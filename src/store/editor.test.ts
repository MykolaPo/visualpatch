import { describe, expect, it, beforeEach } from 'vitest';
import { useEditorStore } from './useEditorStore';
import { buildChangesJson, generateMarkdownSpec } from '../utils/exportEngine';

describe('VisualPatch Editor Store & Export', () => {
  beforeEach(async () => {
    useEditorStore.getState().closeProject();
    await useEditorStore
      .getState()
      .createProjectFromImage(
        'Test Project',
        'https://richnachas.com',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        1280,
        860
      );
  });

  it('creates native elements, moves them, and supports undo/redo', () => {
    const store = useEditorStore.getState();
    const el = store.createNativeElement('button', 100, 120, 140, 44, 'Пошук');
    expect(el).not.toBeNull();
    expect(useEditorStore.getState().elements).toHaveLength(1);
    expect(useEditorStore.getState().operations.at(-1)?.type).toBe('CREATE');

    useEditorStore.getState().moveElements([{ id: el!.id, x: 240, y: 180 }]);
    const moved = useEditorStore.getState().elements[0];
    expect(moved.x).toBe(240);
    expect(moved.y).toBe(180);
    expect(useEditorStore.getState().operations.at(-1)?.type).toBe('MOVE');

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().elements[0].x).toBe(100);
    expect(useEditorStore.getState().elements[0].y).toBe(120);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().elements[0].x).toBe(240);
    expect(useEditorStore.getState().elements[0].y).toBe(180);
  });

  it('supports duplicating, grouping, ungrouping, and soft-deleting elements', () => {
    const store = useEditorStore.getState();
    const el1 = store.createNativeElement('rect', 50, 50, 100, 40)!;
    useEditorStore.getState().setSelectedIds([el1.id]);
    useEditorStore.getState().duplicateSelected();

    const els = useEditorStore.getState().elements;
    expect(els).toHaveLength(2);

    useEditorStore.getState().setSelectedIds([els[0].id, els[1].id]);
    useEditorStore.getState().groupSelected();

    const grouped = useEditorStore.getState().elements;
    const grp = grouped.find((e) => e.type === 'group');
    expect(grp).toBeDefined();
    expect(grouped.filter((e) => e.parentId === grp!.id)).toHaveLength(2);

    useEditorStore.getState().setSelectedIds([grp!.id]);
    useEditorStore.getState().ungroupSelected();
    expect(useEditorStore.getState().elements.some((e) => e.type === 'group')).toBe(false);

    useEditorStore.getState().setSelectedIds([els[0].id]);
    useEditorStore.getState().deleteSelected();
    expect(useEditorStore.getState().elements.find((e) => e.id === els[0].id)?.deleted).toBe(true);
  });

  it('adds comments and generates complete Markdown ТЗ and changes.json without AI', () => {
    const store = useEditorStore.getState();
    const el = store.createNativeElement('text', 40, 40, 200, 30, 'Заголовок')!;
    useEditorStore.getState().moveElements([{ id: el.id, x: 80, y: 60 }]);
    useEditorStore.getState().addComment(el.id, 280, 60, 'Сохранить текущие цвета и шрифты', 'high');

    const s = useEditorStore.getState();
    const md = generateMarkdownSpec(s.project!, s.elements, s.operations, s.comments);
    expect(md).toContain('# Техническое задание: Test Project');
    expect(md).toContain('https://richnachas.com');
    expect(md).toContain('MOVE');
    expect(md).toContain('Сохранить текущие цвета и шрифты');

    const json = buildChangesJson(s.project!, s.elements, s.operations, s.comments);
    expect(json.summary.operationsCount).toBe(3);
    expect(json.summary.commentsCount).toBe(1);
    expect(json.operations[1].type).toBe('MOVE');
  });
});
