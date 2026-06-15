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

  // recipe : { output, duration, input1, input1_amount, input2, input2_amount, yield_pct }
  // priceOut : prix COIN de la ressource produite (null/undefined si inconnu)
  // getPrice : (symbol) => prix COIN de l'input (null/undefined si inconnu)
  // bonus : Speed bonus Workshop de l'usine (0 par défaut)
  // mastery : bonus de Mastery EN POURCENTAGE (s'ajoute au yield du niveau ; 0 par défaut)
  // Retourne le coin/h, ou null si non calculable (recette/prix/durée manquants).
  function coinPerHour(recipe, priceOut, getPrice, bonus, mastery) {
    if (!recipe) return null;
    const hours = durationHours(recipe.duration);
    const B = recipe.output;
    if (priceOut == null || hours == null || !B) return null;
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
    const D = priceOut * 0.975 - cost / B;
    return D * B / hours * 2 * (1 + (bonus || 0));   // *2 = bonus vidéo +100 % ; *(1+bonus) = Speed Workshop
  }

  return { durationHours, yieldFactor, coinPerHour };
});
