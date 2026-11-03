/**
 * Entry point: runs every feature on load, on an interval, and on SPA DOM mutations.
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';

/**
 * Scan and process all tables on the page
 */
function scanAndAttachTables() {
  if (isInternalMutation) return;

  const tables = document.querySelectorAll('table');
  tables.forEach(table => {
    makeTableSortable(table);
  });
  
  injectLoadAllButton();
}

function initAll() {
  scanAndAttachTables();
  injectDraftGradebookNavItem();
  managePortalTermFilters();
}

// Initial scan on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}

// Recurring check every 800ms to guarantee persistent presence across Next.js SPA transitions
setInterval(() => {
  injectDraftGradebookNavItem();
  managePortalTermFilters();
}, 800);

// MutationObserver for dynamic SPA updates
let scanTimeout = null;
const observer = new MutationObserver((mutations) => {
  if (isInternalMutation) return;

  // Instant synchronous hiding to prevent visual flash
  if (!portalShowTerm1 && (window.location.pathname.includes('assessments') || window.location.pathname.includes('academics'))) {
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        for (let j = 0; j < m.addedNodes.length; j++) {
          const node = m.addedNodes[j];
          if (node.nodeType === 1) {
            if (node.nodeName === 'TR' && node.id !== 'aurora-empty-term-row') {
              if (isTerm1PortalElement(node)) {
                node.style.display = 'none';
                node.setAttribute('data-aurora-term1-hidden', 'true');
              }
            } else if (node.querySelectorAll) {
              const trs = node.querySelectorAll('tr');
              for (let k = 0; k < trs.length; k++) {
                const tr = trs[k];
                if (tr.id !== 'aurora-empty-term-row' && isTerm1PortalElement(tr)) {
                  tr.style.display = 'none';
                  tr.setAttribute('data-aurora-term1-hidden', 'true');
                }
              }
            }
          }
        }
      }
    }
  }

  const shouldScan = mutations.some(m => {
    if (m.type === 'childList' && m.addedNodes.length > 0) {
      for (let i = 0; i < m.addedNodes.length; i++) {
        const node = m.addedNodes[i];
        if (node.nodeType === 1) {
          if (
            node.nodeName === 'TABLE' ||
            node.nodeName === 'ASIDE' ||
            node.nodeName === 'NAV' ||
            node.nodeName === 'TBODY' ||
            node.nodeName === 'THEAD' ||
            node.nodeName === 'TR' ||
            node.querySelector?.('table, aside, nav, tbody, thead, tr, a[href*="gradebook"], a[href*="academics"], a[href*="faculty"]')
          ) {
            return true;
          }
        }
      }
    }
    return false;
  });

  if (!shouldScan) return;

  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(initAll, 150);
});

observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});
