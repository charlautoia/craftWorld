// Calcul pur de coin/h (différence acheter vs produire), partagé par index.html et les tests.
// Aucune dépendance, aucun accès au DOM. Reprend la formule de l'Excel (onglet data, col E) :
//   coin/h = (prix_out*0.975 - Σ(qté_input*0.95*prix_input)/output) * output / heures * 2 * (1 + bonus)
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

  // recipe : { output, duration, input1, input1_amount, input2, input2_amount }
  // priceOut : prix COIN de la ressource produite (null/undefined si inconnu)
  // getPrice : (symbol) => prix COIN de l'input (null/undefined si inconnu)
  // bonus : bonus d'usine (0 par défaut)
  // Retourne le coin/h, ou null si non calculable (recette/prix/durée manquants).
  function coinPerHour(recipe, priceOut, getPrice, bonus) {
    if (!recipe) return null;
    const hours = durationHours(recipe.duration);
    const B = recipe.output;
    if (priceOut == null || hours == null || !B) return null;
    let cost = 0;
    const inputs = [[recipe.input1, recipe.input1_amount], [recipe.input2, recipe.input2_amount]];
    for (const [sym, amt] of inputs) {
      if (sym && amt) {
        const pin = getPrice(sym);
        if (pin == null) return null;       // prix d'un input manquant -> non calculable
        cost += amt * 0.95 * pin;
      }
    }
    const D = priceOut * 0.975 - cost / B;
    return D * B / hours * 2 * (1 + (bonus || 0));
  }

  return { durationHours, coinPerHour };
});
