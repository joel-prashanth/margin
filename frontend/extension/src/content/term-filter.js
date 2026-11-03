/**
 * Term filter: hides Term 1 rows/options on the portal and adds a Term 1 toggle.
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';


let portalShowTerm1 = sessionStorage.getItem('aurora_portal_show_term1') === 'true';

const KNOWN_TERM1_UUIDS = [
  "457f6c9c-f721-4fe0-bb86-9fb11b14fd83",
  "41c4e12b-62be-4753-aa86-bcdcbcb64c2e",
  "4cad5e3f-0203-4a66-a00a-608dc9334f1b",
];

const KNOWN_TERM2_UUIDS = [
  "c2d9f82a-7d8f-4ae9-a394-5e621f246262",
  "b8c722e8-2762-477c-aeaa-3b54a9ef361a",
  "e952dcaa-5353-4165-b07e-7700c232991e",
];

function isTerm1Text(text) {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return /\bterm\s*[-_]?\s*1\b/i.test(s) || s.includes("term1") || s.includes("term-1") || s.includes("sophomore-term1");
}

function isTerm2Text(text) {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return /\bterm\s*[-_]?\s*2\b/i.test(s) || s.includes("term2") || s.includes("term-2") || s.includes("sophomore-term2");
}

function isTerm1Option(opt) {
  if (!opt) return false;
  if (KNOWN_TERM1_UUIDS.includes(opt.value)) return true;
  return isTerm1Text(opt.textContent);
}

function isTerm2Option(opt) {
  if (!opt) return false;
  if (KNOWN_TERM2_UUIDS.includes(opt.value)) return true;
  return isTerm2Text(opt.textContent);
}

function isTerm1Item(item) {
  if (!item) return false;
  const termId = item.termId || item.term?.id || item.academicTermId || "";
  if (termId && KNOWN_TERM1_UUIDS.includes(termId)) return true;
  const termName = item.termName || item.term?.name || item.academicTerm?.name || "";
  if (isTerm1Text(termName)) return true;
  const title = item.title || "";
  const desc = item.description || "";
  if ((isTerm1Text(title) || isTerm1Text(desc)) && !isTerm2Text(title) && !isTerm2Text(desc)) {
    return true;
  }
  return false;
}

function parseDatesFromText(text) {
  if (!text) return [];
  const dates = [];
  const regex = /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const cleanMonth = match[2].replace(/^Sept$/i, 'Sep');
    const parsed = Date.parse(`${match[1]} ${cleanMonth} ${match[3]}`);
    if (!isNaN(parsed)) {
      dates.push(new Date(parsed));
    }
  }
  const isoRegex = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((match = isoRegex.exec(text)) !== null) {
    const parsed = Date.parse(match[0]);
    if (!isNaN(parsed)) {
      dates.push(new Date(parsed));
    }
  }
  return dates;
}

function isTerm1PortalElement(el) {
  if (!el) return false;
  const text = (el.textContent || '').trim();
  if (!text) return false;
  const textLower = text.toLowerCase();

  // 1. Explicit Term 2 string => NOT Term 1
  if (isTerm2Text(textLower)) {
    return false;
  }

  // 2. Explicit Term 1 strings
  if (isTerm1Text(textLower)) {
    return true;
  }

  // 3. Known Term 1 subjects (Advanced Database Management Systems / ADMS / DBMS)
  if (
    textLower.includes('advanced database management') ||
    textLower.includes('database management systems') ||
    textLower.includes('adms')
  ) {
    return true;
  }

  // 4. Date check: Academic Year 2026-2027
  // Term 1 dates: Jun 2026 through Oct 2026 (before Nov 1, 2026)
  // Term 2 dates: Nov 2026 onwards (Nov 2026 - May 2027)
  const dates = parseDatesFromText(text);
  if (dates.length > 0) {
    const cutoffDate = new Date('2026-11-01T00:00:00');
    const anyIn2026Term1 = dates.some(d => {
      const m = d.getMonth(); // 5 = June, 6 = July, 7 = Aug, 8 = Sep, 9 = Oct
      return d.getFullYear() === 2026 && m >= 5 && m <= 9;
    });
    const allBeforeCutoff = dates.every(d => d.getTime() < cutoffDate.getTime());

    if (anyIn2026Term1 && allBeforeCutoff) {
      return true;
    }
  }

  return false;
}

let isManagingTerm = false;

function triggerReactSelectChange(selectEl, value) {
  if (!selectEl) return;
  try {
    const tracker = selectEl._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(selectEl, value);
    } else {
      selectEl.value = value;
    }
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) {
    console.warn('Aurora: error triggering React select change', e);
  }
}

function managePortalTermFilters() {
  if (isManagingTerm) return;

  // 1. Find all Term <select> elements across the page (desktop header and mobile modals)
  const selects = Array.from(document.querySelectorAll('select'));
  const termSelects = selects.filter(sel => {
    const allOptions = Array.from(sel.options).concat(sel._auroraTerm1Options || []);
    return allOptions.some(o => 
      o.textContent.includes('Term') || 
      KNOWN_TERM1_UUIDS.includes(o.value) || 
      KNOWN_TERM2_UUIDS.includes(o.value)
    );
  });

  termSelects.forEach(termSelect => {
    if (!termSelect._auroraTerm1Options) {
      termSelect._auroraTerm1Options = [];
    }

    // Track user interactions so we never override manual user selections
    if (!termSelect.dataset.auroraChangeBound) {
      termSelect.dataset.auroraChangeBound = 'true';
      termSelect.addEventListener('change', () => {
        termSelect.dataset.auroraUserInteracted = 'true';
      });
    }

    // Collect any Term 1 options currently in DOM
    const currentOptions = Array.from(termSelect.options);
    const term1OptionsInDOM = currentOptions.filter(isTerm1Option);
    term1OptionsInDOM.forEach(opt => {
      if (!termSelect._auroraTerm1Options.some(o => o.value === opt.value)) {
        termSelect._auroraTerm1Options.push(opt);
      }
    });

    if (!portalShowTerm1) {
      // Physically remove Term 1 options from DOM so Chromium native popup index mapping is NOT corrupted
      term1OptionsInDOM.forEach(opt => {
        opt.removeAttribute('hidden');
        opt.style.display = '';
        opt.remove();
      });

      // Ensure remaining options in DOM are completely clean and visible
      Array.from(termSelect.options).forEach(opt => {
        opt.removeAttribute('hidden');
        opt.style.display = '';
      });

      // If the select currently has a Term 1 value, auto-switch to the first Term 2 option
      const isCurrentTerm1 = KNOWN_TERM1_UUIDS.includes(termSelect.value) ||
                             termSelect._auroraTerm1Options.some(o => o.value === termSelect.value);

      if (isCurrentTerm1) {
        const remainingOptions = Array.from(termSelect.options);
        const term2 = remainingOptions.find(isTerm2Option);
        if (term2) {
          isManagingTerm = true;
          try {
            triggerReactSelectChange(termSelect, term2.value);
          } finally {
            setTimeout(() => { isManagingTerm = false; }, 50);
          }
        }
      }
    } else {
      // SHOW Term 1 options: restore them into the DOM
      if (termSelect._auroraTerm1Options.length > 0) {
        termSelect._auroraTerm1Options.forEach(opt => {
          opt.removeAttribute('hidden');
          opt.style.display = '';
          if (!termSelect.contains(opt)) {
            if (termSelect.options.length > 0 && termSelect.options[0].value === '') {
              termSelect.insertBefore(opt, termSelect.options[1] || null);
            } else {
              termSelect.appendChild(opt);
            }
          }
        });
      }
    }

    // Position the Aurora Term Toggle button directly below "MY details" (Profile area)
    const profileBtn = document.querySelector(
      'button[aria-label="Profile menu"], [aria-label*="avatar"]'
    )?.closest('button') || document.querySelector('.relative button[aria-expanded]');

    const profileWrapper = profileBtn?.closest('.relative') || profileBtn?.parentElement;
    const targetContainer = profileWrapper || termSelect.closest('.relative') || termSelect.parentElement;

    if (targetContainer) {
      if (!targetContainer.style.position || targetContainer.style.position === 'static') {
        targetContainer.style.position = 'relative';
      }

      let toggleBtn = document.getElementById('aurora-term-toggle-btn');
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'aurora-term-toggle-btn';
        toggleBtn.type = 'button';
        targetContainer.appendChild(toggleBtn);
      } else if (toggleBtn.parentElement !== targetContainer) {
        targetContainer.appendChild(toggleBtn);
      }

      toggleBtn.className = `aurora-term-toggle-btn flex items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-[11px] font-semibold border transition-all cursor-pointer ${
        portalShowTerm1
          ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
          : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
      }`;
      
      toggleBtn.style.position = 'absolute';
      toggleBtn.style.top = 'calc(100% + 4px)';
      toggleBtn.style.right = '0';
      toggleBtn.style.zIndex = '30';
      toggleBtn.style.whiteSpace = 'nowrap';
      toggleBtn.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';

      // If the profile dropdown is open, hide toggle to prevent overlap
      if (profileBtn?.getAttribute('aria-expanded') === 'true') {
        toggleBtn.style.display = 'none';
      } else {
        toggleBtn.style.display = 'flex';
      }

      toggleBtn.innerHTML = `
        <span class="inline-block h-2 w-2 rounded-full ${portalShowTerm1 ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
        <span>${portalShowTerm1 ? 'Term 1 Included' : 'Term 2 Only (Active)'}</span>
        <span class="text-[10px] opacity-75 font-normal">(${portalShowTerm1 ? 'Hide Term 1' : 'Check Term 1'})</span>
      `;
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        portalShowTerm1 = !portalShowTerm1;
        sessionStorage.setItem('aurora_portal_show_term1', portalShowTerm1 ? 'true' : 'false');
        managePortalTermFilters();
      };
    }
  });

  // 2. Filter Table Rows / Cards on /modules/academics/assessments
  if (window.location.pathname.includes('assessments') || window.location.pathname.includes('academics')) {
    // Ensure CSS rule exists to avoid any visual flash
    if (!document.getElementById('aurora-term-filter-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'aurora-term-filter-style';
      styleEl.textContent = `
        tr[data-aurora-term1-hidden="true"],
        [data-aurora-term1-hidden="true"] {
          display: none !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
    }

    const rows = document.querySelectorAll('table tbody tr');
    let hiddenCount = 0;
    let totalAssessmentRows = 0;

    rows.forEach(tr => {
      if (tr.id === 'aurora-empty-term-row') return;
      totalAssessmentRows++;

      if (isTerm1PortalElement(tr)) {
        if (!portalShowTerm1) {
          tr.style.display = 'none';
          tr.setAttribute('data-aurora-term1-hidden', 'true');
          hiddenCount++;
        } else {
          tr.style.display = '';
          tr.removeAttribute('data-aurora-term1-hidden');
        }
      } else {
        tr.style.display = '';
        tr.removeAttribute('data-aurora-term1-hidden');
      }
    });

    // Also cards or grid items
    const cards = document.querySelectorAll('[class*="card"], [class*="assessment-item"]');
    cards.forEach(card => {
      if (card.id?.startsWith('dg') || card.classList.contains('aurora-draft-gradebook-wrapper')) return;
      if (isTerm1PortalElement(card)) {
        if (!portalShowTerm1) {
          card.style.display = 'none';
          card.setAttribute('data-aurora-term1-hidden', 'true');
        } else {
          card.style.display = '';
          card.removeAttribute('data-aurora-term1-hidden');
        }
      }
    });

    // If all rows on current page are Term 1 and hidden, provide informative notice
    const tbody = document.querySelector('table tbody');
    if (tbody) {
      let emptyRow = document.getElementById('aurora-empty-term-row');
      if (totalAssessmentRows > 0 && hiddenCount === totalAssessmentRows && !portalShowTerm1) {
        if (!emptyRow) {
          emptyRow = document.createElement('tr');
          emptyRow.id = 'aurora-empty-term-row';
          tbody.appendChild(emptyRow);
        }
        emptyRow.style.display = '';
        emptyRow.innerHTML = `
          <td colspan="9" style="text-align: center; padding: 36px 16px; color: #64748b; font-size: 13px;">
            <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
              <div style="font-weight: 600; color: #334155; font-size: 14px;">All ${totalAssessmentRows} assessments on this page are from Term 1 (Hidden)</div>
              <div style="font-size: 12px; color: #64748b;">Showing Term 2 only. Click the toggle badge above <b>(Check Term 1)</b> to view Term 1 details.</div>
            </div>
          </td>
        `;
      } else if (emptyRow) {
        emptyRow.style.display = 'none';
      }
    }
  }
}
