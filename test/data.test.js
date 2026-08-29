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
