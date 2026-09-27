// Tests de non-régression sur la structure de data.json (onglets bâtiments du Game Data).
// Vérifie que build_data.py produit bien les groupes attendus et que le coût d'évolution
// en COIN (upgradeCost) est calculable sur chaque niveau qui a un COST SYMBOL.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { upgradeCost } = require('../coinh.js');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));

test('data.json contient les groupes des onglets bâtiments', () => {
  for (const k of ['educationals', 'houses', 'hatcheries', 'buildings', 'townhall']) {
    assert.ok(DATA[k], `${k} manquant`);
  }
  assert.deepStrictEqual(Object.keys(DATA.educationals).sort(), ['SCHOOL', 'UNIVERSITY']);
  assert.ok(DATA.buildings.WORKSHOP && DATA.buildings.VAULT && DATA.buildings.SECRET_LAB);
  // Les familles qui ont leur propre onglet sont exclues de Buildings (Sheet dédié plus riche).
  for (const n of Object.keys(DATA.buildings)) {
    assert.ok(!/^(TOWN_HALL|BATTERY|POWER_PLANT|HATCHERY|HOUSE|EDUCATIONAL)/.test(n), n);
  }
});

test('niveaux triés et champs communs présents', () => {
  const groups = [DATA.educationals, DATA.houses, DATA.hatcheries, DATA.buildings];
  for (const g of groups) {
    for (const [name, levels] of Object.entries(g)) {
      assert.ok(levels.length > 0, name);
      levels.forEach((l, i) => {
        if (i) assert.ok(l.level > levels[i - 1].level, `${name} niveaux non triés`);
        assert.ok('upgrade_duration' in l && 'cost_symbol' in l && 'cost_amount' in l, name);
      });
    }
  }
  DATA.townhall.forEach((l, i) => {
    if (i) assert.ok(l.level > DATA.townhall[i - 1].level, 'townhall non trié');
    assert.ok('power_capacity' in l && 'cost_symbol' in l, 'townhall champs');
  });
});

test('SCHOOL_2 = ligne du Game Data (STEEL x4, 2 slots) et talents en %', () => {
  const l = DATA.educationals.SCHOOL.find(x => x.level === 2);
  assert.strictEqual(l.cost_symbol, 'STEEL');
  assert.strictEqual(l.cost_amount, 4);
  assert.strictEqual(l.slots, 2);
  assert.strictEqual(l.mode, 'LEARN');
  assert.strictEqual(l.talents.length, 6);
  assert.ok(Math.abs(l.talents.reduce((a, b) => a + b, 0) - 100) < 0.01);
});

test('coût d\'évolution en COIN calculable dès que le symbole a un prix', () => {
  const price = sym => (sym === 'STEEL' ? 10 : null);
  const l = DATA.educationals.SCHOOL.find(x => x.level === 2);
  assert.strictEqual(upgradeCost(l, price), 40);          // 4 STEEL x 10
  const l1 = DATA.educationals.SCHOOL.find(x => x.level === 1);
  assert.strictEqual(upgradeCost(l1, price), null);       // niveau 1 : pas de coût
});

test('chaque input de recette est une ressource connue avec une pool (chaînes calculables)', () => {
  // Régression : BEAM consomme du LUMBER, absent du Game Data -> toute la branche
  // BEAM/BRICK/TILE/NAIL/PAINT affichait « prix manquant dans la chaîne ».
  const known = new Map(DATA.resources.map(r => [r.name, r]));
  for (const [name, levels] of Object.entries(DATA.crafting)) {
    for (const l of levels) {
      for (const inp of [l.input1, l.input2]) {
        if (!inp) continue;
        assert.ok(known.has(inp), `${name}_${l.level} : input ${inp} inconnu de data.json`);
        assert.ok(known.get(inp).pool, `${name}_${l.level} : input ${inp} sans pool`);
      }
    }
  }
});

test('niveaux relevés dans le jeu : l\'appli retombe sur Speed et Input de l\'écran d\'usine', () => {
  // Captures du 2026-09-27 : BEAM 18 = 17,7/min, BRICK 14 = 3,76/min, TILE 3 = 1,8/h.
  // Mastery par défaut 0 (inputs déjà réduits par le jeu), Speed bonus 0.
  const CoinH = require('../coinh.js');
  const game = { BEAM: [18, 17.7 * 60, 2140], BRICK: [14, 3.76 * 60, 457], TILE: [3, 1.8, 198] };
  for (const [name, [lvl, perHour, input1]] of Object.entries(game)) {
    const r = DATA.resources.find(x => x.name === name);
    assert.strictEqual(r.level, lvl, `${name} : niveau actuel`);
    assert.strictEqual(r.mastery, 0, `${name} : mastery par défaut`);
    const recipe = DATA.crafting[name].find(l => l.level === lvl);
    const ctx = { recipeOf: n => (n === name ? recipe : null), priceOf: () => 1,
      masteryOf: () => r.mastery, speedOf: () => 0, buyFactor: 1, sellFactor: 1 };
    const m = CoinH.chainMetrics(name, ctx);
    assert.ok(Math.abs(m.rate / perHour - 1) < 0.01, `${name} : débit ${m.rate} vs jeu ${perHour}/h`);
    // yield du niveau + mastery 0 -> facteur 1 : l'input reste celui affiché par le jeu
    assert.strictEqual(CoinH.yieldFactor(recipe.yield_pct, r.mastery), 1);
    assert.strictEqual(recipe.input1_amount, input1);
  }
});
