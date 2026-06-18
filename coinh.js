// Calcul pur de coin/h (différence acheter vs produire), partagé par index.html et les tests.
// Aucune dépendance, aucun accès au DOM. Reprend la formule de l'Excel (onglet data, col E) :
//   coin/h = (prix_out*0.975 - Σ(qté_input*yf*prix_input)/output) * output / heures * 2 * (1 + bonus)
//   où   *2         = bonus VIDÉO +100 % permanent ("Speed Bonus from Video" du jeu) ;
//        *(1+bonus) = Speed bonus Workshop de l'usine (bonus de VITESSE : cumul multiplicatif avec *2,
//                     réduit la durée -> durée_effective = durée / (2*(1+bonus)).
//                     Vérifié SCREWS niv 7 : 15h / (2*1,52) ≈ 4h57m = le jeu) ;
//        yf         = facteur de YIELD sur la quantité d'inputs = yield_niveau / (yield_niveau + mastery).
//                     Le yield (rendement) réduit la conso d'inputs ; yield_total = yield du niveau (Game Data,
//                     recipe.yield_pct) + bonus Mastery (en %). Vérifié SCREWS niv 7 : 2,85 * 105,31/(105,31+5,49) = 2,71 = le jeu.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoinH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // "H:MM:SS" -> heures (nombre). null si vide / format invalide / durée nulle.
  function durationHours(d) {
    const p = String(d == null ? '' : d).split(':').map(Number);
    if (p.length !== 3 || p.some(Number.isNaN)) return null;
    const h = p[0] + p[1] / 60 + p[2] / 3600;
    return h > 0 ? h : null;
  }

  // Facteur de yield appliqué à la quantité d'inputs : le yield (niveau + mastery) réduit la conso.
  // yieldBase : rendement du niveau en % (Game Data recipe.yield_pct ; 100 par défaut si absent).
  // masteryPct : bonus de Mastery en % (0 par défaut). -> yield_total = yieldBase + masteryPct.
  function yieldFactor(yieldBase, masteryPct) {
    const y = (yieldBase == null ? 100 : yieldBase);
    const m = (masteryPct == null ? 0 : masteryPct);
    return y / (y + m);
  }

  // Profit (en COIN) d'UN cycle de production = prix_out*0.975*output − coût des inputs (yield-ajusté).
  // recipe : { output, input1, input1_amount, input2, input2_amount, yield_pct }
  // priceOut : prix COIN de la ressource produite ; getPrice : (symbol) => prix COIN de l'input
  // mastery : bonus de Mastery EN POURCENTAGE (s'ajoute au yield du niveau ; 0 par défaut)
  // Retourne null si non calculable (recette/prix/output manquants).
  // sellFactor : part encaissée à la vente = 1 − taxe (0.975 par défaut, soit 2.5 % de taxe).
  function profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor) {
    if (!recipe) return null;
    const B = recipe.output;
    if (priceOut == null || !B) return null;
    const sf = (sellFactor == null ? 0.975 : sellFactor);
    const yf = yieldFactor(recipe.yield_pct, mastery);   // yield (niveau + mastery) -> réduit la conso d'inputs
    let cost = 0;
    const inputs = [[recipe.input1, recipe.input1_amount], [recipe.input2, recipe.input2_amount]];
    for (const [sym, amt] of inputs) {
      if (sym && amt) {
        const pin = getPrice(sym);
        if (pin == null) return null;       // prix d'un input manquant -> non calculable
        cost += amt * yf * pin;
      }
    }
    return priceOut * sf * B - cost;        // = D * B (D = marge par unité de l'Excel col D)
  }

  // coin/h : profit par cycle ramené à l'heure, avec les bonus de VITESSE.
  // bonus : Speed bonus Workshop (0 par défaut). Retourne null si non calculable.
  function coinPerHour(recipe, priceOut, getPrice, bonus, mastery, sellFactor) {
    const ppc = profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor);
    const hours = durationHours(recipe && recipe.duration);
    if (ppc == null || hours == null) return null;
    return ppc / hours * 2 * (1 + (bonus || 0));   // *2 = bonus vidéo +100 % ; *(1+bonus) = Speed Workshop
  }

  // coin/kpower : coins par 1000 de power dépensé (Excel col W = D*B / V, V = power/1000).
  // Indépendant de la vitesse (le power est consommé par cycle). recipe.power = coût power (Game Data).
  // Retourne null si non calculable (profit indéfini ou power absent/nul).
  function coinPerKPower(recipe, priceOut, getPrice, mastery, sellFactor) {
    const ppc = profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor);
    const power = recipe && recipe.power;
    if (ppc == null || !power) return null;
    return ppc * 1000 / power;
  }

  // Coût d'upgrade (en COIN) pour atteindre ce niveau = cost_amount * prix(cost_symbol).
  // null si pas de coût défini ou prix du cost_symbol inconnu.
  function upgradeCost(recipe, getPrice) {
    if (!recipe || !recipe.cost_symbol || !recipe.cost_amount) return null;
    const p = getPrice(recipe.cost_symbol);
    return p == null ? null : recipe.cost_amount * p;
  }

  return { durationHours, yieldFactor, profitPerCycle, coinPerHour, coinPerKPower, upgradeCost };
});
