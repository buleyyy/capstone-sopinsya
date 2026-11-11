/*
 * Peningkatan halaman peserta (tanpa framework, CSP-aman: tanpa gaya/skrip inline).
 *  - menandai <html> sebagai "js" (gerbang "Ikuti Pelatihan" aktif)
 *  - "Ikuti Pelatihan": riwayat program di localStorage browser (tanpa login)
 *  - Pre-test / Post-test dikerjakan di pop up; soal dan pengiriman lewat /api/public/* (server yang sama).
 *    Penilaian dilakukan server; peserta hanya menerima tanda terima, tanpa nilai.
 */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  var JOINED_KEY = "sopinsya:joined";
  var PERSON_KEY = "sopinsya.participant";

  // ---------- util ----------

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (k === "disabled" || k === "checked" || k === "required") n[k] = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  function fetchJson(url, options, timeoutMs) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs) : null;
    var init = options || {};
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init).then(
      function (res) {
        if (timer) clearTimeout(timer);
        return res.json().catch(function () { return null; }).then(function (body) { return { res: res, body: body }; });
      },
      function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      }
    );
  }

  // ---------- riwayat program yang diikuti ----------

  var memJoined = null;

  function readJoined() {
    if (memJoined) return memJoined;
    try {
      var v = JSON.parse(window.localStorage.getItem(JOINED_KEY) || "[]");
      if (Array.isArray(v)) return v.filter(function (x) { return typeof x === "string"; });
    } catch (e) { /* abaikan */ }
    return [];
  }

  function writeJoined(list) {
    memJoined = list;
    try { window.localStorage.setItem(JOINED_KEY, JSON.stringify(list)); } catch (e) { /* penyimpanan diblokir: berlaku selama halaman terbuka */ }
  }

  // ---------- data peserta (kemudahan: isi ulang nama/instansi) ----------

  function readPerson() {
    try {
      var v = JSON.parse(window.localStorage.getItem(PERSON_KEY) || "null");
      if (v && typeof v.participantName === "string" && typeof v.participantInstitution === "string") return v;
    } catch (e) { /* abaikan */ }
    return { participantName: "", participantInstitution: "" };
  }

  function savePerson(name, institution) {
    try { window.localStorage.setItem(PERSON_KEY, JSON.stringify({ participantName: name, participantInstitution: institution })); } catch (e) { /* abaikan */ }
  }

  // ---------- pop up tes ----------

  function openTest(cfg) {
    var kindLabel = cfg.kind === "pre" ? "Pre-test" : "Post-test";
    var saved = readPerson();
    var st = {
      load: null,
      phase: "identity", // identity | working | done
      name: saved.participantName,
      institution: saved.participantInstitution,
      formError: "",
      answers: {},
      confirmBlank: false,
      submitting: false,
      submitError: "",
      receipt: null,
      requestId: newId(),
      confirmExit: false
    };

    var dlg = el("dialog", { "class": "dlg dlg-test", "aria-labelledby": "dlg-title" });
    document.body.appendChild(dlg);

    function test() { return st.load && st.load.status === "ok" ? st.load.test : null; }
    function answeredCount() {
      var t = test();
      if (!t) return 0;
      return t.questions.filter(function (q) { return st.answers[q.id] !== undefined; }).length;
    }
    function dirty() { return st.phase === "working" && answeredCount() > 0 && !st.submitting; }
    function requestClose() {
      if (dirty()) { st.confirmExit = true; render(); } else { dlg.close(); }
    }

    function load() {
      st.load = null;
      render();
      var url = "/api/public/programs/" + encodeURIComponent(cfg.slug) + "/pertemuan/" + cfg.meeting + "/tests/" + cfg.kind;
      fetchJson(url, { cache: "no-store", headers: { Accept: "application/json" } }, 8000).then(
        function (r) {
          if (r.res.status === 404) st.load = { status: "not_found" };
          else if (!r.res.ok) st.load = { status: "error", message: "Server mengembalikan status " + r.res.status + "." };
          else if (!r.body || !r.body.success || !r.body.data) st.load = { status: "error", message: "Respons server tidak sesuai format." };
          else st.load = { status: "ok", test: r.body.data };
          render();
        },
        function () {
          st.load = { status: "error", message: "Tidak dapat terhubung ke server. Coba lagi beberapa saat." };
          render();
        }
      );
    }

    function submit() {
      var t = test();
      if (!t || st.submitting) return;
      st.submitting = true;
      st.submitError = "";
      st.confirmBlank = false;
      render();
      var payload = {
        participantName: st.name,
        participantInstitution: st.institution,
        clientRequestId: st.requestId,
        answers: t.questions.map(function (q) {
          return { questionId: q.id, optionId: st.answers[q.id] === undefined ? null : st.answers[q.id] };
        })
      };
      fetchJson("/api/public/tests/" + t.id + "/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      }, 10000).then(
        function (r) {
          st.submitting = false;
          if (r.res.ok && r.body && r.body.success && r.body.data) {
            st.receipt = r.body.data;
            st.phase = "done";
          } else {
            st.submitError = (r.body && r.body.error && r.body.error.message) || "Server mengembalikan status " + r.res.status + ".";
          }
          render();
        },
        function () {
          st.submitting = false;
          st.submitError = "Tidak dapat terhubung ke server. Jawaban Anda masih tersimpan di layar, coba lagi.";
          render();
        }
      );
    }

    // ----- potongan tampilan -----

    function subtitle() {
      if (st.phase === "done" && st.receipt) {
        return "Jawaban Anda sudah terkirim (" + st.receipt.answeredCount + " dari " + st.receipt.totalQuestions + " soal terjawab)";
      }
      if (!test()) return "";
      return st.phase === "identity" ? "Isi data diri untuk memulai" : "Selamat mengerjakan";
    }

    function headView() {
      return el("div", { "class": "dlg-head" }, [
        el("div", {}, [
          el("h2", { id: "dlg-title", text: kindLabel }),
          el("p", { "class": "dlg-sub", "aria-live": "polite", text: subtitle() })
        ]),
        el("button", { type: "button", "class": "icon-btn", "aria-label": "Tutup", onclick: requestClose, text: "✕" })
      ]);
    }

    function confirmExitView() {
      return el("div", { "class": "dlg-confirm-layer" }, [
        el("div", { "class": "dlg-confirm", role: "alertdialog", "aria-labelledby": "dlg-exit" }, [
          el("h3", { id: "dlg-exit", text: "Yakin Ingin Keluar Halaman?" }),
          el("p", { text: "Semua proses pengerjaan tidak akan tersimpan. Klik “Ya” jika setuju." }),
          el("div", { "class": "dlg-actions" }, [
            el("button", { type: "button", "class": "btn btn-outline", text: "Batalkan", onclick: function () { st.confirmExit = false; render(); } }),
            el("button", { type: "button", "class": "btn btn-primary", text: "Ya, Setuju", onclick: function () { dlg.close(); } })
          ])
        ])
      ]);
    }

    function identityView(t) {
      var nameInput = el("input", { id: "dlg-nama", type: "text", autocomplete: "name", maxlength: "120", value: st.name, "aria-invalid": st.formError && !st.name.trim() ? "true" : null });
      var instInput = el("input", { id: "dlg-instansi", type: "text", autocomplete: "organization", maxlength: "160", value: st.institution, "aria-invalid": st.formError && !st.institution.trim() ? "true" : null });
      nameInput.value = st.name;
      instInput.value = st.institution;
      return el("form", {
        "class": "dlg-form",
        novalidate: true,
        onsubmit: function (e) {
          e.preventDefault();
          var n = nameInput.value.trim();
          var i = instInput.value.trim();
          st.name = n;
          st.institution = i;
          if (!n || !i) { st.formError = "Nama dan instansi wajib diisi."; render(); return; }
          st.formError = "";
          savePerson(n, i);
          st.phase = "working";
          render();
        }
      }, [
        el("p", { "class": "note", text: kindLabel + " " + cfg.title + " terdiri dari " + t.questions.length + " soal. Nama dan instansi dipakai agar hasil Anda dapat dicatat oleh penyelenggara." }),
        el("div", { "class": "form-row" }, [el("label", { "for": "dlg-nama", text: "Nama" }), nameInput]),
        el("div", { "class": "form-row" }, [el("label", { "for": "dlg-instansi", text: "Instansi" }), instInput]),
        st.formError ? el("p", { "class": "form-error", role: "alert", text: st.formError }) : null,
        el("div", { "class": "dlg-actions" }, [el("button", { type: "submit", "class": "btn btn-primary", text: "Mulai" })])
      ]);
    }

    function progressView(t) {
      var total = t.questions.length;
      var shown = st.phase === "done" ? total : answeredCount();
      var bar = el("span", {});
      bar.style.width = (total > 0 ? (shown / total) * 100 : 0) + "%";
      return el("div", { "class": "dlg-progress" }, [
        el("div", { "class": "dlg-progress-row" }, [
          el("strong", { text: cfg.title }),
          el("span", { text: "Soal " + shown + " dari " + total })
        ]),
        el("div", { "class": "progress", role: "progressbar", "aria-label": "Jumlah soal terjawab", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(shown) }, [bar])
      ]);
    }

    function questionsView(t) {
      return el("div", { "class": "dlg-body" }, t.questions.map(function (q, qi) {
        var selected = st.answers[q.id];
        return el("fieldset", { "class": "question" }, [
          el("legend", { "class": "sr-only", text: "Pertanyaan " + (qi + 1) }),
          el("span", { "class": "qtag", "aria-hidden": "true", text: "Pertanyaan " + (qi + 1) }),
          el("p", { "class": "q-text", text: q.text }),
          el("div", { "class": "options" }, q.options.map(function (opt) {
            var cls = "option" + (selected === opt.id ? " selected" : "") + (st.phase === "done" ? " locked" : "");
            return el("label", { "class": cls }, [
              el("input", {
                type: "radio",
                "class": "sr-only",
                name: "q" + q.id,
                checked: selected === opt.id,
                disabled: st.phase === "done" || st.submitting,
                onchange: function () { st.answers[q.id] = opt.id; st.confirmBlank = false; render(); }
              }),
              el("span", { "class": "option-label", text: "Opsi " + opt.label }),
              el("span", { "class": "option-text", text: opt.text })
            ]);
          }))
        ]);
      }));
    }

    function footView(t) {
      if (st.phase === "done") {
        return el("div", { "class": "dlg-foot" }, [
          el("p", { "class": "score", text: "Terima kasih, jawaban Anda sudah tersimpan. Hasil penilaian dikelola oleh penyelenggara pelatihan." }),
          el("button", {
            type: "button", "class": "btn btn-primary", text: "Ulang",
            onclick: function () {
              st.requestId = newId(); st.answers = {}; st.receipt = null; st.confirmBlank = false; st.submitError = ""; st.phase = "working"; render();
            }
          })
        ]);
      }
      var blanks = t.questions.length - answeredCount();
      var kids = [];
      if (st.confirmBlank) {
        kids.push(el("div", { "class": "confirm-box", role: "alert" }, [
          el("p", { text: blanks + " dari " + t.questions.length + " soal belum dijawab. Soal yang kosong dihitung salah." }),
          el("div", { "class": "dlg-actions" }, [
            el("button", { type: "button", "class": "btn btn-outline", text: "Kembali mengerjakan", disabled: st.submitting, onclick: function () { st.confirmBlank = false; render(); } }),
            el("button", { type: "button", "class": "btn btn-primary", text: st.submitting ? "Mengirim..." : "Tetap selesai", disabled: st.submitting, onclick: submit })
          ])
        ]));
      }
      if (st.submitError) kids.push(el("p", { "class": "form-error", role: "alert", text: st.submitError }));
      if (!st.confirmBlank) {
        kids.push(el("div", { "class": "dlg-actions" }, [
          el("button", {
            type: "button", "class": "btn btn-outline", text: "Reset", disabled: st.submitting || answeredCount() === 0,
            onclick: function () { st.answers = {}; st.confirmBlank = false; st.submitError = ""; render(); }
          }),
          el("button", {
            type: "button", "class": "btn btn-primary", text: st.submitting ? "Mengirim..." : "Selesai", disabled: st.submitting,
            onclick: function () { if (blanks > 0) { st.confirmBlank = true; render(); } else { submit(); } }
          })
        ]));
      }
      return el("div", { "class": "dlg-foot" }, kids);
    }

    function render() {
      var prev = dlg.querySelector(".dlg-body");
      var scroll = prev ? prev.scrollTop : 0;
      dlg.textContent = "";
      var t = test();
      dlg.classList.toggle("dlg-tall", !!t && st.phase !== "identity");

      if (st.confirmExit) dlg.appendChild(confirmExitView());
      dlg.appendChild(headView());

      if (st.load === null) {
        dlg.appendChild(el("div", { "class": "dlg-body" }, [el("p", { "class": "note", role: "status", text: "Memuat soal..." })]));
      } else if (st.load.status === "not_found") {
        dlg.appendChild(el("div", { "class": "dlg-body" }, [el("p", { "class": "note", text: "Soal untuk " + kindLabel.toLowerCase() + " ini belum tersedia." })]));
      } else if (st.load.status === "error") {
        dlg.appendChild(el("div", { "class": "dlg-body" }, [el("p", { "class": "form-error", role: "alert", text: st.load.message })]));
        dlg.appendChild(el("div", { "class": "dlg-foot" }, [el("button", { type: "button", "class": "btn btn-primary", text: "Coba lagi", onclick: load })]));
      } else if (st.phase === "identity") {
        dlg.appendChild(identityView(t));
      } else {
        dlg.appendChild(progressView(t));
        dlg.appendChild(questionsView(t));
        dlg.appendChild(footView(t));
      }

      var body = dlg.querySelector(".dlg-body");
      if (body && scroll) body.scrollTop = scroll;
    }

    dlg.addEventListener("cancel", function (e) { e.preventDefault(); requestClose(); });
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.showModal();
    load();
  }

  // ---------- halaman detail program ----------

  function initProgram() {
    var pd = document.querySelector(".pd");
    if (!pd) return;
    var slug = pd.getAttribute("data-program-slug") || "";
    var title = pd.getAttribute("data-program-title") || "";

    function apply() { pd.classList.toggle("is-joined", readJoined().indexOf(slug) !== -1); }
    apply();

    Array.prototype.forEach.call(pd.querySelectorAll("[data-join]"), function (btn) {
      btn.addEventListener("click", function () {
        var list = readJoined();
        if (list.indexOf(slug) === -1) writeJoined(list.concat([slug]));
        apply();
      });
    });

    Array.prototype.forEach.call(pd.querySelectorAll("[data-test]"), function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-test");
        var meeting = Number(btn.getAttribute("data-meeting"));
        if ((kind !== "pre" && kind !== "post") || !meeting) return;
        openTest({ slug: slug, title: title, meeting: meeting, kind: kind });
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initProgram);
  else initProgram();
})();
