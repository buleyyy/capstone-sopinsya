/* Peningkatan progresif untuk halaman Auditor. Semua fitur tetap berfungsi tanpa berkas ini
 * (filter lewat tombol Terapkan, cetak lewat Ctrl+P, bukti lewat tautan https). Tanpa inline script (CSP script-src 'self'). */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  // ---- Tampilkan/sembunyikan kata sandi (halaman Masuk) ----
  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    var input = document.getElementById(btn.getAttribute('data-toggle-password') || '');
    if (!input) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
    });
  });

  // ---- Unggah berkas Admin (sampul program & materi): mengisi kolom tujuan dengan /berkas/<id>/<nama> ----
  document.querySelectorAll('[data-upload]').forEach(function (slot) {
    var target = document.getElementById(slot.getAttribute('data-upload') || '');
    if (!target) return;
    var purpose = slot.getAttribute('data-purpose') || 'MATERIAL';
    var csrf = slot.getAttribute('data-csrf') || '';
    var preview = document.querySelector('[data-upload-preview="' + target.id + '"]');
    var label = document.createElement('label');
    label.className = 'btn outline small ad-pick';
    label.innerHTML = '<svg class="icon sm" aria-hidden="true"><use href="#i-upload"/></svg><span>Unggah File</span>';
    var input = document.createElement('input');
    input.type = 'file';
    input.className = 'au-file-input';
    input.accept = slot.getAttribute('data-accept') || '';
    label.appendChild(input);
    var status = document.createElement('span');
    status.className = 'au-attach-status';
    status.setAttribute('aria-live', 'polite');
    slot.appendChild(label);
    slot.appendChild(status);
    slot.hidden = false;
    var text = label.querySelector('span');
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      status.classList.remove('err');
      if (file.size > 5 * 1024 * 1024) { status.textContent = 'Ukuran berkas maksimal 5 MB.'; status.classList.add('err'); input.value = ''; return; }
      status.textContent = 'Mengunggah ' + file.name + '...';
      text.textContent = 'Mengunggah...';
      input.disabled = true;
      fetch('/admin/berkas', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name), 'X-CSRF-Token': csrf, 'X-Purpose': purpose },
        body: file
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Gagal mengunggah (kode ' + res.status + ').');
            return data;
          });
        })
        .then(function (data) {
          target.value = data.url;
          status.textContent = 'Terunggah: ' + data.name + '. Klik Simpan untuk menerapkan.';
          if (preview) { preview.src = data.url; preview.hidden = false; }
        })
        .catch(function (err) { status.textContent = err.message; status.classList.add('err'); })
        .then(function () { input.disabled = false; input.value = ''; text.textContent = 'Unggah File'; });
    });
  });
  document.querySelectorAll('[data-clear]').forEach(function (box) {
    var target = document.getElementById(box.getAttribute('data-clear') || '');
    if (!target) return;
    var original = target.value;
    box.addEventListener('change', function () { target.value = box.checked ? '' : original; });
  });

  // ---- Cetak / Simpan PDF ----
  document.querySelectorAll('[data-print]').forEach(function (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      window.print();
    });
  });

  // ---- Filter langsung pada Daftar Temuan ----
  var toolbar = document.querySelector('form.au-toolbar');
  if (toolbar) {
    toolbar.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        toolbar.submit();
      });
    });
    var search = toolbar.querySelector('input[type="search"]');
    if (search) {
      var timer = null;
      search.addEventListener('input', function () {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          toolbar.submit();
        }, 400);
      });
      // Setelah halaman dimuat ulang oleh pencarian, kembalikan kursor ke ujung teks.
      if (search.value) {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }
    }
  }

  // ---- Unggah bukti ----
  var MAX_BYTES = 5 * 1024 * 1024;
  var ALLOWED = /\.(pdf|png|jpe?g|webp|xlsx|docx)$/i;

  document.querySelectorAll('.au-attach').forEach(function (box) {
    var target = document.getElementById(box.getAttribute('data-target') || '');
    var picker = box.querySelector('input[type="file"]');
    var status = box.querySelector('.au-attach-status');
    var csrf = box.getAttribute('data-csrf') || '';
    if (!target || !picker || !status) return;
    var idle = status.textContent;

    function fail(message) {
      status.textContent = message;
      status.classList.add('err');
      picker.value = '';
    }

    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      status.classList.remove('err');
      if (!ALLOWED.test(file.name)) return fail('Jenis berkas tidak diizinkan (PDF, JPG, PNG, WEBP, XLSX, DOCX).');
      if (file.size > MAX_BYTES) return fail('Ukuran berkas maksimal 5 MB.');

      status.textContent = 'Mengunggah ' + file.name + '...';
      picker.disabled = true;
      fetch('/auditor/bukti', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Filename': encodeURIComponent(file.name),
          'X-CSRF-Token': csrf
        },
        body: file
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              if (!res.ok) throw new Error(data.error || 'Gagal mengunggah (kode ' + res.status + ').');
              return data;
            });
        })
        .then(function (data) {
          target.value = data.url;
          status.textContent = 'Terunggah: ' + data.name + ' (kosongkan kolom di atas untuk melepas)';
          picker.value = '';
        })
        .catch(function (err) {
          fail(err && err.message ? err.message : idle);
        })
        .then(function () {
          picker.disabled = false;
        });
    });
  });
})();
