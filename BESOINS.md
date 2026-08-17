# CraftWorld — Utilitaire web : liste des besoins

Source de vérité (entrée) : **Game Data officiel de la team** (Google Sheet
`1HIJtfYQjsf7qXRI1ca8EdZMMmbWzEpf5U1a8IvZ3nRE`) → `data.json` (via `build_data.py`).
Réseau : Ronin. Prix live : API GeckoTerminal (endpoint multi-pools).
`extract_data.py` (ancien pipeline depuis `craft world.xlsx`) = **legacy**, plus utilisé.

## Besoins (à toujours garder OK)

1. [x] **Afficher le prix courant de chaque ressource** — en **COIN** (monnaie du jeu).
       - Source mapping ressource→pool : `data.json`. Pools = tokens officiels on-chain.
       - Prix : `base_token_price_quote_token` via `/networks/ronin/pools/multi/{pools}` (1 appel ; chunks de 30).
       - Affiché dans la colonne **Prix live** de `index.html` (page unique).
       - **Format** (`fmtPrice`) : 3 chiffres significatifs ; si > 1000 → entier (décimales ignorées).

2. [x] **Utilisable depuis le téléphone** — via **hébergement public** (GitHub Pages).
       - Rendu mobile : OK (viewport + `overflow-x-auto`, pas de débordement à 375 px).
       - Déployé : dépôt https://github.com/charlautoia/craftWorld (public), Pages sur branche `main` (root).
       - URL : https://charlautoia.github.io/craftWorld/
       - MAJ futures : `git commit` + `git push` → redéploiement auto.

3. [x] **Page unique (merge)** — `prix.html` supprimé ; sa logique de prix (1 appel multi-pools)
       intégrée à la colonne **Prix live** de `index.html`.

4. [x] **Entrée = Game Data officiel de la team** (bascule complète, plus l'Excel perso).
       - `build_data.py` télécharge le Sheet officiel (onglets recettes + ressources de base) → `data.json`.
       - Structure `data.json` : `resources` (liste + pool) et `crafting` (recettes, ~59 ressources).
       - Mapping `ressource → pool` (29, FIRE/WATER inclus) maintenu dans `build_data.py` (absent du Sheet officiel).
       - `index.html` : onglet **Prix** (Ressource | Prix live COIN | Pool) + onglet **Crafting** (toutes les recettes officielles).
       - Cache-bust sur `data.json` → toujours la dernière version publiée.
       - Métriques d'analyse perso (prix_man, gain_coin_h…) abandonnées (sans source officielle).
       - MAJ données : `python build_data.py` puis `git push`.

5. [x] **Sélection des items + pool COPPER corrigée.**
       - Liste retenue = **factories** (du début jusqu'à **DYNAMITE** inclus) **+** **BOLTS → fin**
         (BOLTS, KEY, CERAMICKEY, GLASSKEY, DYNOKEY) **+** éléments bruts **EARTH / FIRE / WATER**.
         Le bloc food/outils/armes (BOWL → LOBSTER) est **exclu**. → 34 ressources, 32 recettes.
       - Logique dans `build_data.py` (`select_resources`, marqueurs DYNAMITE et BOLTS).
       - **COPPER** : ancienne pool COPPER/COIN morte (liquidité nulle) → nouvelle pool
         `0xc0f4621ab3cd1405952015c84c5063db708c67d9` (**USDC/COPPER**, COPPER = quote token).
         Prix calculé via le pont USD (`COPPER_usd / COIN_usd`) ; marqué `"quote": true` dans `data.json`.
         Les 28 autres restent en direct (`base_token_price_quote_token`).

6. [x] **Pools manquantes (keys/bolts) récupérées.** Trouvées via l'API de recherche GeckoTerminal
       (`/search/pools?query=…&network=ronin`), pas via la dApp roninchain (JS, non scrapable).
       Toutes en RESOURCE/COIN (prix direct). Tier le plus liquide retenu quand plusieurs.
       BOLTS, KEY, CERAMICKEY, GLASSKEY, DYNOKEY ajoutées à `build_data.py` → **34/34 ressources ont un pool**.
       (>30 pools : la requête se découpe en 2 chunks, déjà géré.)

7. [x] **Ordre du jeu** pour l'affichage des ressources : **EARTH, WATER, FIRE**, puis le reste
       dans l'ordre du **Game Data** (ordre des lignes du Sheet officiel).
       - `build_data.py` : `resources` ordonnées (plus d'alphabétique).
       - `index.html` : tri par défaut = `'game'` (garde l'ordre de `data.json`) ; sélecteur Crafting
         peuplé dans cet ordre. Le tri par colonne (clic) reste disponible.

8. [x] **Colonne `coin/h`** (après le prix) = différence acheter vs produire, ramenée en coin/h.
       - Formule (reprise de l'Excel onglet `data` col E, validée numériquement) :
         `coin/h = (prix_out×0,975 − Σ(qté_input×yf×prix_input)/output) × output / heures × 2 × (1 + bonus)`
         (prix live en COIN ; heures = durée d'un cycle). Multiplicateurs de **vitesse** :
         `×2` = **bonus vidéo +100 % permanent** ("Speed Bonus from Video") ; `×(1+bonus)` = **Speed bonus Workshop**
         (cumul multiplicatif → durée effective = durée / (2×(1+bonus)) ; vérifié SCREWS niv 7 : 15h/(2×1,52) ≈ 4h57m).
         `yf` = facteur de **Yield** = yield_niveau / (yield_niveau + mastery) → le yield réduit la conso d'inputs
         (yield_niveau = Game Data `yield_pct` ; mastery en % ; vérifié SCREWS niv 7 : 2,85×105,31/110,8 = 2,71 = le jeu). Cf. besoin #13.
       - **Sélecteur de niveau d'usine par ressource** (défaut = niveau actuel `CURRENT_LEVELS` dans
         `build_data.py`, repris de l'Excel) ; changer le niveau recalcule le coin/h.
       - `data.json` : chaque ressource porte `level` (défaut) et `bonus` ; les niveaux dispo viennent de `crafting`.
       - Colonne triable. FIRE/WATER (sans recette) → `—`.
       - MAJ niveaux : éditer `CURRENT_LEVELS` dans `build_data.py` quand tu montes une usine.
       - **Test de non-régression** : calcul pur extrait dans `coinh.js` (partagé page + tests) ;
         `test/coinh.test.js` fige la formule (SCREWS niv 7 réel : yield + speed ; EARTH/MUD + cas limites). Lancer : `npm test`.

9. [x] **Mastery éditable + niveau en 1re colonne + persistance navigateur.**
       - La Mastery du jeu devient une **valeur par ressource**, saisie dans une **colonne Mastery éditable**
         (après coin/h). Saisie **en pourcentage** (comme l'affichage du jeu ; défaut **5,3 %**, max 100, pas 0,1).
         Elle **s'ajoute au yield du niveau** pour réduire le coût des inputs (voir besoin #13) ; passée **en %** à `coinh.js`.
         Clé localStorage `cw_mastery_pct` (l'ancienne `cw_mastery`, en facteur, est abandonnée).
       - Le **sélecteur de niveau** (fusionné dans la colonne Ressource au besoin #16 : `NAME_niveau`) recalcule
         le coin/h de la ligne. coin/h n'affiche que la valeur.
       - **Persistance localStorage** (`cw_levels`, `cw_mastery`) : tes niveaux + masteries survivent au rechargement.
         Saisie 100% dans la page, rien à re-déployer.
       - Colonnes : Niveau | Ressource | Prix live | coin/h | Mastery | Pool.
       - Test : `coinh.js` reçoit la mastery **en %** (ajoutée au yield), couvert par `test/coinh.test.js` (cf. besoin #13).

10. [x] **Colonne variation 24h** (après le prix). *(La colonne « 1 semaine » a été retirée — voir besoin #22.)*
        - **24h** : `price_change_percentage.h24` (déjà dans le fetch de prix, instantané, aucun appel en plus).
        - Format `fmtVar` : `+x,x %` vert / `-x,x %` rouge / `—`. Triable.
        - Pools inversées (COPPER) : variation non dérivable → « — ».

11. [x] **Réorganisation pour réduire la conso de tokens** (refacto, pas de changement fonctionnel).
        - `data.json` **minifié** + flottants entiers → int : **178 KB → ~96 KB (−44 %)**. `build_data.py`
          produit ce format (`separators=(",",":")`). NB : `yield_pct` avait été retiré ici puis **restauré au besoin #13** (utile).
        - Le JS d'`index.html` est extrait dans **`app.js`** (`index.html` ne garde que HTML+CSS, ~5 KB) ;
          chargé via `<script src="app.js">`. `coinh.js` reste séparé. Les éditions de logique ne relisent plus le HTML.
        - Vérifié : app charge (34 ressources), 8/8 tests, rendu identique. data.json reste 100 % généré.

12. [x] **Colonne Speed bonus** (après Mastery) = le bonus de prod par usine, désormais **éditable**.
        - C'est le bonus déjà présent dans le coin/h (terme `× (1 + bonus)`), simplement exposé en colonne.
        - Saisi **en %** (cohérent avec Mastery ; défaut = `bonus` de data.json ×100, **relevé dans le jeu** :
          SEAWATER 54, SCREWS 52, ALGAE 47, CERAMICS/STEEL/OXYGEN 39, GAS/FUEL 25, HEAT/LAVA 10, STONE 9 ; 0 sinon).
          `app.js` le reconvertit en fraction `bonus/100` avant `coinh.js` (formule inchangée).
        - **Persisté** localStorage `cw_bonus_pct` ; éditable pour toute ressource ayant une recette (sinon « — »).
        - Test : `coinh.test.js` ancre `39 % → facteur 1,39`. **NB** : les screenshots des valeurs ne parviennent
          pas dans le chat → l'user saisit ses vraies valeurs dans la colonne (mémorisées au rechargement).
        - Colonnes finales : Niveau | Ressource | Prix live | 24h | 1 sem. | coin/h | Mastery | Speed bonus | Pool.

13. [x] **Modèle Yield** (réduction du coût des inputs) + cache-bust des scripts.
        - Le **Yield** du jeu réduit la conso d'inputs. Il cumule deux sources (additif en %) :
          le **rendement du niveau** (Game Data `yield_pct`, restauré dans `data.json` ; il avait été retiré au #11)
          + le **bonus Mastery** (la colonne Mastery, en %). → `yield_total = yield_pct + mastery`.
        - Facteur appliqué à la quantité d'inputs : `yf = yield_pct / (yield_pct + mastery)` (`coinh.js`, fn `yieldFactor`).
          Si `yield_pct` absent (ressources de base, 50/580 niveaux) → base 100.
        - **Validé sur le screenshot SCREWS niv 7** : input base 2,85, yield niveau 105,31 %, Mastery 5,49 %
          → 2,85 × 105,31/110,8 = **2,71** (= l'input affiché par le jeu). `raw_need = input×yield ≈ 3,0` constant par niveau.
        - `coinh.test.js` ancre ce cas (yield → input 2,71) **et** le speed (durée 15h → 4h57m via ×2×(1+0,52)).
        - **Cache-bust** : `index.html` charge `coinh.js` puis `app.js` avec `?v=Date.now()` (chargement ordonné) —
          évite tout décalage de version entre `app.js`, `coinh.js` et `data.json` chez un visiteur en cache.

14. [x] **Colonne `coin/kpower`** (après coin/h) = coins par **1000 de power** dépensé.
        - Formule (Excel onglet `data` col W = `D*B / V`, avec V = `k power` = power/1000) :
          `coin/kpower = profit_par_cycle × 1000 / power`, où `profit_par_cycle = prix_out×0,975×output − coût_inputs`
          (même marge que le coin/h, yield inclus) et `power` = coût power du **Game Data officiel** (`recipe.power`).
        - **Indépendant de la vitesse** (pas de ×2 vidéo ni de durée ni de Speed bonus) : le power est consommé par cycle.
          Dépend du niveau (output/input/yield/power), de la Mastery et des prix.
        - `coinh.js` : `profitPerCycle` (factorisée, partagée avec coin/h) + `coinPerKPower`. Colonne triable ;
          `—` si pas de recette ou power nul. Test : `coinh.test.js` ancre SCREWS niv 7 (0,00866 aux prix de test).
        - Colonnes finales : Niveau | Ressource | Prix live | 24h | 1 sem. | coin/h | coin/kpower | Mastery | Speed bonus | Pool.

15. [x] **Taxe de vente globale configurable.**
        - Le `×0,975` (part encaissée = 1 − taxe) était hardcodé. Devient un **champ global** « Taxe vente % »
          (barre de config du tableau Prix ; défaut **2,5 %**), qui s'applique à **coin/h ET coin/kpower**.
        - `coinh.js` : param `sellFactor` (= 1 − taxe/100 ; défaut 0,975) sur `profitPerCycle` → propagé aux deux calculs.
          `app.js` : `sellFactor()` = `1 − taxPct/100` ; **persisté** localStorage `cw_tax`.
        - Test : `coinh.test.js` ancre 0 % / 2,5 % / 5 % (coin/h) et 0 % / 10 % (coin/kpower).

16. [x] **Refonte de l'en-tête du tableau Prix** (UI, pas de changement de calcul).
        - Renommages : « Prix live (COIN) » → **coin** ; « coin/kpower » → **coin/kpow**.
        - **coin/h** et **coin/kpow** déplacés juste après Ressource.
        - **Niveau fusionné dans Ressource** : la cellule affiche `NAME_niveau` (format ID officiel, ex. `SEAWATER_30`)
          avec le sélecteur de niveau **inline** (seul l'affichage/recalcul bouge). FIRE/WATER (sans recette) : nom seul.
        - `app.js` : `resourceCell` (remplace `levelCell`) ; ordre des `<td>` et `thIdx` du tri mis à jour.
        - Colonnes finales : **Ressource | coin/h | coin/kpow | coin | 24h | Mastery | Speed bonus | Pool** (1 sem. retirée au #22).

17. [x] **Réorganisation des lignes par glisser** (poignée tactile + souris).
        - Poignée **⠿** à gauche de chaque ligne (dans la cellule Ressource). Glisser via **pointer events**
          (marche au doigt ET à la souris ; `touch-action: none` sur la poignée pour ne pas scroller pendant le drag).
        - Ordre **persisté** localStorage `cw_order` ; bouton **« ↺ ordre du jeu »** (barre de config) réinitialise.
        - Après un glisser, l'ordre manuel devient la vue par défaut (`rentaSort.key='game'`). Cliquer un en-tête
          trie temporairement ; reglisser refige l'ordre courant. Avec un filtre actif, seules les lignes **visibles**
          sont réordonnées (les masquées gardent leur place — algo de fusion dans `onDragEnd`).
        - `app.js` : `customOrder` + `orderedResources()` (ordre de base) ; drag via délégation sur `#renta-body`
          (`setupDragReorder`, `dragAfterElement`, `onDragMove/onDragEnd`) ; `<tr data-name>` pour relire l'ordre.
          Vérifié en preview (glisser simulé, persistance au rechargement, reset). Logique de calcul inchangée (12/12).

18. [x] **Ordre d'affichage par défaut** (choix user) — remplace l'ordre du besoin #7.
        - `PREFERRED_ORDER` dans `build_data.py` : EARTH, MUD, CLAY, SAND, COPPER, STEEL, SCREWS, WATER, SEAWATER,
          ALGAE, OXYGEN, GAS, FUEL, OIL, **ACID, CERAMICS, STONE, CEMENT**, FIRE, LAVA, GLASS, SULFUR, HEAT, STEAM,
          ENERGY, HYDROGEN, FIBERGLASS, PLASTICS, DYNAMITE — **puis le reste** (ordre Game Data).
        - Ordonne `resources` dans `data.json` (appliqué aussi en place). C'est l'ordre **par défaut** ; un ordre manuel
          (`cw_order`, besoin #17) le surcharge → bouton « ↺ ordre du jeu » pour revenir à ce défaut.

19. [x] **Dégradé rouge→vert sur coin/h et coin/kpow** (heatmap par valeur).
        - Fond de cellule interpolé `hsla(0→120, …)` = rouge (valeur la plus basse) → vert (la plus haute),
          plage min/max calculée par colonne sur les lignes **affichées**. **EARTH exclu** de l'échelle (outlier) → sans fond.
        - `app.js` : `heatRange` (min/max hors EARTH) + `heatSpan` ; valeurs précalculées dans `renderRenta`,
          passées à `coinhCell`/`coinhkCell`. Recalculé à chaque rendu (filtre, prix, niveau, taxe). Calcul inchangé (12/12).

20. [x] **Colonnes coin/h et coin/kpow dans l'onglet Crafting** (placées **juste après Niveau**).
        - Chaque ligne = un **niveau** → coin/h et coin/kpow calculés **par niveau** (recette de la ligne) avec la
          Mastery / Speed bonus / taxe **de la ressource sélectionnée** (mêmes fonctions `coinh.js` que l'onglet Prix).
        - `renderCrafting` : `priceByName(resource)` en sortie, `priceByName` pour les inputs ; couleur par signe.
          Rafraîchi à l'ouverture de l'onglet (`showTab`) et à l'arrivée des prix (`fetchAllPrices`). Pas de dégradé ici.

21. [x] **Vue à plat de toutes les recettes** (onglet Crafting).
        - **Bouton « À plat »** (à côté du sélecteur ; état `craftingFlat`, `toggleFlat`) : liste **toutes** les recettes
          de toutes les ressources (580 lignes / 32 ressources) en un tableau, avec une colonne **Ressource** en tête
          (masquée en vue par ressource via `#crafting-res-th.hidden`, td conditionnel pour l'alignement).
          Bouton actif = surligné, sélecteur désactivé. Re-clic = retour vue par ressource.
        - Chaque ligne calcule coin/h & coin/kpow avec la Mastery/Speed bonus/taxe de **sa** ressource.
        - Défaut = vue par ressource (1re ressource) ; la vue à plat est opt-in via le bouton.

24. [x] **Nouvel onglet PowerPlant** — données de l'onglet **PowerPlants** du Game Data officiel.
        - Nouveau tab Sheet (`GID_POWERPLANTS = "360630991"`), parsé par `parse_powerplants` (`build_data.py`) :
          regroupe les lignes `ID = NAME_niveau` (AIRSTREAM, SUNFORGE, STEAMFORGE, REACTOR) en
          `data.json.powerplants = {NAME: [niveaux...]}` (town_hall, max_count, power, per_hour, per_day,
          cycle_duration, input/input_amount, upgrade_duration, cost_symbol/cost_amount).
        - `index.html` : 3e onglet **PowerPlant** (sélecteur de centrale + tableau, même style que Crafting).
        - `app.js` : `renderPowerPlant()` (affichage brut, pas de coin/h ni de coût converti en COIN —
          juste les données du Game Data, contrairement à Crafting) ; sélecteur peuplé dans `init()`.
        - `python build_data.py` régénère aussi `data.json.powerplants` désormais.
        - **Colonne `coin/kpow`** (remplace **Town Hall**) = coût en COIN de l'input consommé par 1000 de
          power **produit** (`input_amount × prix(input) × 1000 / power`) — inverse du coin/kpow de Crafting
          (ici c'est un coût, pas un profit, car les centrales ne produisent pas de ressource vendable).
          N'existe que pour **STEAMFORGE** (LAVA) et **REACTOR** (HYDROGEN), constant par ressource sur tous
          les niveaux (même ratio input/power à chaque palier) ; AIRSTREAM/SUNFORGE (pas d'input) → « — ».
          `coinh.js` fn `powerPlantCostPerKPower` (testée : REACTOR niv.1, 0,01531 HYDROGEN → 111 kpower).
        - **Vue à plat par défaut** (contrairement à Crafting où elle est opt-in) : toutes les centrales
          (40 niveaux / 4 centrales) affichées d'un coup avec une colonne **Centrale** en tête. Bouton
          « À plat » (`powerplantFlat`/`togglePowerPlantFlat`, actif par défaut) permet de revenir à la
          vue par centrale (sélecteur réactivé). Même pattern que le bouton « À plat » de Crafting (besoin #21).

25. [x] **Colonne Δ Prod** (onglet Crafting, juste après **Output**) + colonnes Coût/Qté coût + renommage Up Cost/Sum.
        - Donnée du Game Data officiel `PRODUCTION CHANGE` (présente dans Factories et Mines) = le gain de
          production/jour apporté par ce niveau vs le niveau précédent (toujours ≥ 0). Ajoutée à chaque niveau
          dans `build_data.py` (`parse_recipes`) : `production_change_pct`. **Δ Prod** réutilise `fmtVar`
          (déjà utilisé pour la variation 24h) — vert/+ % si gain, neutre si 0 %.
          *(Δ Output et Δ Durée avaient été ajoutées puis retirées à la demande de l'user — `output_change` et
          `duration_change` supprimés de `build_data.py`/`data.json`, non réintroduits.)*
        - **Upgrade Cost / Upgrade Sum renommées Up Cost / Up Sum** (en-têtes plus courts).
        - **Colonnes Coût / Qté coût** déplacées **après Up Sum** (affichage brut de `cost_symbol`/`cost_amount`,
          la source de calcul d'Up Cost) — même style que les colonnes Coût/Qté coût de l'onglet PowerPlant (besoin #24).
        - Ordre final : Ressource | Niveau | coin/h | coin/kpow | Up Cost | Up Sum | Coût | Qté coût | Output |
          Δ Prod | Durée | Input 1 | Qté 1 | Input 2 | Qté 2 | Power | XP.

23. [x] **Colonnes Upgrade Cost et Upgrade Sum** (onglet Crafting, après coin/kpow).
        - Données : `cost_symbol` + `cost_amount` ajoutés à chaque recette (Game Data `COST SYMBOL`/`COST AMOUNT`,
          via `build_data.py` ; mergées dans `data.json` depuis `_recipes.csv`). 530/580 niveaux ont un coût.
        - **Upgrade Cost** (Excel col R) = `cost_amount × prix(cost_symbol)` (en COIN) ; `coinh.js` fn `upgradeCost`.
        - **Upgrade Sum** (Excel col S) = somme **cumulée** des Upgrade Cost par ressource (ordre de niveau ;
          accumulateur `sumByRes` dans `renderCrafting`). Couleur rose (coût). `—` si prix indispo / pas de coût.
        - Tous les cost_symbol de nos 32 ressources sont prix-disponibles. Test : `upgradeCost` figé (MUD_17 = COPPER×21).

22. [x] **Suppression de la colonne « 1 semaine »** + tout son code.
        - Retiré : `<th>1 sem.</th>`, `weekCell`, `fetchWeekVars`, `weekVar`, `weekStarted`, `sleep`, le tri `w1`,
          le `<td>` et l'appel dans `fetchAllPrices`. (Le besoin #10 ne garde que la variation 24h.)
        - **Motif** : la variation 1 sem. déclenchait **34 appels OHLCV par refresh** → cause probable des `429`/
          « Failed to fetch » (rate-limit ~30/min). Le fetch de prix se limite désormais à **2 requêtes** (chunks de 30).

26. [x] **Colonnes UpCost et up kpow/j/kcoin** (onglet PowerPlant, après **coin/kpow**).
        - **UpCost** = coût d'upgrade du niveau en COIN (`cost_amount × prix(cost_symbol)`), réutilise `CoinH.upgradeCost`
          (déjà utilisée par Up Cost de Crafting, besoin #23). Couleur rose (coût).
        - **up kpow/j/kcoin** = gain de power/jour apporté par ce niveau (`per_day` − `per_day` du niveau précédent
          de la même centrale ; niveau 1 → gain = `per_day` complet), divisé par UpCost — un ratio d'efficacité
          de l'upgrade (kpow/j gagné par kcoin dépensé). `coinh.js` fn `powerPlantUpgradeEfficiency`
          (testée : REACTOR niv.1→2 figé). Couleur verte (valeur, pas un coût).
        - `app.js` : `ppUpCostCell`/`ppEfficiencyCell` + accumulateur `prevPerDayByName` dans `renderPowerPlant`
          (par centrale, ordre de niveau — même pattern que `sumByRes` de Crafting).

27. [x] **Nouvel onglet Batteries** — données de l'onglet **Batteries** du Game Data officiel (`GID_BATTERIES = "22834069"`).
        - `parse_batteries` (`build_data.py`) : regroupe les lignes `NAME = FAMILLE_niveau` (**POWER_CELL**,
          **BATTERY** ; lignes vides entre les deux blocs → ignorées) en `data.json.batteries = {FAMILLE: [niveaux...]}`
          (town_hall, capacity, max_count, upgrade_duration, cost_symbol/cost_amount). Pas de production/power
          (les batteries stockent, ne produisent pas) → pas d'équivalent coin/h ni coin/kpow ici.
        - `index.html` : 4e onglet **Batteries** (sélecteur de famille + tableau, même style que PowerPlant),
          colonnes : Batterie | Niveau | UpCost | up capa/coin | Max | Capacité | Durée upgrade | Coût | Qté coût.
        - **UpCost** = coût d'upgrade en COIN, réutilise `CoinH.upgradeCost` (comme PowerPlant, besoin #26).
        - **up capa/coin** = gain de capacité apporté par ce niveau (`capacity` − `capacity` du niveau précédent
          de la même famille ; niveau 1 → gain = `capacity` complète), divisé par UpCost — ratio d'efficacité
          de l'upgrade (capacité gagnée par coin dépensé, pas de facteur "kilo" ici contrairement à PowerPlant).
          `coinh.js` fn `batteryUpgradeEfficiency` (testée : BATTERY niv.1→2 figé).
        - **Vue à plat par défaut** (`batteriesFlat`/`toggleBatteriesFlat`, actif par défaut), même pattern que
          PowerPlant (besoin #24) : 25 niveaux / 2 familles affichés d'un coup, bouton « À plat » pour revenir
          à la vue par famille (sélecteur réactivé).
        - `python build_data.py` régénère aussi `data.json.batteries` désormais.

28. [x] **Taxe d'achat + cases Achat/Vente par ressource** (onglet Prix, colonnes après Speed bonus).
        - **Principe** : les taxes sont des **frais réels prélevés sur une transaction** — pas de transaction,
          pas de frais. (Modèle choisi par l'user, ≠ coût d'opportunité : une ressource produite puis consommée
          en aval n'est ni achetée ni vendue, donc n'est taxée d'aucun côté.)
        - **Champ « Taxe achat % »** à côté de « Taxe vente % » (défaut 2,5 %, persisté `cw_buytax`).
          Le vrai taux côté acheteur du jeu n'est pas confirmé — l'user ajustera.
        - **Case Achat** = j'achète les **inputs** de cette recette au marché → `coût_input × (1 + taxe_achat)`.
          « — » si la recette n'a pas d'input. Défaut **coché uniquement** si un input n'a aucune recette
          (donc impossible à produire) : SEAWATER←WATER, HEAT←FIRE, SALT←FIRE, PAPERWRAP/BOOK←DUST.
        - **Case Vente** = je vends l'**output** au marché → `prix_out × (1 − taxe_vente)`. Défaut coché.
          Décochée = output consommé par une recette en aval, donc aucune taxe de vente.
        - Les 4 combinaisons sont valides et distinctes ; « Achat ✗ + Vente ✗ » = palier purement
          intermédiaire (marge brute sans aucune taxe).
        - `coinh.js` : `profitPerCycle` prend un 6e param **`buyFactor`** (défaut 1 = rétro-compatible),
          appliqué à `amt * yf * pin`. Propagé à `coinPerHour` (7e param) et `coinPerKPower` (6e param).
        - `app.js` : `buyFlag`/`sellFlag` (persistés `cw_buy`/`cw_sell`), `sellFactorFor(name)`/`buyFactorFor(name)`
          remplacent l'ancien `sellFactor()` global (supprimé). Utilisés par l'onglet Prix **et** l'onglet Crafting
          (où `sf`/`bf` sont désormais calculés par ligne, plus une seule fois hors boucle).
        - **Non touché** : Up Cost / UpCost (Crafting, PowerPlant, Batteries) et le coin/kpow des centrales
          restent au prix brut, sans taxe d'achat.

29. [x] **Nouvel onglet Chaînes** — rentabilité d'une chaîne de production complète.
        - **Chaîne détectée automatiquement** depuis les recettes : on remonte l'arbre des inputs jusqu'aux
          ressources **sans recette** (achetées au marché). 24 recettes ont 2 inputs → c'est un **arbre**,
          pas une ligne (ex. DYNAMITE = 23 étapes).
        - **Modèle** : seules les feuilles sont achetées (taxe d'achat), seule la ressource de la ligne est
          vendue (taxe de vente) ; les intermédiaires ne passent pas par le marché, donc **aucune taxe** —
          cohérent avec le besoin #28. Le prix de marché d'un intermédiaire n'entre jamais dans le calcul.
        - `coinh.js` : `chainMetrics(name, ctx)` + `chainNode` récursif (mémoïsé, garde-fou anti-cycle).
          `ctx = { recipeOf, priceOf, masteryOf, speedOf, buyFactor, sellFactor }`. Retourne
          `{ cost, power, rate, bottleneck, margin, coinH, coinKPow }` **par unité produite**.
          Débit : `rate(N) = min(débit propre, min amont / qté par unité)` → propage le **goulot**.
        - `app.js` : `renderChains`, `chainCtx`, `chainSteps` (étapes amont d'abord), `toggleChainsFlat`.
          Colonnes : Ressource | Niveau | coin/h | coin/kpow | Marge/u | Coût mat. | Prix | kpow/u |
          Débit u/h | Goulot | Étapes. **Vue à plat par défaut** (44 ressources) ; le sélecteur montre
          les étapes d'une chaîne, chacune avec SES propres métriques de chaîne (= « et si je vendais ici ? »).
        - **Débit et goulot calculés avec une usine par étape** (hypothèse affichée sous les onglets).
        - Vérifié par recoupement : implémentation JS ≡ script Python indépendant, aux prix live du jour
          (OIL coin/h 102,01 / coin/kpow 0,649 / goulot FUEL).
        - **Taxes par défaut passées à 3,5 %** (achat et vente) — taux réel du jeu confirmé par l'user.
          NB : `cw_tax`/`cw_buytax` déjà en localStorage écrasent ce défaut.
        - **Bug corrigé au passage** : `showTab` faisait `querySelectorAll('.tab-btn')`, qui attrape aussi les
          boutons « À plat » (même classe) → ils perdaient leur surlignage à chaque changement d'onglet alors
          que le mode à plat restait actif. Le conteneur de navigation a désormais `id="tabs"` et le sélecteur
          est `#tabs .tab-btn`.

30. [x] **Colonne « Coût inputs »** (onglet Chaînes, juste après **Coût mat.**).
        - = coût des inputs de **cette usine seule**, achetés au marché (taxe d'achat comprise), par unité
          produite — quantités yield/Mastery-ajustées comme partout ailleurs.
        - À comparer à **Coût mat.** (coût cumulé des matières de base en remontant toute la chaîne) :
          si « Coût inputs » est plus cher, produire l'intermédiaire soi-même est rentable.
        - `coinh.js` : `directInputCost(name, ctx)` (non récursif, contrairement à `chainNode`), exposée
          via `chainMetrics().directCost`. `null` si la recette n'a aucun input ou si un prix manque —
          une chaîne peut rester calculable alors que `directCost` ne l'est pas (l'intermédiaire produit
          n'a pas besoin d'un prix de marché, l'acheter si).
        - Contrôles : SEAWATER affiche deux coûts **identiques** (son input WATER est déjà acheté) ;
          les chaînes issues d'EARTH ont **Coût mat. = 0** car EARTH est une recette **sans input**
          (extraite de rien, power 7) — leur seul coût réel est le power.

31. [x] **EARTH comptée à son prix d'achat** dans l'onglet Chaînes (correction du besoin #29).
        - EARTH est la **seule recette sans aucun input** du Game Data (extraite de rien, power 7). `chainNode`
          la traitait donc comme une production **gratuite**, et toutes les chaînes issues d'EARTH
          affichaient `Coût mat. = 0` — ce qui les faisait paraître rentables à tort.
        - Règle : une recette sans input, **consommée par une autre recette**, est comptée à son
          **prix d'achat** (taxe d'achat comprise), comme n'importe quelle matière de base. Son power
          n'est plus cumulé non plus (on n'exploite pas la mine, on achète). `chainNode` prend un flag
          `asInput` ; la mémoïsation est donc clé `nom|in` / `nom|root`.
        - **À la racine, la recette est conservée** : la ligne EARTH elle-même continue de montrer son
          économie de production (coût matières 0, power 7, son propre coin/kpow).
        - Cohérence retrouvée avec les onglets Prix et Crafting, qui valorisaient déjà EARTH au marché
          quand MUD la consomme — seul l'onglet Chaînes la rendait gratuite.
        - Effet : MUD passe de rentable à **perdant** (coût 0,0125 pour un prix de 0,0121), et pour STEEL
          il devient visible qu'**acheter le COPPER** (39,26) coûte moins cher que de le produire (40,31).

32. [x] **Colonne « Prix net »** (onglet Chaînes) — remplace l'affichage du cours brut.
        - Affiche le prix **encaissé** = cours du marché × (1 − taxe de vente), au lieu du cours brut.
          Motif : le cours brut ne se comparait à aucune autre colonne (les deux colonnes de coût sont
          taxe d'achat comprise), ce qui invitait à calculer une marge fausse par simple soustraction.
        - Rend le tableau vérifiable de tête : **Marge/u = Prix net − Coût mat.** (aux arrondis
          d'affichage près, 3 chiffres significatifs).
        - `app.js` : la cellule affiche `m.margin + m.cost` plutôt que `priceByName(name) * sellFactor` —
          par construction de `chainMetrics`, c'est exactement le prix ayant servi au calcul de la marge,
          donc aucun risque de divergence entre l'affichage et le calcul.
        - Mention ajoutée dans le texte explicatif sous les onglets + tooltip sur l'en-tête.

33. [x] **Ressources après DYNOKEY retirées** (obsolètes) — `select_resources` dans `build_data.py`.
        - La sélection « BOLTS → fin » ramassait tout ce que la team avait ajouté après DYNOKEY dans le
          Sheet : WIRE, NEST/WETNEST/WARMNEST/DYNONEST, PAPERWRAP/SANDWRAP/STEAMWRAP, BOOK, SALT,
          ARTICLE, DIPLOMA. Bornée à **DYNOKEY inclus**.
        - Ces 12 ressources n'avaient **aucun pool** (donc aucun prix) : elles remplissaient l'onglet
          Chaînes de lignes « prix manquant ». Retour à **34 ressources / 32 recettes, toutes avec pool**.

34. [x] **Case « Acheter » par ressource** (onglet Chaînes, après Niveau) — couper la chaîne à une étape.
        - Cochée, la ressource est prise à son **prix de marché** (taxe d'achat comprise) au lieu d'être
          produite : la chaîne s'arrête là, son power n'est plus cumulé et elle cesse d'être un goulot
          potentiel (approvisionnement marché illimité). Persistée dans `cw_bought`.
        - Réutilise le mécanisme `asInput` du besoin #31 : `ctx.boughtOf(name)` s'ajoute à la règle de
          coupure de `chainNode`. **À la racine la recette est conservée** — la propre ligne de la
          ressource continue de montrer son économie de production, donc on voit toujours *pourquoi*
          on a décidé de l'acheter.
        - Case désactivée (« — ») pour une ressource de base (déjà toujours achetée) ou sans prix.
        - `chainSteps` suit la même règle de coupure — au passage **correction** : il comptait encore
          EARTH comme une étape depuis le besoin #31 (colonne Étapes surévaluée de 1).
        - Cas d'usage réel (DYNAMITE, prix du jour) : FIBERGLASS coûte 11 204 à produire pour 9 899 au
          marché. En l'achetant, DYNAMITE passe de **−855 à +1 548** de marge (coin/h −4,34 → +19,21),
          le power tombe de 11 856 à 7 467 kpow/u, la chaîne de 22 à 17 étapes et le goulot se déplace
          de SULFUR vers STONE.

35. [x] **Correctif #34** — cocher « Acheter » faisait disparaître la ligne, la rendant impossible à décocher.
        - Cause : en vue par chaîne, la liste affichée venait de `chainSteps(sel, ctx)`, qui coupe sur les
          ressources achetées. Cocher une étape la retirait donc de la liste **avec sa propre case**.
        - Correctif : la liste **affichée** est calculée avec un ctx où `boughtOf` renvoie toujours faux
          (`displayCtx`), donc l'arbre reste stable quoi qu'on coche. Le décompte « N étapes » de la
          barre d'info utilise, lui, le ctx réel (achats déduits) — sur DYNAMITE : 22 lignes affichées,
          « 17 étapes » annoncées après achat de FIBERGLASS.
        - Les lignes achetées sont **atténuées** (opacity .5) : elles ne font plus partie de la chaîne,
          mais leurs chiffres restent lisibles pour voir l'économie de production à laquelle on renonce.

36. [x] **Onglet Chaînes : tableau moins large + niveau modifiable.**
        - En-têtes raccourcis : **Ressource → Res**, **Niveau → Niv**, **Acheter → Buy** (les `th` sont en
          `white-space: nowrap`, donc le libellé fixait la largeur mini de la colonne). Le sens complet
          est conservé dans les infobulles. Le tableau ne déborde plus de son conteneur.
        - **Niveau d'usine modifiable** ici aussi (sélecteur, comme dans l'onglet Prix) : `levelCell(n)`
          dans `renderChains`, câblée sur le **même** `onLevelChange` — donc le même état `factoryLevel`,
          la même persistance `cw_levels`, et les deux onglets restent synchronisés.
        - `onLevelChange` rafraîchit désormais `renderRenta()` **et** `renderChains()`.
        - Vérifié : SEAWATER 30 → 20 fait passer sa ligne de 5,65 à −25,6 de coin/h et propage l'effet
          en aval (OIL 102 → 46,5), le niveau se relit dans l'onglet Prix.

37. [x] **Onglet Chaînes placé en premier**, devant Prix (ordre : Chaînes | Prix | Crafting | PowerPlant | Batteries).
        - `index.html` : bouton Chaînes déplacé en tête et porteur de `active` ; `#tab-chains` visible au
          chargement, `#tab-renta` passe en `hidden`.
        - `app.js` : tableau `order` de `showTab` réordonné (il mappe l'index du bouton vers le nom d'onglet).
        - Vérifié : au chargement Chaînes est ouvert et surligné ; pour chacun des 5 onglets, une seule
          zone visible et le bon bouton allumé ; les boutons « À plat » gardent leur état.

38. [x] **Noms de ressources tronqués à 4 caractères** (onglet Chaînes uniquement).
        - `shortName(n)` dans `renderChains` : affiche `n.slice(0, 4)` avec le **nom complet en infobulle**.
          Appliqué à la colonne **Res** (ligne normale et ligne « prix manquant ») **et** à la colonne
          **Goulot**, qui affiche elle aussi des noms de ressources.
        - Les autres onglets (Prix, Crafting, PowerPlant, Batteries) gardent les noms complets : le motif
          `<td class="font-semibold text-white">${name}</td>` y est identique, l'édition a donc dû être
          ciblée sur les seules lignes de `renderChains`.
        - **Limite connue — 2 collisions** sur les 34 ressources : `CERA` = CERAMICS **et** CERAMICKEY,
          `GLAS` = GLASS **et** GLASSKEY. Seule l'infobulle les distingue. (DYNAMITE/DYNOKEY passent :
          `DYNA` vs `DYNO` ; STEEL/STEAM aussi : `STEE` vs `STEA`.)
        - Largeur du tableau : 1216 px → 1063 px (−153). Au-delà, le conteneur reste en `overflow-x-auto`.

39. [x] **Colonne Yield** (onglet Crafting, juste après **Δ Prod**).
        - Affiche `yield_pct` (Game Data `YIELD`), déjà présent dans `data.json` depuis le besoin #13 —
          il servait au calcul (il réduit la quantité d'inputs) mais n'était pas visible.
        - Placée après Δ Prod à dessein : les deux mesurent ce qu'apporte un niveau, mais sur des axes
          différents. Ex. SEAWATER 1→5 : Δ Prod reste à 0 % (même output, même durée) alors que le
          **yield double de 100 % à 200 %**, faisant tomber la conso de 16 à 8 WATER. Un niveau à
          Δ Prod = 0 n'est donc pas un niveau inutile — la colonne Yield le rend enfin lisible.
        - `—` pour les 50 niveaux d'**EARTH**, seule recette sans input : rien à économiser, donc pas
          de yield dans le Game Data.
        - Infobulle sur l'en-tête : rendement du niveau, la Mastery s'y **ajoute** dans le calcul du coin/h.
        - Ordre Crafting : … | Output | Δ Prod | **Yield** | Durée | Input 1 | … (18 colonnes en vue à plat).

40. [x] **Favicon** — icône dans l'onglet du navigateur.
        - `favicon.png` (90×90, 16 Ko) : **l'icône officielle du jeu**, fournie par l'user.
        - `index.html` : `<link rel="icon" type="image/png">` + `<link rel="apple-touch-icon">` +
          `<meta name="theme-color" content="#0f172a">`.
        - *(Un `favicon.svg` maison — cube isométrique indigo — avait d'abord été créé puis remplacé
          par l'icône du jeu, et le fichier supprimé.)*
        - Vérifié servi en 200 avec `content-type: image/png` et rastérisé par le navigateur.

41. [x] **Alerte usine déficitaire** (onglet Chaînes) — code couleur + info agrégée.
        - Une ligne est marquée (**fond rosé, liseré rouge à gauche, ⚠ devant le nom**) quand elle est
          **produite à perte** (`margin < 0`) **et pas cochée Buy** : c'est une candidate au Buy.
          Une ligne achetée n'est jamais marquée (le problème est traité) — elle reste atténuée.
        - Critère : `margin < 0` suffit, car **coin/h et coin/kpow ont toujours le même signe que la
          marge** (ce sont la marge multipliée par le débit / par 1000÷power, tous deux positifs).
        - **Barre d'info** : en vue à plat, `N ressources — ⚠ k produites à perte : …` ; en vue par
          chaîne, `N étapes jusqu'à X — ⚠ k à perte : …`. Répond au cas signalé (« le dernier est
          négatif, ex. OIL ») comme aux étapes intermédiaires.
        - En vue par chaîne, seules les étapes **réellement dans la chaîne** sont signalées : celles en
          amont d'une étape achetée restent affichées (pour pouvoir la décocher, cf. #35) mais ne la
          nourrissent plus. Sans ça, le décompte de l'info et le nombre de ⚠ divergeaient
          (DYNAMITE après achat de FIBERGLASS : info « 4 » vs 8 lignes marquées).
        - Vérifié : aucun oubli ni faux positif en vue à plat (12/32 marquées), et cocher FIBERGLASS
          fait tomber DYNAMITE de 10 à 4 alertes, info et marquage concordants.

42. [x] **Correction du critère d'alerte #41** — c'est l'**usine seule** qui compte, pas la chaîne cumulée.
        - #41 marquait les lignes dont la **marge de chaîne** était négative. L'user visait autre chose :
          le rendement de l'usine **prise isolément**, celui qu'affiche l'onglet Prix. Cas typique OIL :
          chaîne **+583/u** (bénéficiaire) alors que l'usine seule **perd** — les deux coexistent.
        - `coinh.js` : nouveau champ `chainMetrics().stepMargin` = `prix_net − directCost`, soit l'output
          vendu au marché moins ses propres inputs achetés au marché. Recette sans input (EARTH) → tout
          le prix net. `null` si le prix d'un input manque (chaîne calculable mais étape non jugeable).
        - `app.js` : l'alerte et le décompte de la barre d'info utilisent `stepMargin < 0` au lieu de
          `margin < 0`. Infobulle du ⚠ : rappelle coût des inputs, prix net et marge d'étape.
        - **Écart Prix / Chaînes à connaître** : l'onglet Prix n'applique la taxe d'achat que si la case
          *Achat* de la ressource est cochée, alors que `stepMargin` l'applique toujours (dans une chaîne,
          l'input vient forcément du marché si on n'en produit pas). Sur OIL : −190 sans la taxe (ce que
          montre l'onglet Prix) contre −274 avec. Le signe est le même, l'ordre de grandeur diffère.

43. [x] **Refonte des indicateurs (remplace #41/#42)** — ne signaler que ce sur quoi on peut AGIR.
        - **Problème** : le ⚠ portait sur la « marge d'étape » (`stepMargin < 0`), qui marquait ALGAE et
          OXYGEN. Or ce sont des **passages obligés** vers GAS/FUEL : les arrêter casserait la chaîne, et
          les acheter coûte plus cher que les produire. L'indicateur poussait donc à une mauvaise décision.
        - **⚠ rosé** = `prix d'achat × (1 + taxe) < Coût mat.` : la ressource est **moins chère à acheter
          qu'à produire** → coche Buy. Seul cas où une action est justifiée. Aux prix du jour : 5 sur 32
          (GLASS, HEAT, STEAM, FIBERGLASS, DYNAMITE) au lieu des 22 signalées à tort par #42.
        - **★ vert** = **meilleur coin/h de la chaîne** → c'est là qu'il faut vendre. Repère positif qui
          répond à la question « où m'arrêter ? » sans alarmer sur les maillons en amont. Sur la chaîne
          OIL aux prix du jour : ★ sur **FUEL** (81,2 coin/h) et rien sur OIL (69,4) — l'étape finale
          est visiblement en retrait, ce qui était le besoin initial.
        - `stepMargin` (ajouté au #42) reste calculé et testé dans `coinh.js` mais ne pilote plus l'affichage.
        - Barre d'info : `N étapes jusqu'à X — ★ vendre à Y — ⚠ k moins chères à acheter : …`.

44. [x] **★ étendu à la vue à plat** (onglet Chaînes).
        - Le ★ n'existait qu'en vue par chaîne. En vue à plat chaque ligne est sa **propre** chaîne :
          une ligne reçoit donc le ★ si elle est le meilleur coin/h **de sa propre chaîne**, c'est-à-dire
          si la produire jusqu'au bout est le bon choix. `bestStopOf(n)` (mémoïsé) remplace le calcul
          ponctuel ; la vue par chaîne l'appelle simplement sur la ressource sélectionnée.
        - Les lignes **sans** ★ portent une infobulle indiquant où leur chaîne rapporte le plus —
          ex. OIL : « Sa chaîne rapporte plus en s'arrêtant à FUEL (81,2 coin/h contre 69,4) ».
        - Barre d'info à plat : `★ k à vendre en l'état : …` + `⚠ k moins chères à acheter : …`.
          Une ressource ⚠ est **exclue** de la liste ★ (le ⚠ prime, comme sur la ligne) — sans quoi HEAT
          apparaissait dans les deux listes et le décompte de l'info ne collait plus aux lignes marquées.
        - **Perf** : `chainMetrics` repart d'une mémoïsation vierge à chaque appel et il est désormais
          invoqué pour chaque ligne, chaque `bestStopOf` et la barre d'info → cache `mcache` local au
          rendu. Rendu complet des 32 lignes en ~10 ms.

45. [x] **★ = « à vendre », calculé en regardant l'AVAL** (remplace le ★ « meilleur coin/h de la chaîne »).
        - **Problème** : le ★ classait les étapes d'une chaîne sur le coin/h, donc il tombait sur FUEL.
          Or convertir le FUEL en **ACID** rapporte davantage (92,6 coin/h contre 82,9 en vendant FUEL
          et SCREWS), parce que l'usine ACID est lente et n'absorbe que ~23 % de la production de FUEL :
          elle **s'ajoute** à la vente de FUEL au lieu de la remplacer. `chainMetrics` ne pouvait pas le
          voir : il ne regarde qu'en **amont**.
        - `coinh.js` : **`sellPlan(names, ctx, metricsOf)`** construit le graphe **aval** (input → recettes
          qui le consomment) et calcule `value(n)` = meilleure valeur d'une unité de n, soit sa marge de
          vente, soit ce que rapporte sa transformation en aval (récursif, mémoïsé, garde-fou anti-cycle).
          `sell[n]` = la vendre est sa meilleure issue **ET** la produire ajoute de la valeur par rapport
          à la vente de ses propres inputs — c'est ce qui reçoit la ★.
        - **Approximation assumée** : les **co-inputs** d'une recette sont valorisés à leur marge de vente
          et non à leur propre `value`, sinon FUEL et SCREWS (les deux inputs d'ACID) s'attendraient
          mutuellement — dépendance circulaire. Les deux concluent quand même « faire de l'ACID ».
        - La double condition évite deux pièges : OIL n'a rien en aval mais **détruit de la valeur**
          (pas de ★), et ALGAE est rentable seul mais vaut bien plus transformé (pas de ★ non plus).
        - Infobulle sur les lignes sans ★ : « la transformer en aval vaut X/unité contre Y à la vente »
          ou « étape qui détruit de la valeur ». Aux prix du jour, ★ sur 5 ressources seulement :
          ACID, CEMENT, LAVA, HYDROGEN, DYNOKEY (au lieu de 14 avec l'ancien critère).
        - **Limite connue** : le modèle reste « une usine par étape » et ne répartit pas un flux entre
          plusieurs débouchés (vendre 77 % du FUEL + convertir 23 % en ACID). Le ★ dit quoi vendre,
          pas dans quelles proportions.
