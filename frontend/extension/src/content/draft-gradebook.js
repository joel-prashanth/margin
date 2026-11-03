/**
 * Draft Gradebook: sidebar nav item plus a full gradebook view built from ERP data.
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';

/**
 * Global state for active view
 */
let isDraftGradebookActive = false;

/**
 * Injects the "Draft Gradebook" navigation item into all sidebars (desktop <aside> and mobile <nav>)
 */
function injectDraftGradebookNavItem() {
  if (isInternalMutation) return;

  // Find all Gradebook links across <aside> and <nav> (supports both new /modules/academics/gradebook and legacy routes)
  let gradebookLinks = Array.from(document.querySelectorAll(
    'aside a[href*="gradebook"]:not(.aurora-draft-gradebook-btn), nav a[href*="gradebook"]:not(.aurora-draft-gradebook-btn), a[href*="/modules/academics/gradebook"]:not(.aurora-draft-gradebook-btn), a[href*="/faculty/gradebook"]:not(.aurora-draft-gradebook-btn)'
  ));

  // Fallback if gradebook link is not yet present in DOM: attach under assessments or classes
  if (gradebookLinks.length === 0) {
    gradebookLinks = Array.from(document.querySelectorAll(
      'aside a[href*="assessments"]:not(.aurora-draft-gradebook-btn), nav a[href*="assessments"]:not(.aurora-draft-gradebook-btn)'
    ));
  }

  if (gradebookLinks.length > 0) {
    gradebookLinks.forEach((gradebookLink) => {
      const gradebookWrapper = gradebookLink.closest('div[style*="opacity"]') || 
        (gradebookLink.parentElement?.tagName === 'DIV' ? gradebookLink.parentElement : gradebookLink);
      if (!gradebookWrapper || !gradebookWrapper.parentElement) return;

      // Ensure we don't inject duplicates in the same navigation container
      if (gradebookWrapper.parentElement.querySelector('.aurora-draft-gradebook-wrapper')) {
        return;
      }
      if (gradebookWrapper.nextElementSibling?.classList.contains('aurora-draft-gradebook-wrapper')) {
        return;
      }

      const navItem = document.createElement('div');
      navItem.className = 'aurora-draft-gradebook-wrapper';
      navItem.style.opacity = '1';
      navItem.style.transform = 'none';

      // Detect whether the site is using the new compact sidebar or legacy design
      const isNewDesign = gradebookLink.classList.contains('flex') || gradebookLink.querySelector('span');
      const siblingSpan = gradebookLink.querySelector('span:last-child');
      const spanClasses = siblingSpan?.className || 'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out max-w-0 opacity-0';

      if (isNewDesign) {
        navItem.innerHTML = `
          <a href="#draft-gradebook" class="aurora-draft-gradebook-btn flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
            isDraftGradebookActive
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }" title="Draft Gradebook">
            <span class="shrink-0 flex h-4.5 w-4.5 items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-award" aria-hidden="true">
                <circle cx="12" cy="8" r="6"></circle>
                <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path>
              </svg>
            </span>
            <span class="${spanClasses}">
              Draft Gradebook <span class="ml-1 rounded px-1.5 py-0.5 text-[8.5px] font-bold ${isDraftGradebookActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}">LIVE</span>
            </span>
          </a>
        `;
      } else {
        navItem.innerHTML = `
          <a href="#draft-gradebook" class="aurora-draft-gradebook-btn" style="text-decoration:none; display:block;" title="Draft Gradebook">
            <div class="draft-nav-inner group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 cursor-pointer ${
              isDraftGradebookActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
            }">
              <span class="draft-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150 ${
                isDraftGradebookActive
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-50 text-indigo-600 group-hover:scale-110'
              }">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-award h-4 w-4" aria-hidden="true">
                  <circle cx="12" cy="8" r="6"></circle>
                  <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path>
                </svg>
              </span>
              <span class="flex-1 truncate leading-none">Draft Gradebook</span>
              <span class="draft-nav-badge rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                isDraftGradebookActive
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-100 text-indigo-700'
              }">LIVE</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right h-3.5 w-3.5 shrink-0 transition-all duration-150 group-hover:translate-x-0.5 ${
                isDraftGradebookActive ? 'text-white/70' : 'text-slate-300 group-hover:text-blue-400'
              }" aria-hidden="true">
                <path d="m9 18 6-6-6-6"></path>
              </svg>
            </div>
          </a>
        `;
      }

      const btn = navItem.querySelector('.aurora-draft-gradebook-btn');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openDraftGradebookView();
      });

      gradebookWrapper.insertAdjacentElement('afterend', navItem);
    });
  }

  // Also inject quick-access switch button when viewing native Gradebook page
  if (window.location.pathname.includes('gradebook') && !document.getElementById('aurora-native-gb-draft-btn')) {
    const headerTitleContainer = document.querySelector('h1')?.closest('.flex.flex-wrap.items-center.justify-between') ||
      document.querySelector('h1')?.parentElement;
    if (headerTitleContainer && !headerTitleContainer.querySelector('#aurora-native-gb-draft-btn')) {
      const quickBtn = document.createElement('button');
      quickBtn.id = 'aurora-native-gb-draft-btn';
      quickBtn.type = 'button';
      quickBtn.className = 'flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer shrink-0';
      quickBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-award"><circle cx="12" cy="8" r="6"></circle><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"></path></svg>
        <span>View Draft Gradebook (Live)</span>
      `;
      quickBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDraftGradebookView();
      });
      headerTitleContainer.appendChild(quickBtn);
    }
  }

  // Also listen to official links to close draft view when user navigates away
  document.querySelectorAll('aside a:not(.aurora-draft-gradebook-btn), nav a:not(.aurora-draft-gradebook-btn)').forEach(link => {
    if (!link.hasAttribute('data-aurora-draft-listener')) {
      link.setAttribute('data-aurora-draft-listener', 'true');
      link.addEventListener('click', () => {
        if (isDraftGradebookActive) {
          closeDraftGradebookView();
        }
      });
    }
  });
}

/**
 * Opens and renders the Draft Gradebook View
 */
function openDraftGradebookView() {
  isDraftGradebookActive = true;

  // Update active nav styling for new and legacy buttons
  document.querySelectorAll('.aurora-draft-gradebook-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.aurora-draft-gradebook-btn');
    if (btn) {
      btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.remove('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900', 'hover:bg-blue-50', 'hover:text-blue-700');
    }

    const inner = wrapper.querySelector('.draft-nav-inner');
    const icon = wrapper.querySelector('.draft-nav-icon');
    const badge = wrapper.querySelector('.draft-nav-badge');
    if (inner) {
      inner.className = 'draft-nav-inner group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 cursor-pointer bg-blue-600 text-white shadow-sm';
    }
    if (icon) {
      icon.className = 'draft-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150 bg-white/20 text-white';
    }
    if (badge) {
      badge.className = 'draft-nav-badge rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-white/20 text-white';
    }
  });

  // De-activate other active nav items in the aside/nav
  document.querySelectorAll('aside a.bg-blue-600:not(.aurora-draft-gradebook-btn), nav a.bg-blue-600:not(.aurora-draft-gradebook-btn)').forEach(el => {
    el.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
    el.classList.add('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
  });
  document.querySelectorAll('aside a:not(.aurora-draft-gradebook-btn) > div.bg-blue-600, nav a:not(.aurora-draft-gradebook-btn) > div.bg-blue-600').forEach(el => {
    el.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
    el.classList.add('text-slate-600', 'hover:bg-blue-50', 'hover:text-blue-700');
    const iconSpan = el.querySelector('span.bg-white\\/20');
    if (iconSpan) {
      iconSpan.classList.remove('bg-white/20', 'text-white');
      iconSpan.classList.add('bg-blue-50', 'text-blue-600');
    }
  });

  // Locate main content container
  const mainEl = document.querySelector('main') || document.body;

  let container = document.getElementById('aurora-draft-gradebook-view');
  if (!container) {
    container = document.createElement('div');
    container.id = 'aurora-draft-gradebook-view';
    container.className = 'transition-all duration-300 ease-in-out';
    
    if (mainEl.tagName === 'MAIN') {
      mainEl.appendChild(container);
    } else {
      const asideEl = document.querySelector('aside');
      if (asideEl && asideEl.nextElementSibling) {
        asideEl.parentElement.insertBefore(container, asideEl.nextElementSibling);
      } else {
        document.body.appendChild(container);
      }
    }
  } else if (mainEl.tagName === 'MAIN' && container.parentElement !== mainEl) {
    mainEl.appendChild(container);
  }

  // Hide original main content children while viewing Draft Gradebook
  if (mainEl.tagName === 'MAIN') {
    Array.from(mainEl.children).forEach(child => {
      if (child.id !== 'aurora-draft-gradebook-view') {
        if (!child.hasAttribute('data-aurora-prev-display')) {
          child.setAttribute('data-aurora-prev-display', child.style.display || '');
        }
        child.style.display = 'none';
      }
    });
  } else {
    document.querySelectorAll('main, aside ~ div:not(#aurora-draft-gradebook-view)').forEach(el => {
      if (el.id !== 'aurora-draft-gradebook-view' && !el.contains(container)) {
        if (!el.hasAttribute('data-aurora-prev-display')) {
          el.setAttribute('data-aurora-prev-display', el.style.display || '');
        }
        el.style.display = 'none';
      }
    });
  }

  container.style.display = 'block';

  // Render Official-Style Gradebook UI
  container.innerHTML = `
    <div class="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-7">
      <div class="space-y-6">
      <!-- Top Title Bar -->
      <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm sm:px-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-marked h-4 w-4" aria-hidden="true"><path d="M10 2v8l3-3 3 3V2"></path><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"></path></svg>
            </span>
            <div class="min-w-0">
              <p class="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">Academic</p>
              <div class="flex items-center gap-2">
                <h1 class="truncate text-[15px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-base">Gradebook</h1>
                <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">Draft + Published Live</span>
              </div>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2 flex-wrap">
            <button id="dgRefreshBtn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all">
              <svg class="w-3.5 h-3.5 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              Refresh
            </button>
            <button id="dgExportCsvBtn" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[12px] font-bold shadow-sm transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-spreadsheet" aria-hidden="true"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M8 13h2"></path><path d="M14 13h2"></path><path d="M8 17h2"></path><path d="M14 17h2"></path></svg>
              Export CSV
            </button>
            <button id="draftGbCloseBtn" class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
              Close View
            </button>
          </div>
        </div>
      </div>

      <!-- Filter Controls Row -->
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-start">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative">
              <select id="dgClassSelect" class="appearance-none rounded-xl border border-gray-200 bg-white pl-3 pr-8 py-2 text-[13px] font-semibold text-gray-700 cursor-pointer outline-none transition-colors hover:bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                <option value="">Detecting classes...</option>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
            </div>
            <div class="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>
              <input id="dgSearchStudent" placeholder="Search student..." class="pl-8 pr-4 py-2 text-[13px] font-medium bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-52" type="text">
            </div>
            <div id="dgSyncStatus" class="text-xs text-slate-500 ml-2"></div>
          </div>
        </div>

        <!-- Official Gradebook Table Container -->
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table id="dgMainTable" class="w-full text-sm border-collapse">
              <thead id="dgTableHead">
                <tr style="background-color: rgb(248, 250, 252);">
                  <th class="sticky left-0 z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap" rowspan="2" style="background-color: rgb(248, 250, 252); width: 56px; min-width: 56px;">S.No</th>
                  <th class="sticky z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap" rowspan="2" style="background-color: rgb(248, 250, 252); left: 56px; width: 150px; min-width: 150px;">Registration No</th>
                  <th class="sticky z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap" rowspan="2" style="background-color: rgb(248, 250, 252); left: 206px; width: 200px; min-width: 200px; box-shadow: rgba(0, 0, 0, 0.1) 4px 0px 8px -4px;">Student Name</th>
                  <th colspan="1" class="text-center px-3 py-3 text-[11px] font-bold text-gray-700 border border-slate-200 bg-blue-50">Assessments</th>
                  <th rowspan="2" class="text-center px-3 py-3 text-[11px] font-bold text-gray-700 border border-slate-200 bg-blue-50 min-w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody id="dgTableBody" class="divide-y divide-gray-100">
                <tr>
                  <td colspan="5" class="text-center py-16 text-slate-400">
                    <div class="flex flex-col items-center justify-center gap-2">
                      <svg class="w-8 h-8 text-blue-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      <p class="font-semibold text-slate-700 text-xs">Loading Class &amp; Assessment Records...</p>
                      <p class="text-[11px] text-slate-400">Fetching live marks including draft-saved evaluations.</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <!-- Bottom Table Footer Bar -->
          <div class="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style="border-top: 1px solid rgb(241, 245, 249); background-color: rgb(248, 250, 252);">
            <span id="dgStudentCountFooter" class="text-[12px] font-semibold text-gray-500">Showing 0 of 0 students</span>
            <div class="flex items-center gap-4 text-[11px] font-semibold flex-wrap">
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-[4px]" style="background-color: rgb(240, 253, 244); border: 1px solid rgba(5, 150, 105, 0.19);"></div>
                <span style="color: rgb(5, 150, 105);">Published</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-[4px]" style="background-color: rgb(254, 243, 199); border: 1px solid rgba(217, 119, 6, 0.19);"></div>
                <span style="color: rgb(217, 119, 6);">Draft (Live)</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-[4px]" style="background-color: rgb(239, 246, 255); border: 1px solid rgba(37, 99, 235, 0.19);"></div>
                <span style="color: rgb(37, 99, 235);">Evaluated</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded-[4px]" style="background-color: rgb(254, 242, 242); border: 1px solid rgba(220, 38, 38, 0.19);"></div>
                <span style="color: rgb(220, 38, 38);">Not Submitted</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Official Analytics Section -->
      <div class="space-y-5">
        <h2 class="text-[17px] font-bold text-gray-900" style="letter-spacing: -0.02em;">Analytics</h2>
        
        <!-- Top 3 Analytics Cards Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Grade Distribution -->
          <div class="bg-white rounded-[22px] border border-gray-200 shadow-sm p-6">
            <h3 class="text-[15px] font-bold text-gray-900 mb-1">Grade Distribution</h3>
            <p class="text-[12px] text-gray-500 mb-5">How marks are distributed across the section</p>
            <div class="flex items-center gap-8">
              <div class="shrink-0">
                <svg width="140" height="140" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="60" fill="none" stroke="#f3f4f6" stroke-width="20"></circle>
                  <text id="dgDonutTotal" x="80" y="74" text-anchor="middle" font-size="22" font-weight="bold" fill="#111827">--</text>
                  <text x="80" y="92" text-anchor="middle" font-size="11" fill="#6b7280">students</text>
                </svg>
              </div>
              <div id="dgDistributionBreakdown" class="flex-1 space-y-2 text-xs">
                <p class="text-[13px] text-gray-400 italic">Calculating distribution...</p>
              </div>
            </div>
          </div>

          <!-- Assessment Contribution -->
          <div class="bg-white rounded-[22px] border border-gray-200 shadow-sm p-6">
            <div class="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chart-pie text-indigo-500"><path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"></path><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path></svg>
              <h3 class="text-[15px] font-bold text-gray-900">Assessment Contribution</h3>
            </div>
            <p class="text-[12px] text-gray-500 mb-5">Weightage breakdown by category — live status</p>
            <div id="dgCategoryContribution" class="space-y-3">
              <p class="text-[13px] text-gray-400 italic">Loading assessment types...</p>
            </div>
          </div>

          <!-- Assessment Coverage -->
          <div class="bg-white rounded-[22px] border border-gray-200 shadow-sm p-6">
            <div class="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-check-big text-teal-500"><path d="M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344"></path><path d="m9 11 3 3L22 4"></path></svg>
              <h3 class="text-[15px] font-bold text-gray-900">Assessment Coverage</h3>
            </div>
            <p class="text-[12px] text-gray-500 mb-6">Status of assessments for this section</p>
            <div class="space-y-4">
              <div class="flex items-center justify-between pb-3 border-b border-gray-100">
                <span class="text-[13px] font-medium text-gray-600">Total Assessments</span>
                <span id="dgStatAssessmentsCount" class="text-[14px] font-bold text-gray-900">0</span>
              </div>
              <div class="flex items-center justify-between pb-3 border-b border-gray-100">
                <span class="text-[13px] font-medium text-gray-600">Draft Evaluations Saved</span>
                <span id="dgStatDraftCount" class="text-[14px] font-bold text-amber-600">0</span>
              </div>
              <div class="flex items-center justify-between pb-3 border-b border-gray-100">
                <span class="text-[13px] font-medium text-gray-600">Evaluated / Published</span>
                <span id="dgStatPublishedCount" class="text-[14px] font-bold text-emerald-600">0</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[13px] font-medium text-gray-600">Class Average Score</span>
                <span id="dgStatClassAverage" class="text-[14px] font-bold text-blue-600">0%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom 2 Cards Grid: Top Performers & Needs Attention -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <!-- Top Performers -->
          <div class="bg-white rounded-[22px] border border-gray-200 shadow-sm p-6">
            <div class="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trophy text-amber-500"><path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"></path><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"></path><path d="M18 9h1.5a1 1 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"></path><path d="M6 9H4.5a1 1 0 0 1 0-5H6"></path></svg>
              <h3 class="text-[15px] font-bold text-gray-900">Top Performers</h3>
            </div>
            <p class="text-[12px] text-gray-500 mb-4">Highest scoring students this term (Live)</p>
            <div id="dgTopPerformersList" class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              <p class="text-[13px] text-gray-400 italic">No evaluated data yet.</p>
            </div>
          </div>

          <!-- Needs Attention -->
          <div class="bg-white rounded-[22px] border border-gray-200 shadow-sm p-6">
            <div class="flex items-center gap-2 mb-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert text-rose-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
              <h3 class="text-[15px] font-bold text-gray-900">Needs Attention</h3>
            </div>
            <p class="text-[12px] text-gray-500 mb-4">Students at risk of failing or scoring low</p>
            <div id="dgNeedsAttentionList" class="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              <p class="text-[13px] text-gray-400 italic">No students at risk.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('draftGbCloseBtn')?.addEventListener('click', closeDraftGradebookView);
  document.getElementById('dgRefreshBtn')?.addEventListener('click', () => {
    loadGradebookData(true);
  });
  document.getElementById('dgClassSelect')?.addEventListener('change', (e) => {
    onClassSelected(e.target.value);
  });
  document.getElementById('dgSearchStudent')?.addEventListener('input', (e) => {
    filterGradebookRows(e.target.value);
  });
  document.getElementById('dgExportCsvBtn')?.addEventListener('click', exportGradebookToCSV);

  // Initial load
  loadGradebookData();
}

// State
let gbClasses = []; // List of unique classes
let gbSelectedClass = null;
let gbCurrentAssessments = [];
let gbCurrentStudents = [];
let gbFilteredStudents = [];

function normalizeCode(str) {
  return String(str || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function cleanSectionLabel(code) {
  if (!code) return "";
  let s = String(code).trim();
  s = s.replace(/\b\d{4}[-_]\d{4}\b/g, "").replace(/\b\d{4}\s*-\s*\d{4}\b/g, "").trim();
  s = s.replace(/B\.\s*TECH/gi, "BTECH");
  s = s.replace(/[-_]{2,}/g, "-").replace(/^[-_\s]+|[-_\s]+$/g, "");
  return s || String(code).trim();
}

function getCachedStudentName(regNo) {
  if (!regNo) return null;
  try {
    const cached = localStorage.getItem(`aurora_student_name_${regNo}`);
    if (cached && !cached.toLowerCase().startsWith('student (')) return cached;
  } catch (e) {}
  return null;
}

function setCachedStudentName(regNo, name) {
  if (!regNo || !name) return;
  const trimmed = String(name).trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('student (') || trimmed.toUpperCase() === 'UNKNOWN') return;
  try {
    localStorage.setItem(`aurora_student_name_${regNo}`, trimmed);
  } catch (e) {}
}

function extractStudentName(stu) {
  if (!stu) return "";
  const s = stu.student || stu.user || stu;
  
  let name = 
    s.name ||
    s.studentName ||
    s.fullName ||
    s.displayName ||
    stu.studentName ||
    stu.fullName ||
    stu.name ||
    stu.displayName ||
    s.user?.name ||
    s.user?.fullName ||
    stu.user?.name ||
    stu.user?.fullName;

  if (!name) {
    const parts = [
      s.firstName || stu.firstName,
      s.middleName || stu.middleName,
      s.lastName || stu.lastName
    ].filter(Boolean).map(v => String(v).trim());
    if (parts.length > 0) {
      name = parts.join(" ");
    }
  }

  if (name && typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed && trimmed.toUpperCase() !== "UNKNOWN" && !trimmed.toLowerCase().startsWith("student (")) {
      return trimmed;
    }
  }
  return "";
}

function extractStudentRegNo(stu) {
  if (!stu) return "";
  const s = stu.student || stu.user || stu;
  const reg = 
    stu.registrationNo ||
    stu.rollNo ||
    stu.studentRegistrationNo ||
    stu.admissionNo ||
    s.registrationNo ||
    s.rollNo ||
    s.studentRegistrationNo ||
    s.admissionNo ||
    stu.studentId ||
    stu.id;
  return reg ? String(reg).trim().toUpperCase() : "";
}

/**
 * Fast in-memory / sessionStorage cache
 */
const GB_CACHE_KEY = "aurora_draft_gradebook_cache_v1";

function getSessionCache() {
  try {
    const raw = sessionStorage.getItem(GB_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && Date.now() - (data.timestamp || 0) < 10 * 60 * 1000) { // 10 min TTL
      return data;
    }
  } catch (e) {}
  return null;
}

function setSessionCache(data) {
  try {
    sessionStorage.setItem(GB_CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch (e) {}
}

/**
 * Helper to fetch data in parallel with high concurrency limit
 */
async function fetchInBatches(items, batchSize, fn) {
  const results = [];
  const size = Math.max(batchSize || 20, 20);
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Loads classes, assessments, and draft marks from Aurora ERP with instant caching
 */
async function loadGradebookData(force = false) {
  const syncStatus = document.getElementById('dgSyncStatus');
  const classSelect = document.getElementById('dgClassSelect');
  const tableBody = document.getElementById('dgTableBody');
  const refreshBtn = document.getElementById('dgRefreshBtn');

  // 0. Instant render from Cache if available
  const cached = getSessionCache();
  if (cached && !force && cached.classes && cached.classes.length > 0) {
    gbClasses = cached.classes.map(c => ({
      ...c,
      sectionCodes: new Set(c.sectionCodes || []),
      sectionIds: new Set(c.sectionIds || []),
      courseOfferingIds: new Set(c.courseOfferingIds || []),
    }));
    window._auroraGbAssessments = cached.assessments || [];
    window._auroraGbSubmissions = cached.submissions || [];
    window._auroraGbSubmissionsMap = cached.submissionsMap || {};

    if (classSelect) {
      classSelect.innerHTML = gbClasses
        .map((c) => `<option value="${c.key}">${c.label} ${c.subjectName ? `— ${c.subjectName}` : ''}</option>`)
        .join('');
    }
    if (gbClasses.length > 0) {
      onClassSelected(gbClasses[0].key, true); // Instant render
    }
    if (syncStatus) syncStatus.textContent = "Loaded from cache (instant). Syncing live...";
  }

  if (refreshBtn) {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 text-blue-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
      Syncing...
    `;
  }
  if (syncStatus && (!cached || force)) syncStatus.textContent = "Discovering classes & assessments...";

  const API_BASE = "https://admissionsserver.aurora.edu.in/api/v1";

  try {
    // 1. Fetch current & adjacent week timetable in parallel
    const now = new Date();
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);

    const weekDates = [0, -7, 7].map(offset => {
      const d = new Date(monday);
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
    });

    const [ttResults, directAssessmentsRes, subRes] = await Promise.all([
      Promise.all(weekDates.map(weekStr =>
        fetch(`${API_BASE}/timetable/entries/mine?weekStart=${encodeURIComponent(weekStr)}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        }).then(r => r.ok ? r.json() : []).catch(() => [])
      )),
      fetch(`${API_BASE}/faculty/me/assessments?limit=100`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_BASE}/faculty/me/submissions`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);

    let timetableEntries = [];
    ttResults.forEach(ttData => {
      const entries = Array.isArray(ttData) ? ttData : Array.isArray(ttData?.entries) ? ttData.entries : Array.isArray(ttData?.data) ? ttData.data : [];
      if (entries.length > 0) timetableEntries.push(...entries);
    });

    const directAssessments = Array.isArray(directAssessmentsRes) ? directAssessmentsRes : Array.isArray(directAssessmentsRes?.assessments) ? directAssessmentsRes.assessments : Array.isArray(directAssessmentsRes?.data) ? directAssessmentsRes.data : [];
    const allSubmissions = Array.isArray(subRes) ? subRes : Array.isArray(subRes?.submissions) ? subRes.submissions : Array.isArray(subRes?.data) ? subRes.data : [];

    // 2. Build assessments list directly (no slow individual 63 requests needed!)
    const assessmentMap = new Map();
    directAssessments.forEach(a => { if (a && a.id) assessmentMap.set(a.id, a); });

    // Check course offering assessments in parallel if timetable has additional offerings
    const discoveredOfferingIds = [...new Set(timetableEntries.map(e => e.courseOfferingId).filter(Boolean))];
    if (discoveredOfferingIds.length > 0) {
      const offeringAssessments = await Promise.all(discoveredOfferingIds.map(offeringId =>
        fetch(`${API_BASE}/faculty/me/assessments?courseOfferingId=${encodeURIComponent(offeringId)}`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        }).then(r => r.ok ? r.json() : []).catch(() => [])
      ));
      offeringAssessments.forEach(oData => {
        const list = Array.isArray(oData) ? oData : Array.isArray(oData?.assessments) ? oData.assessments : Array.isArray(oData?.data) ? oData.data : [];
        list.forEach(a => { if (a && a.id) assessmentMap.set(a.id, a); });
      });
    }

    const assessmentDetailsList = Array.from(assessmentMap.values());

    // 3. Build strictly de-duplicated classes list
    const classesMap = new Map();

    function registerClass(rawSecCode, secId, courseOfferingId, subjectName, secName) {
      const cleanLabel = cleanSectionLabel(rawSecCode || secName);
      const normKey = normalizeCode(cleanLabel);
      if (!normKey) return;

      if (!classesMap.has(normKey)) {
        classesMap.set(normKey, {
          key: normKey,
          label: cleanLabel,
          subjectName: subjectName || "",
          sectionCodes: new Set(),
          sectionIds: new Set(),
          courseOfferingIds: new Set(),
        });
      }

      const item = classesMap.get(normKey);
      if (rawSecCode) item.sectionCodes.add(rawSecCode);
      if (cleanLabel) item.sectionCodes.add(cleanLabel);
      if (secId) item.sectionIds.add(secId);
      if (courseOfferingId) item.courseOfferingIds.add(courseOfferingId);
      if (subjectName && (!item.subjectName || item.subjectName.length < subjectName.length)) {
        item.subjectName = subjectName;
      }
    }

    // Register from timetable
    timetableEntries.forEach((entry) => {
      if (!entry.sectionCode || entry.isCancelled) return;
      if (!portalShowTerm1 && isTerm1Item(entry)) return;
      registerClass(entry.sectionCode, entry.sectionId, entry.courseOfferingId, entry.subjectName || entry.subjectCode, entry.sectionName);
    });

    // Register from assessments
    assessmentDetailsList.forEach((det) => {
      if (!portalShowTerm1 && isTerm1Item(det)) return;
      const secCode = det.section?.code || det.sectionCode;
      const secId = det.section?.id || det.sectionId;
      const subName = det.subject?.name || det.subject?.code;
      const secName = det.section?.name || det.sectionName;
      registerClass(secCode, secId, det.courseOfferingId, subName, secName);
    });

    gbClasses = Array.from(classesMap.values()).sort((a, b) => a.label.localeCompare(b.label));

    if (gbClasses.length === 0) {
      gbClasses = [{
        key: "all",
        label: "All Enrolled Students",
        subjectName: "",
        sectionCodes: new Set(),
        sectionIds: new Set(),
        courseOfferingIds: new Set(),
      }];
    }

    if (classSelect) {
      const currentVal = classSelect.value;
      classSelect.innerHTML = gbClasses
        .map((c) => `<option value="${c.key}" ${c.key === currentVal ? 'selected' : ''}>${c.label} ${c.subjectName ? `— ${c.subjectName}` : ''}</option>`)
        .join('');
    }

    window._auroraGbAssessments = assessmentDetailsList;
    window._auroraGbSubmissions = allSubmissions;

    // Save to fast cache
    setSessionCache({
      classes: gbClasses.map(c => ({
        key: c.key,
        label: c.label,
        subjectName: c.subjectName,
        sectionCodes: Array.from(c.sectionCodes),
        sectionIds: Array.from(c.sectionIds),
        courseOfferingIds: Array.from(c.courseOfferingIds),
      })),
      assessments: assessmentDetailsList,
      submissions: allSubmissions,
    });

    if (gbClasses.length > 0) {
      const activeKey = classSelect?.value || gbClasses[0].key;
      await onClassSelected(activeKey, false);
    }
  } catch (err) {
    console.error("[Draft Gradebook] Load error:", err);
    if (syncStatus) syncStatus.textContent = "Error loading data.";
    if (tableBody && (!cached || force)) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-12 text-rose-500">
            <p class="font-semibold text-xs text-rose-700">Failed to connect to Aurora ERP</p>
            <p class="text-[11px] text-slate-500 mt-1">${err.message || "Please check your ERP login and retry."}</p>
          </td>
        </tr>
      `;
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.innerHTML = `
        <svg class="w-3.5 h-3.5 text-slate-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
        Refresh
      `;
    }
  }
}

/**
 * Handles class selection and builds the exact multi-column gradebook table with high concurrency
 */
async function onClassSelected(classKey, isCachedImmediate = false) {
  const selected = gbClasses.find((c) => c.key === classKey) || gbClasses[0];
  gbSelectedClass = selected;

  const syncStatus = document.getElementById('dgSyncStatus');
  const tableBody = document.getElementById('dgTableBody');
  if (syncStatus && !isCachedImmediate) syncStatus.textContent = `Loading ${selected.label}...`;

  if (tableBody && !isCachedImmediate && gbCurrentStudents.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="25" class="text-center py-12 text-slate-400">
          <div class="flex flex-col items-center justify-center gap-2">
            <svg class="w-7 h-7 text-blue-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p class="font-medium text-slate-600 text-xs">Extracting all assignments &amp; draft marks...</p>
          </div>
        </td>
      </tr>
    `;
  }

  const API_BASE = "https://admissionsserver.aurora.edu.in/api/v1";
  const allAssessments = window._auroraGbAssessments || [];

  const normSelected = normalizeCode(selected.label);

  let relevantAssessments = allAssessments.filter((a) => {
    if (!portalShowTerm1 && isTerm1Item(a)) return false;
    const secCode = a.section?.code || a.sectionCode;
    const secId = a.section?.id || a.sectionId;
    const courseOffId = a.courseOfferingId;

    if (!secCode && !secId) return true;

    if (secId && selected.sectionIds.has(secId)) return true;
    if (courseOffId && selected.courseOfferingIds.has(courseOffId)) return true;

    const normSec = normalizeCode(secCode);
    if (normSec && normSec === normSelected) return true;
    if (normSec && (normSec.includes(normSelected) || normSelected.includes(normSec))) return true;

    return false;
  });

  if (relevantAssessments.length === 0) {
    relevantAssessments = allAssessments;
  }

  relevantAssessments.sort((a, b) => {
    const catA = (a.type || a.method || "").toUpperCase();
    const catB = (b.type || b.method || "").toUpperCase();
    if (catA !== catB) return catA.localeCompare(catB);
    return (a.title || "").localeCompare(b.title || "");
  });

  // Fetch Submissions & Roster in parallel with high concurrency (25 at a time)
  const assessmentSubmissionsMap = new Map();
  const sectionIdsList = Array.from(selected.sectionIds);
  const courseOfferingIdsList = Array.from(selected.courseOfferingIds);

  const [submissionsResults, rosterResults] = await Promise.all([
    fetchInBatches(relevantAssessments, 25, async (a) => {
      try {
        const res = await fetch(`${API_BASE}/faculty/me/assessments/${encodeURIComponent(a.id)}/submissions`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.submissions) ? data.submissions : [];
          return { id: a.id, list };
        }
      } catch (err) {}
      return { id: a.id, list: [] };
    }),
    Promise.all(sectionIdsList.map((sId, i) => {
      const cId = courseOfferingIdsList[i] || courseOfferingIdsList[0] || '';
      return fetch(`${API_BASE}/attendance/sections/${encodeURIComponent(sId)}/roster?courseOfferingId=${encodeURIComponent(cId)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      }).then(r => r.ok ? r.json() : []).catch(() => []);
    }))
  ]);

  submissionsResults.forEach(item => {
    if (item && item.id) assessmentSubmissionsMap.set(item.id, item.list);
  });

  let classStudents = [];
  rosterResults.forEach(rData => {
    const list = Array.isArray(rData) ? rData : Array.isArray(rData?.roster) ? rData.roster : Array.isArray(rData?.students) ? rData.students : Array.isArray(rData?.data) ? rData.data : [];
    if (list.length > 0) classStudents.push(...list);
  });

  const studentNamesCache = new Map();
  document.querySelectorAll('table tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 3) {
      const reg = cells[1]?.textContent?.trim();
      const name = cells[2]?.textContent?.trim();
      if (reg && name && /^\d{2,3}[A-Z0-9]+$/i.test(reg) && !name.toLowerCase().startsWith('student')) {
        studentNamesCache.set(reg, name);
        setCachedStudentName(reg, name);
      }
    }
  });

  const studentMap = new Map();

  classStudents.forEach((stu) => {
    const regNo = extractStudentRegNo(stu);
    if (!regNo) return;
    const sName = extractStudentName(stu) || studentNamesCache.get(regNo) || getCachedStudentName(regNo) || `Student (${regNo})`;
    if (sName && !sName.startsWith('Student (')) {
      setCachedStudentName(regNo, sName);
    }
    studentMap.set(regNo, {
      regNo,
      name: sName,
      marks: {},
      totalEarned: 0,
      totalEvaluatedMax: 0,
      totalMax: 0,
      hasDraft: false,
    });
  });

  let totalDraftEvaluationsCount = 0;
  let totalPublishedEvaluationsCount = 0;

  relevantAssessments.forEach((assessment) => {
    const submissions = assessmentSubmissionsMap.get(assessment.id) || [];
    submissions.forEach((sub) => {
      const regNo = extractStudentRegNo(sub) || extractStudentRegNo(sub.student);
      if (!regNo) return;

      if (classStudents.length > 0 && !studentMap.has(regNo)) {
        return;
      }

      const extractedName = extractStudentName(sub) || extractStudentName(sub.student) || studentNamesCache.get(regNo) || getCachedStudentName(regNo);
      if (extractedName) {
        setCachedStudentName(regNo, extractedName);
      }

      if (!studentMap.has(regNo)) {
        studentMap.set(regNo, {
          regNo,
          name: extractedName || `Student (${regNo})`,
          marks: {},
          totalEarned: 0,
          totalEvaluatedMax: 0,
          totalMax: 0,
          hasDraft: false,
        });
      }

      const student = studentMap.get(regNo);
      if (extractedName && (!student.name || student.name.startsWith("Student ("))) {
        student.name = extractedName;
      }

      let markVal = null;
      let isDraft = false;

      if (sub.marksObtained !== null && sub.marksObtained !== undefined) {
        markVal = Number(sub.marksObtained);
        totalPublishedEvaluationsCount++;
      } else if (sub.evaluation?.marks !== null && sub.evaluation?.marks !== undefined) {
        markVal = Number(sub.evaluation.marks);
        isDraft = true;
        totalDraftEvaluationsCount++;
        student.hasDraft = true;
      } else if (sub.evaluation?.totalMarks !== null && sub.evaluation?.totalMarks !== undefined) {
        markVal = Number(sub.evaluation.totalMarks);
        isDraft = true;
        totalDraftEvaluationsCount++;
        student.hasDraft = true;
      } else if (sub.draftMarks !== null && sub.draftMarks !== undefined) {
        markVal = Number(sub.draftMarks);
        isDraft = true;
        totalDraftEvaluationsCount++;
        student.hasDraft = true;
      } else if (sub.evaluation && typeof sub.evaluation === 'object') {
        const rubrics = sub.evaluation.rubric || sub.evaluation.rubrics || sub.rubric;
        if (rubrics && typeof rubrics === 'object') {
          const sum = Object.values(rubrics).reduce((acc, v) => acc + (Number(v) || 0), 0);
          if (sum > 0) {
            markVal = sum;
            isDraft = true;
            totalDraftEvaluationsCount++;
            student.hasDraft = true;
          }
        }
      }

      const maxM = Number(assessment.maxMarks ?? 20);

      if (markVal !== null && !isNaN(markVal)) {
        student.marks[assessment.id] = {
          mark: markVal,
          maxMarks: maxM,
          isDraft,
        };
        student.totalEarned += markVal;
        student.totalEvaluatedMax += maxM;
      }

      student.totalMax += maxM;
    });
  });

  gbCurrentStudents = Array.from(studentMap.values()).sort((a, b) => a.regNo.localeCompare(b.regNo));
  gbCurrentAssessments = relevantAssessments;
  gbFilteredStudents = gbCurrentStudents;

  // Update Analytics Section
  updateFullAnalytics(gbCurrentStudents, relevantAssessments, totalDraftEvaluationsCount, totalPublishedEvaluationsCount);

  renderGradebookTable(relevantAssessments, gbCurrentStudents);

  if (syncStatus) {
    syncStatus.textContent = `${gbCurrentStudents.length} students loaded. ${relevantAssessments.length} assessment column(s).`;
  }
  const studentFooter = document.getElementById('dgStudentCountFooter');
  if (studentFooter) {
    studentFooter.textContent = `Showing ${gbCurrentStudents.length} of ${gbCurrentStudents.length} students`;
  }
}

/**
 * Helper to get avatar initials and colors
 */
function getAvatarData(name) {
  if (!name) return { initials: "ST", bg: "rgb(254, 226, 226)", color: "rgb(220, 38, 38)" };
  const parts = name.trim().split(/\s+/).filter(Boolean);
  let initials = "ST";
  if (parts.length === 1) initials = parts[0].slice(0, 2).toUpperCase();
  else if (parts.length > 1) initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  // Deterministic pleasant color
  const colors = [
    { bg: "rgb(254, 226, 226)", color: "rgb(220, 38, 38)" },
    { bg: "rgb(239, 246, 255)", color: "rgb(37, 99, 235)" },
    { bg: "rgb(240, 253, 244)", color: "rgb(5, 150, 105)" },
    { bg: "rgb(254, 243, 199)", color: "rgb(217, 119, 6)" },
    { bg: "rgb(243, 232, 255)", color: "rgb(147, 51, 234)" },
  ];
  const code = initials.charCodeAt(0) + (initials.charCodeAt(1) || 0);
  const color = colors[code % colors.length];
  return { initials, ...color };
}

/**
 * Computes and renders all analytics sections
 */
function updateFullAnalytics(students, assessments, draftCount, publishedCount) {
  const donutTotal = document.getElementById('dgDonutTotal');
  if (donutTotal) donutTotal.textContent = String(students.length);

  const statAssessmentsCount = document.getElementById('dgStatAssessmentsCount');
  if (statAssessmentsCount) statAssessmentsCount.textContent = String(assessments.length);

  const statDraftCount = document.getElementById('dgStatDraftCount');
  if (statDraftCount) statDraftCount.textContent = String(draftCount);

  const statPublishedCount = document.getElementById('dgStatPublishedCount');
  if (statPublishedCount) statPublishedCount.textContent = String(publishedCount);

  let evaluatedStudentsCount = 0;
  let totalPercentageSum = 0;

  const studentScores = students.map(s => {
    const evalMax = s.totalEvaluatedMax || Object.values(s.marks).reduce((acc, m) => acc + (m.maxMarks || 20), 0);
    const count = Object.keys(s.marks).length;
    const pct = count > 0 && evalMax > 0 ? (s.totalEarned / evalMax) * 100 : null;
    if (pct !== null) {
      evaluatedStudentsCount++;
      totalPercentageSum += pct;
    }
    return {
      ...s,
      percentage: pct,
      evaluatedCount: count,
      totalEvaluatedMax: evalMax,
    };
  });

  const classAvg = evaluatedStudentsCount > 0 ? (totalPercentageSum / evaluatedStudentsCount).toFixed(1) : "0.0";
  const statClassAverage = document.getElementById('dgStatClassAverage');
  if (statClassAverage) statClassAverage.textContent = `${classAvg}%`;

  // Grade Distribution Breakdown
  const distEl = document.getElementById('dgDistributionBreakdown');
  if (distEl) {
    let bracketA = 0, bracketB = 0, bracketC = 0, bracketF = 0, bracketPending = 0;
    studentScores.forEach(s => {
      if (s.percentage === null) bracketPending++;
      else if (s.percentage >= 75) bracketA++;
      else if (s.percentage >= 60) bracketB++;
      else if (s.percentage >= 40) bracketC++;
      else bracketF++;
    });

    distEl.innerHTML = `
      <div class="flex items-center justify-between"><span class="text-emerald-700 font-semibold">≥75% (Distinction)</span><span class="font-bold text-gray-800">${bracketA}</span></div>
      <div class="flex items-center justify-between"><span class="text-blue-700 font-semibold">60-74% (First Class)</span><span class="font-bold text-gray-800">${bracketB}</span></div>
      <div class="flex items-center justify-between"><span class="text-amber-700 font-semibold">40-59% (Pass)</span><span class="font-bold text-gray-800">${bracketC}</span></div>
      <div class="flex items-center justify-between"><span class="text-rose-700 font-semibold">&lt;40% (Needs Attention)</span><span class="font-bold text-gray-800">${bracketF}</span></div>
      ${bracketPending > 0 ? `<div class="flex items-center justify-between pt-1 border-t border-gray-100 text-gray-400"><span>Pending Evaluations</span><span class="font-bold">${bracketPending}</span></div>` : ''}
    `;
  }

  // Assessment Contribution Breakdown
  const catEl = document.getElementById('dgCategoryContribution');
  if (catEl) {
    const categoriesMap = new Map();
    assessments.forEach(a => {
      const cat = (a.type || a.method || "ASSIGNMENTS").toUpperCase();
      categoriesMap.set(cat, (categoriesMap.get(cat) || 0) + 1);
    });

    catEl.innerHTML = Array.from(categoriesMap.entries()).map(([cat, count]) => `
      <div class="flex items-center justify-between pb-2 border-b border-gray-100 last:border-0 last:pb-0">
        <span class="text-[13px] font-medium text-gray-600">${cat}</span>
        <span class="text-[13px] font-bold text-gray-900">${count} Task(s)</span>
      </div>
    `).join('');
  }

  // Top Performers List (Top 50 evaluated students)
  const topEl = document.getElementById('dgTopPerformersList');
  if (topEl) {
    const evaluatedStudents = studentScores.filter(s => s.percentage !== null);
    const sortedTop = [...evaluatedStudents]
      .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
      .slice(0, 50);

    if (sortedTop.length === 0) {
      topEl.innerHTML = `<p class="text-[13px] text-gray-400 italic">No evaluated marks recorded yet.</p>`;
    } else {
      const medals = ["🥇", "🥈", "🥉"];
      topEl.innerHTML = sortedTop.map((s, idx) => {
        const pctDisplay = `${s.percentage.toFixed(1)}%`;
        const gradeBadge = s.percentage >= 75 ? "A+" : s.percentage >= 60 ? "A" : s.percentage >= 50 ? "B" : "Pass";
        return `
          <div class="flex items-center gap-3 p-3 rounded-[14px] hover:bg-gray-50 cursor-pointer transition-colors group">
            <div class="w-8 text-center text-[13px] font-bold shrink-0">${medals[idx] || (idx + 1)}</div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">${s.name}</p>
              <p class="text-[11px] text-gray-500">${s.regNo}</p>
            </div>
            <div class="text-right shrink-0">
              <div class="text-[14px] font-bold text-emerald-600">${pctDisplay}</div>
              <div class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">${gradeBadge}</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Needs Attention List (Students with evaluated marks < 40%)
  const attentionEl = document.getElementById('dgNeedsAttentionList');
  if (attentionEl) {
    const atRisk = studentScores
      .filter(s => s.percentage !== null && s.percentage < 40)
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 5);

    if (atRisk.length === 0) {
      attentionEl.innerHTML = `<p class="text-[13px] text-emerald-600 font-semibold p-3">🎉 All evaluated students are performing above passing threshold (≥40%)!</p>`;
    } else {
      attentionEl.innerHTML = atRisk.map(s => {
        const scoreText = `${s.percentage.toFixed(1)}%`;
        return `
          <div class="flex items-center gap-3 p-3 rounded-[14px] hover:bg-rose-50/50 cursor-pointer transition-colors group border border-transparent hover:border-rose-100">
            <div class="w-2 h-8 rounded-full shrink-0 bg-rose-500"></div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-bold text-gray-900 truncate group-hover:text-rose-600 transition-colors">${s.name}</p>
              <p class="text-[11px] text-gray-500">${s.regNo}</p>
            </div>
            <div class="text-right shrink-0">
              <div class="text-[14px] font-bold text-rose-600">${scoreText}</div>
              <span class="text-[10px] font-semibold text-rose-500">At Risk (&lt;40%)</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

/**
 * Renders the complete multi-level header and student row grid matching official Aurora styling
 */
function renderGradebookTable(assessments, students) {
  const tableHead = document.getElementById('dgTableHead');
  const tableBody = document.getElementById('dgTableBody');
  if (!tableHead || !tableBody) return;

  // 1. Group assessments by Category/Type
  const categoriesMap = new Map();
  assessments.forEach((a) => {
    const category = (a.type || a.method || "ASSIGNMENTS").toUpperCase();
    if (!categoriesMap.has(category)) {
      categoriesMap.set(category, []);
    }
    categoriesMap.get(category).push(a);
  });

  // 2. Build Multi-Level Table Header matching the official Aurora Gradebook screenshot
  let headerRow1 = `
    <tr style="background-color: rgb(248, 250, 252);">
      <th rowspan="2" class="sticky left-0 z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap" style="background-color: rgb(248, 250, 252); width: 56px; min-width: 56px;">S.No</th>
      <th rowspan="2" class="sticky z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-gray-900" style="background-color: rgb(248, 250, 252); left: 56px; width: 150px; min-width: 150px;">
        <span class="flex items-center gap-1">Registration No</span>
      </th>
      <th rowspan="2" class="sticky z-20 text-left px-4 py-4 text-[11px] font-bold text-gray-600 uppercase tracking-wider border border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-gray-900" style="background-color: rgb(248, 250, 252); left: 206px; width: 200px; min-width: 200px; box-shadow: rgba(0, 0, 0, 0.1) 4px 0px 8px -4px;">
        <span class="flex items-center gap-1">Student Name</span>
      </th>
  `;

  let headerRow2 = `<tr style="background-color: rgb(248, 250, 252);">`;

  categoriesMap.forEach((catAssessments, catName) => {
    headerRow1 += `
      <th colspan="${catAssessments.length}" class="text-center px-3 py-3 text-[11px] font-bold text-gray-700 border border-slate-200 bg-slate-100 uppercase tracking-wider">
        ${catName}
      </th>
    `;

    catAssessments.forEach((a) => {
      const shortTitle = (a.title || a.type || "TASK").toUpperCase();
      headerRow2 += `
        <th class="text-center px-3 py-2.5 text-[10px] text-gray-600 font-semibold border border-slate-200 min-w-[90px] whitespace-nowrap bg-slate-50">
          <div class="truncate max-w-[120px]" title="${a.title || ''}">${shortTitle}</div>
          <div class="text-[9px] font-normal text-gray-400 mt-0.5">${a.maxMarks || 20}M</div>
        </th>
      `;
    });
  });

  // Summary Column
  headerRow1 += `
    <th colspan="1" class="text-center px-3 py-3 text-[11px] font-bold text-gray-700 border border-slate-200 bg-blue-50">
      Summary
    </th>
  </tr>`;

  headerRow2 += `
    <th class="text-center px-3 py-3 text-[11px] font-bold text-gray-700 border border-slate-200 bg-blue-50 min-w-[80px]">
      Total
    </th>
  </tr>`;

  tableHead.innerHTML = headerRow1 + headerRow2;

  // 3. Render Student Rows
  if (students.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="30" class="text-center py-12 text-slate-400 text-xs">
          No students found for this class.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = students
    .map((student, idx) => {
      const avatar = getAvatarData(student.name);

      let assessmentCells = "";
      assessments.forEach((a) => {
        const record = student.marks[a.id];
        if (record && record.mark !== undefined) {
          assessmentCells += `
            <td class="border border-slate-200 px-3 py-2.5 text-center whitespace-nowrap">
              <span class="text-[13px] font-bold ${record.isDraft ? 'text-amber-600' : 'text-gray-900'}">${record.mark}</span><span class="text-[10px] text-gray-400 font-normal">/${record.maxMarks}</span>
              ${record.isDraft ? '<span title="Draft Saved (Unpublished)" class="ml-1 inline-flex items-center px-1 rounded text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-300">DRAFT</span>' : ''}
            </td>
          `;
        } else {
          assessmentCells += `
            <td class="border border-slate-200 px-3 py-2.5 text-center text-gray-400 text-[13px]">
              —
            </td>
          `;
        }
      });

      const evalMax = student.totalEvaluatedMax || Object.values(student.marks).reduce((sum, m) => sum + (m.maxMarks || 20), 0);
      const count = Object.keys(student.marks).length;
      const pct = count > 0 && evalMax > 0 ? (student.totalEarned / evalMax) * 100 : null;

      const totalCellDisplay = evalMax > 0
        ? `<div><span class="text-[13px] font-bold text-gray-900">${student.totalEarned}</span><span class="text-[10px] text-gray-400 font-normal">/${evalMax}</span></div>
           <div class="text-[10px] font-bold ${pct >= 75 ? 'text-emerald-600' : pct >= 60 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}">${pct !== null ? `${pct.toFixed(1)}%` : '—'}</div>`
        : `<span class="text-[13px] text-gray-400">—</span>`;

      return `
        <tr class="hover:bg-blue-50/30 transition-colors group cursor-pointer">
          <td class="sticky left-0 z-10 border border-slate-200 bg-white group-hover:bg-blue-50/30 transition-colors px-4 py-3 text-[13px] font-semibold text-gray-500" style="width: 56px; min-width: 56px;">${idx + 1}</td>
          <td class="sticky z-10 border border-slate-200 bg-white group-hover:bg-blue-50/30 transition-colors px-4 py-3 text-[12px] text-gray-600" style="left: 56px; width: 150px; min-width: 150px;">${student.regNo}</td>
          <td class="sticky z-10 border border-slate-200 bg-white group-hover:bg-blue-50/30 transition-colors px-4 py-3" style="left: 206px; width: 200px; min-width: 200px; box-shadow: rgba(0, 0, 0, 0.1) 4px 0px 8px -4px;">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style="background-color: ${avatar.bg}; color: ${avatar.color};">${avatar.initials}</div>
              <p class="text-[13px] font-bold text-gray-900 truncate group-hover:text-blue-700 transition-colors min-w-0" title="${student.name}">${student.name}</p>
            </div>
          </td>
          ${assessmentCells}
          <td class="border border-slate-200 px-3 py-2.5 text-center whitespace-nowrap">
            ${totalCellDisplay}
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Filters student rows by search input
 */
function filterGradebookRows(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    gbFilteredStudents = gbCurrentStudents;
  } else {
    gbFilteredStudents = gbCurrentStudents.filter(
      (s) => s.name.toLowerCase().includes(q) || s.regNo.toLowerCase().includes(q),
    );
  }
  renderGradebookTable(gbCurrentAssessments, gbFilteredStudents);

  const studentFooter = document.getElementById('dgStudentCountFooter');
  if (studentFooter) {
    studentFooter.textContent = `Showing ${gbFilteredStudents.length} of ${gbCurrentStudents.length} students`;
  }
}

/**
 * Exports the currently displayed Gradebook to CSV
 */
function exportGradebookToCSV() {
  if (!gbCurrentStudents || gbCurrentStudents.length === 0) {
    alert("No student data available to export.");
    return;
  }

  const headers = ["S.NO", "REGISTRATION NO", "STUDENT NAME"];
  gbCurrentAssessments.forEach((a) => {
    headers.push(`"${(a.title || a.type || 'TASK').replace(/"/g, '""')} (${a.maxMarks || 20}M)"`);
  });
  headers.push("TOTAL");

  const rows = [headers.join(",")];

  gbFilteredStudents.forEach((s, idx) => {
    const row = [idx + 1, `"${s.regNo}"`, `"${s.name.replace(/"/g, '""')}"`];
    gbCurrentAssessments.forEach((a) => {
      const record = s.marks[a.id];
      row.push(record && record.mark !== undefined ? record.mark : "—");
    });
    row.push(s.totalEarned);
    rows.push(row.join(","));
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  const className = (gbSelectedClass?.label || "class").replace(/[^a-zA-Z0-9_-]/g, "_");
  link.setAttribute("download", `Gradebook_${className}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Closes the Draft Gradebook View and restores standard UI
 */
/**
 * Closes the Draft Gradebook View and restores standard UI
 */
function closeDraftGradebookView() {
  isDraftGradebookActive = false;

  // Reset draft nav styling for both new and legacy sidebar items
  document.querySelectorAll('.aurora-draft-gradebook-wrapper').forEach(wrapper => {
    const btn = wrapper.querySelector('.aurora-draft-gradebook-btn');
    if (btn) {
      btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.add('text-slate-600', 'hover:bg-slate-100', 'hover:text-slate-900');
    }

    const inner = wrapper.querySelector('.draft-nav-inner');
    const icon = wrapper.querySelector('.draft-nav-icon');
    const badge = wrapper.querySelector('.draft-nav-badge');
    if (inner) {
      inner.className = 'draft-nav-inner group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 cursor-pointer text-slate-600 hover:bg-blue-50 hover:text-blue-700';
    }
    if (icon) {
      icon.className = 'draft-nav-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150 bg-indigo-50 text-indigo-600 group-hover:scale-110';
    }
    if (badge) {
      badge.className = 'draft-nav-badge rounded-md px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700';
    }
  });

  const container = document.getElementById('aurora-draft-gradebook-view');
  if (container) {
    container.style.display = 'none';
  }

  // Restore hidden page content
  const mainEl = document.querySelector('main');
  if (mainEl) {
    Array.from(mainEl.children).forEach(child => {
      if (child.hasAttribute('data-aurora-prev-display')) {
        child.style.display = child.getAttribute('data-aurora-prev-display') || '';
        child.removeAttribute('data-aurora-prev-display');
      }
    });
  }

  document.querySelectorAll('[data-aurora-prev-display]').forEach(el => {
    el.style.display = el.getAttribute('data-aurora-prev-display') || '';
    el.removeAttribute('data-aurora-prev-display');
  });
}
