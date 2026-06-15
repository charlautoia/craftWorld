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
         `coin/h = (prix_out×0,975 − Σ(qté_input×0,95×prix_input)/output) × output / heures × 2 × (1 + bonus)`
         (prix live en COIN ; `×2` constant ; `bonus` par usine ; heures = durée d'un cycle).
       - **Sélecteur de niveau d'usine par ressource** (défaut = niveau actuel `CURRENT_LEVELS` dans
         `build_data.py`, repris de l'Excel) ; changer le niveau recalcule le coin/h.
       - `data.json` : chaque ressource porte `level` (défaut) et `bonus` ; les niveaux dispo viennent de `crafting`.
       - Colonne triable. FIRE/WATER (sans recette) → `—`.
       - MAJ niveaux : éditer `CURRENT_LEVELS` dans `build_data.py` quand tu montes une usine.
       - **Test de non-régression** : calcul pur extrait dans `coinh.js` (partagé page + tests) ;
         `test/coinh.test.js` fige la formule (SEAWATER/EARTH/MUD + cas limites). Lancer : `npm test`.

9. [x] **Mastery éditable + niveau en 1re colonne + persistance navigateur.**
       - Le facteur `0,95` des inputs (Mastery du jeu) devient une **valeur par ressource**, saisie dans une
         **colonne Mastery éditable** (après coin/h ; défaut 0,95). Passée à `coinh.js` (param `mastery`).
       - Le **sélecteur de niveau** passe en **1re colonne** (tout à gauche) ; coin/h n'affiche plus que la valeur.
       - **Persistance localStorage** (`cw_levels`, `cw_mastery`) : tes niveaux + masteries survivent au rechargement.
         Saisie 100% dans la page, rien à re-déployer.
       - Colonnes : Niveau | Ressource | Prix live | coin/h | Mastery | Pool.
       - Test : `coinh.js` accepte la mastery, couvert par `test/coinh.test.js` (7 tests).

10. [x] **Colonnes variation 24h et 1 semaine** (après le prix).
        - **24h** : `price_change_percentage.h24` (déjà dans le fetch de prix, instantané).
        - **1 semaine** : non fournie par l'API de prix → 1 appel OHLCV/jour par pool, en **arrière-plan**
          throttlé (~2,2 s/pool, ~75 s pour les 34, sous le rate-limit). Variation = (close_actuel − close_J-7)/close_J-7.
        - Format `fmtVar` : `+x,x %` vert / `-x,x %` rouge / `—`. Colonnes triables.
        - Pools inversées (COPPER) : variation non dérivable → « — ».
        - L'API n'expose rien au-delà de 24h en immédiat (m5…h24) ; tout horizon ≥ qq jours passe par l'OHLCV
          (un seul appel/pool ramène tout l'historique : 7j/15j/30j possibles au même coût si besoin un jour).
        - Colonnes finales : Niveau | Ressource | Prix live | 24h | 1 sem. | coin/h | Mastery | Pool.
