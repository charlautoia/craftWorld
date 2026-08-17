// Calcul pur de coin/h (différence acheter vs produire), partagé par index.html et les tests.
// Aucune dépendance, aucun accès au DOM. Reprend la formule de l'Excel (onglet data, col E) :
//   coin/h = (prix_out*sf - Σ(qté_input*yf*prix_input*bf)/output) * output / heures * 2 * (1 + bonus)
//   où   sf         = 1 − taxe_vente si l'output est vendu, 1 sinon (consommé en aval : pas de transaction) ;
//        bf         = 1 + taxe_achat si les inputs sont achetés, 1 sinon (produits soi-même) ;
//        *2         = bonus VIDÉO +100 % permanent ("Speed Bonus from Video" du jeu) ;
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

  // Profit (en COIN) d'UN cycle de production = prix_out*sf*output − coût des inputs (yield-ajusté)*bf.
  // recipe : { output, input1, input1_amount, input2, input2_amount, yield_pct }
  // priceOut : prix COIN de la ressource produite ; getPrice : (symbol) => prix COIN de l'input
  // mastery : bonus de Mastery EN POURCENTAGE (s'ajoute au yield du niveau ; 0 par défaut)
  // Retourne null si non calculable (recette/prix/output manquants).
  // sellFactor : part encaissée à la vente = 1 − taxe_vente (0.975 par défaut, soit 2.5 % de taxe).
  //              Vaut 1 si l'output n'est PAS vendu (consommé par une recette en aval) : pas de vente, pas de taxe.
  // buyFactor  : part payée à l'achat = 1 + taxe_achat (1 par défaut = inputs non achetés, donc non taxés).
  //              Les taxes sont des frais réels prélevés sur une transaction : pas de transaction, pas de frais.
  function profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor, buyFactor) {
    if (!recipe) return null;
    const B = recipe.output;
    if (priceOut == null || !B) return null;
    const sf = (sellFactor == null ? 0.975 : sellFactor);
    const bf = (buyFactor == null ? 1 : buyFactor);
    const yf = yieldFactor(recipe.yield_pct, mastery);   // yield (niveau + mastery) -> réduit la conso d'inputs
    let cost = 0;
    const inputs = [[recipe.input1, recipe.input1_amount], [recipe.input2, recipe.input2_amount]];
    for (const [sym, amt] of inputs) {
      if (sym && amt) {
        const pin = getPrice(sym);
        if (pin == null) return null;       // prix d'un input manquant -> non calculable
        cost += amt * yf * pin * bf;
      }
    }
    return priceOut * sf * B - cost;        // = D * B (D = marge par unité de l'Excel col D)
  }

  // coin/h : profit par cycle ramené à l'heure, avec les bonus de VITESSE.
  // bonus : Speed bonus Workshop (0 par défaut). Retourne null si non calculable.
  function coinPerHour(recipe, priceOut, getPrice, bonus, mastery, sellFactor, buyFactor) {
    const ppc = profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor, buyFactor);
    const hours = durationHours(recipe && recipe.duration);
    if (ppc == null || hours == null) return null;
    return ppc / hours * 2 * (1 + (bonus || 0));   // *2 = bonus vidéo +100 % ; *(1+bonus) = Speed Workshop
  }

  // coin/kpower : coins par 1000 de power dépensé (Excel col W = D*B / V, V = power/1000).
  // Indépendant de la vitesse (le power est consommé par cycle). recipe.power = coût power (Game Data).
  // Retourne null si non calculable (profit indéfini ou power absent/nul).
  function coinPerKPower(recipe, priceOut, getPrice, mastery, sellFactor, buyFactor) {
    const ppc = profitPerCycle(recipe, priceOut, getPrice, mastery, sellFactor, buyFactor);
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

  // Coût (en COIN) d'une centrale (PowerPlant) par 1000 de power PRODUIT.
  // level : { input, input_amount, power } (power = power produit par cycle, input = ressource consommée).
  // Ex. REACTOR niv.1 : 0,01531 HYDROGEN consommé pour 111 000 power (111 kpower) produit.
  // null si pas d'input (AIRSTREAM/SUNFORGE n'en consomment pas) ou prix de l'input inconnu.
  function powerPlantCostPerKPower(level, getPrice) {
    if (!level || !level.input || !level.input_amount || !level.power) return null;
    const p = getPrice(level.input);
    if (p == null) return null;
    return level.input_amount * p * 1000 / level.power;
  }

  // Efficacité d'upgrade d'une centrale : gain de power/jour (en kpow) apporté par ce niveau,
  // divisé par le coût d'upgrade (en kcoin). Les deux "kilo" s'annulent -> deltaPower / upgradeCost,
  // mais le nommage garde le sens "kpow/j par kcoin dépensé".
  // prevPerDay : per_day du niveau précédent de la même centrale (0 si 1er niveau -> gain = per_day complet).
  // null si coût d'upgrade non calculable ou per_day absent.
  function powerPlantUpgradeEfficiency(level, prevPerDay, getPrice) {
    const uc = upgradeCost(level, getPrice);
    if (uc == null || !uc || !level || level.per_day == null) return null;
    const deltaPower = level.per_day - (prevPerDay || 0);
    return deltaPower / uc;
  }

  // Efficacité d'upgrade d'une batterie : gain de capacité apporté par ce niveau, divisé par le coût d'upgrade (COIN).
  // prevCapacity : capacity du niveau précédent de la même batterie (0 si 1er niveau -> gain = capacity complète).
  // null si coût d'upgrade non calculable ou capacity absente.
  function batteryUpgradeEfficiency(level, prevCapacity, getPrice) {
    const uc = upgradeCost(level, getPrice);
    if (uc == null || !uc || !level || level.capacity == null) return null;
    const deltaCapacity = level.capacity - (prevCapacity || 0);
    return deltaCapacity / uc;
  }

  // ── Chaîne de production ────────────────────────────────────────────────────
  // Remonte l'arbre des recettes depuis `name` jusqu'aux ressources sans recette (achetées au marché),
  // et cumule coût matières / power / débit. Les intermédiaires ne transitent pas par le marché :
  // seules les feuilles sont achetées (buyFactor) et seul `name` est vendu (sellFactor).
  // Les recettes à 2 inputs font de la chaîne un ARBRE, pas une ligne (24 recettes concernées).
  // ctx = { recipeOf(name)->recette|null, priceOf(name)->prix|null, masteryOf(name)->%,
  //         speedOf(name)->fraction (Speed bonus Workshop), boughtOf(name)->bool (optionnel :
  //         ressource achetée au marché au lieu d'être produite), buyFactor, sellFactor }
  // Retourne { cost, power, rate, bottleneck } par unité produite, ou null si non calculable.
  // `asInput` : true quand `name` est consommé par une autre recette, false à la racine de la chaîne.
  function chainNode(name, ctx, memo, stack, asInput) {
    const key = name + (asInput ? '|in' : '|root');
    if (memo[key] !== undefined) return memo[key];
    if (stack.indexOf(name) >= 0) return null;          // garde-fou : recettes circulaires
    const recipe = ctx.recipeOf(name);
    // Deux cas où `name` consommé par une autre recette est compté à son PRIX D'ACHAT plutôt que produit :
    //  - recette sans aucun input (EARTH, extraite de rien) : jamais gratuite ;
    //  - ressource marquée « achetée » par l'utilisateur (ctx.boughtOf) : on coupe la chaîne ici.
    // Dans les deux cas on garde la recette À LA RACINE, pour que la propre ligne de `name` montre
    // bien son économie de production.
    const base = !!recipe && !recipe.input1 && !recipe.input2;
    const bought = !!ctx.boughtOf && !!ctx.boughtOf(name);
    if (!recipe || (asInput && (base || bought))) {     // feuille : matière achetée au marché
      const p = ctx.priceOf(name);
      const leaf = p == null ? null
        : { cost: p * ctx.buyFactor, power: 0, rate: Infinity, bottleneck: null, raw: true };
      return (memo[key] = leaf);
    }
    const B = recipe.output, hrs = durationHours(recipe.duration);
    if (!B || hrs == null) return (memo[key] = null);
    const yf = yieldFactor(recipe.yield_pct, ctx.masteryOf(name));
    let cost = 0, power = (recipe.power || 0) / B;
    let rate = B / (hrs / (2 * (1 + (ctx.speedOf(name) || 0))));   // débit de CETTE usine (bonus vidéo *2)
    let bottleneck = name;
    const inputs = [[recipe.input1, recipe.input1_amount], [recipe.input2, recipe.input2_amount]];
    for (const [symb, amt] of inputs) {
      if (!symb || !amt) continue;
      const per = amt * yf / B;                         // quantité d'input par unité produite
      const sub = chainNode(symb, ctx, memo, stack.concat(name), true);
      if (!sub) return (memo[key] = null);
      cost += per * sub.cost;
      power += per * sub.power;
      const upstream = sub.rate / per;                  // débit amont converti en unités de `name`
      if (upstream < rate) { rate = upstream; bottleneck = sub.bottleneck; }
    }
    return (memo[key] = { cost, power, rate, bottleneck, raw: false });
  }

  // Coût des inputs de la SEULE usine `name`, achetés au marché (taxe d'achat comprise), par unité produite.
  // À comparer au coût matières de la chaîne : si c'est plus cher, produire l'intermédiaire soi-même paie.
  // null si la recette n'a aucun input ou si un prix manque.
  function directInputCost(name, ctx) {
    const recipe = ctx.recipeOf(name);
    if (!recipe || !recipe.output) return null;
    const yf = yieldFactor(recipe.yield_pct, ctx.masteryOf(name));
    let cost = 0, has = false;
    const inputs = [[recipe.input1, recipe.input1_amount], [recipe.input2, recipe.input2_amount]];
    for (const [symb, amt] of inputs) {
      if (!symb || !amt) continue;
      const p = ctx.priceOf(symb);
      if (p == null) return null;
      cost += amt * yf / recipe.output * p * ctx.buyFactor;
      has = true;
    }
    return has ? cost : null;
  }

  // Rentabilité de la chaîne complète menant à `name` (voir chainNode).
  // coinH = marge * débit de la chaîne (bridé par le goulot) ; coinKPow = marge par 1000 de power cumulé.
  // Retourne null si `name` n'a pas de recette ou si un prix de la chaîne manque.
  function chainMetrics(name, ctx) {
    const n = chainNode(name, ctx, {}, [], false);
    if (!n || n.raw) return null;
    const p = ctx.priceOf(name);
    if (p == null) return null;
    const margin = p * ctx.sellFactor - n.cost;
    const direct = directInputCost(name, ctx);
    // Marge de l'USINE SEULE : son output vendu au marché moins ses propres inputs achetés au marché,
    // indépendamment de la chaîne (c'est le rendement que montre l'onglet Prix). Négative = l'usine
    // détruit de la valeur, même si la chaîne complète reste bénéficiaire grâce à l'amont produit maison.
    // Une recette sans input (EARTH) n'a rien à acheter : sa marge d'étape est son prix net.
    const rec = ctx.recipeOf(name);
    const hasInputs = !!(rec && (rec.input1 || rec.input2));
    const stepMargin = !hasInputs ? p * ctx.sellFactor
      : (direct == null ? null : p * ctx.sellFactor - direct);
    return {
      cost: n.cost,                                     // coût cumulé des matières achetées, par unité
      directCost: direct,                               // coût des inputs de cette usine seule, achetés
      stepMargin,                                       // marge de l'usine seule (null si non calculable)
      power: n.power,                                   // power cumulé de toute la chaîne, par unité
      rate: n.rate,                                     // unités/h (1 usine par étape, bridé par le goulot)
      bottleneck: n.bottleneck,                         // étape qui bride la chaîne
      margin,
      coinH: margin * n.rate,
      coinKPow: n.power ? margin * 1000 / n.power : null,
    };
  }

  // Valeur ajoutée par la DERNIÈRE étape : vendre une unité de `name` rapporte-t-il plus que vendre
  // les inputs qu'elle consomme ? C'est la réponse à « dois-je faire du X ? », et elle ne sort jamais
  // de la chaîne — chaque chaîne reste une boîte noire.
  // Comparer les coin/h de deux paliers serait faux : ça suppose de cadencer toute la chaîne sur le
  // palier le plus lent, alors qu'une usine lente (ACID, 50 h) n'absorbe qu'une fraction de l'amont
  // et s'ajoute à la vente du reste. La comparaison à quantité d'inputs égale est la bonne.
  // Un input acheté (sans recette, ou coché Buy) vaut 0 : l'utiliser ne fait renoncer à aucune vente.
  // Retourne { added, forgone, inputs:[{name, qty, margin}] } ou null si non calculable.
  function stepValueAdd(name, ctx, metricsOf) {
    const m = metricsOf(name), r = ctx.recipeOf(name);
    if (!m || !r || !r.output) return null;
    const yf = yieldFactor(r.yield_pct, ctx.masteryOf(name));
    const inputs = [];
    let forgone = 0;
    for (const [s, a] of [[r.input1, r.input1_amount], [r.input2, r.input2_amount]]) {
      if (!s || !a) continue;
      const qty = a * yf / r.output;
      const produced = !!ctx.recipeOf(s) && !(ctx.boughtOf && ctx.boughtOf(s));
      const sub = produced ? metricsOf(s) : null;
      const margin = sub ? sub.margin : 0;
      inputs.push({ name: s, qty, margin });
      forgone += qty * margin;
    }
    return { added: m.margin - forgone, forgone, inputs };
  }

  return {
    durationHours, yieldFactor, profitPerCycle, coinPerHour, coinPerKPower, upgradeCost,
    powerPlantCostPerKPower, powerPlantUpgradeEfficiency, batteryUpgradeEfficiency, chainMetrics,
    stepValueAdd,
  };
});
