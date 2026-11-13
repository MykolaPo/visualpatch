(() => {
  function buildCssSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 4) {
      let part = cur.tagName.toLowerCase();
      if (cur.classList && cur.classList.length > 0) {
        const cls = Array.from(cur.classList).slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
        part += cls;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function collectFromRoot(root, offsetX, offsetY, inShadow, inIframe, results) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const tag = node.tagName.toLowerCase();
      const isCandidate =
        ['button', 'a', 'input', 'textarea', 'select', 'img', 'h1', 'h2', 'h3', 'nav', 'header', 'form'].includes(tag) ||
        node.getAttribute('role') === 'button' ||
        (node.className && typeof node.className === 'string' && /card|btn|search|pill|badge/i.test(node.className));

      if (isCandidate) {
        const rect = node.getBoundingClientRect();
        if (rect.width >= 16 && rect.height >= 12 && rect.bottom > 0 && rect.right > 0) {
          const style = window.getComputedStyle(node);
          if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
            results.push({
              tag,
              text: (node.innerText || node.getAttribute('placeholder') || node.getAttribute('aria-label') || '').trim().slice(0, 80),
              x: Math.round(rect.left + offsetX),
              y: Math.round(rect.top + offsetY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              domMetadata: {
                selector: buildCssSelector(node),
                tag,
                inShadowDom: String(inShadow),
                inIframe: String(inIframe),
                backgroundColor: style.backgroundColor,
                color: style.color,
                fontSize: style.fontSize,
              },
            });
          }
        }
      }

      if (node.shadowRoot) {
        collectFromRoot(node.shadowRoot, offsetX, offsetY, true, inIframe, results);
      }

      if (tag === 'iframe') {
        try {
          const frameRect = node.getBoundingClientRect();
          const doc = node.contentDocument;
          if (doc && doc.body) {
            collectFromRoot(doc.body, offsetX + frameRect.left, offsetY + frameRect.top, inShadow, true, results);
          }
        } catch {
          // Cross-origin iframe: access restricted by browser security policy
        }
      }

      node = walker.nextNode();
    }
  }

  const elements = [];
  if (document.body) {
    collectFromRoot(document.body, 0, 0, false, false, elements);
  }

  return {
    title: document.title,
    url: location.href,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
    elements: elements.slice(0, 120),
  };
})();
