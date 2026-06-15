// Tests de non-régression de la formule coin/h (coinh.js).
// Exécuter : node --test   (ou npm test)
const { test } = require('node:test');
const assert = require('node:assert');
const { coinPerHour, durationHours, yieldFactor } = require('../coinh.js');

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

test('yieldFactor = yield_niveau / (yield_niveau + mastery)', () => {
  near(yieldFactor(100, 0), 1);                      // pas de yield ni mastery -> aucune réduction
  near(yieldFactor(105.31, 5.49), 105.31 / 110.8);   // SCREWS niv 7 (cf. screenshot)
  near(yieldFactor(null, 5.3), 100 / 105.3);         // yield absent -> base 100
  near(yieldFactor(105.31, null), 1);                // mastery absente -> 0
});

// ── Screenshot SCREWS niv 7 (jeu) : input affiché 2,71 ; yield 110,8 % (= 105,31 niveau + 5,49 mastery). ──
test('SCREWS niv 7 : yield réduit l\'input 2,85 -> 2,71 (= le jeu)', () => {
  const effInput = 2.85 * yieldFactor(105.31, 5.49);
  near(effInput, 2.71, 3e-3);                         // le jeu affiche 2,71
});

test('SCREWS niv 7 : coin/h complet (prix de test)', () => {
  // recipe relevée du Game Data ; prix arbitraires (en vrai = prix live COIN).
  const recipe = { output: 1, duration: '15:00:00', input1: 'STEEL', input1_amount: 2.85, yield_pct: 105.31 };
  // SCREWS=0,5 ; STEEL=0,1 ; bonus Workshop 0,52 ; mastery 5,49 % ; *2 = bonus vidéo.
  near(coinPerHour(recipe, 0.5, prices({ STEEL: 0.1 }), 0.52, 5.49), 0.04390193501805052);
});

// ── Screenshot Speed bonus (jeu) : Workshop +52 % et Video +100 % -> durée 15h ramenée à ~4h57m. ──
test('Speed : *2 (vidéo) * (1+bonus) Workshop ; durée 15h -> ~4h57m', () => {
  near(durationHours('15:00:00') / (2 * 1.52), 4.934210526315789);   // ≈ 4h57m affiché par le jeu
  // coin/h sans input : prix_out 1, 15h, bonus 0,52 -> 0,975/15 * 2 * 1,52
  const r = { output: 1, duration: '15:00:00', input1: null, input2: null };
  near(coinPerHour(r, 1, prices({}), 0.52, 0), 0.1976);
});

test('EARTH niv.50 (sans input) — insensible au yield/mastery', () => {
  const recipe = { output: 180000, duration: '12:00:00', input1: null, input2: null };
  // 0.004*0.975 * 180000 / 12 * 2 = 117
  near(coinPerHour(recipe, 0.004, prices({}), 0, 0), 117);
});

test('MUD niv.17 (input EARTH, sans yield ni mastery)', () => {
  const recipe = { output: 4412, duration: '1:02:00', input1: 'EARTH', input1_amount: 13236 };
  near(coinPerHour(recipe, 0.5, prices({ EARTH: 0.004 }), 0, 0), 4060.463225806451, 1e-6);
});

test('deux inputs (sans yield ni mastery)', () => {
  const recipe = { output: 10, duration: '1:00:00', input1: 'A', input1_amount: 4, input2: 'B', input2_amount: 2 };
  // D = 5*0.975 - (4*1 + 2*3)/10 = 4.875 - 1 = 3.875 ; coin/h = 3.875*10/1*2 = 77.5
  near(coinPerHour(recipe, 5, prices({ A: 1, B: 3 }), 0, 0), 77.5);
});

test('non calculable -> null', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  assert.strictEqual(coinPerHour(null, 10, prices({}), 0), null, 'pas de recette');
  assert.strictEqual(coinPerHour(r, null, prices({ WATER: 3 }), 0), null, 'prix output manquant');
  assert.strictEqual(coinPerHour(r, 10, prices({}), 0), null, 'prix input manquant');
  assert.strictEqual(coinPerHour({ ...r, duration: '0' }, 10, prices({ WATER: 3 }), 0), null, 'durée nulle');
  assert.strictEqual(coinPerHour({ ...r, output: 0 }, 10, prices({ WATER: 3 }), 0), null, 'output nul');
});
