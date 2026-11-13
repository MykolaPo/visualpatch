import React, { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Group,
  History,
  Lock,
  MessageSquare,
  Sliders,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore';
import type { BgRestoreMode } from '../types/editor';

export const RightInspector: React.FC = () => {
  const project = useEditorStore((s) => s.project);
  const elements = useEditorStore((s) => s.elements);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const comments = useEditorStore((s) => s.comments);
  const operations = useEditorStore((s) => s.operations);

  const moveElements = useEditorStore((s) => s.moveElements);
  const resizeElement = useEditorStore((s) => s.resizeElement);
  const updateElementProps = useEditorStore((s) => s.updateElementProps);
  const updateBgRestore = useEditorStore((s) => s.updateBgRestore);
  const reorderElement = useEditorStore((s) => s.reorderElement);
  const alignSelected = useEditorStore((s) => s.alignSelected);
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroupSelected = useEditorStore((s) => s.ungroupSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const toggleLock = useEditorStore((s) => s.toggleLock);
  const addComment = useEditorStore((s) => s.addComment);
  const toggleCommentStatus = useEditorStore((s) => s.toggleCommentStatus);
  const deleteComment = useEditorStore((s) => s.deleteComment);

  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<'props' | 'comments' | 'history'>('props');
  const [quickComment, setQuickComment] = useState('');

  if (!project) return null;

  const selectedElements = elements.filter(
    (e) => selectedIds.includes(e.id) && !e.deleted
  );
  const single = selectedElements.length === 1 ? selectedElements[0] : null;

  if (selectedElements.length === 0 && tab === 'props' && collapsed) {
    return null;
  }

  if (collapsed) {
    return (
      <div
        style={{
          width: 36,
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 6,
        }}
      >
        <button
          className="vp-btn vp-btn-icon"
          title="Развернуть инспектор"
          onClick={() => setCollapsed(false)}
        >
          <Sliders size={14} />
        </button>
      </div>
    );
  }

  return (
    <aside
      className="inspector-drawer"
      style={{
        width: 276,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Header tabs */}
      <div
        style={{
          height: 38,
          padding: '0 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 3 }}>
          <button
            className={`vp-btn ${tab === 'props' ? 'vp-btn-active' : ''}`}
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
            onClick={() => setTab('props')}
          >
            <Sliders size={12} />
            Свойства
          </button>
          <button
            className={`vp-btn ${tab === 'comments' ? 'vp-btn-active' : ''}`}
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
            onClick={() => setTab('comments')}
          >
            <MessageSquare size={12} />
            {comments.length}
          </button>
          <button
            className={`vp-btn ${tab === 'history' ? 'vp-btn-active' : ''}`}
            style={{ height: 26, padding: '0 7px', fontSize: 11 }}
            onClick={() => setTab('history')}
          >
            <History size={12} />
            {operations.length}
          </button>
        </div>

        <button
          className="vp-btn vp-btn-icon"
          style={{ width: 24, height: 24 }}
          title="Свернуть панель"
          onClick={() => setCollapsed(true)}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {tab === 'props' && (
          <>
            {selectedElements.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 12 }}>
                Выберите элемент на холсте для редактирования свойств или выделите область инструментом «Вырезать» (R).
              </div>
            ) : selectedElements.length > 1 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  Выбрано элементов: {selectedElements.length}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="vp-btn" style={{ flex: 1 }} onClick={groupSelected}>
                    <Group size={13} /> Группировать
                  </button>
                  <button
                    className="vp-btn"
                    style={{ color: '#fca5a5' }}
                    onClick={deleteSelected}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div>
                  <span className="vp-label">Выравнивание</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('left')}><AlignStartVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('center')}><AlignCenterVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('right')}><AlignEndVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('top')}><AlignStartHorizontal size={13} /></button>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('middle')}><AlignCenterHorizontal size={13} /></button>
                    <button className="vp-btn vp-btn-icon" onClick={() => alignSelected('bottom')}><AlignEndHorizontal size={13} /></button>
                  </div>
                </div>
              </div>
            ) : single ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Name & Type */}
                <div>
                  <label className="vp-label">Название ({single.type})</label>
                  <input
                    className="vp-input"
                    value={single.name}
                    onChange={(e) =>
                      updateElementProps(single.id, { name: e.target.value })
                    }
                  />
                </div>

                {/* Coordinates & Size */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="vp-label">X (px)</label>
                    <input
                      type="number"
                      className="vp-input"
                      value={Math.round(single.x)}
                      onChange={(e) =>
                        moveElements([{ id: single.id, x: Number(e.target.value), y: single.y }])
                      }
                    />
                  </div>
                  <div>
                    <label className="vp-label">Y (px)</label>
                    <input
                      type="number"
                      className="vp-input"
                      value={Math.round(single.y)}
                      onChange={(e) =>
                        moveElements([{ id: single.id, x: single.x, y: Number(e.target.value) }])
                      }
                    />
                  </div>
                  <div>
                    <label className="vp-label">Ширина</label>
                    <input
                      type="number"
                      className="vp-input"
                      value={Math.round(single.width)}
                      onChange={(e) =>
                        resizeElement(
                          single.id,
                          single.x,
                          single.y,
                          Number(e.target.value),
                          single.height
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="vp-label">Высота</label>
                    <input
                      type="number"
                      className="vp-input"
                      value={Math.round(single.height)}
                      onChange={(e) =>
                        resizeElement(
                          single.id,
                          single.x,
                          single.y,
                          single.width,
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                {/* Alignment & Z-order */}
                <div>
                  <span className="vp-label">Выравнивание и слои</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="vp-btn vp-btn-icon" title="По левому краю" onClick={() => alignSelected('left')}><AlignStartVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" title="По центру" onClick={() => alignSelected('center')}><AlignCenterVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" title="По правому краю" onClick={() => alignSelected('right')}><AlignEndVertical size={13} /></button>
                    <button className="vp-btn vp-btn-icon" title="Выше" onClick={() => reorderElement(single.id, 'up')}><ArrowUp size={13} /></button>
                    <button className="vp-btn vp-btn-icon" title="Ниже" onClick={() => reorderElement(single.id, 'down')}><ArrowDown size={13} /></button>
                  </div>
                </div>

                {/* Text & Colors for Native elements */}
                {(single.type === 'text' || single.type === 'button' || single.type === 'rect') && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(single.type === 'text' || single.type === 'button') && (
                      <div>
                        <label className="vp-label">Текст</label>
                        <input
                          className="vp-input"
                          value={single.content || ''}
                          onChange={(e) =>
                            updateElementProps(
                              single.id,
                              { content: e.target.value },
                              'EDIT_TEXT'
                            )
                          }
                        />
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label className="vp-label">Цвет</label>
                        <input
                          type="color"
                          className="vp-input"
                          style={{ padding: 2 }}
                          value={
                            single.type === 'text'
                              ? single.styles.color || '#0f172a'
                              : single.styles.fill || '#e2e8f0'
                          }
                          onChange={(e) =>
                            updateElementProps(single.id, {
                              styles:
                                single.type === 'text'
                                  ? { color: e.target.value }
                                  : { fill: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="vp-label">Размер шрифта</label>
                        <input
                          type="number"
                          className="vp-input"
                          value={single.styles.fontSize || 16}
                          onChange={(e) =>
                            updateElementProps(single.id, {
                              styles: { fontSize: Number(e.target.value) },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Background Restore Mode for RasterElement */}
                {single.type === 'raster' && single.sourceCrop && (
                  <div>
                    <label className="vp-label">Восстановление фона под объектом</label>
                    <select
                      className="vp-input"
                      value={single.bgRestoreMode || 'sample'}
                      onChange={(e) =>
                        updateBgRestore(single.id, e.target.value as BgRestoreMode)
                      }
                    >
                      <option value="sample">Адаптивное восстановление</option>
                      <option value="solid">Заливка цветом</option>
                      <option value="ai">Локальный AI-inpainting</option>
                    </select>
                    {single.bgRestoreMode === 'solid' && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="color"
                          value={single.bgRestoreColor || '#ffffff'}
                          onChange={(e) =>
                            updateBgRestore(single.id, 'solid', e.target.value)
                          }
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          Цвет фона
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Group / Lock / Delete */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {single.type === 'group' && (
                    <button className="vp-btn" onClick={ungroupSelected}>
                      <Ungroup size={13} /> Разгруппировать
                    </button>
                  )}
                  <button
                    className={`vp-btn ${single.locked ? 'vp-btn-active' : ''}`}
                    onClick={() => toggleLock(single.id)}
                  >
                    <Lock size={13} /> {single.locked ? 'Разблок.' : 'Блок.'}
                  </button>
                  <button
                    className="vp-btn"
                    style={{ color: '#fca5a5' }}
                    onClick={deleteSelected}
                  >
                    <Trash2 size={13} /> Удалить
                  </button>
                </div>

                {/* Quick comment */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <label className="vp-label">Комментарий к элементу</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="vp-input"
                      placeholder="Напр.: Уменьшить отступ..."
                      value={quickComment}
                      onChange={(e) => setQuickComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && quickComment.trim()) {
                          addComment(
                            single.id,
                            single.x + single.width,
                            single.y,
                            quickComment
                          );
                          setQuickComment('');
                        }
                      }}
                    />
                    <button
                      className="vp-btn vp-btn-primary"
                      onClick={() => {
                        if (quickComment.trim()) {
                          addComment(
                            single.id,
                            single.x + single.width,
                            single.y,
                            quickComment
                          );
                          setQuickComment('');
                        }
                      }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}

        {tab === 'comments' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {comments.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Нет комментариев. Выберите инструмент «Комментарий» (C) или добавьте комментарий к элементу.
              </div>
            ) : (
              comments.map((c, idx) => {
                const linked = elements.find((e) => e.id === c.elementId);
                return (
                  <div
                    key={c.id}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      background: 'var(--bg-panel-elevated)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>
                        #{idx + 1} · {linked ? linked.name : 'Холст'}
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="vp-btn vp-btn-icon"
                          style={{ width: 20, height: 20 }}
                          title="Статус"
                          onClick={() => toggleCommentStatus(c.id)}
                        >
                          <CheckCircle2
                            size={12}
                            color={c.status === 'resolved' ? '#10b981' : '#98a2b3'}
                          />
                        </button>
                        <button
                          className="vp-btn vp-btn-icon"
                          style={{ width: 20, height: 20 }}
                          title="Удалить"
                          onClick={() => deleteComment(c.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12 }}>{c.text}</div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ display: 'grid', gap: 6 }}>
            {operations.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                История операций пуста.
              </div>
            ) : (
              [...operations].reverse().map((op) => (
                <div
                  key={op.id}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-panel-elevated)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#c7d2fe' }}>
                    {op.type} · {op.elementName || op.elementId}
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(op.timestamp).toLocaleTimeString('ru-RU')}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
