/* ============================================================================
   market-tables.js — sortable columns and page flipping for the Markets tables
   ============================================================================

   ONE FILE, THREE PAGES. This replaces three byte-for-byte copies of the
   column sorter that were pasted inline into markets.html,
   markets-fundamental.html and Markets/spotlight.html on 2026-08-07. Three
   copies of a behavior is three chances for two of them to drift, and the
   earnings table is rendered into all three pages by the same function in
   tools/inject-market-data.mjs — so the markup was already shared and only the
   script was not.

   BOTH FEATURES ARE PURE ENHANCEMENT, AND THAT IS LOAD-BEARING.

   The tables ship COMPLETE and already sensibly ordered by the build. This
   script fetches nothing, creates no rows and removes none. Sorting reorders
   rows that are already in the document; paging sets `display:none` on the
   ones not on the current page and builds a Prev/Next control that does not
   otherwise exist in the HTML.

   Which means: with JavaScript off, or to a crawler that does not run it,
   every row of every table is present and visible, and there is no dead pager
   sitting there implying a page 2 that nothing can reach. That is the whole
   reason paging is done this way rather than by having the build emit ten rows
   and a "load more" button — the Markets pages rank because their content is
   in the HTML on first crawl, and hiding 90% of the earnings calendar behind a
   fetch would undo that for the sake of a scrollbar.

   HOW PAGING AND SORTING COMPOSE. A sort reorders the underlying rows and then
   returns the reader to page 1. Any other choice is wrong: staying on page 4
   after sorting by market cap shows rows 31-40 of a list the reader has just
   asked to see the top of. `applyPage` is therefore called at the end of every
   sort, and it reads row order from the DOM each time rather than caching it.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------- sorting -- */

  function keyOf(cell, numeric) {
    if (!cell) return numeric ? -Infinity : '';
    var raw = cell.getAttribute('data-v');
    if (numeric) {
      if (raw === null || raw === '') return -Infinity;
      var n = parseFloat(raw);
      return isNaN(n) ? -Infinity : n;
    }
    return (raw !== null ? raw : cell.textContent).trim().toLowerCase();
  }

  function sortTable(table, index, numeric, ascending) {
    var body = table.tBodies[0];
    if (!body) return;
    var decorated = Array.prototype.slice.call(body.rows).map(function (row, i) {
      return { row: row, key: keyOf(row.cells[index], numeric), i: i };
    });
    decorated.sort(function (a, b) {
      /* A blank is "no number", not "the smallest number", so it is parked at
         the bottom in BOTH directions rather than floating to the top when
         ascending. Doing it with a -Infinity sentinel alone gets this wrong. */
      var am = numeric && a.key === -Infinity, bm = numeric && b.key === -Infinity;
      if (am !== bm) return am ? 1 : -1;
      if (am && bm) return a.i - b.i;
      var d = numeric ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
                      : a.key.localeCompare(b.key);
      if (d === 0) return a.i - b.i;          // ties keep the build's ordering
      return ascending ? d : -d;
    });
    var frag = document.createDocumentFragment();
    decorated.forEach(function (d) { frag.appendChild(d.row); });
    body.appendChild(frag);
  }

  /* -------------------------------------------------------------- paging -- */

  /* Rows are hidden with an inline `display:none` rather than a class, so this
     works on any page that loads the script whether or not its stylesheet has
     been updated. A row hidden by a stylesheet rule that has not shipped yet is
     a row that is simply gone. */
  function applyPage(state) {
    var rows = state.rows();
    var size = state.size;
    var pages = Math.max(1, Math.ceil(rows.length / size));
    if (state.page > pages) state.page = pages;
    if (state.page < 1) state.page = 1;

    var first = (state.page - 1) * size;
    var last = Math.min(first + size, rows.length);

    for (var i = 0; i < rows.length; i++) {
      rows[i].style.display = (i >= first && i < last) ? '' : 'none';
    }

    state.label.textContent = rows.length
      ? 'Showing ' + (first + 1) + '–' + last + ' of ' + rows.length
      : 'Nothing to show';
    state.count.textContent = 'Page ' + state.page + ' of ' + pages;
    state.prev.disabled = state.page <= 1;
    state.next.disabled = state.page >= pages;

    /* One pager for one table: if everything fits on a single page there is
       nothing to flip, so the control removes itself rather than sitting there
       greyed out on both sides. */
    state.bar.hidden = pages <= 1;
  }

  function button(text, aria) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mkt-page-btn';
    b.textContent = text;
    b.setAttribute('aria-label', aria);
    return b;
  }

  function buildPager(wrap) {
    var table = wrap.querySelector('table');
    if (!table || !table.tBodies[0]) return null;

    var size = parseInt(wrap.getAttribute('data-page-size'), 10);
    if (!size || size < 1) size = 10;

    var body = table.tBodies[0];

    var bar = document.createElement('nav');
    bar.className = 'mkt-pager';
    /* A landmark with a name, because a page may carry three of these and
       "navigation" three times over is useless to anyone reading by landmark. */
    bar.setAttribute('aria-label', 'Table pages');

    var label = document.createElement('p');
    label.className = 'mkt-page-range';

    var prev = button('← Prev', 'Previous page');
    var next = button('Next →', 'Next page');

    var count = document.createElement('span');
    count.className = 'mkt-page-count';
    /* The page counter announces itself when it changes, so a screen-reader
       user who presses Next hears where they landed. The row range does not
       need to: it is in the same live region's sentence and would double up. */
    count.setAttribute('aria-live', 'polite');

    var group = document.createElement('div');
    group.className = 'mkt-page-btns';
    group.appendChild(prev);
    group.appendChild(count);
    group.appendChild(next);

    bar.appendChild(label);
    bar.appendChild(group);
    wrap.appendChild(bar);

    var state = {
      page: 1,
      size: size,
      bar: bar, label: label, count: count, prev: prev, next: next,
      /* Read from the DOM every time rather than caching the list: sorting
         reorders these same nodes in place, and a cached array would keep
         showing the pre-sort page 1. */
      rows: function () { return Array.prototype.slice.call(body.rows); },
    };

    prev.addEventListener('click', function () {
      state.page--; applyPage(state); scrollToTop(wrap);
    });
    next.addEventListener('click', function () {
      state.page++; applyPage(state); scrollToTop(wrap);
    });

    applyPage(state);
    return state;
  }

  /* After a page flip the reader is usually looking at the bottom of the old
     page. Put the top of the table back in view — but only if it has actually
     scrolled out of view above, so flipping a table that is already fully on
     screen does not yank the page around for no reason. */
  function scrollToTop(wrap) {
    var top = wrap.getBoundingClientRect().top;
    if (top < 0) wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* ----------------------------------------------------------------- wire -- */

  var pagers = new WeakMap();

  Array.prototype.forEach.call(document.querySelectorAll('.mkt-paged'), function (wrap) {
    var state = buildPager(wrap);
    if (state) pagers.set(wrap, state);
  });

  Array.prototype.forEach.call(document.querySelectorAll('table.mkt-sortable'), function (table) {
    var heads = table.tHead ? Array.prototype.slice.call(table.tHead.rows[0].cells) : [];
    heads.forEach(function (th, index) {
      var btn = th.querySelector('button.mkt-sort');
      if (!btn) return;
      var numeric = th.getAttribute('data-type') === 'num';
      btn.addEventListener('click', function () {
        var cur = th.getAttribute('aria-sort');
        // Numeric columns open largest-first; text columns open A-Z.
        var asc = cur === 'ascending' ? false : cur === 'descending' ? true : !numeric;
        heads.forEach(function (h) { h.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        sortTable(table, index, numeric, asc);

        // Back to page 1 — see the note in this file's header.
        var wrap = table.closest ? table.closest('.mkt-paged') : null;
        var state = wrap && pagers.get(wrap);
        if (state) { state.page = 1; applyPage(state); }
      });
    });
  });
})();
