# CraftWorld — Utilitaire web : liste des besoins

Source de vérité : `craft world.xlsx` → `data.json` (via `extract_data.py`).
Réseau : Ronin. Prix live : API GeckoTerminal (endpoint multi-pools).

## Besoins (à toujours garder OK)

1. [x] **Afficher le prix courant de chaque ressource** — en **COIN** (monnaie du jeu).
       - Source mapping ressource→pool : `data.json` (feuille `renta`). Pools = tokens officiels on-chain.
       - Prix : `base_token_price_quote_token` via `/networks/ronin/pools/multi/{pools}` (1 appel pour les 29).
       - Affiché dans la colonne **Prix live** de `index.html` (page unique).

2. [x] **Utilisable depuis le téléphone** — via **hébergement public** (GitHub Pages).
       - Rendu mobile : OK (viewport + `overflow-x-auto`, pas de débordement à 375 px).
       - Déployé : dépôt https://github.com/charlautoia/craftWorld (public), Pages sur branche `main` (root).
       - URL : https://charlautoia.github.io/craftWorld/
       - MAJ futures : `git commit` + `git push` → redéploiement auto.

3. [x] **Page unique (merge)** — `prix.html` supprimé ; sa logique de prix (1 appel multi-pools)
       intégrée à la colonne **Prix live** de `index.html`.

<!-- Prochains besoins à ajouter ici, au fur et à mesure. -->
