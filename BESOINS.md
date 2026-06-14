# CraftWorld — Utilitaire web : liste des besoins

Source de vérité : `craft world.xlsx` → `data.json` (via `extract_data.py`).
Réseau : Ronin. Prix live : API GeckoTerminal (endpoint multi-pools).

## Besoins (à toujours garder OK)

1. [x] **Afficher le prix courant de chaque ressource** — en **COIN** (monnaie du jeu).
       - Source mapping ressource→pool : `data.json` (feuille `renta`).
       - Prix : `base_token_price_quote_token` via `/networks/ronin/pools/multi/{pools}` (1 appel).
       - Page : `prix.html`. Colonnes : Ressource | Prix (COIN) | Var 24h. Tri + rafraîchir + horodatage.

2. [x] **Utilisable depuis le téléphone** — via **hébergement public** (GitHub Pages), pour `index.html` ET `prix.html`.
       - Rendu mobile : OK sans modif (viewport + `overflow-x-auto`, pas de débordement à 375 px).
       - Déployé : dépôt https://github.com/charlautoia/craftWorld (public), Pages sur branche `main` (root).
       - URL : https://charlautoia.github.io/craftWorld/ (index) et /prix.html.
       - MAJ futures : `git commit` + `git push` → redéploiement auto.

<!-- Prochains besoins à ajouter ici, au fur et à mesure. -->
