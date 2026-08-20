let DATA = { resources: [], crafting: {} };
let livePrice = {};      // pool → price
let taxPct = 3.5;        // taxe de vente globale en % (configurable) → facteur de vente = 1 − taxPct/100
let buyTaxPct = 3.5;     // taxe d'achat globale en % (configurable) → facteur d'achat = 1 + buyTaxPct/100
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
  document.getElementById('tab-powerplant').classList.toggle('hidden', tab !== 'powerplant');
  document.getElementById('tab-batteries').classList.toggle('hidden', tab !== 'batteries');
  document.getElementById('tab-chains').classList.toggle('hidden', tab !== 'chains');
  // #tabs : uniquement les onglets de navigation (les boutons « À plat » portent aussi .tab-btn).
  const order = ['chains', 'renta', 'crafting', 'powerplant', 'batteries'];
  document.querySelectorAll('#tabs .tab-btn').forEach((b, i) => b.classList.toggle('active', order[i] === tab));
  if (tab === 'crafting') renderCrafting();   // valeurs à jour (prix/mastery/bonus/taxe courants)
  if (tab === 'powerplant') renderPowerPlant();
  if (tab === 'batteries') renderBatteries();
  if (tab === 'chains') renderChains();
}

// ── Renta ────────────────────────────────────────────────────────────────────
function sortRenta(key) {
  if (rentaSort.key === key) rentaSort.dir *= -1;
  else { rentaSort.key = key; rentaSort.dir = 1; }
  document.querySelectorAll('#renta-table th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
  });
  const thIdx = ['name','coinh','coinkp','prix_live','d24','mastery','bonus','buy','sell','pool'].indexOf(key);
  const ths = document.querySelectorAll('#renta-table th');
  if (thIdx >= 0) ths[thIdx].classList.add(rentaSort.dir === 1 ? 'sorted-asc' : 'sorted-desc');
  renderRenta();
}

// ── coin/h ─────────────────────────────────────────────────────────────────────
let factoryLevel = {};   // ressource → niveau d'usine choisi
let mastery = {};        // ressource → bonus Mastery en % (s'ajoute au yield du niveau, réduit les inputs ; défaut 5.3)
let bonusPct = {};       // ressource → Speed bonus de prod en % (défaut = bonus data.json ×100)
let buyFlag = {};        // ressource → true si j'achète ses inputs au marché (taxe d'achat appliquée)
let sellFlag = {};       // ressource → true si je vends son output au marché (taxe de vente appliquée)
let boughtFlag = {};     // ressource → true si je l'achète au marché au lieu de la produire (onglet Chaînes)
let pricesLoaded = false;
let dayVar = {};         // pool → variation 24h (%)

// Persistance navigateur (les valeurs saisies survivent au rechargement).
const LS_LEVELS = 'cw_levels', LS_MASTERY = 'cw_mastery_pct', LS_BONUS = 'cw_bonus_pct';   // _pct : valeurs en %
const LS_TAX = 'cw_tax', LS_BUYTAX = 'cw_buytax';   // taxes globales vente/achat (scalaires)
const LS_BUY = 'cw_buy', LS_SELL = 'cw_sell';       // cases Achat/Vente par ressource
const LS_BOUGHT = 'cw_bought';                      // cases « Acheter » de l'onglet Chaînes
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
  return CoinH.coinPerHour(recipe, priceByName(name), priceByName, bonus, mastery[name],
                           sellFactorFor(name), buyFactorFor(name));
}

// coin/kpower : coins par 1000 de power (indépendant de la vitesse).
function coinPerKPower(name) {
  const r = DATA.resources.find(x => x.name === name);
  if (!r || r.level == null) return null;
  const recipe = (DATA.crafting[name] || []).find(l => l.level === factoryLevel[name]);
  return CoinH.coinPerKPower(recipe, priceByName(name), priceByName, mastery[name],
                             sellFactorFor(name), buyFactorFor(name));
}

// Les taxes sont des frais réels sur une transaction : elles ne s'appliquent que si la transaction a lieu.
// Vente cochée → l'output part au marché (1 − taxe_vente) ; décochée → consommé en aval, aucune taxe.
// Achat coché  → les inputs viennent du marché (1 + taxe_achat) ; décoché → produits soi-même, aucune taxe.
function sellFactorFor(name) { return sellFlag[name] ? 1 - taxPct / 100 : 1; }
function buyFactorFor(name) { return buyFlag[name] ? 1 + buyTaxPct / 100 : 1; }

function onTaxChange(val) { taxPct = +val; try { localStorage.setItem(LS_TAX, taxPct); } catch (e) {} renderRenta(); }
function onBuyTaxChange(val) { buyTaxPct = +val; try { localStorage.setItem(LS_BUYTAX, buyTaxPct); } catch (e) {} renderRenta(); }
function onBuyChange(name, checked) { buyFlag[name] = checked; saveLS(LS_BUY, buyFlag); renderRenta(); }
function onSellChange(name, checked) { sellFlag[name] = checked; saveLS(LS_SELL, sellFlag); renderRenta(); }

// Le niveau est éditable depuis l'onglet Prix ET l'onglet Chaînes : on rafraîchit les deux.
function onLevelChange(name, val) { factoryLevel[name] = +val; saveLS(LS_LEVELS, factoryLevel); renderRenta(); renderChains(); }
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

// Colonne Achat : les inputs de cette recette sont-ils achetés au marché ? ("—" si la recette n'a pas d'input)
function buyCell(r) {
  if (r.level == null) return '—';
  const recipe = (DATA.crafting[r.name] || []).find(l => l.level === factoryLevel[r.name]);
  if (!recipe || !recipe.input1) return '—';
  return `<input type="checkbox"${buyFlag[r.name] ? ' checked' : ''}
     onchange="onBuyChange('${r.name}', this.checked)" class="accent-rose-500">`;
}

// Colonne Vente : l'output de cette recette est-il vendu au marché (vs consommé par une recette en aval) ?
function sellCell(r) {
  if (r.level == null) return '—';
  return `<input type="checkbox"${sellFlag[r.name] ? ' checked' : ''}
     onchange="onSellChange('${r.name}', this.checked)" class="accent-emerald-500">`;
}

// Variation 24h (déjà fournie par le fetch de prix, aucun appel supplémentaire).
function dayCell(r) {
  if (!r.pool || r.quote) return '—';
  const v = dayVar[r.pool];
  if (v === undefined) return pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>';
  return fmtVar(v);
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
                      : k === 'd24' ? (dayVar[r.pool] ?? null) : r[k];
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
      <td>${masteryCell(r)}</td>
      <td>${bonusCell(r)}</td>
      <td class="text-center">${buyCell(r)}</td>
      <td class="text-center">${sellCell(r)}</td>
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
let craftingFlat = false;   // bouton « À plat » : affiche toutes les recettes

function toggleFlat() {
  craftingFlat = !craftingFlat;
  document.getElementById('flat-btn').classList.toggle('active', craftingFlat);
  document.getElementById('resource-select').disabled = craftingFlat;   // sélecteur inutile en vue à plat
  renderCrafting();
}

function renderCrafting() {
  const flat = craftingFlat;                            // vue à plat : toutes les ressources
  const sel = document.getElementById('resource-select').value;
  document.getElementById('crafting-res-th').classList.toggle('hidden', !flat);

  // entrées à afficher : {name, l} (l = recette d'un niveau).
  const entries = [];
  if (flat) DATA.resources.forEach(r => (DATA.crafting[r.name] || []).forEach(l => entries.push({ name: r.name, l })));
  else (DATA.crafting[sel] || []).forEach(l => entries.push({ name: sel, l }));

  document.getElementById('crafting-info').textContent = flat
    ? `${entries.length} recettes — ${Object.keys(DATA.crafting).length} ressources`
    : `${entries.length} niveaux`;

  const coinCell = v => v == null
    ? (pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>')
    : `<span class="${v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'} font-mono">${fmtPrice(v)}</span>`;
  const costCell = v => v == null
    ? (pricesLoaded ? '<span class="neutral">—</span>' : '<span class="spin neutral">⟳</span>')
    : `<span class="text-rose-300 font-mono">${fmtPrice(v)}</span>`;

  const sumByRes = {};   // somme cumulée des coûts d'upgrade par ressource (en ordre de niveau)
  document.getElementById('crafting-body').innerHTML = entries.map(({ name, l }) => {
    // coin/h et coin/kpow avec la Mastery / Speed bonus / cases Achat-Vente de CETTE ressource.
    const r = DATA.resources.find(x => x.name === name);
    const bonus = (r && bonusPct[name] != null) ? bonusPct[name] / 100 : (r ? (r.bonus || 0) : 0);
    const m = mastery[name], po = priceByName(name);
    const sf = sellFactorFor(name), bf = buyFactorFor(name);
    const uc = CoinH.upgradeCost(l, priceByName);                    // coût d'upgrade vers ce niveau (COIN)
    if (uc != null) sumByRes[name] = (sumByRes[name] || 0) + uc;     // somme cumulée (ordre de niveau)
    const us = sumByRes[name] != null ? sumByRes[name] : null;
    const resTd = flat ? `<td class="font-semibold text-white">${name}</td>` : '';
    return `<tr>
      ${resTd}<td><span class="badge bg-indigo-900 text-indigo-300">${l.level}</span></td>
      <td>${coinCell(CoinH.coinPerHour(l, po, priceByName, bonus, m, sf, bf))}</td>
      <td>${coinCell(CoinH.coinPerKPower(l, po, priceByName, m, sf, bf))}</td>
      <td>${costCell(uc)}</td>
      <td>${costCell(us)}</td>
      <td class="text-sky-300">${l.cost_symbol ?? '—'}</td>
      <td class="font-mono">${fmt(l.cost_amount, 0)}</td>
      <td class="font-mono">${fmt(l.output, 0)}</td>
      <td>${fmtVar(l.production_change_pct)}</td>
      <td class="font-mono text-slate-300">${l.yield_pct == null ? '—' : fmt(l.yield_pct, 2) + ' %'}</td>
      <td class="font-mono text-slate-300">${l.duration ?? '—'}</td>
      <td class="text-sky-300">${l.input1 ?? '—'}</td>
      <td class="font-mono">${fmt(l.input1_amount, 2)}</td>
      <td class="text-sky-300">${l.input2 ?? '—'}</td>
      <td class="font-mono">${fmt(l.input2_amount, 2)}</td>
      <td class="text-amber-400">${fmt(l.power, 0)}</td>
      <td class="text-emerald-400">${fmt(l.xp, 0)}</td>
    </tr>`;
  }).join('');
}

// ── PowerPlant ───────────────────────────────────────────────────────────────
// coin/kpow d'une centrale : coût (en COIN) de l'input consommé par 1000 de power produit.
// N'existe que pour STEAMFORGE (LAVA) et REACTOR (HYDROGEN) ; AIRSTREAM/SUNFORGE n'ont pas d'input -> "—".
function ppKpowCell(l) {
  const v = CoinH.powerPlantCostPerKPower(l, priceByName);
  if (v == null) return (l.input && pricesLoaded) ? '<span class="neutral">—</span>'
    : (l.input ? '<span class="spin neutral">⟳</span>' : '—');
  return `<span class="text-rose-300 font-mono">${fmtPrice(v)}</span>`;
}

// Coût d'upgrade (en COIN) d'un niveau de centrale.
function ppUpCostCell(l) {
  const v = CoinH.upgradeCost(l, priceByName);
  if (v == null) return (l.cost_symbol && pricesLoaded) ? '<span class="neutral">—</span>'
    : (l.cost_symbol ? '<span class="spin neutral">⟳</span>' : '—');
  return `<span class="text-rose-300 font-mono">${fmtPrice(v)}</span>`;
}

// Efficacité d'upgrade : gain de power/jour (kpow) par kcoin dépensé.
function ppEfficiencyCell(l, prevPerDay) {
  const v = CoinH.powerPlantUpgradeEfficiency(l, prevPerDay, priceByName);
  if (v == null) return (l.cost_symbol && pricesLoaded) ? '<span class="neutral">—</span>'
    : (l.cost_symbol ? '<span class="spin neutral">⟳</span>' : '—');
  return `<span class="text-emerald-400 font-mono">${fmt(v, 2)}</span>`;
}

let powerplantFlat = true;   // vue par défaut : toutes les centrales à plat

function togglePowerPlantFlat() {
  powerplantFlat = !powerplantFlat;
  document.getElementById('powerplant-flat-btn').classList.toggle('active', powerplantFlat);
  document.getElementById('powerplant-select').disabled = powerplantFlat;   // sélecteur inutile en vue à plat
  renderPowerPlant();
}

function renderPowerPlant() {
  const flat = powerplantFlat;
  const sel = document.getElementById('powerplant-select').value;
  document.getElementById('powerplant-res-th').classList.toggle('hidden', !flat);

  // entrées à afficher : {name, l} (l = un niveau de centrale).
  const entries = [];
  if (flat) Object.keys(DATA.powerplants).forEach(name => (DATA.powerplants[name] || []).forEach(l => entries.push({ name, l })));
  else (DATA.powerplants[sel] || []).forEach(l => entries.push({ name: sel, l }));

  document.getElementById('powerplant-info').textContent = flat
    ? `${entries.length} niveaux — ${Object.keys(DATA.powerplants).length} centrales`
    : `${entries.length} niveaux`;

  const prevPerDayByName = {};   // per_day du niveau précédent, par centrale (0 si 1er niveau)
  document.getElementById('powerplant-body').innerHTML = entries.map(({ name, l }) => {
    const prevPerDay = prevPerDayByName[name] || 0;
    prevPerDayByName[name] = l.per_day;
    const resTd = flat ? `<td class="font-semibold text-white">${name}</td>` : '';
    return `<tr>
      ${resTd}<td><span class="badge bg-indigo-900 text-indigo-300">${l.level}</span></td>
      <td>${ppKpowCell(l)}</td>
      <td>${ppUpCostCell(l)}</td>
      <td>${ppEfficiencyCell(l, prevPerDay)}</td>
      <td class="font-mono">${fmt(l.max_count, 0)}</td>
      <td class="text-amber-400 font-mono">${fmt(l.power, 0)}</td>
      <td class="text-amber-400 font-mono">${fmt(l.per_hour, 0)}</td>
      <td class="text-amber-400 font-mono">${fmt(l.per_day, 0)}</td>
      <td class="font-mono text-slate-300">${l.cycle_duration ?? '—'}</td>
      <td class="text-sky-300">${l.input ?? '—'}</td>
      <td class="font-mono">${fmt(l.input_amount, 5)}</td>
      <td class="font-mono text-slate-300">${l.upgrade_duration ?? '—'}</td>
      <td class="text-sky-300">${l.cost_symbol ?? '—'}</td>
      <td class="font-mono">${fmt(l.cost_amount, 0)}</td>
    </tr>`;
  }).join('');
}

// ── Batteries ────────────────────────────────────────────────────────────────
function bUpCostCell(l) {
  const v = CoinH.upgradeCost(l, priceByName);
  if (v == null) return (l.cost_symbol && pricesLoaded) ? '<span class="neutral">—</span>'
    : (l.cost_symbol ? '<span class="spin neutral">⟳</span>' : '—');
  return `<span class="text-rose-300 font-mono">${fmtPrice(v)}</span>`;
}

// Efficacité d'upgrade : gain de capacité par coin dépensé.
function bEfficiencyCell(l, prevCapacity) {
  const v = CoinH.batteryUpgradeEfficiency(l, prevCapacity, priceByName);
  if (v == null) return (l.cost_symbol && pricesLoaded) ? '<span class="neutral">—</span>'
    : (l.cost_symbol ? '<span class="spin neutral">⟳</span>' : '—');
  return `<span class="text-emerald-400 font-mono">${fmt(v, 2)}</span>`;
}

let batteriesFlat = true;   // vue par défaut : toutes les batteries à plat

function toggleBatteriesFlat() {
  batteriesFlat = !batteriesFlat;
  document.getElementById('batteries-flat-btn').classList.toggle('active', batteriesFlat);
  document.getElementById('batteries-select').disabled = batteriesFlat;   // sélecteur inutile en vue à plat
  renderBatteries();
}

function renderBatteries() {
  const flat = batteriesFlat;
  const sel = document.getElementById('batteries-select').value;
  document.getElementById('batteries-res-th').classList.toggle('hidden', !flat);

  // entrées à afficher : {name, l} (l = un niveau de batterie).
  const entries = [];
  if (flat) Object.keys(DATA.batteries || {}).forEach(name => (DATA.batteries[name] || []).forEach(l => entries.push({ name, l })));
  else (DATA.batteries[sel] || []).forEach(l => entries.push({ name: sel, l }));

  document.getElementById('batteries-info').textContent = flat
    ? `${entries.length} niveaux — ${Object.keys(DATA.batteries || {}).length} batteries`
    : `${entries.length} niveaux`;

  const prevCapacityByName = {};   // capacity du niveau précédent, par batterie (0 si 1er niveau)
  document.getElementById('batteries-body').innerHTML = entries.map(({ name, l }) => {
    const prevCapacity = prevCapacityByName[name] || 0;
    prevCapacityByName[name] = l.capacity;
    const resTd = flat ? `<td class="font-semibold text-white">${name}</td>` : '';
    return `<tr>
      ${resTd}<td><span class="badge bg-indigo-900 text-indigo-300">${l.level}</span></td>
      <td>${bUpCostCell(l)}</td>
      <td>${bEfficiencyCell(l, prevCapacity)}</td>
      <td class="font-mono">${fmt(l.max_count, 0)}</td>
      <td class="text-amber-400 font-mono">${fmt(l.capacity, 0)}</td>
      <td class="font-mono text-slate-300">${l.upgrade_duration ?? '—'}</td>
      <td class="text-sky-300">${l.cost_symbol ?? '—'}</td>
      <td class="font-mono">${fmt(l.cost_amount, 0)}</td>
    </tr>`;
  }).join('');
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
    renderPowerPlant();   // colonne coin/kpow de l'onglet PowerPlant
    renderBatteries();   // colonnes UpCost & up capa/coin de l'onglet Batteries
    renderChains();      // rentabilité de chaîne (dépend des prix live)
  }
}

// ── Chaînes ──────────────────────────────────────────────────────────────────
let chainsFlat = true;      // vue à plat par défaut (comme PowerPlant/Batteries)

// Contexte passé à CoinH.chainMetrics : recettes au niveau choisi, prix live, Mastery/Speed bonus, taxes.
function chainCtx() {
  return {
    recipeOf: n => (DATA.crafting[n] || []).find(l => l.level === factoryLevel[n]) || null,
    priceOf: priceByName,
    masteryOf: n => mastery[n],
    speedOf: n => {
      const r = DATA.resources.find(x => x.name === n);
      return (r && bonusPct[n] != null) ? bonusPct[n] / 100 : (r ? (r.bonus || 0) : 0);
    },
    boughtOf: n => !!boughtFlag[n],
    buyFactor: 1 + buyTaxPct / 100,
    sellFactor: 1 - taxPct / 100,
  };
}

// Étapes de production de la chaîne de `name`, amont d'abord. Même règle de coupure que chainNode :
// une ressource achetée (sans recette, sans input, ou cochée « Acheter ») n'est pas une étape.
function chainSteps(name, ctx, seen, stack, asInput) {
  seen = seen || []; stack = stack || [];
  if (seen.indexOf(name) >= 0 || stack.indexOf(name) >= 0) return seen;
  const recipe = ctx.recipeOf(name);
  if (!recipe) return seen;                     // matière sans recette : achetée, pas une étape
  const base = !recipe.input1 && !recipe.input2;
  if (asInput && (base || ctx.boughtOf(name))) return seen;
  for (const s of [recipe.input1, recipe.input2]) if (s) chainSteps(s, ctx, seen, stack.concat(name), true);
  seen.push(name);
  return seen;
}

function onBoughtChange(name, checked) { boughtFlag[name] = checked; saveLS(LS_BOUGHT, boughtFlag); renderChains(); }

// Saut vers la chaîne d'une autre ressource (depuis le débouché nommé dans la barre d'info) :
// le débouché est une branche sœur, donc invisible dans la chaîne courante — on y emmène l'user.
function onChainJump(name) {
  if (chainsFlat) toggleChainsFlat();          // le sélecteur est désactivé en vue à plat
  document.getElementById('chains-select').value = name;
  renderChains();
}

function toggleChainsFlat() {
  chainsFlat = !chainsFlat;
  document.getElementById('chains-flat-btn').classList.toggle('active', chainsFlat);
  document.getElementById('chains-select').disabled = chainsFlat;
  renderChains();
}

function renderChains() {
  const ctx = chainCtx();
  const sel = document.getElementById('chains-select').value;
  // Liste AFFICHÉE : on ignore les cases « Acheter » (ctx sans boughtOf), sinon cocher une étape la
  // ferait disparaître avec sa propre case, la rendant impossible à décocher.
  const displayCtx = Object.assign({}, ctx, { boughtOf: () => false });
  // Vue à plat : toutes les ressources produisibles. Sinon : les étapes de la chaîne choisie (amont d'abord).
  const names = chainsFlat
    ? DATA.resources.filter(r => DATA.crafting[r.name]).map(r => r.name)
    : chainSteps(sel, displayCtx);

  // Cache d'un rendu : chaque chaîne est réévaluée plusieurs fois (ligne, meilleur point de vente,
  // barre d'info) et chainMetrics repart d'une mémoïsation vierge à chaque appel.
  const mcache = {};
  const metrics = n => (n in mcache ? mcache[n] : (mcache[n] = CoinH.chainMetrics(n, ctx)));

  // Seul signal ACTIONNABLE : acheter la ressource revient moins cher que la produire.
  // (Une étape « mince » — marge d'étape négative — n'est PAS un signal : un intermédiaire comme
  //  OXYGEN est un passage obligé vers GAS, l'arrêter casserait la chaîne.)
  const cheaperToBuy = n => {
    if (boughtFlag[n]) return false;
    const mm = metrics(n), p = priceByName(n);
    return !!mm && p != null && p * ctx.buyFactor < mm.cost;
  };
  // Étapes réellement dans la chaîne (null en vue à plat, où chaque ligne est sa propre racine).
  const chainSet = chainsFlat ? null : new Set(chainSteps(sel, ctx));
  // Chaque chaîne est une BOÎTE NOIRE : on ne raisonne jamais d'une chaîne à l'autre. Le ★ désigne
  // le meilleur coin/h PARMI LES ÉTAPES DE CETTE CHAÎNE, donc l'endroit où s'arrêter et vendre.
  // Valeur ajoutée par l'étape finale (mémoïsée) : « faire X » rapporte-t-il plus que vendre ses inputs ?
  const vaCache = {};
  const valueAdd = n => (n in vaCache ? vaCache[n] : (vaCache[n] = CoinH.stepValueAdd(n, ctx, metrics)));
  const worthMaking = n => { const v = valueAdd(n); return !!v && v.added > 0; };
  // Dans une chaîne dont l'étape finale ne vaut pas le coup, la ★ va sur l'input qu'il faut vendre.
  const starOfChain = () => {
    const v = valueAdd(sel);
    if (!v) return null;
    if (v.added > 0) return sel;
    const best = v.inputs.filter(i => i.margin > 0).sort((a, b) => b.margin - a.margin)[0];
    return best ? best.name : null;
  };
  const chainStar = chainsFlat ? null : starOfChain();

  const info = document.getElementById('chains-info');
  // Une ressource moins chère à acheter ne peut pas être « à vendre » : le ⚠ prime, comme sur la ligne.
  const isStar = n => !boughtFlag[n] && !cheaperToBuy(n) && worthMaking(n);
  const chainLink = n => `<a href="#" onclick="onChainJump('${n}');return false"
     class="text-indigo-300 hover:underline">${n}</a>`;
  if (chainsFlat) {
    const buy = names.filter(cheaperToBuy);
    const stars = names.filter(isStar);
    info.innerHTML = `${names.length} ressources — clique un nom pour voir sa chaîne`
      + (stars.length ? ` — ★ ${stars.length} à produire jusqu'au bout : ${stars.map(chainLink).join(', ')}` : '')
      + (buy.length ? ` — ⚠ ${buy.length} moins chères à acheter : ${buy.join(', ')}` : '');
  } else {
    // VERDICT en tête : la chaîne ne sert qu'à répondre « dois-je produire cette ressource ? ».
    // Comparaison à quantité d'inputs égale (voir CoinH.stepValueAdd), donc valable même quand
    // l'usine finale est lente et n'absorbe qu'une partie de l'amont.
    const steps = chainSteps(sel, ctx);            // décompte réel : achats déduits
    const buy = steps.filter(cheaperToBuy);
    const va = valueAdd(sel);
    let verdict = '';
    if (va) {
      const sold = va.inputs.filter(i => i.margin > 0).map(i => i.name).join(' et ');
      verdict = va.added > 0
        ? `<span class="verdict ok">✔ FAIS DU ${sel}</span>
           <span class="text-slate-400">+${fmtPrice(va.added)} par unité vs vendre ${sold || 'ses inputs'}</span>`
        : `<span class="verdict ko">✘ NE FAIS PAS DE ${sel}</span>
           <span class="text-slate-400">${fmtPrice(va.added)} par unité — vends ton ${sold || 'input'} à la place</span>`;
    }
    info.innerHTML = verdict
      + ` <span class="text-slate-500">— ${steps.length} étapes</span>`
      + (buy.length ? ` <span class="text-slate-500">— ⚠ ${buy.length} moins chères à acheter : ${buy.join(', ')}</span>` : '');
  }

  const wait = '<span class="spin neutral">⟳</span>';
  // Case « Acheter » : coupe la chaîne ici, la ressource est prise à son prix de marché.
  // Désactivée si elle n'a pas de prix, ou si c'est une ressource de base (déjà toujours achetée).
  const boughtCell = n => {
    const recipe = ctx.recipeOf(n);
    const base = recipe && !recipe.input1 && !recipe.input2;
    const noPrice = priceByName(n) == null;
    if (base) return '<span class="neutral" title="Ressource de base : toujours comptée à l\'achat">—</span>';
    if (noPrice) return '<span class="neutral" title="Pas de prix de marché : impossible à acheter">—</span>';
    return `<input type="checkbox"${boughtFlag[n] ? ' checked' : ''}
       onchange="onBoughtChange('${n}', this.checked)" class="accent-amber-500">`;
  };
  // Prix d'achat au marché de la ressource, taxe d'achat comprise (— si pas de cours).
  const buyPriceCell = n => {
    const p = priceByName(n);
    return p == null ? (pricesLoaded ? '—' : '⟳') : fmtPrice(p * ctx.buyFactor);
  };
  const signCell = v => v == null
    ? (pricesLoaded ? '<span class="neutral">—</span>' : wait)
    : `<span class="${v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'} font-mono">${fmtPrice(v)}</span>`;
  // Colonne Res : icône du jeu si on l'a, sinon nom tronqué à 4 caractères (tableau étroit).
  // Nom complet toujours en infobulle. NB : deux couples se confondent à 4 lettres —
  // CERAMICS/CERAMICKEY et GLASS/GLASSKEY, d'où l'intérêt de l'icône.
  const resLabel = n => ICONS.has(n)
    ? `<img src="icons/${n.toLowerCase()}.png" alt="${n}" class="res-icon">`
    : String(n).slice(0, 4);
  const shortName = n => `<span data-tip="${n}">${resLabel(n)}</span>`;
  // En vue à plat, cliquer ouvre le détail de la chaîne de cette ressource.
  const resCell = n => chainsFlat
    ? `<a href="#" onclick="onChainJump('${n}');return false"
         class="hover:underline decoration-dotted" data-tip="${n} — voir le détail de sa chaîne">${resLabel(n)}</a>`
    : shortName(n);
  // Niveau d'usine modifiable ici aussi (même état que l'onglet Prix, donc même handler).
  const levelCell = n => {
    const levels = DATA.crafting[n] || [];
    if (!levels.length) return '—';
    const opts = levels.map(l =>
      `<option value="${l.level}"${l.level === factoryLevel[n] ? ' selected' : ''}>${l.level}</option>`).join('');
    return `<select onchange="onLevelChange('${n}', this.value)"
       class="text-xs bg-slate-800 border border-slate-600 rounded px-1 py-0.5">${opts}</select>`;
  };

  document.getElementById('chains-body').innerHTML = names.map(name => {
    const m = CoinH.chainMetrics(name, ctx);
    const steps = chainSteps(name, ctx).length;
    if (!m) return `<tr>
      <td class="font-semibold text-white">${shortName(name)}</td>
      <td>${levelCell(name)}</td>
      <td class="text-center">${boughtCell(name)}</td>
      <td colspan="10" class="neutral">${pricesLoaded ? 'prix manquant dans la chaîne' : wait}</td>
    </tr>`;
    // Prix net encaissé = marge + coût matières (par construction de chainMetrics) : garantit que la
    // colonne affichée est exactement celle qui a servi au calcul de la marge.
    // Goulot : rouge si c'est l'usine de la ligne elle-même, sinon c'est une étape amont.
    const gl = m.bottleneck === name
      ? `<span class="text-rose-300">${shortName(m.bottleneck)}</span>`
      : `<span class="text-slate-400">${m.bottleneck ? shortName(m.bottleneck) : '—'}</span>`;
    // Ligne achetée : atténuée, car elle ne fait plus partie de la chaîne — ses chiffres restent
    // affichés pour montrer l'économie de production à laquelle on renonce.
    // Deux repères, tous deux ACTIONNABLES :
    //  ⚠ = l'acheter revient moins cher que la produire -> coche Buy ;
    //  ★ = meilleur coin/h de la chaîne -> c'est là qu'il faut vendre.
    // On ne signale PAS les étapes « minces » (marge d'étape négative) : un intermédiaire obligatoire
    // comme OXYGEN le serait à tort, alors qu'il faut continuer jusqu'à l'étape ★.
    // En vue par chaîne, seules les étapes réellement dans la chaîne comptent : celles en amont d'une
    // étape achetée restent affichées (pour pouvoir la décocher) mais ne la nourrissent plus.
    const bought = !!boughtFlag[name];
    const inChain = !chainSet || chainSet.has(name);
    const warn = !bought && inChain && cheaperToBuy(name);
    // ★ = ce qu'il faut produire/vendre : la ressource si son étape ajoute de la valeur, sinon
    // (vue par chaîne) l'input qu'il vaut mieux vendre tel quel.
    const best = !bought && (chainsFlat ? worthMaking(name) : name === chainStar);
    const trAttr = bought ? ' style="opacity:.5"' : (warn ? ' class="warn"' : (best ? ' class="best"' : ''));
    const flag = warn
      ? `<span class="text-rose-400" title="Moins chère à acheter : ${fmtPrice(priceByName(name) * ctx.buyFactor)} au marché contre ${fmtPrice(m.cost)} à produire. Coche Buy.">⚠ </span>`
      : (best ? `<span class="text-emerald-400" title="À produire : ${fmtPrice((valueAdd(name) || {}).added)} de plus par unité que vendre ses inputs.">★ </span>` : '');
    // Ligne sans ★ : on dit de combien son étape détruit de la valeur.
    const v = valueAdd(name);
    const hint = (best || bought || !v || v.added > 0) ? ''
      : ` title="Étape perdante : ${fmtPrice(v.added)} par unité — vendre ses inputs rapporte plus."`;
    return `<tr${trAttr}${hint}>
      <td class="font-semibold text-white"><span class="res-cell">${flag}${resCell(name)}</span></td>
      <td>${levelCell(name)}</td>
      <td class="text-center">${boughtCell(name)}</td>
      <td>${signCell(m.coinH)}</td>
      <td>${signCell(m.coinKPow)}</td>
      <td>${signCell(m.margin)}</td>
      <td><span class="text-rose-300 font-mono">${fmtPrice(m.cost)}</span></td>
      <td><span class="text-rose-300 font-mono">${fmtPrice(m.directCost)}</span></td>
      <td><span class="text-amber-300 font-mono">${fmtPrice(m.margin + m.cost)}</span></td>
      <td><span class="text-rose-300 font-mono">${buyPriceCell(name)}</span></td>
      <td class="font-mono text-slate-300">${fmt(m.power / 1000, 1)}</td>
      <td class="font-mono text-slate-300">${fmt(m.rate, 3)}</td>
      <td>${gl}</td>
      <td class="font-mono text-slate-400">${steps}</td>
    </tr>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('data.json?v=' + Date.now());   // cache-bust : toujours la dernière version publiée
    DATA = await res.json();

    // Niveau d'usine + Mastery + Speed bonus : défauts, puis valeurs sauvegardées.
    // Vente : cochée par défaut (on vend ce qu'on produit). Achat : coché seulement si un input n'a
    // aucune recette (EARTH/WATER/FIRE/DUST) — il ne peut alors venir que du marché.
    DATA.resources.forEach(r => { if (r.level != null) {
      factoryLevel[r.name] = r.level; mastery[r.name] = 5.3; bonusPct[r.name] = (r.bonus || 0) * 100;
      sellFlag[r.name] = true;
      buyFlag[r.name] = (DATA.crafting[r.name] || []).some(l =>
        [l.input1, l.input2].some(i => i && !DATA.crafting[i]));
    } });
    Object.assign(factoryLevel, loadLS(LS_LEVELS));
    Object.assign(mastery, loadLS(LS_MASTERY));
    Object.assign(bonusPct, loadLS(LS_BONUS));
    Object.assign(buyFlag, loadLS(LS_BUY));
    Object.assign(sellFlag, loadLS(LS_SELL));
    Object.assign(boughtFlag, loadLS(LS_BOUGHT));   // cases « Acheter » de l'onglet Chaînes
    const savedTax = parseFloat(localStorage.getItem(LS_TAX));   // taxes globales persistées
    if (!isNaN(savedTax)) taxPct = savedTax;
    const savedBuyTax = parseFloat(localStorage.getItem(LS_BUYTAX));
    if (!isNaN(savedBuyTax)) buyTaxPct = savedBuyTax;
    const taxInput = document.getElementById('tax-input');
    if (taxInput) taxInput.value = taxPct;
    const buyTaxInput = document.getElementById('buytax-input');
    if (buyTaxInput) buyTaxInput.value = buyTaxPct;
    try { const o = JSON.parse(localStorage.getItem(LS_ORDER)); if (Array.isArray(o)) customOrder = o; } catch (e) {}

    // Populate crafting selector
    const sel = document.getElementById('resource-select');
    DATA.resources.forEach(r => {                 // ordre du jeu, recettes uniquement
      if (DATA.crafting[r.name]) sel.innerHTML += `<option value="${r.name}">${r.name}</option>`;
    });

    // Populate powerplant selector (désactivé par défaut : vue à plat)
    const ppSel = document.getElementById('powerplant-select');
    Object.keys(DATA.powerplants || {}).forEach(name => {
      ppSel.innerHTML += `<option value="${name}">${name}</option>`;
    });
    ppSel.disabled = powerplantFlat;

    // Populate batteries selector (désactivé par défaut : vue à plat)
    const bSel = document.getElementById('batteries-select');
    Object.keys(DATA.batteries || {}).forEach(name => {
      bSel.innerHTML += `<option value="${name}">${name}</option>`;
    });
    bSel.disabled = batteriesFlat;

    // Populate chains selector (désactivé par défaut : vue à plat) — ressources produisibles
    const cSel = document.getElementById('chains-select');
    DATA.resources.forEach(r => {
      if (DATA.crafting[r.name]) cSel.innerHTML += `<option value="${r.name}">${r.name}</option>`;
    });
    cSel.disabled = chainsFlat;

    renderRenta();
    setupDragReorder();
    renderCrafting();
    renderPowerPlant();
    renderBatteries();
    renderChains();
    fetchAllPrices();
  } catch (e) {
    document.body.innerHTML += `<div class="fixed bottom-4 right-4 bg-red-900 text-red-200 p-4 rounded-xl text-sm">
      Erreur chargement data.json : ${e.message}<br>
      Ouvre ce fichier via un serveur local (ex: <code>python -m http.server</code>)
    </div>`;
  }
}

// Ressources dont on a l'icône du jeu dans icons/ (média kit officiel).
// Les autres (ajouts récents : DUST, BOLTS, clés, WIRE/NEST, WRAP, BOOK...) n'y sont
// pas encore : elles retombent sur le nom tronqué.
const ICONS = new Set(['ACID', 'ALGAE', 'CEMENT', 'CERAMICS', 'CLAY', 'COPPER', 'DYNAMITE', 'EARTH',
  'ENERGY', 'FIBERGLASS', 'FIRE', 'FUEL', 'GAS', 'GLASS', 'HEAT', 'HYDROGEN', 'LAVA', 'MUD', 'OIL',
  'OXYGEN', 'PLASTICS', 'SAND', 'SCREWS', 'SEAWATER', 'STEAM', 'STEEL', 'STONE', 'SULFUR', 'WATER']);

// ── Infobulles tactiles ──────────────────────────────────────────────────────
// title= n'apparaît jamais sur mobile (pas de survol) : les éléments [data-tip]
// affichent leur texte au survol ET au tap, dans une bulle positionnée à la main.
function setupTips() {
  const tip = document.getElementById('tip');
  const hide = () => { tip.style.display = 'none'; };
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect();
    // Au-dessus de l'élément si la place manque en dessous ; borné à l'écran.
    const top = r.bottom + 6 + t.height > innerHeight ? r.top - t.height - 6 : r.bottom + 6;
    tip.style.left = Math.max(4, Math.min(r.left, innerWidth - t.width - 4)) + 'px';
    tip.style.top = Math.max(4, top) + 'px';
  };
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;               // le tactile passe par le click
    const el = e.target.closest('[data-tip]');
    el ? show(el) : hide();
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-tip]');
    el ? show(el) : hide();
  });
  addEventListener('scroll', hide, true);
}

setupTips();
init();
