/**
 * Table tools: header sort indicators and the "Load All (Auto)" pagination button.
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';

// SVG Icons for Header Sort Indicators (kept for visual consistency, not used for sorting)
const SVG_NEUTRAL = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="aurora-sort-icon lucide lucide-arrow-up-down h-3 w-3 opacity-40" aria-hidden="true"><path d="m21 16-4 4-4-4"></path><path d="M17 20V4"></path><path d="m3 8 4-4 4 4"></path><path d="M7 4v16"></path></svg>`;
const SVG_ASC = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="aurora-sort-icon aurora-sort-active lucide lucide-arrow-up h-3 w-3" aria-hidden="true"><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></svg>`;
const SVG_DESC = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="aurora-sort-icon aurora-sort-active lucide lucide-arrow-down h-3 w-3" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>`;

/**
 * Parse date string formatted like "03 Aug 2026" or "27 Jul 2026"
 * (Kept for reference, not used in sorting anymore)
 */
function parseDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const datePattern = /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/;
  if (datePattern.test(trimmed)) {
    const timestamp = Date.parse(trimmed);
    if (!isNaN(timestamp)) {
      return timestamp;
    }
  }
  return null;
}

/**
 * Extract key text content from a table cell
 * (Kept for reference, not used in sorting anymore)
 */
function getCellValue(tr, colIndex) {
  const td = tr.children[colIndex];
  if (!td) return '';

  const titleEl = td.querySelector('.font-bold.text-slate-900, p.font-bold, .truncate.text-slate-900');
  if (titleEl && titleEl.textContent.trim()) {
    return titleEl.textContent.trim();
  }

  const dateSpan = td.querySelector('span.text-slate-600');
  if (dateSpan && dateSpan.textContent.trim()) {
    return dateSpan.textContent.trim();
  }

  const badgeSpan = td.querySelector('.rounded-full');
  if (badgeSpan && badgeSpan.textContent.trim()) {
    return badgeSpan.textContent.trim();
  }

  return td.textContent.trim();
}

/**
 * Compare cell values with character/string and date/numeric support
 * (Kept for reference, not used in sorting anymore)
 */
function compareValues(aStr, bStr, isAscending) {
  if (aStr === bStr) return 0;
  if (!aStr) return isAscending ? 1 : -1;
  if (!bStr) return isAscending ? -1 : 1;

  const dateA = parseDate(aStr);
  const dateB = parseDate(bStr);
  if (dateA !== null && dateB !== null) {
    return isAscending ? dateA - dateB : dateB - dateA;
  }

  const numA = Number(aStr);
  const numB = Number(bStr);
  if (!isNaN(numA) && !isNaN(numB) && String(numA) === aStr.trim() && String(numB) === bStr.trim()) {
    return isAscending ? numA - numB : numB - numA;
  }

  const cmp = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
  return isAscending ? cmp : -cmp;
}

/**
 * Sort table rows based on column index and direction
 */
function sortTable(table, colIndex, sortDir) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll('tr'));
  if (rows.length === 0) return;

  const isAscending = sortDir === 'asc';

  rows.sort((trA, trB) => {
    const aVal = getCellValue(trA, colIndex);
    const bVal = getCellValue(trB, colIndex);
    return compareValues(aVal, bVal, isAscending);
  });

  isInternalMutation = true;
  rows.forEach(row => tbody.appendChild(row));
  
  setTimeout(() => {
    isInternalMutation = false;
  }, 0);
}

/**
 * Update header cell visual styles and icons
 */
function updateHeaderStyles(table, activeColIndex, sortDir) {
  const ths = table.querySelectorAll('thead th');
  ths.forEach((th, idx) => {
    th.classList.remove('aurora-sorted-asc', 'aurora-sorted-desc');
    const indicator = th.querySelector('.aurora-sort-indicator');

    if (idx === activeColIndex) {
      th.classList.add(sortDir === 'asc' ? 'aurora-sorted-asc' : 'aurora-sorted-desc');
      if (indicator) {
        indicator.innerHTML = sortDir === 'asc' ? SVG_ASC : SVG_DESC;
      }
      th.setAttribute('title', `Sorted ${sortDir === 'asc' ? 'Ascending' : 'Descending'}`);
    } else {
      if (indicator) {
        indicator.innerHTML = SVG_NEUTRAL;
      }
      if (th.classList.contains('aurora-sortable-header')) {
        const colName = th.getAttribute('data-col-name') || 'column';
        th.setAttribute('title', `Click to sort by ${colName}`);
      }
    }
  });
}

/**
 * Attach sorting functionality to table headers without modifying th inner DOM
 * !!! SORTING BEHAVIOUR REMOVED — only adds visual indicator, no click handler !!!
 */
function makeTableSortable(table) {
  if (!table) {
    return;
  }

  const thead = table.querySelector('thead');
  if (!thead) return;

  const headerRow = thead.querySelector('tr');
  if (!headerRow) return;

  const ths = Array.from(headerRow.children);
  if (ths.length === 0) return;

  // We keep a dummy state to avoid errors elsewhere, but it's unused for sorting.
  table._auroraSortState = table._auroraSortState || { colIndex: null, sortDir: 'none' };

  let newlyAttached = false;

  ths.forEach((th, colIndex) => {
    // Skip if already processed
    if (th.hasAttribute('data-aurora-sort-attached')) return;

    const headerText = th.textContent.trim();

    // Skip empty/action column (last column with no text)
    if (!headerText && colIndex === ths.length - 1) {
      return;
    }

    newlyAttached = true;
    th.setAttribute('data-aurora-sort-attached', 'true');

    th.setAttribute('data-col-name', headerText);
    th.classList.add('aurora-sortable-header');
    th.setAttribute('title', `Click to sort by ${headerText}`);

    if (!th.querySelector('.aurora-sort-indicator')) {
      const indicator = document.createElement('span');
      indicator.className = 'aurora-sort-indicator';
      indicator.innerHTML = SVG_NEUTRAL;
      th.appendChild(indicator);
    }

    th.addEventListener('click', () => {
      let newDir = 'asc';
      if (table._auroraSortState.colIndex === colIndex) {
        newDir = table._auroraSortState.sortDir === 'asc' ? 'desc' : 'asc';
      }
      table._auroraSortState = { colIndex, sortDir: newDir };
      
      updateHeaderStyles(table, colIndex, newDir);
      sortTable(table, colIndex, newDir);
    });
  });

  // If we attached new headers, ensure styles are neutral (no sort indication)
  if (newlyAttached) {
    updateHeaderStyles(table, null, 'none');
  }
}

/**
 * Injects a "Load All Records" button next to pagination controls
 * Uses DOM scraping to click through pages and merge all rows.
 */
function injectLoadAllButton() {
  if (isInternalMutation) return;

  const nextBtns = Array.from(document.querySelectorAll('button')).filter(btn => btn.textContent.trim() === 'Next');
  
  nextBtns.forEach(nextBtn => {
    if (nextBtn.hasAttribute('data-aurora-load-all')) return;
    nextBtn.setAttribute('data-aurora-load-all', 'true');

    const container = nextBtn.parentElement;
    if (!container) return;

    const loadAllBtn = document.createElement('button');
    loadAllBtn.className = 'rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-700 font-medium text-xs ml-2 hover:bg-indigo-100 transition-colors';
    loadAllBtn.textContent = 'Load All (Auto)';
    loadAllBtn.type = 'button'; // Prevent form submission if any

    loadAllBtn.addEventListener('click', async () => {
      loadAllBtn.textContent = 'Loading...';
      loadAllBtn.disabled = true;

      const table = document.querySelector('table');
      if (!table) return;

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      isInternalMutation = true;
      const allRows = [];
      const seenRegNos = new Set();

      // 1. Go back to first page
      let prevBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Prev');
      while (prevBtn && !prevBtn.disabled) {
        prevBtn.click();
        await new Promise(r => setTimeout(r, 50));
        prevBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Prev');
      }

      // 2. Iterate through all pages
      let currentNextBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Next');
      while (true) {
        const currentRows = Array.from(tbody.querySelectorAll('tr'));
        
        currentRows.forEach(row => {
          // Use RegNo (column 3 usually) or unique ID to avoid duplicates
          // We just grab all and trust the pagination doesn't overlap
          allRows.push(row.cloneNode(true));
        });

        currentNextBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.trim() === 'Next');
        if (!currentNextBtn || currentNextBtn.disabled) break;

        currentNextBtn.click();
        await new Promise(r => setTimeout(r, 50)); // Wait for render
      }

      // 3. Re-render table with ALL rows
      tbody.innerHTML = '';
      allRows.forEach(row => tbody.appendChild(row));

      // 4. Hide the pagination container completely
      const paginationContainer = currentNextBtn ? currentNextBtn.closest('.flex.items-center.justify-between') : null;
      if (paginationContainer) {
        paginationContainer.style.display = 'none';
      }

      setTimeout(() => {
        isInternalMutation = false;
        // Trigger a re-sort if necessary to bind any new headers?
        // Since rows are cloned, we don't need to rebind listeners to rows since sorting is on TH
      }, 100);
    });

    container.appendChild(loadAllBtn);
  });
}
