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

10. [x] **Colonnes variation 24h et 1 semaine** (après le prix).
        - **24h** : `price_change_percentage.h24` (déjà dans le fetch de prix, instantané).
        - **1 semaine** : non fournie par l'API de prix → 1 appel OHLCV/jour par pool, en **arrière-plan**
          throttlé (~2,2 s/pool, ~75 s pour les 34, sous le rate-limit). Variation = (close_actuel − close_J-7)/close_J-7.
        - Format `fmtVar` : `+x,x %` vert / `-x,x %` rouge / `—`. Colonnes triables.
        - Pools inversées (COPPER) : variation non dérivable → « — ».
        - L'API n'expose rien au-delà de 24h en immédiat (m5…h24) ; tout horizon ≥ qq jours passe par l'OHLCV
          (un seul appel/pool ramène tout l'historique : 7j/15j/30j possibles au même coût si besoin un jour).
        - Colonnes finales : Niveau | Ressource | Prix live | 24h | 1 sem. | coin/h | Mastery | Pool.

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
        - Colonnes finales : **Ressource | coin/h | coin/kpow | coin | 24h | 1 sem. | Mastery | Speed bonus | Pool**.

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
          ALGAE, OXYGEN, GAS, FUEL, OIL, FIRE, LAVA, GLASS, SULFUR, FIBERGLASS — **puis le reste** (ordre Game Data).
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
        - Option **« — Toutes (vue à plat) — »** en tête du sélecteur (`value="__all__"`) : liste **toutes** les recettes
          de toutes les ressources (580 lignes / 32 ressources) en un tableau, avec une colonne **Ressource** en tête
          (masquée en vue par ressource via `#crafting-res-th.hidden`, td conditionnel pour l'alignement).
        - Chaque ligne calcule coin/h & coin/kpow avec la Mastery/Speed bonus/taxe de **sa** ressource.
        - Défaut = 1re ressource (vue par ressource inchangée) ; la vue à plat est opt-in.
