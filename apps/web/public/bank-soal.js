/* Bank Soal (Admin > Program Training > Pre/Post-test): pencarian, filter, paginasi, dan aksi massal di sisi peramban.
 * Peningkatan progresif: tanpa berkas ini seluruh soal tetap tampil dan tiap aksi (aktif/nonaktif, hapus) tetap berjalan lewat form.
 * Data tetap dirender server; berkas ini hanya menyembunyikan/menampilkan baris. Tanpa inline script (CSP script-src 'self'). */
(function () {
  'use strict';

  var root = document.querySelector('[data-bank-soal]');
  if (!root) return;
  var rows = Array.prototype.slice.call(root.querySelectorAll('[data-bs-row]'));
  if (rows.length === 0) return;

  function $(sel) { return root.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  var el = {
    toolbar: $('[data-bs-toolbar]'),
    q: $('[data-bs-q]'),
    program: $('[data-bs-program]'),
    meeting: $('[data-bs-meeting]'),
    type: $('[data-bs-type]'),
    status: $('[data-bs-status]'),
    bulk: $('[data-bs-bulk]'),
    selected: $('[data-bs-selected]'),
    selectFiltered: $('[data-bs-select-filtered]'),
    filteredTotal: $('[data-bs-filtered-total]'),
    clear: $('[data-bs-clear]'),
    all: $('[data-bs-all]'),
    empty: $('[data-bs-empty]'),
    foot: $('[data-bs-foot]'),
    staticFoot: $('[data-bs-static]'),
    per: $('[data-bs-per]'),
    range: $('[data-bs-range]'),
    pages: $('[data-bs-pages]')
  };
  if (!el.toolbar || !el.per || !el.pages || !el.range) return;

  var STORE_KEY = 'bank-soal-state';
  var DEFAULTS = { q: '', program: '', meeting: '', type: '', status: '', per: 10, page: 1 };
  var state = {};
  Object.keys(DEFAULTS).forEach(function (k) { state[k] = DEFAULTS[k]; });

  // Teks pencarian dihitung sekali per baris.
  rows.forEach(function (row) {
    var t = row.querySelector('.bs-text');
    row._text = (t ? t.textContent : '').toLowerCase();
    row._pick = row.querySelector('[data-bs-pick]');
  });

  var filtered = rows.slice();

  // ---- Simpan/pulihkan keadaan: hanya setelah aksi (halaman dimuat ulang dengan ?ok=1) supaya halaman dan filter tidak hilang ----
  function save() {
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* penyimpanan dimatikan: abaikan */ }
  }
  function restore() {
    if (!/[?&]ok=1(&|$)/.test(window.location.search)) {
      try { window.sessionStorage.removeItem(STORE_KEY); } catch (e) { /* abaikan */ }
      return false;
    }
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(STORE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return false;
      ['q', 'program', 'meeting', 'type', 'status'].forEach(function (k) { if (typeof saved[k] === 'string') state[k] = saved[k]; });
      if ([10, 20, 50].indexOf(saved.per) !== -1) state.per = saved.per;
      if (Number.isInteger(saved.page) && saved.page > 0) state.page = saved.page;
      return true;
    } catch (e) {
      return false;
    }
  }

  function matches(row) {
    if (state.program && row.getAttribute('data-program') !== state.program) return false;
    if (state.meeting && row.getAttribute('data-meeting') !== state.meeting) return false;
    if (state.type && row.getAttribute('data-type') !== state.type) return false;
    if (state.status && row.getAttribute('data-active') !== state.status) return false;
    if (state.q && row._text.indexOf(state.q.toLowerCase()) === -1) return false;
    return true;
  }

  // ---- Pilihan (kotak centang) ----
  function checkedRows() { return rows.filter(function (r) { return r._pick && r._pick.checked; }); }

  function clearSelection() {
    rows.forEach(function (r) { if (r._pick) r._pick.checked = false; });
    updateBulk();
  }

  function updateBulk() {
    var count = checkedRows().length;
    var pageRows = filtered.slice((state.page - 1) * state.per, state.page * state.per);
    var pageChecked = pageRows.filter(function (r) { return r._pick && r._pick.checked; }).length;
    if (el.bulk) el.bulk.hidden = count === 0;
    if (el.selected) el.selected.textContent = String(count);
    if (el.all) {
      el.all.checked = pageRows.length > 0 && pageChecked === pageRows.length;
      el.all.indeterminate = pageChecked > 0 && pageChecked < pageRows.length;
    }
    if (el.selectFiltered) {
      // Tawarkan memilih semua hasil filter bila hasilnya lebih banyak daripada satu halaman dan belum terpilih semua.
      var offer = filtered.length > pageRows.length && count < filtered.length && pageChecked === pageRows.length && pageRows.length > 0;
      el.selectFiltered.hidden = !offer;
      if (el.filteredTotal) el.filteredTotal.textContent = String(filtered.length);
    }
  }

  // ---- Paginasi ----
  function pageList(current, total) {
    var set = {};
    [1, total, current - 1, current, current + 1].forEach(function (p) { if (p >= 1 && p <= total) set[p] = true; });
    var nums = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    var out = [];
    nums.forEach(function (n, i) {
      if (i > 0 && n - nums[i - 1] > 1) out.push('gap');
      out.push(n);
    });
    return out;
  }

  function pageButton(label, page, opts) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'bs-pg' + (opts && opts.active ? ' active' : '');
    b.textContent = label;
    if (opts && opts.aria) b.setAttribute('aria-label', opts.aria);
    if (opts && opts.active) b.setAttribute('aria-current', 'page');
    if (opts && opts.disabled) b.disabled = true;
    else b.addEventListener('click', function () { goTo(page); });
    return b;
  }

  function renderPages(totalPages) {
    el.pages.textContent = '';
    if (totalPages <= 1) return;
    el.pages.appendChild(pageButton('\u2039', state.page - 1, { aria: 'Halaman sebelumnya', disabled: state.page <= 1 }));
    pageList(state.page, totalPages).forEach(function (p) {
      if (p === 'gap') {
        var gap = document.createElement('span');
        gap.className = 'bs-gap';
        gap.textContent = '\u2026';
        el.pages.appendChild(gap);
      } else {
        el.pages.appendChild(pageButton(String(p), p, { active: p === state.page, aria: 'Halaman ' + p }));
      }
    });
    el.pages.appendChild(pageButton('\u203A', state.page + 1, { aria: 'Halaman berikutnya', disabled: state.page >= totalPages }));
  }

  function render() {
    filtered = rows.filter(matches);
    var totalPages = Math.max(1, Math.ceil(filtered.length / state.per));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.per;
    var end = Math.min(start + state.per, filtered.length);
    var visible = {};
    filtered.slice(start, end).forEach(function (r) { visible[rows.indexOf(r)] = true; });
    rows.forEach(function (r, i) { r.hidden = !visible[i]; });

    if (el.empty) el.empty.hidden = filtered.length > 0;
    el.range.textContent = filtered.length === 0
      ? 'Tidak ada soal'
      : 'Menampilkan ' + (start + 1) + '\u2013' + end + ' dari ' + filtered.length + ' soal' + (filtered.length !== rows.length ? ' (difilter dari ' + rows.length + ')' : '');
    renderPages(totalPages);
    updateBulk();
    save();
  }

  function goTo(page) {
    state.page = page;
    clearSelection();
    render();
    var card = $('.tablewrap');
    if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
  }

  function changeFilter() {
    state.page = 1;
    clearSelection();
    render();
  }

  function syncControls() {
    el.q.value = state.q;
    el.program.value = state.program;
    el.meeting.value = state.meeting;
    el.type.value = state.type;
    el.status.value = state.status;
    el.per.value = String(state.per);
  }

  function reset() {
    state.q = ''; state.program = ''; state.meeting = ''; state.type = ''; state.status = ''; state.page = 1;
    syncControls();
    clearSelection();
    render();
  }

  // ---- Pengikatan ----
  var timer = null;
  el.q.addEventListener('input', function () {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(function () { state.q = el.q.value.trim(); changeFilter(); }, 150);
  });
  [['program', el.program], ['meeting', el.meeting], ['type', el.type], ['status', el.status]].forEach(function (pair) {
    pair[1].addEventListener('change', function () { state[pair[0]] = pair[1].value; changeFilter(); });
  });
  el.per.addEventListener('change', function () {
    state.per = parseInt(el.per.value, 10) || 10;
    changeFilter();
  });
  all('[data-bs-reset]').forEach(function (b) { b.addEventListener('click', reset); });

  rows.forEach(function (r) {
    if (r._pick) {
      r._pick.hidden = false;
      r._pick.addEventListener('change', updateBulk);
    }
  });
  if (el.all) {
    el.all.hidden = false;
    el.all.addEventListener('change', function () {
      var pageRows = filtered.slice((state.page - 1) * state.per, state.page * state.per);
      pageRows.forEach(function (r) { if (r._pick) r._pick.checked = el.all.checked; });
      updateBulk();
    });
  }
  if (el.selectFiltered) {
    el.selectFiltered.addEventListener('click', function () {
      filtered.forEach(function (r) { if (r._pick) r._pick.checked = true; });
      updateBulk();
    });
  }
  if (el.clear) el.clear.addEventListener('click', clearSelection);

  // Konfirmasi aksi massal; Hapus permanen selalu ditanyakan.
  if (el.bulk) {
    var lastButton = null;
    Array.prototype.forEach.call(el.bulk.querySelectorAll('button[type="submit"]'), function (b) {
      b.addEventListener('click', function () { lastButton = b; });
    });
    el.bulk.addEventListener('submit', function (e) {
      var n = checkedRows().length;
      var btn = e.submitter || lastButton;
      var action = btn ? btn.value : '';
      if (n === 0) { e.preventDefault(); return; }
      if (action === 'hapus') {
        if (!window.confirm('Hapus ' + n + ' soal terpilih secara permanen? Soal yang sudah dijawab peserta tidak dihapus (cukup dinonaktifkan). Tindakan ini tidak dapat dibatalkan.')) e.preventDefault();
      } else if (n > 20) {
        var verb = action === 'aktifkan' ? 'Aktifkan' : 'Nonaktifkan';
        if (!window.confirm(verb + ' ' + n + ' soal terpilih?')) e.preventDefault();
      }
    });
  }

  // ---- Mulai ----
  var restored = restore();
  syncControls();
  el.toolbar.hidden = false;
  el.foot.hidden = false;
  if (el.staticFoot) el.staticFoot.hidden = true;
  render();
  if (restored) root.scrollIntoView({ block: 'start' });
})();
