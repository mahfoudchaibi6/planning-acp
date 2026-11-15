// Planning ACP – CH Valenciennes (médecins + internes)
// Données Firestore sous /espaces/{code du service}/semaines/{semaine ISO}
const CFG = window.PLANNING_CONFIG;
const FB_VERSION = "10.12.2";
const DEMO = !CFG.firebase || !CFG.firebase.apiKey || CFG.firebase.apiKey === "A_REMPLIR";
const DERMA = CFG.dermato || null;

// ------------------------------------------------------------------ statuts
const STATUTS = [
  { id: "ABS", label: "ABS (absent)" },
  { id: "TP", label: "TP (temps partiel)" },
  { id: "CONGRES", label: "Congrès" },
  { id: "FORMATION", label: "Formation pédagogique" },
  { id: "ADMIN", label: "Administratif" },
  { id: "TLT", label: "TLT (télétravail)" },
  { id: "FRAIS", label: "Frais médical" }
];
const STATUT_LABEL = Object.fromEntries(STATUTS.map(s => [s.id, s.label]));
const ABSENT = ["ABS", "CONGRES"];            // rendent indisponible pour encadrer un interne (pas le TP)
const SLOTS = ["M", "AM"];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
const JC = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

// ------------------------------------------------------------------ dates (UTC)
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const frDate = d => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
const frCourt = d => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
const dow = d => (d.getUTCDay() + 6) % 7 + 1; // 1 = lundi
const fromIso = s => new Date(s + "T00:00:00Z");
function isoWeek(d) {
  const t = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const y = t.getUTCFullYear(); const jan4 = utc(y, 0, 4);
  return { year: y, week: 1 + Math.round(((t - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7) };
}
const weekId = (y, w) => `${y}-W${pad(w)}`;
const parseWeekId = id => { const [y, w] = id.split("-W").map(Number); return { year: y, week: w }; };
function mondayOf(id) { const { year, week } = parseWeekId(id); const j = utc(year, 0, 4); return addDays(addDays(j, -((j.getUTCDay() + 6) % 7)), (week - 1) * 7); }
function shiftWeek(id, n) { const r = isoWeek(addDays(mondayOf(id), 7 * n)); return weekId(r.year, r.week); }
function todayWeekId() { const n = new Date(); const r = isoWeek(utc(n.getFullYear(), n.getMonth(), n.getDate())); return weekId(r.year, r.week); }
const weekDays = id => { const m = mondayOf(id); return [0, 1, 2, 3, 4].map(i => addDays(m, i)); };

// ------------------------------------------------------------------ jours fériés français
const ferCache = {};
function feries(y) {
  if (ferCache[y]) return ferCache[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const p = utc(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  const list = {
    [iso(utc(y, 0, 1))]: "Jour de l'an", [iso(addDays(p, 1))]: "Lundi de Pâques", [iso(utc(y, 4, 1))]: "Fête du Travail",
    [iso(utc(y, 4, 8))]: "Victoire 1945", [iso(addDays(p, 39))]: "Ascension", [iso(utc(y, 6, 14))]: "Fête nationale",
    [iso(utc(y, 7, 15))]: "Assomption", [iso(utc(y, 10, 1))]: "Toussaint", [iso(utc(y, 10, 11))]: "Armistice 1918",
    [iso(utc(y, 11, 25))]: "Noël"
  };
  if (CFG.lundiPentecoteFerie !== false) list[iso(addDays(p, 50))] = "Lundi de Pentecôte";
  return (ferCache[y] = list);
}
const ferie = d => feries(d.getUTCFullYear())[iso(d)] || null;

// ------------------------------------------------------------------ stockage
// patch : objet imbriqué ; une valeur null = suppression du champ.
let store;
async function makeFirestoreStore(code) {
  const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(CFG.firebase));
  const col = fs.collection(db, "espaces", code, "semaines");
  const pref = fs.doc(db, "espaces", code, "config", "params");
  const conv = o => { const r = {}; for (const [k, v] of Object.entries(o)) r[k] = v === null ? fs.deleteField() : (v && typeof v === "object" && !Array.isArray(v)) ? conv(v) : v; return r; };
  return {
    async check() { await fs.getDoc(pref); },
    subscribe(cb, onErr) { return fs.onSnapshot(col, s => { const o = {}; s.forEach(d => (o[d.id] = d.data())); cb(o); }, onErr); },
    patch: (id, p) => fs.setDoc(fs.doc(col, id), { ...conv(p), maj: fs.serverTimestamp() }, { merge: true }),
    async getParams() { const s = await fs.getDoc(pref); return s.exists() ? s.data() : {}; },
    setParams: p => fs.setDoc(pref, p)
  };
}
function makeDemoStore() {
  const K = "planningACP_demo2";
  const load = () => { try { return JSON.parse(localStorage.getItem(K)) || { semaines: {}, params: {} }; } catch { return { semaines: {}, params: {} }; } };
  const save = d => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
  const merge = (t, p) => { for (const [k, v] of Object.entries(p)) { if (v === null) delete t[k]; else if (v && typeof v === "object" && !Array.isArray(v)) merge((t[k] = t[k] && typeof t[k] === "object" ? t[k] : {}), v); else t[k] = v; } };
  let listener = null;
  return {
    async check() {},
    subscribe(cb) { listener = cb; cb(structuredClone(load().semaines)); return () => (listener = null); },
    async patch(id, p) { const d = load(); merge((d.semaines[id] ??= {}), p); save(d); listener && listener(structuredClone(d.semaines)); },
    async getParams() { return load().params || {}; },
    async setParams(p) { const d = load(); d.params = p; save(d); }
  };
}

// ------------------------------------------------------------------ état
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtNb = n => String(Math.round(n * 10) / 10).replace(".", ",");
const state = {
  wid: todayWeekId(), all: {}, tab: "grille",
  meds: [...CFG.medecins], internes: [...(CFG.internes || [])],
  regle: { ...CFG.regleRepartition }, min: CFG.joursMinimumEncadrement ?? 3,
  istart: todayWeekId(),
  month: (() => { const n = new Date(); return utc(n.getFullYear(), n.getMonth(), 1); })()
};
const W = id => state.all[id] || {};
const isFige = (id = state.wid) => !!W(id).fige;
const personnes = () => DERMA ? [...state.meds, DERMA.nom] : [...state.meds];
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2200); }
function showErr(e) {
  console.error(e); const b = $("#errBanner");
  b.textContent = e?.code === "permission-denied" ? "Accès refusé par le serveur (code incorrect, ou semaine figée)." : "Erreur : " + (e?.message || e);
  b.classList.remove("hidden"); setTimeout(() => b.classList.add("hidden"), 6000);
}
const run = async (p, ok) => { try { await p; if (ok) toast(ok); } catch (e) { showErr(e); } };

// ------------------------------------------------------------------ valeurs effectives
function defaultFor(d, med, slot) {
  for (const tp of CFG.tempsPartiels || []) if (tp.medecin === med && tp.jour === dow(d) && (tp.creneau === "J" || tp.creneau === slot)) return "TP";
  return "";
}
function eff(wk, d, med, slot) {
  const s = wk?.jours?.[iso(d)]?.[med]?.[slot];
  if (s === "PRESENT") return "";
  return s || defaultFor(d, med, slot);
}
const rcpPossible = d => (CFG.rcpJours || [1]).includes(dow(d));
function rcpDefault(id, med) { const r = CFG.rcpRoulement || []; return r.length ? r[parseWeekId(id).week % r.length] === med : false; }
function rcp(id, d, med) {
  if (!rcpPossible(d)) return false;
  const s = W(id).jours?.[iso(d)]?.[med]?.RCP;
  return s === undefined || s === null ? rcpDefault(id, med) : !!s;
}
const dermaPresente = (id, d) => DERMA && DERMA.jours.includes(dow(d)) && SLOTS.some(s => !["ABS", "CONGRES", "TP"].includes(eff(W(id), d, DERMA.nom, s)));

// ------------------------------------------------------------------ répartition des cas
function nbRepart(id, d) {
  let n = 0; const detail = {};
  for (const m of state.meds) {
    const on = SLOTS.map(s => { const st = eff(W(id), d, m, s); return !st || !state.regle[st]; });
    detail[m] = on; n += on.filter(Boolean).length * 0.5;
  }
  return { n, detail };
}

// ------------------------------------------------------------------ internes : disponibilité et attribution
function dispoSenior(id, med) {
  const ouv = weekDays(id).filter(d => !ferie(d));
  let n = 0; for (const d of ouv) for (const s of SLOTS) if (!ABSENT.includes(eff(W(id), d, med, s))) n += 0.5;
  return { n, total: ouv.length };
}
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
let cacheInt = null;
function computeInternes(lastId) {
  const key = lastId + JSON.stringify([state.meds, state.internes, state.min]);
  if (cacheInt && cacheInt.key === key && cacheInt.ref === state.all) return cacheInt.res;
  const today = todayWeekId();
  let id = [shiftWeek(today, -52), ...Object.keys(state.all)].sort()[0];
  if (id < shiftWeek(today, -104)) id = shiftWeek(today, -104);
  const total = {}, parInt = {}, prev = {}, res = {};
  state.meds.forEach(m => { total[m] = 0; parInt[m] = Object.fromEntries(state.internes.map(i => [i, 0])); });
  for (; id <= lastId; id = shiftWeek(id, 1)) {
    const w = W(id); const r = {}; const used = new Set();
    for (const i of state.internes) { const m = w.internes?.attrib?.[i]; if (m) { r[i] = { med: m, src: w.internes?.valide || w.fige ? "val" : "man" }; used.add(m); } }
    if (id >= today && !w.fige) {
      const order = parseWeekId(id).week % 2 ? [...state.internes] : [...state.internes].reverse();
      for (const i of order) {
        if (r[i]) continue;
        const c = state.meds.filter(m => !used.has(m)).map(m => ({ m, d: dispoSenior(id, m) })).filter(x => x.d.n >= Math.min(state.min, x.d.total));
        if (!c.length) { r[i] = { med: null, src: "none" }; continue; }
        c.sort((a, b) => ((prev[i] === a.m) - (prev[i] === b.m)) || (total[a.m] - total[b.m]) || (parInt[a.m][i] - parInt[b.m][i]) || (b.d.n - a.d.n) || (hash(id + a.m) - hash(id + b.m)));
        r[i] = { med: c[0].m, src: "prop" }; used.add(c[0].m);
      }
    }
    for (const i of state.internes) { const m = r[i]?.med; prev[i] = m || null; if (m && total[m] !== undefined) { total[m]++; parInt[m][i]++; } }
    res[id] = r;
  }
  cacheInt = { key, ref: state.all, res };
  return res;
}
const internesDe = id => computeInternes([id, shiftWeek(state.istart, (CFG.semainesInternesAffichees || 8) - 1)].sort().pop())[id] || {};

// ------------------------------------------------------------------ rendu : grille semaine (modèle Word)
const todayIso = () => { const n = new Date(); return iso(utc(n.getFullYear(), n.getMonth(), n.getDate())); };
const chip = (txt, st, q) => `<span class="chip st-${st}">${esc(txt)}${q ? ` <span class="q">${q}</span>` : ""}</span>`;
// Pastilles des médecins ayant un des statuts sur la journée (wk/id optionnels pour le calendrier)
function chipsFor(d, statuts, id = state.wid) {
  const items = [];
  for (const m of state.meds) {
    const st = SLOTS.map(s => eff(W(id), d, m, s)); const hit = st.map(x => statuts.includes(x));
    if (!hit[0] && !hit[1]) continue;
    const q = [];
    if (hit[0] && !hit[1]) q.push("mat."); if (!hit[0] && hit[1]) q.push("ap.-m.");
    const suf = { CONGRES: "congrès", FORMATION: "formation", ADMIN: "admin." };
    for (const k of Object.keys(suf)) if (statuts.includes(k) && st.includes(k) && statuts.length > 1) q.push(suf[k]);
    items.push(chip(m, st[hit[0] ? 0 : 1], q.length ? `(${q.join(", ")})` : ""));
  }
  return items.join("");
}
const cellItems = (d, statuts) => `<span class="v">${chipsFor(d, statuts)}</span>`;

function renderGrille() {
  const id = state.wid; const { year, week } = parseWeekId(id); const days = weekDays(id); const wk = W(id); const tIso = todayIso();
  const ints = internesDe(id);
  const intTxt = state.internes.map(i => { const a = ints[i]; return `${esc(i)} <span class="chip">${a?.med ? esc(a.med) : "—"}</span>${a?.src === "prop" ? `<span class="q noprint" style="font-size:12px"> proposé</span>` : ""}`; }).join(" &nbsp;&nbsp; ");
  let h = `<table class="grille"><colgroup><col class="col-jour"><col class="col-frais"><col class="col-mw"><col class="col-abs"><col class="col-tp"><col class="col-tlt"><col class="col-rcp"><col class="col-rep"><col class="col-nb"></colgroup><thead>
    <tr class="titre"><th colspan="9">SEMAINE ${pad(week)}/${year}</th></tr>
    ${state.internes.length ? `<tr class="introw"><th colspan="9">Seniors des internes · ${intTxt}</th></tr>` : ""}
    <tr class="cols"><th></th><th>Frais<br>médical</th><th>MW</th><th class="gris">ABS</th><th class="gris">TP</th><th>TLT</th><th>RCP</th><th colspan="2">Nb répart.</th></tr></thead><tbody>`;
  days.forEach((d, i) => {
    const date = iso(d); const fer = ferie(d);
    if (fer) { h += `<tr class="ferie"><td colspan="9">${JOURS[i].toUpperCase()} ${frDate(d)} · FÉRIÉ (${esc(fer)})</td></tr>`; return; }
    const { n, detail } = nbRepart(id, d); const man = wk.nb?.[date];
    const mw = DERMA && DERMA.jours.includes(dow(d)) ? (dermaPresente(id, d) ? chip(DERMA.nom, "MW") : chip(`${DERMA.nom} absente`, "OFF")) : "";
    const rc = state.meds.filter(m => rcp(id, d, m)).map(m => chip(m, "RCP")).join("");
    h += `<tr class="${date === tIso ? "today" : ""}"><td class="jour"><div class="dname">${JOURS[i].toUpperCase()}</div><div class="ddate">${frDate(d)}</div></td>
      <td class="val frais" data-l="Frais médical" data-date="${date}">${cellItems(d, ["FRAIS"])}</td>
      <td class="val" data-l="MW"><span class="v">${mw}</span></td>
      <td class="val gris" data-l="Absents">${cellItems(d, ["ABS", "CONGRES", "FORMATION", "ADMIN"])}</td>
      <td class="val gris" data-l="Temps partiel">${cellItems(d, ["TP"])}</td>
      <td class="val" data-l="Télétravail">${cellItems(d, ["TLT"])}</td>
      <td class="val" data-l="RCP"><span class="v">${rc}</span></td>
      <td data-l="Répartir à"><div class="nbbox">${state.meds.map(m => { const [a, b] = detail[m]; return `<span class="${a && b ? "full" : a || b ? "half" : ""}">${esc(m)}</span>`; }).join("")}</div></td>
      <td class="nb" data-l="Nb répart." data-date="${date}" data-auto="${n}"><span class="nbbadge">${fmtNb(man ?? n)}</span>${man != null ? `<span class="man">manuel</span>` : ""}</td></tr>`;
  });
  h += `</tbody></table>`;
  if (wk.notes) h += `<div class="notes-print">${esc(wk.notes)}</div>`;
  $("#grilleWrap").innerHTML = h;

  // Bloc « À qui répartir »
  const cards = days.filter(d => !ferie(d)).map(d => {
    const { n, detail } = nbRepart(id, d); const man = wk.nb?.[iso(d)];
    const qui = state.meds.filter(m => detail[m].some(Boolean)).map(m => { const [a, b] = detail[m]; return `<span class="chip">${esc(m)}${a && b ? "" : ` <span class="q">${a ? "mat." : "ap.-m."}</span>`}</span>`; });
    const non = state.meds.filter(m => !detail[m].some(Boolean));
    return `<div class="rcard ${iso(d) === tIso ? "today" : ""}"><div class="rh"><strong>${JOURS[dow(d) - 1]} ${frCourt(d)}</strong><span class="num">${fmtNb(man ?? n)}<small>répart.</small></span></div>
      <div class="who">${qui.join("") || "—"}</div>${non.length ? `<div class="non">Pas de cas : ${non.map(esc).join(", ")}</div>` : ""}</div>`;
  }).join("");
  $("#repartWrap").innerHTML = cards ? `<div class="repart">${cards}</div>` : `<p class="muted">Semaine entièrement fériée.</p>`;

  const f = isFige();
  document.body.classList.toggle("fige-on", f);
  $("#figeBanner").classList.toggle("hidden", !f);
  $("#btnFiger").textContent = f ? "🔓 Défiger la semaine" : "🔒 Figer la semaine";
  $("#btnProposer").disabled = f; $("#btnNotes").disabled = f; $("#notes").disabled = f;
  if (document.activeElement !== $("#notes")) $("#notes").value = wk.notes || "";
}

// ------------------------------------------------------------------ rendu : calendrier mensuel
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function renderCalendrier() {
  const m0 = state.month; const y = m0.getUTCFullYear(), mo = m0.getUTCMonth(); const tIso = todayIso();
  $("#calTitle").textContent = `${MOIS[mo]} ${y}`;
  const first = utc(y, mo, 1), last = utc(y, mo + 1, 0);
  let wid = (() => { const r = isoWeek(first); return weekId(r.year, r.week); })();
  const lastW = (() => { const r = isoWeek(last); return weekId(r.year, r.week); })();
  let h = `<div class="cal"><div class="dow"></div>${JC.map(j => `<div class="dow">${j}</div>`).join("")}`;
  for (; wid <= lastW; wid = shiftWeek(wid, 1)) {
    const ints = internesDe(wid);
    const intTxt = state.internes.map(i => `${esc(i[0])}: ${esc(ints[i]?.med || "—")}`).join(" · ");
    h += `<div class="wn" data-week="${wid}" title="Ouvrir la semaine">S${parseWeekId(wid).week}</div>`;
    weekDays(wid).forEach((d, k) => {
      const out = d.getUTCMonth() !== mo; const fer = ferie(d); const date = iso(d);
      if (fer) { h += `<div class="cday ferie ${out ? "out" : ""}"><div class="ct"><span class="dn">${d.getUTCDate()}</span></div><span class="fl">${esc(fer)}</span></div>`; return; }
      const { n } = nbRepart(wid, d); const man = W(wid).nb?.[date];
      h += `<div class="cday ${out ? "out" : ""} ${date === tIso ? "today" : ""}" data-week="${wid}">
        <div class="ct"><span class="dn">${d.getUTCDate()}</span><span class="nbs" title="Nb répart.">${fmtNb(man ?? n)}</span></div>
        <div class="chips">${chipsFor(d, ["FRAIS"], wid)}${chipsFor(d, ["ABS", "CONGRES"], wid)}${chipsFor(d, ["TP"], wid)}</div>
        ${k === 0 && state.internes.length ? `<div class="ints">${intTxt}</div>` : ""}</div>`;
    });
  }
  $("#calWrap").innerHTML = h + `</div>`;
}

// ------------------------------------------------------------------ rendu : saisie
function me() { let v = null; try { v = localStorage.getItem("planningACP_me"); } catch {} return personnes().includes(v) ? v : state.meds[0]; }
function optList(sel, mixte) {
  const o = [`<option value="">✓ Présent</option>`];
  if (mixte) o.push(`<option value="__mixte" disabled>Matin ≠ après-midi</option>`);
  for (const s of STATUTS) o.push(`<option value="${s.id}">${s.label}</option>`);
  return o.join("").replace(`value="${sel}"`, `value="${sel}" selected`);
}
function renderSaisie() {
  const m = me(); const id = state.wid; const days = weekDays(id); const f = isFige(); const isDerma = DERMA && m === DERMA.nom; const tIso = todayIso();
  $("#meSel").innerHTML = personnes().map(x => `<option ${x === m ? "selected" : ""}>${esc(x)}</option>`).join("");
  $("#meAvatar").textContent = m;
  $("#figeBanner2").classList.toggle("hidden", !f);
  const ints = internesDe(id); const enc = state.internes.filter(i => ints[i]?.med === m);
  $("#saisieInfo").innerHTML = enc.length ? enc.map((i, k) => `<span class="avatar sm i${(state.internes.indexOf(i) % 2) + 1}">${esc(i.slice(0, 2))}</span>`).join("") + `<span>Cette semaine, vous encadrez <strong>${enc.map(esc).join(" et ")}</strong>.</span>` : "";
  let h = `<div class="daycards">`;
  days.forEach((d, i) => {
    const date = iso(d); const fer = ferie(d);
    const head = `<div class="dh"><strong>${JOURS[i]}</strong><span>${frCourt(d)}</span></div>`;
    if (fer) { h += `<div class="dcard ferie">${head}<span class="fl">Férié · ${esc(fer)}</span></div>`; return; }
    if (isDerma && !DERMA.jours.includes(dow(d))) { h += `<div class="dcard ferie">${head}<span class="fl">Pas de présence prévue</span></div>`; return; }
    const [vm, va] = SLOTS.map(s => eff(W(id), d, m, s)); const [dm, da] = SLOTS.map(s => defaultFor(d, m, s));
    const dis = f ? "disabled" : ""; const defTxt = s => s ? `<div class="def">par défaut : ${STATUT_LABEL[s]}</div>` : "";
    const jv = vm === va ? vm : "__mixte";
    h += `<div class="dcard ${date === tIso ? "today" : ""}">${head}
      <div><label class="f">Journée</label><select data-date="${date}" data-slot="J" data-v="${jv === "__mixte" ? "mixte" : jv}" ${dis}>${optList(jv, vm !== va)}</select></div>
      <div class="split">
        <div><label class="f">Matin</label><select data-date="${date}" data-slot="M" data-v="${vm}" ${dis}>${optList(vm)}</select>${defTxt(dm)}</div>
        <div><label class="f">Après-midi</label><select data-date="${date}" data-slot="AM" data-v="${va}" ${dis}>${optList(va)}</select>${defTxt(da)}</div>
      </div>
      ${rcpPossible(d) && !isDerma ? `<label class="toggle">RCP du lundi soir <input type="checkbox" data-rcp="${date}" ${rcp(id, d, m) ? "checked" : ""} ${dis}></label>` : ""}
    </div>`;
  });
  $("#saisieWrap").innerHTML = h + `</div>`;
}
function slotPatch(d, med, slot, val) { // renvoie la valeur à stocker (null = valeur par défaut)
  const def = defaultFor(d, med, slot);
  return val === def ? null : val === "" ? "PRESENT" : val;
}
function patchSlots(list) { // list : [{d, med, slot, val}]
  const jours = {};
  for (const c of list) ((jours[iso(c.d)] ??= {})[c.med] ??= {})[c.slot] = slotPatch(c.d, c.med, c.slot, c.val);
  return { jours };
}

// ------------------------------------------------------------------ frais médical
const fraisHolders = d => state.meds.filter(m => SLOTS.some(s => eff(W(state.wid), d, m, s) === "FRAIS"));
const libre = (d, m) => SLOTS.every(s => !eff(W(state.wid), d, m, s));
function fraisPatch(d, med) {
  const list = [];
  for (const old of fraisHolders(d)) if (old !== med) for (const s of SLOTS) if (eff(W(state.wid), d, old, s) === "FRAIS") list.push({ d, med: old, slot: s, val: "" });
  if (med) for (const s of SLOTS) list.push({ d, med, slot: s, val: "FRAIS" });
  return patchSlots(list);
}
function openFraisDialog(date) {
  if (isFige()) return;
  const d = fromIso(date); const cur = fraisHolders(d)[0] || "";
  const opts = state.meds.map(m => `<option value="${esc(m)}" ${m === cur ? "selected" : ""}>${esc(m)}${libre(d, m) || m === cur ? "" : " (indisponible)"}</option>`).join("");
  dialog(`<h3>Frais médical – ${JOURS[dow(d) - 1]} ${frDate(d)}</h3><select name="med" style="width:100%"><option value="">— Personne</option>${opts}</select>`,
    f => run(store.patch(state.wid, fraisPatch(d, f.med.value)), "Enregistré"));
}
function proposerFrais() {
  if (isFige()) return;
  const y = String(parseWeekId(state.wid).year);
  const count = Object.fromEntries(state.meds.map(m => [m, 0]));
  for (const [id, w] of Object.entries(state.all)) if (id.startsWith(y) && id !== state.wid)
    for (const d of weekDays(id)) for (const m of state.meds) for (const s of SLOTS) if (eff(w, d, m, s) === "FRAIS") count[m] += 0.5;
  const ex = new Set(CFG.fraisExclus || []); const ints = internesDe(state.wid);
  const encad = new Set(state.internes.map(i => ints[i]?.med).filter(Boolean));
  const sem = Object.fromEntries(state.meds.map(m => [m, 0]));
  const days = weekDays(state.wid).filter(d => !ferie(d));
  days.forEach(d => fraisHolders(d).forEach(m => sem[m]++));
  const prop = [], list = [];
  for (const d of days) {
    if (fraisHolders(d).length) continue;
    const c = state.meds.filter(m => !ex.has(m) && libre(d, m));
    if (!c.length) { prop.push(`${JOURS[dow(d) - 1]} ${frCourt(d)} : personne de disponible`); continue; }
    c.sort((a, b) => (sem[a] - sem[b]) || (encad.has(a) - encad.has(b)) || (count[a] - count[b]) || (Math.random() - 0.5));
    const m = c[0]; sem[m]++; count[m]++;
    prop.push(`${JOURS[dow(d) - 1]} ${frCourt(d)} : <strong>${esc(m)}</strong>`);
    for (const s of SLOTS) list.push({ d, med: m, slot: s, val: "FRAIS" });
  }
  if (!prop.length) { toast("Tous les jours ont déjà un frais médical"); return; }
  dialog(`<h3>Proposition de frais médical</h3>
    <p class="small muted">Médecins présents toute la journée, en priorité ceux qui en ont fait le moins cette année. Les seniors des internes passent après les autres. Les jours déjà attribués ne changent pas.</p><p>${prop.join("<br>")}</p>`,
    () => list.length && run(store.patch(state.wid, patchSlots(list)), "Proposition appliquée"), list.length ? "Appliquer" : null);
}

function openNbDialog(td) {
  if (isFige()) return;
  const date = td.dataset.date; const auto = Number(td.dataset.auto); const man = W(state.wid).nb?.[date];
  dialog(`<h3>Nb répart. – ${frDate(fromIso(date))}</h3>
    <p class="small muted">Calcul automatique : <strong>${fmtNb(auto)}</strong>. Saisissez une autre valeur pour la forcer, ou videz le champ pour revenir au calcul.</p>
    <input name="nb" inputmode="decimal" value="${man != null ? fmtNb(man) : ""}" style="width:100%">`,
    f => {
      const raw = f.nb.value.trim().replace(",", "."); const v = raw === "" ? null : Number(raw);
      if (v !== null && !(v >= 0 && v <= 99)) { toast("Valeur invalide"); return; }
      run(store.patch(state.wid, { nb: { [date]: v } }), "Enregistré");
    });
}
function dialog(html, onOk, okLabel = "Valider") {
  const dlg = $("#dlg"); const f = $("#dlgForm");
  f.innerHTML = html + `<div class="row">${okLabel ? `<button class="primary" value="ok">${okLabel}</button>` : ""}<button value="cancel" formnovalidate>${okLabel ? "Annuler" : "Fermer"}</button></div>`;
  dlg.onclose = () => { if (dlg.returnValue === "ok") onOk(f); };
  dlg.returnValue = ""; dlg.showModal();
}

// ------------------------------------------------------------------ rendu : internes (plusieurs semaines)
function istartIds() { return Array.from({ length: CFG.semainesInternesAffichees || 8 }, (_, i) => shiftWeek(state.istart, i)); }
function renderInternes() {
  const ids = istartIds(); const res = computeInternes(ids[ids.length - 1]); const today = todayWeekId();
  $("#iRange").textContent = `S${parseWeekId(ids[0]).week} → S${parseWeekId(ids[ids.length - 1]).week}`;
  const av = i => `<span class="avatar sm i${(state.internes.indexOf(i) % 2) + 1}">${esc(i.slice(0, 2))}</span>`;
  const cur = res[today] || {};
  $("#intHead").innerHTML = state.internes.map(i => `<div class="int-pill">${av(i)}<span>${esc(i)} <span class="muted small" style="font-weight:500">· cette semaine :</span> ${cur[i]?.med ? esc(cur[i].med) : "—"}</span></div>`).join("");
  if (!state.internes.length) { $("#internesWrap").innerHTML = `<p class="muted" style="padding:16px">Aucun interne (voir Paramètres).</p>`; return; }
  let h = `<table class="tab"><thead><tr><th>Semaine</th>${state.internes.map(i => `<th>${esc(i)}</th>`).join("")}<th class="noprint"></th></tr></thead><tbody>`;
  for (const id of ids) {
    const w = W(id); const days = weekDays(id); const r = res[id] || {}; const f = isFige(id);
    const fer = days.filter(ferie).map(d => `${JC[dow(d) - 1]} ${frCourt(d)} férié`);
    h += `<tr class="${id === today ? "now" : ""}"><td class="wk">S${parseWeekId(id).week}${id === today ? ` <span class="tag val">cette semaine</span>` : ""}<div class="dates">${frCourt(days[0])} → ${frCourt(days[4])}${fer.length ? " · " + fer.join(", ") : ""}</div></td>`;
    for (const i of state.internes) {
      const a = r[i] || { med: null, src: "none" };
      const opts = [`<option value="">—</option>`].concat(state.meds.map(m => { const d = dispoSenior(id, m); return `<option value="${esc(m)}" ${m === a.med ? "selected" : ""}>${esc(m)} (${fmtNb(d.n)}/${d.total} j)</option>`; })).join("");
      const tag = { val: `<span class="tag val">validé</span>`, man: `<span class="tag man">choisi</span>`, prop: `<span class="tag prop">proposé</span>`, none: "" }[a.src];
      let alert = "";
      if (a.src === "none" && id >= today) alert = `<span class="alert">Aucun senior présent toute la semaine : choisissez à la main</span>`;
      else if (a.med) { const d = dispoSenior(id, a.med); if (d.n < Math.min(state.min, d.total)) alert = `<span class="alert">⚠ ${esc(a.med)} est absent(e) une partie de la semaine (${fmtNb(d.n)}/${d.total} j)</span>`; }
      h += `<td class="senior" data-l="${esc(i)}"><span><select data-id="${id}" data-int="${esc(i)}" ${f ? "disabled" : ""}>${opts}</select>${tag}</span>${alert}</td>`;
    }
    h += `<td class="noprint" data-l="">${f ? `<span class="muted small">semaine figée</span>` : w.internes?.valide
      ? `<button data-dev="${id}">Annuler la validation</button>`
      : `<button class="primary" data-val="${id}" ${state.internes.every(i => !r[i]?.med) ? "disabled" : ""}>Valider</button>`}</td></tr>`;
  }
  $("#internesWrap").innerHTML = h + `</tbody></table>`;
}
function attribActuelle(id) { const r = internesDe(id); const at = {}; state.internes.forEach(i => { if (r[i]?.med) at[i] = r[i].med; }); return at; }

// ------------------------------------------------------------------ bilan
function renderBilan() {
  const ys = [...new Set([...Object.keys(state.all), todayWeekId()].map(k => k.slice(0, 4)))].sort();
  const sel = $("#bilanYear"); const y = ys.includes(sel.value) ? sel.value : todayWeekId().slice(0, 4);
  sel.innerHTML = ys.map(v => `<option ${v === y ? "selected" : ""}>${v}</option>`).join("");
  const t = Object.fromEntries(state.meds.map(m => [m, { FRAIS: 0, RCP: 0, int: Object.fromEntries(state.internes.map(i => [i, 0])) }]));
  for (const [id, w] of Object.entries(state.all)) if (id.startsWith(y)) for (const d of weekDays(id)) {
    if (ferie(d)) continue;
    for (const m of state.meds) { for (const s of SLOTS) { const st = eff(w, d, m, s); if (st === "FRAIS") t[m].FRAIS += 0.5; } if (rcp(id, d, m)) t[m].RCP++; }
  }
  const cur = todayWeekId(); const last = y < cur.slice(0, 4) ? `${y}-W53` : cur;
  const res = computeInternes([last, shiftWeek(state.istart, (CFG.semainesInternesAffichees || 8) - 1)].sort().pop());
  for (const [id, r] of Object.entries(res)) if (id.startsWith(y) && id <= last) for (const i of state.internes) { const m = r[i]?.med; if (m && t[m]) t[m].int[i]++; }
  const mx = Math.max(1, ...state.meds.map(m => t[m].FRAIS)), mi = Math.max(1, ...state.meds.flatMap(m => state.internes.map(i => t[m].int[i])));
  const bar = (v, max, txt) => `<div class="bar-cell"><i style="width:${Math.round(60 * v / max)}px"></i><span>${txt}</span></div>`;
  $("#bilanWrap").innerHTML = `<table class="simple"><thead><tr><th>Médecin</th><th>Frais médical (j)</th><th>RCP</th>${state.internes.map(i => `<th>Sem. avec ${esc(i)}</th>`).join("")}</tr></thead><tbody>` +
    state.meds.map(m => `<tr><td><span class="avatar sm" style="display:inline-grid;margin-right:8px;vertical-align:middle">${esc(m)}</span></td><td>${bar(t[m].FRAIS, mx, fmtNb(t[m].FRAIS))}</td><td>${t[m].RCP}</td>${state.internes.map(i => `<td>${bar(t[m].int[i], mi, t[m].int[i])}</td>`).join("")}</tr>`).join("") + `</tbody></table>`;
}

// ------------------------------------------------------------------ paramètres
function renderParams() {
  $("#pMeds").value = state.meds.join(", "); $("#pInternes").value = state.internes.join(", "); $("#pMin").value = state.min;
  $("#regleWrap").innerHTML = STATUTS.map(s => `<label class="chk"><input type="checkbox" data-st="${s.id}" ${state.regle[s.id] ? "checked" : ""}> ${s.label}</label>`).join("");
  const r = CFG.rcpRoulement || [];
  $("#rcpWrap").innerHTML = r.length ? `<p>Roulement du lundi soir : ${r.map(esc).join(" → ")}</p>`
    : `<p class="muted small">Pas encore de roulement : chacun coche « RCP » le lundi dans « Ma saisie ». Quand vous me donnerez le roulement, la RCP sera préremplie automatiquement.</p>`;
}

// ------------------------------------------------------------------ navigation
function render() {
  const days = weekDays(state.wid); const { week, year } = parseWeekId(state.wid);
  $("#wLabel").textContent = `Semaine ${week} · ${year}`;
  $("#wDates").textContent = `du ${frCourt(days[0])} au ${frCourt(days[4])}`;
  ({ grille: renderGrille, calendrier: renderCalendrier, saisie: renderSaisie, internes: renderInternes, bilan: renderBilan, params: () => {} })[state.tab]();
}
function goWeek(id) { state.wid = id; history.replaceState(null, "", "#" + id); render(); }
function setTab(t) {
  state.tab = t;
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  ["grille", "calendrier", "saisie", "internes", "bilan", "params"].forEach(s => $("#tab-" + s).classList.toggle("hidden", s !== t));
  $("#weeknav").classList.toggle("hidden", !(t === "grille" || t === "saisie"));
  if (t === "params") renderParams();
  render();
}

function bind() {
  $("#prevW").onclick = () => goWeek(shiftWeek(state.wid, -1));
  $("#nextW").onclick = () => goWeek(shiftWeek(state.wid, 1));
  $("#todayW").onclick = () => goWeek(todayWeekId());
  $("#iPrev").onclick = () => { state.istart = shiftWeek(state.istart, -4); render(); };
  $("#iNext").onclick = () => { state.istart = shiftWeek(state.istart, 4); render(); };
  $("#iToday").onclick = () => { state.istart = todayWeekId(); render(); };
  const shiftMonth = n => { state.month = utc(state.month.getUTCFullYear(), state.month.getUTCMonth() + n, 1); render(); };
  $("#cPrev").onclick = () => shiftMonth(-1); $("#cNext").onclick = () => shiftMonth(1);
  $("#cToday").onclick = () => { const n = new Date(); state.month = utc(n.getFullYear(), n.getMonth(), 1); render(); };
  $("#calWrap").onclick = e => { const c = e.target.closest("[data-week]"); if (c) { state.wid = c.dataset.week; history.replaceState(null, "", "#" + state.wid); setTab("grille"); } };
  $("#tabs").onclick = e => { const b = e.target.closest("button[data-tab]"); if (b) setTab(b.dataset.tab); };
  $("#grilleWrap").onclick = e => {
    const f = e.target.closest("td.frais"); if (f) return openFraisDialog(f.dataset.date);
    const n = e.target.closest("td.nb"); if (n) return openNbDialog(n);
    if (e.target.closest("tr.introw")) setTab("internes");
  };
  $("#saisieWrap").onchange = e => {
    const m = me();
    const cb = e.target.closest("input[data-rcp]");
    if (cb) { const d = fromIso(cb.dataset.rcp); const v = cb.checked === rcpDefault(state.wid, m) ? null : cb.checked;
      return run(store.patch(state.wid, { jours: { [cb.dataset.rcp]: { [m]: { RCP: v } } } }), "Enregistré"); }
    const sel = e.target.closest("select[data-date]"); if (!sel) return;
    const d = fromIso(sel.dataset.date); const slots = sel.dataset.slot === "J" ? SLOTS : [sel.dataset.slot];
    run(store.patch(state.wid, patchSlots(slots.map(s => ({ d, med: m, slot: s, val: sel.value })))), "Enregistré");
  };
  $("#meSel").onchange = e => { try { localStorage.setItem("planningACP_me", e.target.value); } catch {} renderSaisie(); };
  $("#internesWrap").onchange = e => {
    const s = e.target.closest("select[data-id]"); if (!s) return;
    run(store.patch(s.dataset.id, { internes: { attrib: { [s.dataset.int]: s.value || null } } }), "Enregistré");
  };
  $("#internesWrap").onclick = e => {
    const v = e.target.closest("[data-val]"), d = e.target.closest("[data-dev]");
    if (v) run(store.patch(v.dataset.val, { internes: { attrib: attribActuelle(v.dataset.val), valide: true } }), "Semaine validée");
    if (d && confirm("Annuler la validation ? Les seniors seront de nouveau proposés automatiquement.")) run(store.patch(d.dataset.dev, { internes: null }), "Validation annulée");
  };
  $("#btnProposer").onclick = proposerFrais;
  $("#btnFiger").onclick = async () => {
    const v = !isFige();
    if (v && !confirm("Figer cette semaine ? Plus personne ne pourra la modifier (saisies, frais, seniors des internes) tant qu'elle n'est pas défigée.")) return;
    try {
      if (v) await store.patch(state.wid, { internes: { attrib: attribActuelle(state.wid), valide: true } });
      await store.patch(state.wid, { fige: v }); toast(v ? "Semaine figée" : "Semaine défigée");
    } catch (e) { showErr(e); }
  };
  $("#btnPrint").onclick = () => window.print();
  $("#btnPrintI").onclick = () => window.print();
  $("#btnNotes").onclick = () => run(store.patch(state.wid, { notes: $("#notes").value.slice(0, 1000) }), "Remarques enregistrées");
  $("#bilanYear").onchange = renderBilan;
  $("#btnParams").onclick = async () => {
    const split = s => [...new Set(s.split(/[,;]/).map(x => x.trim()).filter(Boolean))];
    const medecins = split($("#pMeds").value), internes = split($("#pInternes").value);
    const joursMin = Math.max(0.5, Math.min(5, Number(String($("#pMin").value).replace(",", ".")) || 5));
    const regle = {}; document.querySelectorAll("#regleWrap input").forEach(i => (regle[i.dataset.st] = i.checked));
    if (medecins.length < 2) { toast("Il faut au moins 2 médecins"); return; }
    if (internes.length > medecins.length) { toast("Plus d'internes que de médecins"); return; }
    try { await store.setParams({ medecins, internes, joursMin, regle }); Object.assign(state, { meds: medecins, internes, min: joursMin, regle }); cacheInt = null; toast("Paramètres enregistrés"); }
    catch (e) { showErr(e); }
  };
  $("#btnLogout").onclick = () => { try { localStorage.removeItem("planningACP_code"); sessionStorage.removeItem("planningACP_code"); } catch {} location.reload(); };
  $("#codeBtn").onclick = tryCode;
  $("#codeInput").onkeydown = e => { if (e.key === "Enter") tryCode(); };
}

async function start(code) {
  store = DEMO ? makeDemoStore() : await makeFirestoreStore(code);
  await store.check(); // lève permission-denied si le code est faux
  try {
    const p = await store.getParams();
    if (p.medecins?.length) state.meds = p.medecins;
    if (Array.isArray(p.internes)) state.internes = p.internes;
    if (p.joursMin) state.min = p.joursMin;
    if (p.regle) state.regle = { ...CFG.regleRepartition, ...p.regle };
  } catch {}
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  $("#demoBanner").classList.toggle("hidden", !DEMO);
  const h = location.hash.match(/^#(\d{4}-W\d{2})$/); if (h) state.wid = h[1];
  store.subscribe(all => { state.all = all || {}; render(); }, showErr);
}
async function tryCode() {
  const code = $("#codeInput").value.trim(); const err = $("#codeErr"); err.classList.add("hidden");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) { err.textContent = "Code invalide (8 caractères minimum : lettres, chiffres, - ou _)."; err.classList.remove("hidden"); return; }
  try { await start(code); try { ($("#codeRemember").checked ? localStorage : sessionStorage).setItem("planningACP_code", code); } catch {} }
  catch (e) { console.error(e); err.textContent = e?.code === "permission-denied" ? "Code incorrect." : "Connexion impossible : " + (e?.message || e); err.classList.remove("hidden"); }
}

bind();
(async () => {
  if (DEMO) return start("demo");
  let saved = null; try { saved = localStorage.getItem("planningACP_code") || sessionStorage.getItem("planningACP_code"); } catch {}
  if (saved) { try { await start(saved); return; } catch (e) { console.warn(e); } }
  $("#login").classList.remove("hidden"); $("#codeInput").focus();
})();
