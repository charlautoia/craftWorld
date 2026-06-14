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
}

# Pools où la ressource est le QUOTE token (et non le base) : prix lu via le pont USD
# (resource_usd / COIN_usd) au lieu de base_token_price_quote_token.
# COPPER : seule pool liquide = USDC/COPPER (COPPER = quote). L'ancienne COPPER/COIN est morte.
INVERTED = {"COPPER"}

# Éléments bruts à toujours garder (pas de recette "factory" propre, mais ont un pool).
ELEMENTS = ["EARTH", "FIRE", "WATER"]

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
            "yield_pct": sym(row.get("YIELD")),
            "power": num(row.get("POWER COST")),
            "xp": xp,
        })
    return crafting


def select_resources(recipe_order):
    """Items retenus : factories (début → DYNAMITE inclus) + items (BOLTS → fin) + éléments bruts.
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
    for levels in crafting.values():
        levels.sort(key=lambda x: x["level"])

    included = select_resources(recipe_order)
    crafting = {k: v for k, v in crafting.items() if k in included}

    resources = []
    for n in sorted(included):
        entry = {"name": n, "pool": POOLS.get(n)}
        if n in INVERTED:
            entry["quote"] = True       # prix lu via le pont USD (ressource = quote token)
        resources.append(entry)

    output = {"resources": resources, "crafting": crafting}
    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    with_pool = sum(1 for r in resources if r["pool"])
    print(f"data.json généré : {len(resources)} ressources ({with_pool} avec pool), "
          f"{len(crafting)} ressources avec recette.")


if __name__ == "__main__":
    main()
