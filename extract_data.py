import pandas as pd
import json
import math

def clean(val):
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val

def parse_duration(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    return str(val)

xl = pd.ExcelFile('craft world.xlsx')

# ── Feuille renta ──────────────────────────────────────────────────────────────
df_renta = xl.parse('renta', header=0)
df_renta.columns = [
    'name', 'symbol', 'index', 'rapport', 'min_item',
    'prix_man', 'prix_auto', 'coin_earth', 'coin_precedent',
    'gain_coin_h', 'gain_kpow', '_c11', '_c12', '_c13', 'pool'
]

renta = []
for _, row in df_renta.iterrows():
    name = row['name']
    if not isinstance(name, str) and (not isinstance(name, float) or math.isnan(name)):
        continue
    if isinstance(name, float) and math.isnan(name):
        continue
    renta.append({
        'name':           str(row['name']) if pd.notna(row['name']) else None,
        'symbol':         str(row['symbol']) if pd.notna(row['symbol']) else None,
        'index':          clean(row['index']),
        'rapport':        clean(row['rapport']),
        'min_item':       clean(row['min_item']),
        'prix_man':       clean(row['prix_man']),
        'prix_auto':      clean(row['prix_auto']),
        'coin_earth':     clean(row['coin_earth']),
        'coin_precedent': clean(row['coin_precedent']),
        'gain_coin_h':    clean(row['gain_coin_h']),
        'gain_kpow':      clean(row['gain_kpow']),
        'pool':           str(row['pool']).strip() if pd.notna(row['pool']) else None,
    })

# ── Feuille data ───────────────────────────────────────────────────────────────
df_data = xl.parse('data', header=0)

crafting = {}
for _, row in df_data.iterrows():
    rid = row.get('ID')
    if not isinstance(rid, str):
        continue
    parts = rid.rsplit('_', 1)
    if len(parts) != 2:
        continue
    resource, level = parts[0], int(parts[1])

    entry = {
        'level':          level,
        'output':         clean(row.get('OUTPUT')),
        'duration':       parse_duration(row.get('DURATION')),
        'coin_h':         clean(row.get('coin/h')),
        'input1':         str(row['INPUT 1 SYMBOL']) if pd.notna(row.get('INPUT 1 SYMBOL')) else None,
        'input1_amount':  clean(row.get('INPUT 1 AMOUNT')),
        'input2':         str(row['INPUT 2 SYMBOL']) if pd.notna(row.get('INPUT 2 SYMBOL')) else None,
        'input2_amount':  clean(row.get('INPUT 2 AMOUNT')),
        'yield_pct':      clean(row.get('YIELD')),
        'battery':        clean(row.get('BATTERY COST')),
        'xp':             clean(row.get('XP PER OUTPUT')),
        'gain_coin_item': clean(row.get('gain coin/item')),
    }
    crafting.setdefault(resource, []).append(entry)

# ── Export ─────────────────────────────────────────────────────────────────────
output = {'renta': renta, 'crafting': crafting}
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"data.json généré : {len(renta)} ressources renta, {len(crafting)} ressources crafting")
