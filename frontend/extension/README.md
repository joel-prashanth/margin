# Margin — Chrome extension

The bridge between Margin and Aurora ERP: Google Sheet → ERP attendance, the attendance assistant, AI-assisted grading (Reflective Journals, Lab Reports, Reflective Essays, Project Reports) and portal enhancements.

Load it unpacked from this folder (`chrome://extensions` → Developer mode → Load unpacked).

## Layout

```
manifest.json
assets/icons/                 extension icons
src/
  config.js                   shared constants (ERP base URL, AI endpoints, defaults)
  background/
    service-worker.js         toolbar action + FETCH_ROSTER / SUBMIT_ATTENDANCE messages
  content/                    classic scripts injected into admissions.aurora.edu.in
    shared.js                 shared flags (loaded first)
    table-tools.js            header sort indicators, "Load All" pagination
    term-filter.js            hide Term 1 rows/options + toggle
    draft-gradebook.js        Draft Gradebook nav item and view
    attendance-state.js       GET_PAGE_ATTENDANCE_STATE responder
    main.js                   init, interval and MutationObserver (loaded last)
  pages/
    app.html, app.css         extension page
    privacy.html
  app/                        extension page code (MVC, ES modules)
    main.js                   bootstrap: wires controllers together
    core/                     framework-free helpers (dom, async, storage cache)
    services/                 data access only: ERP API, Sheets, chrome.storage,
      ai/                     portal tab, background messaging, AI providers
    models/                   state + domain rules, no DOM
      attendance/             sheet mapping, matching, submission, assistant
      grading/                rubrics, assessment catalog, per-module models
    views/                    DOM rendering only, no fetching
      grading/
    controllers/              event wiring and orchestration
      grading/
```

## Rules of the road

- **Views** read and write the DOM and accept callbacks. They never call services.
- **Models** hold state and business rules. They may call services, never touch the DOM.
- **Controllers** bind view events, call models and services, and push results into views.
- **Navigation** belongs to `controllers/navigation-controller.js`. A feature that needs to react to its tab registers an `onTabActivated` hook instead of toggling sections itself.
- Lab and Essay share `views/grading/pdf-grading-view.js` and `models/grading/assessment-catalog.js`. Add a new PDF-graded assessment type by supplying a view config, a model (classifier + cache keys) and a controller.
- Content scripts can't import ES modules. They share the isolated-world global scope, so the order in `manifest.json` matters and top-level names must be unique across files.
