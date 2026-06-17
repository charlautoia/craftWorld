let DATA = { resources: [], crafting: {} };
let livePrice = {};      // pool → price
let taxPct = 2.5;        // taxe de vente globale en % (configurable) → facteur de vente = 1 − taxPct/100
let customOrder = null;  // ordre manuel des lignes (array de noms) ; null = ordre du jeu (data.json)
let rentaSort = { key: 'game', dir: 1 };   // 'game' = ordre du jeu (ordre de data.json), non trié

// ── Utilities ────────────────────────────────────────────────────────────────
const fmt = (v, d=4) => v == null ? '—' : Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
// Prix : 3 chiffres significatifs ; si > 1000, entier (décimales ignorées).
const fmtPrice = v => v == null ? '—'
  : v > 1000
    ? Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 })
    : Number(v).toLocaleString('fr-FR', { maximumSignificantDigits: 3 });
// Variation en % (signe + couleur).
const fmtVar = v => {
  if (v == null) return '<span class="neutral">—</span>';
  const cls = v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral';
  const s = (v > 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `<span class="${cls} font-mono">${s} %</span>`;
};

// ── Tabs ─────────────────────────────────────────────────────────────────────
function showTab(tab) {
  document.getElementById('tab-renta').classList.toggle('hidden', tab !== 'renta');
  document.getElementById('tab-crafting').classList.toggle('hidden', tab !== 'crafting');
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 && tab === 'renta') || (i === 1 && tab === 'crafting'));
  });
  if (tab === 'crafting') renderCrafting();   // valeurs à jour (prix/mastery/bonus/taxe courants)
}

// ── Renta ────────────────────────────────────────────────────────────────────
function sortRenta(key) {
  if (rentaSort.key === key) rentaSort.dir *= -1;
  else { rentaSort.key = key; rentaSort.dir = 1; }
  document.querySelectorAll('#renta-table th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
  });
  const thIdx = ['name','coinh','coinkp','prix_live','d24','w1','mastery','bonus','pool'].indexOf(key);
  const ths = document.querySelectorAll('#renta-table th');
  if (thIdx >= 0) ths[thIdx].classList.add(rentaSort.dir === 1 ? 'sorted-asc' : 'sorted-desc');
  renderRenta();
}

// ── coin/h ─────────────────────────────────────────────────────────────────────
let factoryLevel = {};   // ressource → niveau d'usine choisi
let mastery = {};        // ressource → bonus Mastery en % (s'ajoute au yield du niveau, réduit les inputs ; défaut 5.3)
let bonusPct = {};       // ressource → Speed bonus de prod en % (défaut = bonus data.json ×100)
let pricesLoaded = false;
let dayVar = {};         // pool → variation 24h (%)
let weekVar = {};        // pool → variation 1 semaine (%) ; undefined = en cours
let weekStarted = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Persistance navigateur (les valeurs saisies survivent au rechargement).
const LS_LEVELS = 'cw_levels', LS_MASTERY = 'cw_mastery_pct', LS_BONUS = 'cw_bonus_pct';   // _pct : valeurs en %
const LS_TAX = 'cw_tax';   // taxe de vente globale (scalaire)
const LS_ORDER = 'cw_order';   // ordre manuel des lignes
function loadLS(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; } }
function saveLS(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }

function priceByName(name) {
  const r = DATA.resources.find(x => x.name === name);
  return r && r.pool ? livePrice[r.pool] : undefined;
}

// Différence acheter vs produire, en coin/h. Calcul pur délégué à coinh.js (testé).
function coinPerHour(name) {
  const r = DATA.resources.find(x => x.name === name);
  if (!r || r.level == null) return null;
  const recipe = (DATA.crafting[name] || []).find(l => l.level === factoryLevel[name]);
  const bonus = bonusPct[name] != null ? bonusPct[name] / 100 : (r.bonus || 0);   // Speed bonus en % → fraction
  // Mastery passée en % : coinh.js l'ajoute au yield du niveau (recipe.yield_pct) pour réduire le coût des inputs.
  return CoinH.coinPerHour(recipe, priceByName(name), priceByName, bonus, mastery[name], sellFactor());
}

// coin/kpower : coins par 1000 de power (indépendant de la vitesse).
function coinPerKPower(name) {
  const r = DATA.resources.find(x => x.name === name);
  if (!r || r.level == null) return null;
  const recipe = (DATA.crafting[name] || []).find(l => l.level === factoryLevel[name]);
  return CoinH.coinPerKPower(recipe, priceByName(name), priceByName, mastery[name], sellFactor());
}

// Facteur de vente = 1 − taxe/100 (taxe globale configurable).
function sellFactor() { return 1 - taxPct / 100; }
function onTaxChange(val) { taxPct = +val; try { localStorage.setItem(LS_TAX, taxPct); } catch (e) {} renderRenta(); }

function onLevelChange(name, val) { factoryLevel[name] = +val; saveLS(LS_LEVELS, factoryLevel); renderRenta(); }
function onMasteryChange(name, val) { mastery[name] = +val; saveLS(LS_MASTERY, mastery); renderRenta(); }
function onBonusChange(name, val) { bonusPct[name] = +val; saveLS(LS_BONUS, bonusPct); renderRenta(); }

// Colonne Mastery : input éditable (uniquement si la recette a au moins un input).
function masteryCell(r) {
  if (r.level == null) return '—';
  const recipe = (DATA.crafting[r.name] || []).find(l => l.level === factoryLevel[r.name]);
  if (!recipe || !recipe.input1) return '—';
  const v = mastery[r.name] != null ? mastery[r.name] : 5.3;
  return `<input type="number" step="0.1" min="0" max="100" value="${v}"
     onchange="onMasteryChange('${r.name}', this.value)"
     class="w-16 text-xs bg-slate-800 border border-slate-600 rounded px-1 py-0.5"> %`;
}

// Colonne Speed bonus : bonus de prod en % (intervient dans coin/h via ×(1 + bonus)).
function bonusCell(r) {
  if (r.level == null) return '—';
  const v = bonusPct[r.name] != null ? bonusPct[r.name] : (r.bonus || 0) * 100;
  return `<input type="number" step="0.1" min="0" value="${v}"
     onchange="onBonusChange('${r.name}', this.value)"
     class="w-16 text-xs bg-slate-800 border border-slate-600 rounded px-1 py-0.5"> %`;
}

// Variations de prix (24h dispo dans le fetch de prix ; 1 semaine via OHLCV en arrière-plan).
function dayCell(r) {
  if (!r.pool || r.quote) return '—';
  const v = dayVar[r.pool];
  if (v === undefined) return pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>';
  return fmtVar(v);
}
function weekCell(r) {
  if (!r.pool || r.quote) return '—';
  const v = weekVar[r.pool];
  if (v === undefined) return '<span class="spin neutral">⟳</span>';   // chargement en arrière-plan
  return fmtVar(v);
}

// 1 appel OHLCV/jour par pool (throttlé) ; variation = (close_actuel - close_il_y_a_7j) / close_il_y_a_7j.
async function fetchWeekVars() {
  const targets = DATA.resources.filter(r => r.pool && !r.quote);
  for (const r of targets) {
    try {
      const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/ronin/pools/${r.pool}/ohlcv/day?limit=8`, {
        headers: { 'Accept': 'application/json;version=20230302' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()).data.attributes.ohlcv_list;   // [ts,o,h,l,c,v], plus récent en premier
      if (list && list.length >= 2) {
        const cur = list[0][4], old = list[Math.min(7, list.length - 1)][4];
        weekVar[r.pool] = old ? (cur - old) / old * 100 : null;
      } else weekVar[r.pool] = null;
    } catch (e) {
      weekVar[r.pool] = null;
    }
    renderRenta();
    await sleep(2200);   // throttle anti rate-limit (API gratuite ~30/min)
  }
}

// Cellule Ressource = poignée de glissement + nom + niveau fusionnés ("NAME_niveau", ID officiel).
function resourceCell(r) {
  const grip = `<span class="drag-handle" title="Glisser pour réordonner">⠿</span>`;
  const name = `<span class="font-semibold text-white">${r.name ?? '—'}</span>`;
  if (r.level == null) return `${grip}${name}`;   // pas de recette (FIRE/WATER) : nom seul
  const opts = (DATA.crafting[r.name] || []).map(l =>
    `<option value="${l.level}"${l.level === factoryLevel[r.name] ? ' selected' : ''}>${l.level}</option>`).join('');
  return `${grip}${name}<span class="text-slate-500">_</span><select onchange="onLevelChange('${r.name}', this.value)"
       class="text-xs bg-slate-800 border border-slate-600 rounded px-1 py-0.5">${opts}</select>`;
}

// Ordre de base des lignes : ordre manuel (customOrder) si défini, sinon ordre du jeu (data.json).
function orderedResources() {
  if (!customOrder) return DATA.resources.slice();
  const byName = Object.fromEntries(DATA.resources.map(r => [r.name, r]));
  const out = customOrder.map(n => byName[n]).filter(Boolean);
  for (const r of DATA.resources) if (!customOrder.includes(r.name)) out.push(r);   // nouveautés en fin
  return out;
}

// Rétablit l'ordre du jeu (efface l'ordre manuel).
function onResetOrder() {
  customOrder = null;
  try { localStorage.removeItem(LS_ORDER); } catch (e) {}
  renderRenta();
}

// Dégradé rouge→vert d'une valeur dans [range.min, range.max]. EARTH est exclu (outlier).
const clamp01 = x => Math.max(0, Math.min(1, x));
function heatRange(rows, vals) {
  const xs = rows.filter(r => r.name !== 'EARTH' && vals[r.name] != null).map(r => vals[r.name]);
  return xs.length ? { min: Math.min(...xs), max: Math.max(...xs) } : null;
}
function heatSpan(v, range, excluded) {
  const bg = (excluded || !range || range.max === range.min) ? ''
    : `background:hsla(${Math.round(clamp01((v - range.min) / (range.max - range.min)) * 120)},60%,42%,0.6);`;
  return `<span class="font-mono" style="${bg}padding:.1rem .45rem;border-radius:.25rem;color:#f1f5f9">${fmtPrice(v)}</span>`;
}

// Cellules coin/h et coin/kpow avec dégradé (valeur + plage précalculées dans renderRenta).
function coinhCell(r, v, range) {
  if (r.level == null) return '—';
  if (v === undefined) v = coinPerHour(r.name);
  if (v == null) return pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>';
  return heatSpan(v, range, r.name === 'EARTH');
}
function coinhkCell(r, v, range) {
  if (r.level == null) return '—';
  if (v === undefined) v = coinPerKPower(r.name);
  if (v == null) return pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>';
  return heatSpan(v, range, r.name === 'EARTH');
}

function renderRenta() {
  const filter = document.getElementById('renta-filter').value.toLowerCase();
  const onlyPool = document.getElementById('only-pool').checked;

  let rows = orderedResources().filter(r => {
    if (filter && !r.name?.toLowerCase().includes(filter)) return false;
    if (onlyPool && !r.pool) return false;
    return true;
  });

  if (rentaSort.key !== 'game') {          // 'game' = ordre manuel (customOrder) ou ordre du jeu (data.json)
    rows.sort((a, b) => {
      const k = rentaSort.key;
      const pick = r => k === 'prix_live' ? (livePrice[r.pool] ?? null)
                      : k === 'coinh' ? (coinPerHour(r.name) ?? null)
                      : k === 'coinkp' ? (coinPerKPower(r.name) ?? null)
                      : k === 'd24' ? (dayVar[r.pool] ?? null)
                      : k === 'w1' ? (weekVar[r.pool] ?? null) : r[k];
      let av = pick(a), bv = pick(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * rentaSort.dir;
      return (av - bv) * rentaSort.dir;
    });
  }

  document.getElementById('renta-count').textContent = `${rows.length} ressources`;

  // Dégradé rouge→vert de coin/h et coin/kpow : valeurs + plages (EARTH exclu).
  const chVals = {}, ckpVals = {};
  rows.forEach(r => { chVals[r.name] = coinPerHour(r.name); ckpVals[r.name] = coinPerKPower(r.name); });
  const chRange = heatRange(rows, chVals), ckpRange = heatRange(rows, ckpVals);

  const tbody = document.getElementById('renta-body');
  tbody.innerHTML = rows.map(r => {
    const live = r.pool ? livePrice[r.pool] : undefined;
    const liveCell = r.pool
      ? (live !== undefined
          ? `<span class="text-amber-300 font-mono">${fmtPrice(live)}</span>`
          : `<span class="spin neutral">⟳</span>`)
      : '—';

    const shortPool = r.pool ? r.pool.slice(0, 8) + '…' : '—';
    const poolLink = r.pool
      ? `<a href="https://www.geckoterminal.com/ronin/pools/${r.pool}" target="_blank"
            class="text-indigo-400 hover:underline font-mono text-xs" title="${r.pool}">${shortPool}</a>`
      : '—';

    return `<tr data-name="${r.name}">
      <td>${resourceCell(r)}</td>
      <td>${coinhCell(r, chVals[r.name], chRange)}</td>
      <td>${coinhkCell(r, ckpVals[r.name], ckpRange)}</td>
      <td>${liveCell}</td>
      <td>${dayCell(r)}</td>
      <td>${weekCell(r)}</td>
      <td>${masteryCell(r)}</td>
      <td>${bonusCell(r)}</td>
      <td>${poolLink}</td>
    </tr>`;
  }).join('');
}

// ── Réorganisation des lignes (poignée glisser, tactile + souris) ─────────────
let dragRow = null;

// Ligne (non glissée) dont le milieu est juste sous le pointeur → on insère avant elle.
function dragAfterElement(tbody, y) {
  const els = [...tbody.querySelectorAll('tr:not(.dragging)')];
  let closest = { offset: -Infinity, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el };
  }
  return closest.el;
}

function onDragMove(e) {
  if (!dragRow) return;
  const tbody = document.getElementById('renta-body');
  const after = dragAfterElement(tbody, e.clientY);
  if (after == null) tbody.appendChild(dragRow);
  else tbody.insertBefore(dragRow, after);
}

function onDragEnd() {
  if (!dragRow) return;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.removeEventListener('pointercancel', onDragEnd);
  dragRow.classList.remove('dragging');
  dragRow = null;

  // Nouvel ordre : on applique le réordonnancement des lignes VISIBLES sur l'ordre complet
  // (les lignes masquées par un filtre gardent leur place).
  const visibleNew = [...document.querySelectorAll('#renta-body tr')].map(tr => tr.dataset.name);
  const visibleSet = new Set(visibleNew);
  let vi = 0;
  customOrder = orderedResources().map(r => visibleSet.has(r.name) ? visibleNew[vi++] : r.name);
  try { localStorage.setItem(LS_ORDER, JSON.stringify(customOrder)); } catch (_) {}

  rentaSort.key = 'game';   // l'ordre manuel devient la vue par défaut
  document.querySelectorAll('#renta-table th').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
  renderRenta();
}

// Délégation : un seul listener sur le tbody (qui persiste aux re-render).
function setupDragReorder() {
  const tbody = document.getElementById('renta-body');
  tbody.addEventListener('pointerdown', e => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();
    dragRow = handle.closest('tr');
    dragRow.classList.add('dragging');
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  });
}

// ── Crafting ─────────────────────────────────────────────────────────────────
function renderCrafting() {
  const resource = document.getElementById('resource-select').value;
  const levels = DATA.crafting[resource] || [];
  document.getElementById('crafting-info').textContent = `${levels.length} niveaux`;

  // coin/h et coin/kpow par niveau, avec la Mastery / Speed bonus / taxe de la ressource sélectionnée.
  const r = DATA.resources.find(x => x.name === resource);
  const bonus = (r && bonusPct[resource] != null) ? bonusPct[resource] / 100 : (r ? (r.bonus || 0) : 0);
  const m = mastery[resource], sf = sellFactor(), po = priceByName(resource);
  const coinCell = v => v == null
    ? (pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>')
    : `<span class="${v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'} font-mono">${fmtPrice(v)}</span>`;

  document.getElementById('crafting-body').innerHTML = levels.map(l => `<tr>
    <td><span class="badge bg-indigo-900 text-indigo-300">${l.level}</span></td>
    <td class="font-mono">${fmt(l.output, 0)}</td>
    <td class="font-mono text-slate-300">${l.duration ?? '—'}</td>
    <td class="text-sky-300">${l.input1 ?? '—'}</td>
    <td class="font-mono">${fmt(l.input1_amount, 2)}</td>
    <td class="text-sky-300">${l.input2 ?? '—'}</td>
    <td class="font-mono">${fmt(l.input2_amount, 2)}</td>
    <td class="text-amber-400">${fmt(l.power, 0)}</td>
    <td class="text-emerald-400">${fmt(l.xp, 0)}</td>
    <td>${coinCell(CoinH.coinPerHour(l, po, priceByName, bonus, m, sf))}</td>
    <td>${coinCell(CoinH.coinPerKPower(l, po, priceByName, m, sf))}</td>
  </tr>`).join('');
}

// ── GeckoTerminal price fetch (prix en COIN, 1 appel multi-pools) ─────────────
const POOL_API = 'https://api.geckoterminal.com/api/v2/networks/ronin/pools/multi/';

async function fetchAllPrices() {
  const btn = document.getElementById('refresh-btn');
  const status = document.getElementById('price-status');
  btn.disabled = true;
  btn.textContent = '⟳ Chargement…';

  const withPool = DATA.resources.filter(r => r.pool);
  const pools = withPool.map(r => r.pool);
  const byAddr = {};                         // adresse minuscule → attributes du pool

  try {
    for (let i = 0; i < pools.length; i += 30) {   // l'API accepte 30 pools max par appel
      const chunk = pools.slice(i, i + 30);
      const res = await fetch(POOL_API + chunk.join(','), {
        headers: { 'Accept': 'application/json;version=20230302' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      for (const p of json.data) byAddr[p.attributes.address.toLowerCase()] = p.attributes;
    }

    // Prix du COIN en USD = quote_token_price_usd d'une pool normale (RESOURCE/COIN).
    let coinUsd = null;
    for (const r of withPool) {
      if (r.quote) continue;
      const a = byAddr[r.pool.toLowerCase()];
      if (a) { coinUsd = parseFloat(a.quote_token_price_usd); break; }
    }

    let ok = 0;
    for (const r of withPool) {
      const a = byAddr[r.pool.toLowerCase()];
      if (!a) { livePrice[r.pool] = null; continue; }
      const price = r.quote
        ? (coinUsd ? parseFloat(a.quote_token_price_usd) / coinUsd : null)  // ressource = quote token → pont USD
        : parseFloat(a.base_token_price_quote_token);                       // ressource = base, quote = COIN
      livePrice[r.pool] = price;
      if (price != null) ok++;
      const pc = a.price_change_percentage;                                 // variation 24h (pools normales)
      dayVar[r.pool] = (!r.quote && pc && pc.h24 != null && pc.h24 !== '') ? parseFloat(pc.h24) : null;
    }
    status.textContent = `✓ ${ok} prix — ${new Date().toLocaleTimeString('fr-FR')}`;
  } catch (e) {
    status.textContent = `Erreur : ${e.message}`;
    console.error(e);
  } finally {
    pricesLoaded = true;
    btn.disabled = false;
    btn.textContent = '↻ Rafraîchir les prix';
    renderRenta();
    renderCrafting();   // colonnes coin/h & coin/kpow de l'onglet Crafting
    if (!weekStarted) { weekStarted = true; fetchWeekVars(); }   // variation 1 sem. en arrière-plan (une fois)
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('data.json?v=' + Date.now());   // cache-bust : toujours la dernière version publiée
    DATA = await res.json();

    // Niveau d'usine + Mastery + Speed bonus : défauts, puis valeurs sauvegardées.
    DATA.resources.forEach(r => { if (r.level != null) {
      factoryLevel[r.name] = r.level; mastery[r.name] = 5.3; bonusPct[r.name] = (r.bonus || 0) * 100;
    } });
    Object.assign(factoryLevel, loadLS(LS_LEVELS));
    Object.assign(mastery, loadLS(LS_MASTERY));
    Object.assign(bonusPct, loadLS(LS_BONUS));
    const savedTax = parseFloat(localStorage.getItem(LS_TAX));   // taxe globale persistée
    if (!isNaN(savedTax)) taxPct = savedTax;
    const taxInput = document.getElementById('tax-input');
    if (taxInput) taxInput.value = taxPct;
    try { const o = JSON.parse(localStorage.getItem(LS_ORDER)); if (Array.isArray(o)) customOrder = o; } catch (e) {}

    // Populate crafting selector
    const sel = document.getElementById('resource-select');
    DATA.resources.forEach(r => {                 // ordre du jeu, recettes uniquement
      if (DATA.crafting[r.name]) sel.innerHTML += `<option value="${r.name}">${r.name}</option>`;
    });

    renderRenta();
    setupDragReorder();
    renderCrafting();
    fetchAllPrices();
  } catch (e) {
    document.body.innerHTML += `<div class="fixed bottom-4 right-4 bg-red-900 text-red-200 p-4 rounded-xl text-sm">
      Erreur chargement data.json : ${e.message}<br>
      Ouvre ce fichier via un serveur local (ex: <code>python -m http.server</code>)
    </div>`;
  }
}

init();
