"""Build the DECKABET game lexicon (DB-201).

Deterministic given its inputs:
  vendor/enable1.txt                       -- ENABLE2k, public domain (committed)
  assets/lexicon-overlays/exclusions.txt   -- LDNOOBW en subset, CC-BY-4.0 (committed)
  assets/lexicon-overlays/removals.txt     -- our case-by-case removals (committed)
  assets/lexicon-overlays/additions.txt    -- our additions (committed)
  https://norvig.com/ngrams/count_1w.txt   -- frequency counts (downloaded, pinned
                                              by sha256 below, cached in .cache/)

Pipeline: ENABLE2k filtered to 3-8-letter /^[a-z]+$/ words, minus exclusions,
minus removals, plus additions (which must also pass the 3-8 alpha filter),
then each word is assigned a commonality tier from its rank in Norvig's
count_1w list (tier 1 = top 5k ranks, 2 = to 20k, 3 = to 60k, 4 = elsewhere
in the count list, 5 = absent). Output: assets/lexicon.json, an object map
word -> tier plus provenance. E7 steering/openness and E8 retirement consume
the tiers; DB-202 swaps src/dict.ts and the deal pool onto this artifact.
"""

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENABLE1 = ROOT / 'vendor' / 'enable1.txt'
OVERLAYS = ROOT / 'assets' / 'lexicon-overlays'
OUT = ROOT / 'assets' / 'lexicon.json'
CACHE = ROOT / '.cache'

COUNTS_URL = 'https://norvig.com/ngrams/count_1w.txt'
# Pinned checksum of count_1w.txt (retrieved 2026-07-17). If Norvig ever
# republishes the file, the build fails loudly instead of drifting.
COUNTS_SHA256 = '51df159fd3de12b20e403c108f526e96dbd723d9cabdd5f17955cdc16059e690'

WORD_RE = re.compile(r'^[a-z]{3,8}$')
# rank <= threshold -> tier; rank absent from the count list -> tier 5
TIER_THRESHOLDS = [(5000, 1), (20000, 2), (60000, 3), (10**9, 4)]
TIER_LABELS = {
    '1': 'top-5k',
    '2': 'top-20k',
    '3': 'top-60k',
    '4': 'in-count-list',
    '5': 'absent-from-count-list',
}

_ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
_ap.add_argument('--out', type=Path, default=OUT, help='output path (default assets/lexicon.json)')
_ap.add_argument('--counts-cache', type=Path, default=CACHE / 'count_1w.txt',
                 help='cache path for the downloaded count list (default .cache/count_1w.txt)')
_args = _ap.parse_args()


def sha256_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_overlay(name):
    """One word per line; blank lines and # comments allowed."""
    words = set()
    for line in (OVERLAYS / name).read_text().splitlines():
        word = line.split('#')[0].strip()
        if word:
            words.add(word)
    return words


def fetch_counts(cache_path):
    """Download count_1w.txt (or reuse the cache) and verify the pinned hash."""
    if not cache_path.exists():
        print(f'downloading {COUNTS_URL} -> {cache_path}')
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(COUNTS_URL) as resp:
            cache_path.write_bytes(resp.read())
    digest = sha256_file(cache_path)
    if digest != COUNTS_SHA256:
        sys.exit(f'error: {cache_path} sha256 {digest} != pinned {COUNTS_SHA256}; '
                 'delete the cache to re-download, or update the pin deliberately')
    return cache_path


# 1. ENABLE2k, filtered to playable shape.
enable_words = ENABLE1.read_text().split()
base = set(w for w in enable_words if WORD_RE.match(w))

# 2. Overlays.
exclusions = read_overlay('exclusions.txt')
removals = read_overlay('removals.txt')
additions = set(w for w in read_overlay('additions.txt') if WORD_RE.match(w))
excluded = (base | additions) & (exclusions | removals)
words = (base - exclusions - removals) | additions

# 3. Frequency tiers from Norvig count_1w rank (the file is sorted by count,
# so rank = 1-based line number).
counts_path = fetch_counts(_args.counts_cache)
rank = {}
for i, line in enumerate(counts_path.read_text().splitlines(), start=1):
    token = line.split('\t')[0]
    if token not in rank:
        rank[token] = i

def tier_for(word):
    r = rank.get(word)
    if r is None:
        return 5
    return next(tier for threshold, tier in TIER_THRESHOLDS if r <= threshold)

word_tiers = {w: tier_for(w) for w in sorted(words)}

# 4. Emit the artifact.
lexicon = {
    'source': 'ENABLE2k (public domain)',
    'builtFrom': {
        'enable1_sha256': sha256_file(ENABLE1),
        'exclusions': 'LDNOOBW en (CC-BY-4.0)',
        'count_1w_sha256': COUNTS_SHA256,
    },
    'tiers': TIER_LABELS,
    'words': word_tiers,
}
_args.out.write_text(json.dumps(lexicon, separators=(',', ':')) + '\n')

per_tier = {t: 0 for t in range(1, 6)}
for t in word_tiers.values():
    per_tier[t] += 1
print(f'wrote {_args.out} with {len(word_tiers)} words '
      f'(from {len(base)} 3-8-letter ENABLE words, {len(excluded)} excluded, '
      f'{len(additions)} added)')
for t in range(1, 6):
    print(f'  tier {t} ({TIER_LABELS[str(t)]:>22s}): {per_tier[t]:6d}')
