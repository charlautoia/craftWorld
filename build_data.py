"""
Génère data.json à partir du GAME DATA OFFICIEL de la team (Google Sheet),
au lieu de l'ancien fichier Excel perso.

- Recettes / ressources : Google Sheet officiel (onglets recettes + ressources de base).
- Pools (ressource -> pool GeckoTerminal) : absents du Sheet officiel, donc maintenus ici
  (les pools référencent les tokens officiels on-chain ; servent aux prix live en COIN).

Usage : python build_data.py   ->   réécrit data.json
"""
import urllib.request
import csv
import io
import json
import re

SHEET_ID = "1HIJtfYQjsf7qXRI1ca8EdZMMmbWzEpf5U1a8IvZ3nRE"
GID_RECIPES = "1026795583"   # ID, OUTPUT, DURATION, INPUT 1/2 SYMBOL+AMOUNT, YIELD, POWER COST, XP PER OUTPUT...
GID_BASE = "754695901"       # ressources de base : ID, OUTPUT, DURATION, INPUT SYMBOL+AMOUNT, ... POWER COST
GID_POWERPLANTS = "360630991"  # centrales : NAME, TOWN HALL LEVEL, MAX COUNT, POWER, PER HOUR/DAY, CYCLE DURATION...
GID_BATTERIES = "22834069"   # batteries : NAME, TOWN HALL LEVEL, CAPACITY, MAX COUNT, UPGRADE DURATION, COST...
GID_EDUCATIONALS = "1472421957"  # SCHOOL/UNIVERSITY : MODE, SLOTS, TRAINING TIME, REROLL COSTS, chances de talent...
GID_HOUSES = "574490048"     # maisons : TOWN HALL LEVEL, MAX COUNT, RESIDENTS, UPGRADE DURATION, COST...
GID_HATCHERIES = "272622660"  # couveuses : SLOTS, INCUBATION TIME DISCOUNT, UPGRADE DURATION, COST...
GID_TOWNHALL = "1619227678"  # town hall : POWER CAPACITY, POWER RECOVERY STEP, POWER PER STEP/HOUR, COST...
GID_BUILDINGS = "1669987517"  # tous les bâtiments : on n'en garde que les familles sans onglet dédié

# Mapping ressource -> pool (maintenu à la main : non fourni par le Game Data officiel).
POOLS = {
    "EARTH": "0xc356cd52364541379ad4d31a889b7031e758220a",
    "WATER": "0xe9c0995144a199241a5c46ccb7e7cd439af3ac75",
    "FIRE": "0xe973dc221bb031010ec673105ed8b04c9e713b9d",
    "MUD": "0xb287ea5a5cd4f2b74571e30fdec96241aa5163d9",
    "CLAY": "0x8b1a1b7b43a53904b0a05406c13399079e553501",
    "SAND": "0x6d8839a585f7877a5e218a217c07334980f04a4a",
    "COPPER": "0xc0f4621ab3cd1405952015c84c5063db708c67d9",
    "STEEL": "0x70c063f17dacb35e4b3df06c8f36020416a44a3c",
    "SCREWS": "0x0016c4c602cc1a96a9d35fe133a7e374d3cdc26d",
    "SEAWATER": "0xd1d6bb059c97295f7437ad423111047cbcddf4c6",
    "ALGAE": "0xe63f8cefea9a17a259bb3b375929bd10d5e1cdfa",
    "OXYGEN": "0x4343846ebe54dcd40ba572275640230d533296e5",
    "GAS": "0x4782e36bbe6e9abca5357d3e43a090fa772de71b",
    "FUEL": "0x0f8f4dcf1b6eb9f5c0e8fbb9cd6879aa3983c8bc",
    "OIL": "0x6f363e6760876a4c66730fbbefccdd3014b6220c",
    "HEAT": "0x6ccd01c951e57d82be8dccb90c01a58bfb4d83cd",
    "LAVA": "0x54ae64826ca9d440ede8c33e6cf4cfa1a3aa5801",
    "GLASS": "0x7aa1cc00ca62982ab10d12fd4f6b6687f33011ad",
    "SULFUR": "0x346e30b7ca273fb001eec84fabf2b693617df710",
    "FIBERGLASS": "0x0ffb7bd0bc009a01f9f9e95a0f563bad2189f151",
    "CERAMICS": "0xfa3a564b27deb29781f80032df662a4406eebef6",
    "STONE": "0xda4145a4975b1219e85a233673187309c4840044",
    "STEAM": "0x7bf03c63adfded079adbd9f807ccce0fd28b8fd8",
    "CEMENT": "0x491a412400840651c243acfc1ed9947ffe8a4e8f",
    "ACID": "0xefc128c4cb990a5ecc88ff71e9efcc0eaef434d2",
    "PLASTICS": "0x0ab775634107063a7c16c6c8e0fd6bda1f219ae6",
    "ENERGY": "0xb0a3c31aae83526fd6ee75aac552822d676f46b2",
    "HYDROGEN": "0xbb155716cd99d7ef8fd3fb45c91d39958c95b088",
    "DYNAMITE": "0x85172e7ff5040366fa5a3caf7b1bd969bb06b570",
    # Items keys/bolts (pools RESOURCE/COIN trouvées via GeckoTerminal ; tier le plus liquide retenu).
    "BOLTS": "0x708804f7f9e3960e282fc1835ff55439319c1925",
    "KEY": "0x9b3b09e4e3339eb429292c0054f0ab97aed5bcc1",
    "CERAMICKEY": "0x884a266b3c1e70cc32ed2af6483070e81b20830c",
    "GLASSKEY": "0x7ac99f731a96ada40371fa2a4ec1527d0b6a48fb",
    "DYNOKEY": "0xb67521d41a2c499ceb1288e70563ca34618da866",
    # Nouvelles ressources (branches WIRE/NEST, WRAP, BOOK/SALT/ARTICLE/DIPLOMA) + l'élément brut DUST.
    "DUST": "0x324b4bc0b0670c713e865b179ef4b9757c89cd85",
    "WIRE": "0xd0fdb28cbbac1808c3bda4c8deb93eb1a8357d0f",
    "NEST": "0xc2135a1b453e7f744b1725961cd97b5a597696aa",
    "WETNEST": "0x98d00d1d04743b210cb2d292cc1a8083310d6996",
    "WARMNEST": "0xec5d2007b60a849d092379075e767a1e38bf54c8",
    "DYNONEST": "0x99e8af05763ef60b6de106ea82db0c899944e5e4",
    "PAPERWRAP": "0x62b567745246f46c782d709fcc7cfe762b4015c0",
    "SANDWRAP": "0x03c1943873df365c01aa900ccdcefa61ed4101f9",
    "STEAMWRAP": "0xb1bd592c787dcd64de096a886bdd1e97213418cd",
    "BOOK": "0xff6724bc90d89cac818955b5c311069ede8ca3be",
    "SALT": "0x98b539ff43aa3dd2a9284f6d9bc5a0a586ba4da0",
    "ARTICLE": "0x2e75c0bf22eba42ed6ee83ba208078bc5c0daf8d",
    "DIPLOMA": "0x0450dbf6f748709d7c01f4dc556643e1220c9227",
    # Matériaux de construction (BEAM/BRICK/TILE/NAIL/PAINT) : absents du Notion officiel, pools trouvées
    # par symbole sur GeckoTerminal (une seule pool RESOURCE/COIN 1 % par token, faible liquidité).
    "BEAM": "0x12f2ffae365bb0ec481bb6bb4cda9ef60ec32921",
    "BRICK": "0x8f32b16fc2574a7c35251772ddd287709a1fa919",
    "TILE": "0xea6750832ea32eb79caaac746c12abf3e812388e",
    "NAIL": "0x88f31ca9087aaa60a217637e6ddeced29370094f",
    "PAINT": "0xc4be5660ea4ad6ceb30eeef56d327b4ff22f5822",
    # LUMBER : input de BEAM, absent du Game Data (aucune recette) -> matière brute achetée, comme FIRE/WATER.
    "LUMBER": "0x615dbabd91f0eb79b59c720f5ec2b3fe0ae61055",
}

# Pools où la ressource est le QUOTE token (et non le base) : prix lu via le pont USD
# (resource_usd / COIN_usd) au lieu de base_token_price_quote_token.
# COPPER : seule pool liquide = USDC/COPPER (COPPER = quote). L'ancienne COPPER/COIN est morte.
INVERTED = {"COPPER"}

# Éléments bruts à toujours garder (pas de recette "factory" propre, mais ont un pool).
ELEMENTS = ["EARTH", "FIRE", "WATER", "DUST", "LUMBER"]

# Ordre d'affichage préféré (choix user) : ces ressources en tête, puis le reste dans l'ordre du Game Data.
PREFERRED_ORDER = ["EARTH", "MUD", "CLAY", "SAND", "COPPER", "STEEL", "SCREWS", "WATER", "SEAWATER",
                   "ALGAE", "OXYGEN", "GAS", "FUEL", "OIL", "ACID", "CERAMICS", "STONE", "CEMENT",
                   "FIRE", "LAVA", "GLASS", "SULFUR", "HEAT", "STEAM", "ENERGY", "HYDROGEN",
                   "FIBERGLASS", "PLASTICS", "DYNAMITE"]

# Niveau d'usine actuel par ressource (= défaut du sélecteur de niveau dans l'UI ; ta progression).
CURRENT_LEVELS = {
    "MUD": 17, "CLAY": 16, "SAND": 11, "COPPER": 6, "STEEL": 8, "SCREWS": 7,
    "SEAWATER": 30, "ALGAE": 20, "OXYGEN": 20, "GAS": 15, "FUEL": 15, "OIL": 10,
    "HEAT": 29, "LAVA": 19, "GLASS": 5, "SULFUR": 2, "FIBERGLASS": 2, "CERAMICS": 10,
    "STONE": 8, "STEAM": 1, "CEMENT": 9, "ACID": 5, "PLASTICS": 4, "ENERGY": 5,
    "HYDROGEN": 5, "DYNAMITE": 5, "BEAM": 18, "BRICK": 14, "TILE": 3,
}

# Speed bonus de production par usine (relevé dans le jeu, écran Workshop) ; coin/h via (1 + bonus).
# = défaut de la colonne "Speed bonus" (éditable dans l'UI). MAJ quand tu montes une usine.
BONUS = {
    "SEAWATER": 0.54, "ALGAE": 0.47, "CERAMICS": 0.39, "STEEL": 0.39, "OXYGEN": 0.39,
    "GAS": 0.25, "FUEL": 0.25, "SCREWS": 0.52, "STONE": 0.09, "HEAT": 0.10, "LAVA": 0.10,
}

ID_RE = re.compile(r"^(.+)_(\d+)$")


def fetch_csv(gid, retries=3):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    last = None
    for _ in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
            return list(csv.DictReader(io.StringIO(raw)))
        except Exception as e:  # noqa: BLE001
            last = e
    raise RuntimeError(f"Échec téléchargement gid={gid}: {last}")


def num(val):
    """Convertit une cellule (ex: '1,236.00') en float, sinon None."""
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def sym(val):
    s = (val or "").strip()
    return s or None


def ypct(val):
    """'105.31%' -> 105.31 (float), sinon None. = rendement du niveau (réduit la conso d'inputs)."""
    s = str(val or "").strip().replace("%", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def compact(v):
    """Réduit les flottants entiers en int (3.0 -> 3) pour alléger data.json. None/str inchangés."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def parse_recipes(rows, single_input=False):
    """Regroupe les lignes ID=RESOURCE_niveau en {resource: [niveaux...]}."""
    crafting = {}
    for row in rows:
        rid = (row.get("ID") or "").strip()
        m = ID_RE.match(rid)
        if not m:
            continue
        resource, level = m.group(1), int(m.group(2))
        if single_input:
            in1_sym, in1_amt = sym(row.get("INPUT SYMBOL")), num(row.get("INPUT AMOUNT"))
            in2_sym, in2_amt = None, None
            xp = None
        else:
            in1_sym, in1_amt = sym(row.get("INPUT 1 SYMBOL")), num(row.get("INPUT 1 AMOUNT"))
            in2_sym, in2_amt = sym(row.get("INPUT 2 SYMBOL")), num(row.get("INPUT 2 AMOUNT"))
            xp = num(row.get("XP PER OUTPUT"))
        crafting.setdefault(resource, []).append({
            "level": level,
            "output": num(row.get("OUTPUT")),
            "duration": sym(row.get("DURATION")),
            "input1": in1_sym,
            "input1_amount": in1_amt,
            "input2": in2_sym,
            "input2_amount": in2_amt,
            "yield_pct": ypct(row.get("YIELD")),   # rendement du niveau ; coin/h : réduit le coût des inputs
            "power": num(row.get("POWER COST")),
            "xp": xp,
            "cost_symbol": sym(row.get("COST SYMBOL")),   # coût d'upgrade vers ce niveau (ressource + quantité)
            "cost_amount": num(row.get("COST AMOUNT")),
            "production_change_pct": ypct(row.get("PRODUCTION CHANGE")),   # % de gain de prod/jour vs niveau précédent
        })
    return crafting


def parse_powerplants(rows):
    """Regroupe les lignes ID=NAME_niveau du Game Data PowerPlants en {name: [niveaux...]}."""
    plants = {}
    for row in rows:
        rid = (row.get("NAME") or "").strip()
        m = ID_RE.match(rid)
        if not m:
            continue
        name, level = m.group(1), int(m.group(2))
        plants.setdefault(name, []).append({
            "level": level,
            "town_hall": num(row.get("TOWN HALL LEVEL")),
            "max_count": num(row.get("MAX COUNT")),
            "power": num(row.get("POWER")),
            "per_hour": num(row.get("PER HOUR")),
            "per_day": num(row.get("PER DAY")),
            "cycle_duration": sym(row.get("CYCLE DURATION")),
            "input": sym(row.get("INPUT SYMBOL")),
            "input_amount": num(row.get("INPUT PER CYCLE")),
            "upgrade_duration": sym(row.get("UPGRADE DURATION")),
            "cost_symbol": sym(row.get("COST SYMBOL")),
            "cost_amount": num(row.get("COST AMOUNT")),
        })
    for levels in plants.values():
        levels.sort(key=lambda x: x["level"])
    return plants


def parse_batteries(rows):
    """Regroupe les lignes ID=NAME_niveau du Game Data Batteries en {name: [niveaux...]}.
    Deux familles : POWER_CELL et BATTERY (lignes vides entre les deux -> ignorées, pas de match ID_RE)."""
    batteries = {}
    for row in rows:
        rid = (row.get("NAME") or "").strip()
        m = ID_RE.match(rid)
        if not m:
            continue
        name, level = m.group(1), int(m.group(2))
        batteries.setdefault(name, []).append({
            "level": level,
            "town_hall": num(row.get("TOWN HALL LEVEL")),
            "capacity": num(row.get("CAPACITY")),
            "max_count": num(row.get("MAX COUNT")),
            "upgrade_duration": sym(row.get("UPGRADE DURATION")),
            "cost_symbol": sym(row.get("COST SYMBOL")),
            "cost_amount": num(row.get("COST AMOUNT")),
        })
    for levels in batteries.values():
        levels.sort(key=lambda x: x["level"])
    return batteries


TEXT_FIELDS = {"mode", "size"}   # colonnes non numériques lues telles quelles par parse_leveled


def parse_leveled(rows, id_col, fields):
    """Regroupe des lignes ID=NAME_niveau en {name: [niveaux...]}, en ne gardant que `fields`
    ({clé data.json: colonne Sheet}). Sert aux onglets Educationals/Houses/Hatcheries/Buildings."""
    out = {}
    for row in rows:
        m = ID_RE.match((row.get(id_col) or "").strip())
        if not m:
            continue
        name, level = m.group(1), int(m.group(2))
        entry = {"level": level}
        for key, col in fields.items():
            entry[key] = sym(row.get(col)) if key in TEXT_FIELDS or key.endswith(
                ("_symbol", "_duration", "_time", "_discount")) else num(row.get(col))
        out.setdefault(name, []).append(entry)
    for levels in out.values():
        levels.sort(key=lambda x: x["level"])
    return out


EDU_FIELDS = {
    "mode": "MODE", "town_hall": "TOWN HALL LEVEL", "max_count": "MAX COUNT", "slots": "SLOTS",
    "training_time": "TRAINING TIME", "reroll_power": "REROLL POWER COST", "reroll_article": "REROLL ARTICLE COST",
    "upgrade_duration": "UPGRADE DURATION", "cost_symbol": "COST SYMBOL", "cost_amount": "COST AMOUNT",
}
EDU_TALENTS = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"]


def parse_educationals(rows):
    """SCHOOL + UNIVERSITY. Ajoute les chances de talent (en %) à ce que parse_leveled extrait."""
    edu = parse_leveled(rows, "ID", EDU_FIELDS)
    by_id = {(r.get("ID") or "").strip(): r for r in rows}
    for name, levels in edu.items():
        for l in levels:
            row = by_id[f"{name}_{l['level']}"]
            l["talents"] = [ypct(row.get(f"{t} TALENT CHANCE")) for t in EDU_TALENTS]
    return edu


HOUSE_FIELDS = {"town_hall": "TOWN HALL LEVEL", "max_count": "MAX COUNT", "residents": "RESIDENTS",
                "upgrade_duration": "UPGRADE DURATION", "cost_symbol": "COST SYMBOL", "cost_amount": "COST AMOUNT"}

HATCH_FIELDS = {"town_hall": "TOWN HALL LEVEL", "max_count": "MAX COUNT", "slots": "SLOTS",
                "incubation_discount": "INCUBATION TIME DISCOUNT", "upgrade_duration": "UPGRADE DURATION",
                "cost_symbol": "COST SYMBOL", "cost_amount": "COST AMOUNT"}

BUILDING_FIELDS = {"town_hall": "REQUIRED TOWN HALL LEVEL", "player_level": "UNLOCKED AT PLAYER LEVEL",
                   "upgrade_duration": "UPGRADE DURATION", "cost_symbol": "COST SYMBOL",
                   "cost_amount": "COST AMOUNT", "size": "SIZE", "max_count": "MAX COUNT"}

# Familles de l'onglet Buildings qui ont déjà leur propre onglet (Sheet dédié plus riche) -> exclues.
BUILDINGS_COVERED = ("TOWN_HALL_", "BATTERY_", "POWER_PLANT_", "HATCHERY_", "HOUSE_", "EDUCATIONAL_")


def parse_buildings(rows):
    """Bâtiments restants (WORKSHOP, VAULT, SECRET_LAB, RESEARCH_CENTER, EXCHANGE, PROFICIENCY)."""
    kept = [r for r in rows if not (r.get("LEVEL ID") or "").strip().startswith(BUILDINGS_COVERED)]
    out = parse_leveled(kept, "LEVEL ID", BUILDING_FIELDS)
    # 'SECRET_LAB_secretLab_3x3_1' -> 'SECRET_LAB' (le suffixe est le nom d'asset, pas une variante utile)
    return {re.sub(r"_[a-z].*$", "", name): levels for name, levels in out.items()}


def parse_townhall(rows):
    """Town hall : une seule progression -> liste de niveaux (colonne LEVEL, pas d'ID_NIVEAU)."""
    levels = []
    for row in rows:
        lvl = num(row.get("LEVEL"))
        if lvl is None:
            continue
        levels.append({
            "level": int(lvl),
            "unlock_level": num(row.get("UNLOCK LEVEL")),
            "power_capacity": num(row.get("POWER CAPACITY")),
            "recovery_step": sym(row.get("POWER RECOVERY STEP")),
            "power_per_step": num(row.get("POWER PER STEP")),
            "power_per_hour": num(row.get("POWER PER HOUR")),
            "upgrade_duration": sym(row.get("UPGRADE DURATION")),
            "cost_symbol": sym(row.get("COST SYMBOL")),
            "cost_amount": num(row.get("COST AMOUNT")),
        })
    levels.sort(key=lambda x: x["level"])
    return levels


# Niveaux relevés DANS LE JEU (écran de l'usine), qui REMPLACENT ceux du Game Data : pour ces ressources le
# Sheet n'a qu'une recette provisoire (niveau 1, durée 1 min). Relevé du 2026-09-27 : niveau actuel + niveau
# suivant (valeurs « +… » de l'écran).
#  - Input : valeur affichée par le jeu, yield/mastery DÉJÀ appliqués -> stockée avec yield_pct = yield affiché
#    et mastery par défaut 0 (GAME_MASTERY) : le calcul retombe exactement sur l'input du jeu.
#  - Durée : le jeu affiche la durée EFFECTIVE (bonus vidéo x2 inclus, Speed bonus Workshop supposé 0 pour
#    ces nouvelles usines) -> durée de base = 2 x durée affichée. Vérifié : Output / durée affichée = Speed.
#  - XP : par unité produite = XP/min x durée affichée / output (constant d'un niveau à l'autre).
#  - Valeurs arrondies par le jeu : LUMBER « 2,14k » (BEAM 18), power « 4,5k » (TILE 3).
#  - Coût d'upgrade : payé avec un objet (bannière rouge) sans pool -> non repris.
# (niveau, output, durée de base, input1, qté1, input2, qté2, yield %, power, xp/unité)
GAME_LEVELS = {
    "BEAM": [(18, 443, "0:50:00", "LUMBER", 2140, None, None, 103.7, 837, 50),
             (19, 509, "0:55:00", "LUMBER", 2459, None, None, 103.7, 952, 50)],
    "BRICK": [(14, 94, "0:50:00", "BEAM", 457, "CLAY", 549, 102.9, 896, 225),
              (15, 116, "1:00:00", "BEAM", 564, "CLAY", 678, 102.9, 1095, 225)],
    "TILE": [(3, 3, "3:20:00", "BRICK", 198, "HEAT", 6, 100, 4500, 5000),
             (4, 4, "3:30:00", "BRICK", 264, "HEAT", 8, 100, 6000, 5000)],
}
GAME_MASTERY = {n: 0 for n in GAME_LEVELS}   # inputs relevés déjà réduits par le yield du jeu


def game_levels(rows):
    """Recettes au format parse_recipes depuis GAME_LEVELS ; Δ Prod recalculé entre niveaux successifs."""
    out, prev = [], None
    for lvl, o, dur, i1, a1, i2, a2, y, pw, xp in rows:
        rate = o / (sum(int(x) * f for x, f in zip(dur.split(":"), (3600, 60, 1))))
        out.append({"level": lvl, "output": o, "duration": dur, "input1": i1, "input1_amount": a1,
                    "input2": i2, "input2_amount": a2, "yield_pct": y, "power": pw, "xp": xp,
                    "cost_symbol": None, "cost_amount": None,
                    "production_change_pct": None if prev is None else round((rate / prev - 1) * 100, 2)})
        prev = rate
    return out


def select_resources(recipe_order):
    """Items retenus : factories (début → DYNAMITE inclus) + tout à partir de BOLTS + éléments bruts.
    On exclut le bloc food/outils/armes (BOWL → LOBSTER) situé entre DYNAMITE et BOLTS."""
    names = set(ELEMENTS)
    if "DYNAMITE" in recipe_order:
        names |= set(recipe_order[:recipe_order.index("DYNAMITE") + 1])
    if "BOLTS" in recipe_order:
        names |= set(recipe_order[recipe_order.index("BOLTS"):])
    return names


def main():
    recipes = parse_recipes(fetch_csv(GID_RECIPES), single_input=False)  # ordre du Sheet préservé
    recipe_order = list(recipes.keys())
    base = parse_recipes(fetch_csv(GID_BASE), single_input=True)

    crafting = dict(recipes)
    # Les ressources de base ne doivent pas écraser une éventuelle recette du même nom.
    for name, levels in base.items():
        crafting.setdefault(name, levels)
    for name, rows in GAME_LEVELS.items():   # relevés du jeu > recette provisoire du Sheet
        crafting[name] = game_levels(rows)
    for levels in crafting.values():
        levels.sort(key=lambda x: x["level"])

    included = select_resources(recipe_order)
    crafting = {k: v for k, v in crafting.items() if k in included}

    # Ordre de base (Game Data) : EARTH, WATER, FIRE puis l'ordre du Sheet.
    base_order = ["EARTH", "WATER", "FIRE", "DUST", "LUMBER"] + [n for n in recipe_order if n in included]
    base_order += [n for n in sorted(included) if n not in base_order]   # filet de sécurité
    # Ordre d'affichage : préférence user en tête, puis le reste dans l'ordre de base.
    game_order = [n for n in PREFERRED_ORDER if n in included]
    game_order += [n for n in base_order if n not in game_order]

    resources = []
    for n in game_order:
        entry = {"name": n, "pool": POOLS.get(n)}
        if n in INVERTED:
            entry["quote"] = True       # prix lu via le pont USD (ressource = quote token)
        avail = sorted(l["level"] for l in crafting.get(n, []))
        if avail:                       # niveau par défaut = niveau actuel (sinon max), borné au dispo
            lvl = CURRENT_LEVELS.get(n, avail[-1])
            entry["level"] = max(avail[0], min(lvl, avail[-1]))
        if BONUS.get(n):
            entry["bonus"] = BONUS[n]
        if n in GAME_MASTERY:
            entry["mastery"] = GAME_MASTERY[n]   # défaut de la colonne Mastery (sinon 5,3 côté appli)
        resources.append(entry)

    for levels in crafting.values():       # allège : flottants entiers -> int
        for l in levels:
            for k in ("output", "input1_amount", "input2_amount", "power", "xp", "yield_pct", "cost_amount",
                       "production_change_pct"):
                l[k] = compact(l[k])

    powerplants = parse_powerplants(fetch_csv(GID_POWERPLANTS))
    for levels in powerplants.values():
        for l in levels:
            for k in ("town_hall", "max_count", "power", "per_hour", "per_day", "input_amount", "cost_amount"):
                l[k] = compact(l[k])

    batteries = parse_batteries(fetch_csv(GID_BATTERIES))
    for levels in batteries.values():
        for l in levels:
            for k in ("town_hall", "capacity", "max_count", "cost_amount"):
                l[k] = compact(l[k])

    educationals = parse_educationals(fetch_csv(GID_EDUCATIONALS))
    houses = parse_leveled(fetch_csv(GID_HOUSES), "ID", HOUSE_FIELDS)
    hatcheries = parse_leveled(fetch_csv(GID_HATCHERIES), "ID", HATCH_FIELDS)
    buildings = parse_buildings(fetch_csv(GID_BUILDINGS))
    townhall = parse_townhall(fetch_csv(GID_TOWNHALL))

    for group in (educationals, houses, hatcheries, buildings):
        for levels in group.values():
            for l in levels:
                for k, v in l.items():
                    if k != "talents":
                        l[k] = compact(v)
    for l in townhall:
        for k, v in l.items():
            l[k] = compact(v)

    output = {"resources": resources, "crafting": crafting, "powerplants": powerplants, "batteries": batteries,
              "educationals": educationals, "houses": houses, "hatcheries": hatcheries,
              "buildings": buildings, "townhall": townhall}
    with open("data.json", "w", encoding="utf-8") as f:        # minifié : fichier généré, jamais édité à la main
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    with_pool = sum(1 for r in resources if r["pool"])
    print(f"data.json généré : {len(resources)} ressources ({with_pool} avec pool), "
          f"{len(crafting)} ressources avec recette, {len(powerplants)} centrales (PowerPlants), "
          f"{len(batteries)} batteries, {len(educationals)} educationals, {len(houses)} maisons, "
          f"{len(hatcheries)} couveuses, {len(buildings)} bâtiments, {len(townhall)} niveaux de town hall.")


if __name__ == "__main__":
    main()
