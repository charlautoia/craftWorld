// Tests de non-régression de la formule coin/h (coinh.js).
// Exécuter : node --test   (ou npm test)
const { test } = require('node:test');
const assert = require('node:assert');
const { coinPerHour, durationHours } = require('../coinh.js');

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
// getPrice depuis une table {symbole: prix}
const prices = m => sym => (sym in m ? m[sym] : null);

test('durationHours parse "H:MM:SS"', () => {
  near(durationHours('8:00:00'), 8);
  near(durationHours('1:02:00'), 1 + 2 / 60);
  near(durationHours('0:30:00'), 0.5);
  assert.strictEqual(durationHours('0'), null);      // durée nulle
  assert.strictEqual(durationHours(''), null);
  assert.strictEqual(durationHours(null), null);
});

test('SEAWATER niv.30 (avec bonus 0.47)', () => {
  const recipe = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  // D = 10*0.975 - (160*0.95*3)/30 = -5.45 ; coin/h = -5.45*30/8*2*1.47
  near(coinPerHour(recipe, 10, prices({ WATER: 3 }), 0.47), -60.08625);
});

test('EARTH niv.50 (sans input, sans bonus)', () => {
  const recipe = { output: 180000, duration: '12:00:00', input1: null, input2: null };
  // 0.004*0.975 * 180000 / 12 * 2 = 117
  near(coinPerHour(recipe, 0.004, prices({}), 0), 117);
});

test('MUD niv.17 (input EARTH)', () => {
  const recipe = { output: 4412, duration: '1:02:00', input1: 'EARTH', input1_amount: 13236 };
  near(coinPerHour(recipe, 0.5, prices({ EARTH: 0.004 }), 0), 4065.5868387096766, 1e-6);
});

test('mastery personnalisée (remplace le 0.95)', () => {
  const recipe = { output: 10, duration: '1:00:00', input1: 'A', input1_amount: 4 };
  // mastery 0.90 : D = 5*0.975 - (4*0.90*1)/10 = 4.875 - 0.36 = 4.515 ; coin/h = 4.515*10/1*2 = 90.3
  near(coinPerHour(recipe, 5, prices({ A: 1 }), 0, 0.90), 90.3);
  // mastery par défaut (undefined) = 0.95 : D = 4.875 - (4*0.95*1)/10 = 4.875-0.38=4.495 ; *20 = 89.9
  near(coinPerHour(recipe, 5, prices({ A: 1 }), 0), 89.9);
});

test('Mastery 5.3 % -> facteur (1 - 5.3/100) = 0.947', () => {
  // L'UI saisit la Mastery en % ; app.js la convertit en facteur 1 - pct/100 avant coinh.js.
  const recipe = { output: 10, duration: '1:00:00', input1: 'A', input1_amount: 4 };
  // D = 5*0.975 - (4*0.947*1)/10 = 4.875 - 0.3788 = 4.4962 ; coin/h = 4.4962*10/1*2 = 89.924
  near(coinPerHour(recipe, 5, prices({ A: 1 }), 0, 1 - 5.3 / 100), 89.924);
});

test('deux inputs', () => {
  const recipe = { output: 10, duration: '1:00:00', input1: 'A', input1_amount: 4, input2: 'B', input2_amount: 2 };
  // D = 5*0.975 - (4*0.95*1 + 2*0.95*3)/10 = 4.875 - (3.8+5.7)/10 = 4.875-0.95 = 3.925
  // coin/h = 3.925*10/1*2 = 78.5
  near(coinPerHour(recipe, 5, prices({ A: 1, B: 3 }), 0), 78.5);
});

test('non calculable -> null', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  assert.strictEqual(coinPerHour(null, 10, prices({}), 0), null, 'pas de recette');
  assert.strictEqual(coinPerHour(r, null, prices({ WATER: 3 }), 0), null, 'prix output manquant');
  assert.strictEqual(coinPerHour(r, 10, prices({}), 0), null, 'prix input manquant');
  assert.strictEqual(coinPerHour({ ...r, duration: '0' }, 10, prices({ WATER: 3 }), 0), null, 'durée nulle');
  assert.strictEqual(coinPerHour({ ...r, output: 0 }, 10, prices({ WATER: 3 }), 0), null, 'output nul');
});
