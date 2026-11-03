/**
 * Shared state for the Aurora ERP portal content scripts.
 *
 * Content scripts are classic scripts that share the extension's isolated-world
 * global scope. Load order is defined in manifest.json: shared.js first, main.js last.
 */

'use strict';

// Flag to prevent MutationObserver loops from internal DOM re-ordering
let isInternalMutation = false;
