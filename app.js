// Planning médecins ACP – CH Valenciennes
// Page unique : données dans Firestore sous /espaces/{code du service}/...
const CFG = window.PLANNING_CONFIG;
const MEDS = CFG.medecins;
const FB_VERSION = "10.12.2";
const DEMO = !CFG.firebase || !CFG.firebase.apiKey || CFG.firebase.apiKey === "A_REMPLIR";

// ------------------------------------------------------------------ statuts
const STATUTS = [
  { id: "ABS", label: "ABS (absent)" },
  { id: "TP", label: "TP (temps partiel)" },
  { id: "RCP", label: "RCP" },
  { id: "TLT", label: "TLT (télétravail)" },
  { id: "CONGRES", label: "Congrès" },
  { id: "FRAIS", label: "Frais médical" },
  { id: "MW", label: "MW" },
  { id: "SCREEN", label: "Screen" }
];
const STATUT_LABEL = Object.fromEntries(STATUTS.map(s => [s.id, s.label]));
// colonnes de la grille Word
const COLS = [
  { key: "FRAIS", titre: "Frais<br>médical", cls: "col-frais", st: ["FRAIS"] },
  { key: "MW", titre: "MW", cls: "col-mw", st: ["MW"] },
  { key: "ABS", titre: "ABS", cls: "col-abs gris", st: ["ABS", "CONGRES"] },
  { key: "TP", titre: "TP", cls: "col-tp gris", st: ["TP"] },
  { key: "TLT", titre: "TLT", cls: "col-tlt", st: ["TLT"] },
  { key: "RCP", titre: "RCP", cls: "col-rcp", st: ["RCP"] }
];
const SLOTS = ["M", "AM"];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

// ------------------------------------------------------------------ dates (en UTC pour éviter les décalages)
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const frDate = d => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;

function isoWeek(d) {
  const t = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = utc(t.getUTCFullYear(), 0, 4);
  const w = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return { year: t.getUTCFullYear(), week: w };
}
const weekId = (y, w) => `${y}-W${pad(w)}`;
function mondayOf(y, w) {
  const jan4 = utc(y, 0, 4);
  const mon1 = addDays(jan4, -((jan4.getUTCDay() + 6) % 7));
  return addDays(mon1, (w - 1) * 7);
}
function parseWeekId(id) { const [y, w] = id.split("-W").map(Number); return { year: y, week: w }; }
function shiftWeek(id, n) { const { year, week } = parseWeekId(id); const m = addDays(mondayOf(year, week), 7 * n); const r = isoWeek(m); return weekId(r.year, r.week); }
function todayWeekId() { const n = new Date(); const r = isoWeek(utc(n.getFullYear(), n.getMonth(), n.getDate())); return weekId(r.year, r.week); }
function weekDays(id) { const { year, week } = parseWeekId(id); const m = mondayOf(year, week); return [0, 1, 2, 3, 4].map(i => addDays(m, i)); }

// ------------------------------------------------------------------ jours fériés français
const ferieCache = {};
function feries(y) {
  if (ferieCache[y]) return ferieCache[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
    f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mois = Math.floor((h + l - 7 * m + 114) / 31) - 1, jour = ((h + l - 7 * m + 114) % 31) + 1;
  const paques = utc(y, mois, jour);
  const list = {
    [iso(utc(y, 0, 1))]: "Jour de l'an",
    [iso(addDays(paques, 1))]: "Lundi de Pâques",
    [iso(utc(y, 4, 1))]: "Fête du Travail",
    [iso(utc(y, 4, 8))]: "Victoire 1945",
    [iso(addDays(paques, 39))]: "Ascension",
    [iso(utc(y, 6, 14))]: "Fête nationale",
    [iso(utc(y, 7, 15))]: "Assomption",
    [iso(utc(y, 10, 1))]: "Toussaint",
    [iso(utc(y, 10, 11))]: "Armistice 1918",
    [iso(utc(y, 11, 25))]: "Noël"
  };
  if (CFG.lundiPentecoteFerie !== false) list[iso(addDays(paques, 50))] = "Lundi de Pentecôte";
  return (ferieCache[y] = list);
}
const ferieName = d => feries(d.getUTCFullYear())[iso(d)] || null;

// ------------------------------------------------------------------ valeurs par défaut (TP fixes, roulement RCP)
function defaultFor(dateObj, med, slot, wid) {
  const dow = (dateObj.getUTCDay() + 6) % 7 + 1; // 1 = lundi
  for (const tp of CFG.tempsPartiels || []) {
    if (tp.medecin === med && tp.jour === dow && (tp.creneau === "J" || tp.creneau === slot)) return "TP";
  }
  const { week } = parseWeekId(wid);
  for (const r of CFG.rcpRoulement || []) {
    if (r.jour === dow && (r.creneau === "J" || r.creneau === slot) && r.rotation && r.rotation.length) {
      if (r.rotation[week % r.rotation.length] === med) return "RCP";
    }
  }
  return "";
}
function stored(wk, date, med, slot) { return wk?.jours?.[date]?.[med]?.[slot] ?? null; }
function eff(wk, dateObj, med, slot, wid) {
  const s = stored(wk, iso(dateObj), med, slot);
  if (s === "PRESENT") return "";
  if (s) return s;
  return defaultFor(dateObj, med, slot, wid);
}

// ------------------------------------------------------------------ stockage (Firestore ou démo locale)
let store;
async function makeFirestoreStore(code) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const app = initializeApp(CFG.firebase);
  const db = fs.getFirestore(app);
  const wref = id => fs.doc(db, "espaces", code, "semaines", id);
  const pref = () => fs.doc(db, "espaces", code, "config", "params");
  const toDel = v => (v === null || v === undefined ? fs.deleteField() : v);
  return {
    async check() { await fs.getDoc(pref()); },
    subscribeWeek(id, cb, onErr) { return fs.onSnapshot(wref(id), s => cb(s.exists() ? s.data() : {}), onErr); },
    async setSlots(id, changes) { // changes : [{date, med, slot, val}]
      const jours = {};
      for (const c of changes) ((jours[c.date] ??= {})[c.med] ??= {})[c.slot] = toDel(c.val);
      await fs.setDoc(wref(id), { jours, maj: fs.serverTimestamp() }, { merge: true });
    },
    async setNb(id, date, val) { await fs.setDoc(wref(id), { nb: { [date]: toDel(val) }, maj: fs.serverTimestamp() }, { merge: true }); },
    async setField(id, field, val) { await fs.setDoc(wref(id), { [field]: val, maj: fs.serverTimestamp() }, { merge: true }); },
    async yearWeeks(y) {
      const q = fs.query(fs.collection(db, "espaces", code, "semaines"),
        fs.where(fs.documentId(), ">=", `${y}-W00`), fs.where(fs.documentId(), "<=", `${y}-W99`));
      const snap = await fs.getDocs(q);
      const out = {}; snap.forEach(d => (out[d.id] = d.data())); return out;
    },
    async getParams() { const s = await fs.getDoc(pref()); return s.exists() ? s.data() : {}; },
    async setParams(p) { await fs.setDoc(pref(), p); }
  };
}
function makeDemoStore() {
  const K = "planningACP_demo";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || { semaines: {}, params: {} }; } catch { return { semaines: {}, params: {} }; } };
  const save = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
  const listeners = {};
  const emit = id => (listeners[id] || []).forEach(cb => cb(structuredClone(load().semaines[id] || {})));
  const mut = (id, fn) => { const d = load(); const w = (d.semaines[id] ??= {}); fn(w); save(d); emit(id); };
  return {
    async check() {},
    subscribeWeek(id, cb) { (listeners[id] ??= []).push(cb); cb(structuredClone(load().semaines[id] || {})); return () => (listeners[id] = listeners[id].filter(x => x !== cb)); },
    async setSlots(id, changes) {
      mut(id, w => { for (const c of changes) { const o = ((w.jours ??= {})[c.date] ??= {})[c.med] ??= {}; if (c.val == null) delete o[c.slot]; else o[c.slot] = c.val; } });
    },
    async setNb(id, date, val) { mut(id, w => { w.nb ??= {}; if (val == null) delete w.nb[date]; else w.nb[date] = val; }); },
    async setField(id, field, val) { mut(id, w => (w[field] = val)); },
    async yearWeeks(y) { const s = load().semaines; return Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith(y + "-W"))); },
    async getParams() { return load().params || {}; },
    async setParams(p) { const d = load(); d.params = p; save(d); }
  };
}

// ------------------------------------------------------------------ état
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNb = n => String(Math.round(n * 10) / 10).replace(".", ",");
const state = { wid: todayWeekId(), week: {}, unsub: null, tab: "grille", regle: { ...CFG.regleRepartition } };
const LS = { get: k => { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch { return null; } } };

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
function showErr(e) {
  console.error(e);
  const b = $("#errBanner");
  b.textContent = (e && e.code === "permission-denied")
    ? "Accès refusé par le serveur (code incorrect, ou semaine figée)."
    : "Erreur : " + (e?.message || e);
  b.classList.remove("hidden"); setTimeout(() => b.classList.add("hidden"), 6000);
}
const isFige = () => !!state.week.fige;

// ------------------------------------------------------------------ calculs
function nbRepart(dateObj) {
  let n = 0; const detail = {};
  for (const m of MEDS) {
    const on = SLOTS.map(s => { const st = eff(state.week, dateObj, m, s, state.wid); return !st || !state.regle[st]; });
    const v = on.filter(Boolean).length * 0.5;
    detail[m] = v; detail[m + "_slots"] = on; n += v;
  }
  return { n, detail };
}
function cellItems(dateObj, statuts) {
  const items = [];
  for (const m of MEDS) {
    const st = SLOTS.map(s => eff(state.week, dateObj, m, s, state.wid));
    const hit = st.map(x => statuts.includes(x));
    if (!hit[0] && !hit[1]) continue;
    const q = [];
    if (hit[0] && !hit[1]) q.push("mat.");
    if (!hit[0] && hit[1]) q.push("ap.-m.");
    if (st.includes("CONGRES") && statuts.includes("CONGRES")) q.push("congrès");
    items.push(`<span class="it">${esc(m)}${q.length ? ` <span class="q">(${q.join(", ")})</span>` : ""}</span>`);
  }
  return `<span class="v">${items.join("")}</span>`;
}

// ------------------------------------------------------------------ rendu : grille
let repartHtml = "";
function renderGrille() {
  const { year, week } = parseWeekId(state.wid);
  const days = weekDays(state.wid);
  let h = `<table class="grille"><colgroup><col class="col-jour">` + COLS.map(c => `<col class="${c.cls.split(" ")[0]}">`).join("") +
    `<col class="col-rep"><col class="col-nb"><col class="col-scr"></colgroup><thead>
    <tr class="titre"><th colspan="10">SEMAINE ${pad(week)}/${year}</th></tr>
    <tr class="cols"><th></th>${COLS.map(c => `<th class="${c.cls.includes("gris") ? "gris" : ""}">${c.titre}</th>`).join("")}
    <th colspan="2">Nb répart.</th><th>Screen</th></tr></thead><tbody>`;
  days.forEach((d, i) => {
    const date = iso(d); const fer = ferieName(d);
    if (fer) { h += `<tr class="ferie"><td colspan="10">${JOURS[i].toUpperCase()} ${frDate(d)} – FÉRIÉ (${esc(fer)})</td></tr>`; return; }
    const { n, detail } = nbRepart(d);
    const man = state.week.nb?.[date];
    h += `<tr><td class="jour">${JOURS[i].toUpperCase()}<br>${frDate(d)}</td>`;
    for (const c of COLS) {
      h += `<td class="val ${c.cls.includes("gris") ? "gris" : ""} ${c.key === "FRAIS" ? "frais" : ""}" data-l="${c.titre.replace("<br>", " ")}" ${c.key === "FRAIS" ? `data-date="${date}"` : ""}>${cellItems(d, c.st)}</td>`;
    }
    h += `<td data-l="Présents"><div class="nbbox">${MEDS.map(m => `<span class="${detail[m] >= 1 ? "full" : detail[m] > 0 ? "half" : ""}" title="${detail[m] >= 1 ? "reçoit des cas" : detail[m] > 0 ? "reçoit des cas une demi-journée" : "pas de cas"}">${esc(m)}</span>`).join("")}</div></td>`;
    h += `<td class="nb" data-l="Nb répart." data-date="${date}" data-auto="${n}">${fmtNb(man ?? n)}${man != null ? `<span class="man">manuel</span>` : ""}</td>`;
    h += `<td class="val" data-l="Screen">${cellItems(d, ["SCREEN"])}</td></tr>`;
  });
  h += `</tbody></table>`;
  repartHtml = days.filter(d => !ferieName(d)).map(d => {
    const { n, detail } = nbRepart(d); const man = state.week.nb?.[iso(d)];
    const qui = MEDS.filter(m => detail[m] > 0).map(m => {
      const [a, b] = detail[m + "_slots"]; return a && b ? esc(m) : `${esc(m)} <span class="q">(${a ? "mat." : "ap.-m."})</span>`;
    });
    const non = MEDS.filter(m => detail[m] === 0);
    return `<tr><td><strong>${JOURS[(d.getUTCDay() + 6) % 7]} ${frDate(d)}</strong></td><td class="n">${fmtNb(man ?? n)}</td>
      <td>${qui.join(", ") || "—"}${non.length ? `<div class="muted small">Pas de cas : ${non.map(esc).join(", ")}</div>` : ""}</td></tr>`;
  }).join("");
  if (state.week.notes) h += `<div class="notes-print">${esc(state.week.notes)}</div>`;
  $("#grilleWrap").innerHTML = h;
  $("#repartWrap").innerHTML = repartHtml ? `<table class="repart"><thead><tr><th>Jour</th><th>Nb</th><th>Répartir à</th></tr></thead><tbody>${repartHtml}</tbody></table>` : `<p class="muted">Semaine entièrement fériée.</p>`;
  document.body.classList.toggle("fige-on", isFige());
  $("#figeBanner").classList.toggle("hidden", !isFige());
  $("#btnFiger").textContent = isFige() ? "Défiger la semaine" : "Figer la semaine";
  $("#btnProposer").disabled = isFige();
  $("#btnNotes").disabled = isFige(); $("#notes").disabled = isFige();
  if (document.activeElement !== $("#notes")) $("#notes").value = state.week.notes || "";
}

// ------------------------------------------------------------------ rendu : saisie
function me() { const v = LS.get("planningACP_me"); return MEDS.includes(v) ? v : MEDS[0]; }
function optList(sel, withMixte) {
  const o = [`<option value="">— Présent</option>`];
  if (withMixte) o.push(`<option value="__mixte" disabled>(matin ≠ après-midi)</option>`);
  for (const s of STATUTS) o.push(`<option value="${s.id}">${s.label}</option>`);
  return o.join("").replace(`value="${sel}"`, `value="${sel}" selected`);
}
function renderSaisie() {
  const m = me(); const days = weekDays(state.wid);
  $("#meSel").value = m;
  $("#figeBanner2").classList.toggle("hidden", !isFige());
  let h = `<table class="saisie"><thead><tr><th>Jour</th><th>Journée</th><th>Matin</th><th>Après-midi</th></tr></thead><tbody>`;
  days.forEach((d, i) => {
    const date = iso(d); const fer = ferieName(d);
    if (fer) { h += `<tr class="ferie"><td>${JOURS[i]} ${frDate(d)}</td><td colspan="3">Férié – ${esc(fer)}</td></tr>`; return; }
    const [vm, va] = SLOTS.map(s => eff(state.week, d, m, s, state.wid));
    const [dm, da] = SLOTS.map(s => defaultFor(d, m, s, state.wid));
    const dis = isFige() ? "disabled" : "";
    const defTxt = s => s ? `<div class="def">par défaut : ${STATUT_LABEL[s]}</div>` : "";
    h += `<tr><td>${JOURS[i]} ${frDate(d)}</td>
      <td data-l="Journée"><select data-date="${date}" data-slot="J" ${dis}>${optList(vm === va ? vm : "__mixte", vm !== va)}</select></td>
      <td data-l="Matin"><select data-date="${date}" data-slot="M" ${dis}>${optList(vm)}</select>${defTxt(dm)}</td>
      <td data-l="Après-midi"><select data-date="${date}" data-slot="AM" ${dis}>${optList(va)}</select>${defTxt(da)}</td></tr>`;
  });
  $("#saisieWrap").innerHTML = h + `</tbody></table>`;
}
function changeFor(dateObj, med, slot, val) {
  const def = defaultFor(dateObj, med, slot, state.wid);
  let v; if (val === def) v = null; else if (val === "") v = "PRESENT"; else v = val;
  return { date: iso(dateObj), med, slot, val: v };
}
async function onSaisieChange(e) {
  const sel = e.target; if (!sel.matches("select[data-date]")) return;
  const date = sel.dataset.date; const d = new Date(date + "T00:00:00Z"); const m = me();
  const slots = sel.dataset.slot === "J" ? SLOTS : [sel.dataset.slot];
  try { await store.setSlots(state.wid, slots.map(s => changeFor(d, m, s, sel.value))); toast("Enregistré"); }
  catch (err) { showErr(err); }
}

// ------------------------------------------------------------------ frais médical
function fraisHolders(dateObj) { return MEDS.filter(m => SLOTS.some(s => eff(state.week, dateObj, m, s, state.wid) === "FRAIS")); }
function fraisChanges(dateObj, med) { // retire l'ancien titulaire, pose le nouveau (journée)
  const ch = [];
  for (const old of fraisHolders(dateObj)) if (old !== med) for (const s of SLOTS) if (eff(state.week, dateObj, old, s, state.wid) === "FRAIS") ch.push(changeFor(dateObj, old, s, ""));
  if (med) for (const s of SLOTS) ch.push(changeFor(dateObj, med, s, "FRAIS"));
  return ch;
}
const libre = (dateObj, m) => SLOTS.every(s => !eff(state.week, dateObj, m, s, state.wid));
function openFraisDialog(date) {
  if (isFige()) return;
  const d = new Date(date + "T00:00:00Z"); const cur = fraisHolders(d)[0] || "";
  const opts = MEDS.map(m => `<option value="${m}" ${m === cur ? "selected" : ""}>${m}${libre(d, m) || m === cur ? "" : " (indisponible)"}</option>`).join("");
  dialog(`<h3>Frais médical – ${JOURS[(d.getUTCDay() + 6) % 7]} ${frDate(d)}</h3>
    <select name="med" style="width:100%"><option value="">— Personne</option>${opts}</select>`,
    async f => { try { await store.setSlots(state.wid, fraisChanges(d, f.med.value)); toast("Enregistré"); } catch (e) { showErr(e); } });
}
async function proposer() {
  if (isFige()) return;
  const { year } = parseWeekId(state.wid);
  let hist = {};
  try { hist = await store.yearWeeks(year); } catch (e) { showErr(e); return; }
  const count = Object.fromEntries(MEDS.map(m => [m, 0]));
  for (const [id, w] of Object.entries(hist)) {
    if (id === state.wid) continue;
    for (const d of weekDays(id)) for (const m of MEDS) for (const s of SLOTS) if (eff(w, d, m, s, id) === "FRAIS") count[m] += 0.5;
  }
  const exclus = new Set(CFG.fraisExclus || []);
  const semaine = Object.fromEntries(MEDS.map(m => [m, 0]));
  const days = weekDays(state.wid).filter(d => !ferieName(d));
  days.forEach(d => fraisHolders(d).forEach(m => semaine[m]++));
  const prop = []; const changes = [];
  for (const d of days) {
    if (fraisHolders(d).length) continue;
    const cands = MEDS.filter(m => !exclus.has(m) && libre(d, m));
    if (!cands.length) { prop.push(`${JOURS[(d.getUTCDay() + 6) % 7]} ${frDate(d)} : personne de disponible`); continue; }
    cands.sort((a, b) => (semaine[a] - semaine[b]) || (count[a] - count[b]) || (Math.random() - 0.5));
    const m = cands[0]; semaine[m]++; count[m]++;
    prop.push(`${JOURS[(d.getUTCDay() + 6) % 7]} ${frDate(d)} : <strong>${m}</strong>`);
    for (const s of SLOTS) changes.push(changeFor(d, m, s, "FRAIS"));
  }
  if (!prop.length) { toast("Tous les jours ont déjà un frais médical"); return; }
  dialog(`<h3>Proposition de frais médical</h3>
    <p class="small muted">Médecins libres toute la journée, en priorité ceux qui en ont fait le moins cette année. Les jours déjà attribués ne changent pas.</p>
    <p>${prop.join("<br>")}</p>`,
    async () => { if (!changes.length) return; try { await store.setSlots(state.wid, changes); toast("Proposition appliquée"); } catch (e) { showErr(e); } },
    changes.length ? "Appliquer" : null);
}

// ------------------------------------------------------------------ nb répart. manuel
function openNbDialog(td) {
  if (isFige()) return;
  const date = td.dataset.date; const auto = Number(td.dataset.auto); const man = state.week.nb?.[date];
  dialog(`<h3>Nb répart. – ${frDate(new Date(date + "T00:00:00Z"))}</h3>
    <p class="small muted">Calcul automatique : <strong>${fmtNb(auto)}</strong>. Saisissez une autre valeur pour la forcer, ou videz le champ pour revenir au calcul.</p>
    <input name="nb" inputmode="decimal" value="${man != null ? fmtNb(man) : ""}" style="width:100%">`,
    async f => {
      const raw = f.nb.value.trim().replace(",", ".");
      const v = raw === "" ? null : Number(raw);
      if (v !== null && !(v >= 0 && v <= 99)) { toast("Valeur invalide"); return; }
      try { await store.setNb(state.wid, date, v); toast("Enregistré"); } catch (e) { showErr(e); }
    });
}

// ------------------------------------------------------------------ dialogue générique
function dialog(html, onOk, okLabel = "Valider") {
  const dlg = $("#dlg"); const f = $("#dlgForm");
  f.innerHTML = html + `<div class="row">${okLabel ? `<button class="primary" value="ok">${okLabel}</button>` : ""}<button value="cancel" formnovalidate>${okLabel ? "Annuler" : "Fermer"}</button></div>`;
  dlg.onclose = () => { if (dlg.returnValue === "ok") onOk(f); };
  dlg.returnValue = ""; dlg.showModal();
}

// ------------------------------------------------------------------ bilan
async function renderBilan() {
  const y = Number($("#bilanYear").value);
  $("#bilanWrap").innerHTML = `<p class="muted">Chargement…</p>`;
  let weeks; try { weeks = await store.yearWeeks(y); } catch (e) { showErr(e); return; }
  const keys = ["FRAIS", "MW", "SCREEN", "RCP", "TLT"];
  const t = Object.fromEntries(MEDS.map(m => [m, Object.fromEntries(keys.map(k => [k, 0]))]));
  for (const [id, w] of Object.entries(weeks)) for (const d of weekDays(id)) {
    if (ferieName(d) || d.getUTCFullYear() !== y) continue;
    for (const m of MEDS) for (const s of SLOTS) { const st = eff(w, d, m, s, id); if (keys.includes(st)) t[m][st] += 0.5; }
  }
  $("#bilanWrap").innerHTML = `<table class="simple"><thead><tr><th>Médecin</th>${keys.map(k => `<th>${STATUT_LABEL[k].split(" (")[0]}</th>`).join("")}</tr></thead><tbody>` +
    MEDS.map(m => `<tr><td>${m}</td>${keys.map(k => `<td>${fmtNb(t[m][k])}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
}

// ------------------------------------------------------------------ paramètres
function renderParams() {
  $("#regleWrap").innerHTML = STATUTS.map(s => `<label class="chk"><input type="checkbox" data-st="${s.id}" ${state.regle[s.id] ? "checked" : ""}> ${s.label}</label>`).join("");
  const r = CFG.rcpRoulement || [];
  $("#rcpWrap").innerHTML = r.length
    ? `<table class="simple"><thead><tr><th>RCP</th><th>Jour</th><th>Créneau</th><th>Rotation</th></tr></thead><tbody>${r.map(x => `<tr><td>${esc(x.nom)}</td><td>${JOURS[x.jour - 1] || "?"}</td><td>${x.creneau}</td><td>${esc((x.rotation || []).join(" → "))}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted small">À venir : le roulement sera ajouté dans <code>config.js</code> (rubrique <code>rcpRoulement</code>). Les RCP seront alors préremplies automatiquement, comme les temps partiels.</p>`;
}

// ------------------------------------------------------------------ navigation
function render() {
  const days = weekDays(state.wid); const { week, year } = parseWeekId(state.wid);
  $("#wLabel").textContent = `Semaine ${week} / ${year}`;
  $("#wDates").textContent = `du ${frDate(days[0])} au ${frDate(days[4])}`;
  if (state.tab === "grille") renderGrille();
  if (state.tab === "saisie") renderSaisie();
}
function loadWeek(id) {
  state.wid = id; state.week = {};
  if (state.unsub) state.unsub();
  state.unsub = store.subscribeWeek(id, data => { state.week = data || {}; render(); }, showErr);
  render();
}
function setTab(t) {
  state.tab = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  for (const s of ["grille", "saisie", "bilan", "params"]) $("#tab-" + s).classList.toggle("hidden", s !== t);
  if (t === "bilan") renderBilan();
  if (t === "params") renderParams();
  render();
}

// ------------------------------------------------------------------ démarrage
async function start(code) {
  store = DEMO ? makeDemoStore() : await makeFirestoreStore(code);
  await store.check(); // lève permission-denied si le code est faux
  try { const p = await store.getParams(); if (p.regle) state.regle = { ...CFG.regleRepartition, ...p.regle }; } catch {}
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#demoBanner").classList.toggle("hidden", !DEMO);
  $("#meSel").innerHTML = MEDS.map(m => `<option>${m}</option>`).join("");
  const y = new Date().getFullYear();
  $("#bilanYear").innerHTML = [y - 1, y, y + 1].map(v => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("");
  const h = location.hash.match(/^#(\d{4}-W\d{2})$/);
  loadWeek(h ? h[1] : todayWeekId());
}

function bind() {
  $("#prevW").onclick = () => { loadWeek(shiftWeek(state.wid, -1)); history.replaceState(null, "", "#" + state.wid); };
  $("#nextW").onclick = () => { loadWeek(shiftWeek(state.wid, 1)); history.replaceState(null, "", "#" + state.wid); };
  $("#todayW").onclick = () => { loadWeek(todayWeekId()); history.replaceState(null, "", "#" + state.wid); };
  $("#tabs").onclick = e => { const b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); };
  $("#grilleWrap").onclick = e => {
    const f = e.target.closest("td.frais"); if (f) return openFraisDialog(f.dataset.date);
    const n = e.target.closest("td.nb"); if (n) return openNbDialog(n);
  };
  $("#saisieWrap").onchange = onSaisieChange;
  $("#meSel").onchange = e => { try { localStorage.setItem("planningACP_me", e.target.value); } catch {} renderSaisie(); };
  $("#btnProposer").onclick = proposer;
  $("#btnFiger").onclick = async () => {
    const v = !isFige();
    if (v && !confirm("Figer cette semaine ? Plus personne ne pourra la modifier tant qu'elle n'est pas défigée.")) return;
    try { await store.setField(state.wid, "fige", v); toast(v ? "Semaine figée" : "Semaine défigée"); } catch (e) { showErr(e); }
  };
  $("#btnPrint").onclick = () => { if (state.tab !== "grille") setTab("grille"); window.print(); };
  $("#btnNotes").onclick = async () => { try { await store.setField(state.wid, "notes", $("#notes").value.slice(0, 1000)); toast("Remarques enregistrées"); } catch (e) { showErr(e); } };
  $("#bilanYear").onchange = renderBilan;
  $("#btnRegle").onclick = async () => {
    const r = {}; document.querySelectorAll("#regleWrap input").forEach(i => (r[i.dataset.st] = i.checked));
    try { await store.setParams({ regle: r }); state.regle = r; toast("Règle enregistrée"); } catch (e) { showErr(e); }
  };
  $("#btnRegleDef").onclick = async () => {
    try { await store.setParams({}); state.regle = { ...CFG.regleRepartition }; renderParams(); toast("Valeurs par défaut rétablies"); } catch (e) { showErr(e); }
  };
  $("#btnLogout").onclick = () => {
    try { localStorage.removeItem("planningACP_code"); sessionStorage.removeItem("planningACP_code"); } catch {}
    location.reload();
  };
  $("#codeBtn").onclick = tryCode;
  $("#codeInput").onkeydown = e => { if (e.key === "Enter") tryCode(); };
}

async function tryCode() {
  const code = $("#codeInput").value.trim();
  const err = $("#codeErr"); err.classList.add("hidden");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) { err.textContent = "Code invalide (8 caractères minimum : lettres, chiffres, - ou _)."; err.classList.remove("hidden"); return; }
  try {
    await start(code);
    try { ($("#codeRemember").checked ? localStorage : sessionStorage).setItem("planningACP_code", code); } catch {}
  } catch (e) {
    console.error(e);
    err.textContent = e?.code === "permission-denied" ? "Code incorrect." : "Connexion impossible : " + (e?.message || e);
    err.classList.remove("hidden");
  }
}

bind();
(async () => {
  if (DEMO) { await start("demo"); return; }
  const saved = LS.get("planningACP_code");
  if (saved) { try { await start(saved); return; } catch (e) { console.warn(e); } }
  $("#login").classList.remove("hidden"); $("#codeInput").focus();
})();
