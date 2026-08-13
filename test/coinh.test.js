// Tests de non-régression de la formule coin/h (coinh.js).
// Exécuter : node --test   (ou npm test)
const { test } = require('node:test');
const assert = require('node:assert');
const { coinPerHour, durationHours, yieldFactor, profitPerCycle, coinPerKPower, upgradeCost, powerPlantCostPerKPower, powerPlantUpgradeEfficiency, batteryUpgradeEfficiency, chainMetrics } = require('../coinh.js');

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

// ── coin/kpower (Excel col W = D*B / V, V = power/1000) : coins par 1000 de power, hors vitesse. ──
test('coin/kpower SCREWS niv 7 = profit_par_cycle * 1000 / power', () => {
  const recipe = { output: 1, duration: '15:00:00', input1: 'STEEL', input1_amount: 2.85, yield_pct: 105.31, power: 25000 };
  // profit/cycle = 0,5*0,975*1 - 2,85*yf(105.31,5.49)*0,1 = 0,21662 ; /25000*1000
  near(profitPerCycle(recipe, 0.5, prices({ STEEL: 0.1 }), 5.49), 0.21662138989169666);
  near(coinPerKPower(recipe, 0.5, prices({ STEEL: 0.1 }), 5.49), 0.008664855595667867);
});

test('coin/kpower null si power absent ou nul', () => {
  const r = { output: 1, duration: '15:00:00', input1: 'STEEL', input1_amount: 2.85, yield_pct: 105.31 };
  assert.strictEqual(coinPerKPower(r, 0.5, prices({ STEEL: 0.1 }), 5.49), null, 'power absent');
  assert.strictEqual(coinPerKPower({ ...r, power: 0 }, 0.5, prices({ STEEL: 0.1 }), 5.49), null, 'power nul');
  assert.strictEqual(coinPerKPower({ ...r, power: 25000 }, null, prices({}), 0), null, 'prix output manquant');
});

test('taxe de vente configurable (sellFactor = 1 − taxe/100)', () => {
  const r = { output: 1, duration: '1:00:00', input1: null, input2: null, power: 1000 };
  near(coinPerHour(r, 10, prices({}), 0, 0, 1.0), 20);     // 0 % taxe : 10*1/1*2 = 20
  near(coinPerHour(r, 10, prices({}), 0, 0), 19.5);        // défaut 2,5 % : 10*0.975/1*2 = 19.5
  near(coinPerHour(r, 10, prices({}), 0, 0, 0.95), 19);    // 5 % taxe : 10*0.95/1*2 = 19
  near(coinPerKPower(r, 10, prices({}), 0, 1.0), 10);      // 0 % : 10*1*1 *1000/1000 = 10
  near(coinPerKPower(r, 10, prices({}), 0, 0.90), 9);      // 10 % : 10*0.90 *1000/1000 = 9
});

test('upgradeCost = cost_amount * prix(cost_symbol)', () => {
  // MUD_17 : coût COPPER x21 (Excel col R = prix(COPPER)*21).
  near(upgradeCost({ cost_symbol: 'COPPER', cost_amount: 21 }, prices({ COPPER: 8.33 })), 174.93);
  assert.strictEqual(upgradeCost({ cost_amount: 21 }, prices({})), null, 'pas de cost_symbol');
  assert.strictEqual(upgradeCost({ cost_symbol: 'X', cost_amount: 5 }, prices({})), null, 'prix manquant');
  assert.strictEqual(upgradeCost(null, prices({})), null, 'pas de recette');
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

test('powerPlantCostPerKPower = input_amount * prix(input) * 1000 / power', () => {
  // REACTOR niv.1 (Game Data) : 0,01531 HYDROGEN consommé pour 111 000 power (111 kpower) produit.
  const level = { input: 'HYDROGEN', input_amount: 0.01531, power: 111000 };
  near(powerPlantCostPerKPower(level, prices({ HYDROGEN: 100 })), 0.01531 * 100 * 1000 / 111000);
  assert.strictEqual(powerPlantCostPerKPower({ power: 111000 }, prices({ HYDROGEN: 100 })), null, 'pas d\'input (AIRSTREAM/SUNFORGE)');
  assert.strictEqual(powerPlantCostPerKPower(level, prices({})), null, 'prix input manquant');
  assert.strictEqual(powerPlantCostPerKPower({ ...level, power: 0 }, prices({ HYDROGEN: 100 })), null, 'power nul');
});

test('powerPlantUpgradeEfficiency = (per_day - prevPerDay) / upgradeCost', () => {
  // REACTOR niv.2 (Game Data) : cost 5 ENERGY, per_day passe de 2 664 000 (niv.1) à 5 760 000.
  const level = { per_day: 5760000, cost_symbol: 'ENERGY', cost_amount: 5 };
  const uc = 5 * 10;   // prix ENERGY = 10 -> upgradeCost = 50
  near(powerPlantUpgradeEfficiency(level, 2664000, prices({ ENERGY: 10 })), (5760000 - 2664000) / uc);
  // 1er niveau (prevPerDay = 0) -> gain = per_day complet.
  near(powerPlantUpgradeEfficiency({ per_day: 2664000, cost_symbol: 'ENERGY', cost_amount: 1 }, 0, prices({ ENERGY: 10 })), 2664000 / 10);
  assert.strictEqual(powerPlantUpgradeEfficiency(level, 2664000, prices({})), null, 'prix cost_symbol manquant');
  assert.strictEqual(powerPlantUpgradeEfficiency({ cost_symbol: 'ENERGY', cost_amount: 5 }, 0, prices({ ENERGY: 10 })), null, 'per_day absent');
});

test('batteryUpgradeEfficiency = (capacity - prevCapacity) / upgradeCost', () => {
  // BATTERY niv.2 (Game Data) : cost 1 SCREWS, capacity passe de 12 500 (niv.1) à 35 000.
  const level = { capacity: 35000, cost_symbol: 'SCREWS', cost_amount: 1 };
  const uc = 1 * 20;   // prix SCREWS = 20 -> upgradeCost = 20
  near(batteryUpgradeEfficiency(level, 12500, prices({ SCREWS: 20 })), (35000 - 12500) / uc);
  // 1er niveau (prevCapacity = 0) -> gain = capacity complète.
  near(batteryUpgradeEfficiency({ capacity: 12500, cost_symbol: 'STEEL', cost_amount: 1 }, 0, prices({ STEEL: 5 })), 12500 / 5);
  assert.strictEqual(batteryUpgradeEfficiency(level, 12500, prices({})), null, 'prix cost_symbol manquant');
  assert.strictEqual(batteryUpgradeEfficiency({ cost_symbol: 'SCREWS', cost_amount: 1 }, 0, prices({ SCREWS: 20 })), null, 'capacity absente');
});

test('non calculable -> null', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  assert.strictEqual(coinPerHour(null, 10, prices({}), 0), null, 'pas de recette');
  assert.strictEqual(coinPerHour(r, null, prices({ WATER: 3 }), 0), null, 'prix output manquant');
  assert.strictEqual(coinPerHour(r, 10, prices({}), 0), null, 'prix input manquant');
  assert.strictEqual(coinPerHour({ ...r, duration: '0' }, 10, prices({ WATER: 3 }), 0), null, 'durée nulle');
  assert.strictEqual(coinPerHour({ ...r, output: 0 }, 10, prices({ WATER: 3 }), 0), null, 'output nul');
});

// ── Taxes achat/vente indépendantes (besoin #28) ────────────────────────────────
// Les taxes sont des frais réels prélevés sur une transaction : pas de transaction, pas de frais.
// sellFactor = 1 − taxe_vente si l'output est vendu, 1 sinon ; buyFactor = 1 + taxe_achat si les
// inputs sont achetés, 1 sinon. Recette type SEAWATER : j'achète WATER, je vends (ou non) SEAWATER.
test('buyFactor : taxe d\'achat appliquée au coût des inputs', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  const p = prices({ WATER: 3 });
  // Achat ✓ / Vente ✓ : 10*0.975*30 − 160*3*1.025
  near(profitPerCycle(r, 10, p, 0, 0.975, 1.025), 10 * 0.975 * 30 - 160 * 3 * 1.025);
  // Achat ✗ / Vente ✓ : inputs produits soi-même, aucune taxe dessus
  near(profitPerCycle(r, 10, p, 0, 0.975, 1), 10 * 0.975 * 30 - 160 * 3);
  // Achat ✓ / Vente ✗ : output consommé en aval, aucune taxe de vente
  near(profitPerCycle(r, 10, p, 0, 1, 1.025), 10 * 30 - 160 * 3 * 1.025);
  // Achat ✗ / Vente ✗ : palier intermédiaire, marge brute sans aucune taxe
  near(profitPerCycle(r, 10, p, 0, 1, 1), 10 * 30 - 160 * 3);
});

test('buyFactor par défaut = 1 (inputs non taxés si non précisé)', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160 };
  const p = prices({ WATER: 3 });
  near(profitPerCycle(r, 10, p, 0, 0.975), profitPerCycle(r, 10, p, 0, 0.975, 1));
});

test('buyFactor se propage à coinPerHour et coinPerKPower', () => {
  const r = { output: 30, duration: '8:00:00', input1: 'WATER', input1_amount: 160, power: 25000 };
  const p = prices({ WATER: 3 });
  const ppc = profitPerCycle(r, 10, p, 0, 0.975, 1.025);
  near(coinPerHour(r, 10, p, 0, 0, 0.975, 1.025), ppc / 8 * 2);
  near(coinPerKPower(r, 10, p, 0, 0.975, 1.025), ppc * 1000 / 25000);
  // Une taxe d'achat plus forte réduit le profit (les inputs coûtent plus cher).
  assert.ok(coinPerHour(r, 10, p, 0, 0, 0.975, 1.05) < coinPerHour(r, 10, p, 0, 0, 0.975, 1.025));
});

test('taxe d\'achat sans input : aucun effet (rien à acheter)', () => {
  const r = { output: 1, duration: '15:00:00', input1: null, input2: null };
  near(coinPerHour(r, 1, prices({}), 0.52, 0, 0.975, 1.025), 0.1976);
});

// ── Chaîne de production (besoin #29) ───────────────────────────────────────────
// ctx minimal : recettes/prix/mastery/speed fournis par des tables.
const mkCtx = (recipes, px, opts = {}) => ({
  recipeOf: n => recipes[n] || null,
  priceOf: n => (n in px ? px[n] : null),
  masteryOf: () => opts.mastery ?? 0,
  speedOf: n => (opts.speed || {})[n] || 0,
  buyFactor: opts.buyFactor ?? 1,
  sellFactor: opts.sellFactor ?? 1,
});

test('chainMetrics : chaîne à 1 étape = coût matière achetée + power de l\'étape', () => {
  // 2 A (achetés) -> 1 B par cycle de 1h. A = 10, B = 30. Taxes : achat +10 %, vente −10 %.
  const recipes = { B: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 5000 } };
  const m = chainMetrics('B', mkCtx(recipes, { A: 10, B: 30 }, { buyFactor: 1.1, sellFactor: 0.9 }));
  near(m.cost, 2 * 10 * 1.1);                  // 22 : les matières de base subissent la taxe d'achat
  near(m.power, 5000);
  near(m.margin, 30 * 0.9 - 22);               // 5
  near(m.rate, 2);                             // 1 unité / 1h, ×2 (bonus vidéo)
  near(m.coinH, 5 * 2);
  near(m.coinKPow, 5 * 1000 / 5000);
  assert.strictEqual(m.bottleneck, 'B');       // seule usine de la chaîne
});

test('chainMetrics : l\'intermédiaire n\'est ni acheté ni vendu (aucune taxe dessus)', () => {
  // A (acheté) -> M -> F (vendu). Le prix de M ne doit PAS entrer dans le calcul.
  const recipes = {
    M: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 1000 },
    F: { output: 1, duration: '1:00:00', input1: 'M', input1_amount: 3, power: 2000 },
  };
  const ctx = mkCtx(recipes, { A: 10, M: 999999, F: 100 }, { buyFactor: 1.1, sellFactor: 0.9 });
  const m = chainMetrics('F', ctx);
  near(m.cost, 3 * (2 * 10 * 1.1));            // 66 : remonte jusqu'à A, le prix de M est ignoré
  near(m.power, 2000 + 3 * 1000);              // power cumulé de toute la chaîne
  near(m.margin, 100 * 0.9 - 66);
});

test('chainMetrics : le goulot est l\'étape la plus lente de la chaîne', () => {
  // M produit 1/h (×2 = 2/h) ; F en consomme 3 par unité -> F plafonné à 0,667/h alors que
  // sa propre usine pourrait faire 2/h. Le goulot est donc M, pas F.
  const recipes = {
    M: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 1000 },
    F: { output: 1, duration: '1:00:00', input1: 'M', input1_amount: 3, power: 2000 },
  };
  const m = chainMetrics('F', mkCtx(recipes, { A: 1, F: 100 }));
  near(m.rate, 2 / 3);
  assert.strictEqual(m.bottleneck, 'M');
  // Speed bonus sur M : le goulot bascule sur F une fois M assez rapide.
  const m2 = chainMetrics('F', mkCtx(recipes, { A: 1, F: 100 }, { speed: { M: 3 } }));
  near(m2.rate, 2);
  assert.strictEqual(m2.bottleneck, 'F');
});

test('chainMetrics : recette à 2 inputs (arbre, pas une ligne)', () => {
  // F = 1 M + 4 B, M lui-même = 2 A. Les deux branches se cumulent en coût et en power.
  const recipes = {
    M: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 1000 },
    F: { output: 1, duration: '1:00:00', input1: 'M', input1_amount: 1, input2: 'B', input2_amount: 4, power: 2000 },
  };
  const m = chainMetrics('F', mkCtx(recipes, { A: 10, B: 5, F: 100 }));
  near(m.cost, 1 * (2 * 10) + 4 * 5);          // 40 : branche M (20) + branche B achetée (20)
  near(m.power, 2000 + 1 * 1000);
});

test('chainMetrics : null si prix manquant, matière brute ou recette circulaire', () => {
  const recipes = { B: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 5000 } };
  assert.strictEqual(chainMetrics('B', mkCtx(recipes, { B: 30 })), null, 'prix de la matière A manquant');
  assert.strictEqual(chainMetrics('B', mkCtx(recipes, { A: 10 })), null, 'prix de l\'output manquant');
  assert.strictEqual(chainMetrics('A', mkCtx(recipes, { A: 10 })), null, 'A n\'a pas de recette');
  const loop = {
    X: { output: 1, duration: '1:00:00', input1: 'Y', input1_amount: 1, power: 1 },
    Y: { output: 1, duration: '1:00:00', input1: 'X', input1_amount: 1, power: 1 },
  };
  assert.strictEqual(chainMetrics('X', mkCtx(loop, { X: 5, Y: 5 })), null, 'recettes circulaires');
});

test('chainMetrics.directCost = inputs de la seule usine, achetés au marché', () => {
  // A (acheté) -> M -> F. Pour F : 3 M au prix du marché (50), contre 66 en le produisant soi-même.
  const recipes = {
    M: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 1000 },
    F: { output: 1, duration: '1:00:00', input1: 'M', input1_amount: 3, power: 2000 },
  };
  const ctx = mkCtx(recipes, { A: 10, M: 50, F: 100 }, { buyFactor: 1.1 });
  const f = chainMetrics('F', ctx);
  near(f.directCost, 3 * 50 * 1.1);            // 165 : acheter les 3 M au marché
  near(f.cost, 3 * 2 * 10 * 1.1);              // 66  : les produire depuis A -> nettement moins cher
  // Une étape dont les inputs sont déjà achetés : les deux coûts coïncident.
  const m = chainMetrics('M', ctx);
  near(m.directCost, m.cost);
  // Recette à 2 inputs : les deux branches sont achetées au marché.
  const two = { F: { output: 2, duration: '1:00:00', input1: 'A', input1_amount: 2, input2: 'B', input2_amount: 4, power: 1 } };
  near(chainMetrics('F', mkCtx(two, { A: 10, B: 5, F: 100 })).directCost, (2 * 10 + 4 * 5) / 2);
});

test('chainMetrics.directCost = null si prix d\'un input manquant', () => {
  const recipes = {
    M: { output: 1, duration: '1:00:00', input1: 'A', input1_amount: 2, power: 1000 },
    F: { output: 1, duration: '1:00:00', input1: 'M', input1_amount: 3, power: 2000 },
  };
  // M n'a pas de prix : la chaîne reste calculable (M est produit), mais directCost non.
  const f = chainMetrics('F', mkCtx(recipes, { A: 10, F: 100 }));
  assert.strictEqual(f.directCost, null);
  near(f.cost, 3 * 2 * 10);
});

test('chainMetrics : une ressource de base (recette sans input) est comptée au prix d\'achat', () => {
  // E est extraite de rien (comme EARTH). Consommée par F, elle ne doit PAS être gratuite.
  const recipes = {
    E: { output: 1, duration: '1:00:00', power: 7 },
    F: { output: 1, duration: '1:00:00', input1: 'E', input1_amount: 3, power: 2000 },
  };
  const ctx = mkCtx(recipes, { E: 10, F: 100 }, { buyFactor: 1.1 });
  const f = chainMetrics('F', ctx);
  near(f.cost, 3 * 10 * 1.1);                  // 33 : E achetée, taxe d'achat comprise (et non 0)
  near(f.directCost, f.cost);                  // acheter E ou « la produire » revient au même
  near(f.power, 2000);                         // on n'exploite pas la mine de E -> son power ne compte pas
  assert.strictEqual(f.bottleneck, 'F');       // E achetée : approvisionnement illimité, jamais le goulot

  // À la racine, E garde sa propre recette : sa ligne montre bien son économie de production.
  const e = chainMetrics('E', ctx);
  near(e.cost, 0);                             // extraite de rien : aucune matière à payer
  near(e.power, 7);
  near(e.margin, 10 * 1);                      // sellFactor 1 dans ce ctx
  near(e.coinKPow, 10 * 1000 / 7);
});
