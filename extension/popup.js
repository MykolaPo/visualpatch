const btn = document.getElementById('captureBtn');
const statusEl = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Захват страницы и DOM...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Активная вкладка не найдена');

    const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    const [{ result: domData }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    const projectId = `proj_${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const dpr = domData.dpr || 1;

    const elements = (domData.elements || []).map((item, idx) => ({
      id: `dom_${idx + 1}`,
      projectId,
      parentId: null,
      type: item.tag === 'img' ? 'image' : item.tag === 'button' ? 'button' : 'container',
      name: item.text ? `${item.tag}: ${item.text.slice(0, 28)}` : `${item.tag} #${idx + 1}`,
      x: Math.round(item.x * dpr),
      y: Math.round(item.y * dpr),
      width: Math.round(item.width * dpr),
      height: Math.round(item.height * dpr),
      rotation: 0,
      zIndex: idx + 1,
      visible: true,
      locked: false,
      styles: { opacity: 1, stroke: '#6366f1', strokeWidth: 1 },
      domMetadata: item.domMetadata,
    }));

    const snapshot = {
      project: {
        id: projectId,
        name: domData.title || 'Captured Page',
        sourceUrl: domData.url || tab.url || '',
        sourceImage: screenshotUrl,
        canvasWidth: Math.round(domData.viewportWidth * dpr),
        canvasHeight: Math.round(domData.viewportHeight * dpr),
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
      },
      elements,
      operations: [],
      comments: [],
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visualpatch-${projectId}.json`;
    a.click();
    URL.revokeObjectURL(url);

    statusEl.textContent = `Готово: захвачено ${elements.length} DOM-элементов. Импортируйте файл в VisualPatch.`;
  } catch (err) {
    statusEl.textContent = `Ошибка: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});
