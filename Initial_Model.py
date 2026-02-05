import os
import csv
import json
import random
from collections import Counter

# Configuration
FOLDER = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(FOLDER, 'Datasets')
CSV_GLOB = '.csv'
TRIALS_PER_BIN = 10000  # Monte Carlo trials per bin
BIN_START = 20
BIN_END = 110
BIN_WIDTH = 10
OUTPUT_JSON = os.path.join(FOLDER, 'simulation_results.json')
SAMPLE_TURNS_PER_BIN = 100  # how many simulated turns to save per bin (for inspection)

# Read CSVs and compute per-file stats
if not os.path.isdir(DATASET_DIR):
    raise FileNotFoundError(f"Datasets folder not found: {DATASET_DIR}")

files = [f for f in os.listdir(DATASET_DIR) if f.lower().endswith(CSV_GLOB)]
records = []  # (fname, average, aimed_count, hit_count, miss_bed_counter)

for fname in sorted(files):
    path = os.path.join(DATASET_DIR, fname)
    try:
        with open(path, newline='', encoding='utf-8') as fh:
            raw_lines = fh.read().splitlines()
        filtered = [ln for ln in raw_lines if not ln.strip().startswith('//') and ln.strip() != '']
        if not filtered:
            print(f"Skipping {fname}: no CSV content after filtering comments")
            continue
        reader = csv.DictReader(filtered)
        if not reader.fieldnames or not all(col in reader.fieldnames for col in ['aimedat', 'bed', 'average']):
            print(f"Skipping {fname}: missing required column(s) (need aimedat, bed, average)")
            continue
        rows = list(reader)
        if not rows:
            continue
        try:
            avg = float(rows[0].get('average') or 0.0)
        except Exception:
            avg = None
        aimed = 0
        hits = 0
        miss_beds = Counter()
        for row in rows:
            aimedat = (row.get('aimedat') or '').strip().lower()
            bed = (row.get('bed') or '').strip().lower()
            if aimedat == 't20':
                aimed += 1
                if bed == 't20':
                    hits += 1
                else:
                    miss_beds[bed] += 1
        records.append((fname, avg, aimed, hits, miss_beds))
    except Exception as e:
        print(f"Error reading {fname}: {e}")

# Compute overall empirical hit rate (used only as fallback)
overall_hits = sum(r[3] for r in records)
overall_aimed = sum(r[2] for r in records)
overall_p_hit = (overall_hits / overall_aimed) if overall_aimed > 0 else 0.5

# Build empirical miss-bed distribution aggregated across all files (conditional on miss)
agg_miss = Counter()
total_misses = 0
for _, _, _, _, miss_beds in records:
    for bed, cnt in miss_beds.items():
        agg_miss[bed] += cnt
        total_misses += cnt # combine total misses

if total_misses == 0:
    # Fallback: assume if they miss, most likely s20
    agg_miss = Counter({'o20': 1})
    total_misses = 1

empirical_miss_dist = {bed: cnt / total_misses for bed, cnt in agg_miss.items()} # convert to probabilities based on a miss

# Bins setup
bins = []  # list of (label, low, high, rep_average)
start = BIN_START
while start <= BIN_END - BIN_WIDTH:
    low = start
    high = start + BIN_WIDTH - 1
    rep = (low + high) / 2.0
    label = f"{low}-{high}"
    bins.append((label, low, high, rep))
    start += BIN_WIDTH
# final "110+" bin if needed
if BIN_END == 110:
    label = f"{BIN_END}+"
    bins.append((label, BIN_END + 1, float('inf'), BIN_END + BIN_WIDTH/2.0))

# Simulation per bin
random.seed(0)
results = {}
bin_stats = []
for label, low, high, rep in bins:
    # predicted hit probability from datasets in this bin
    bin_hits = 0
    bin_aimed = 0
    for _, avg, aimed, hits, _ in records:
        if avg is None or aimed == 0:
            continue
        in_bin = (avg >= low and avg <= high) if high != float('inf') else (avg >= low)
        if in_bin:
            bin_hits += hits
            bin_aimed += aimed

    if bin_aimed > 0:
        p_hit = bin_hits / bin_aimed
    else:
        p_hit = None

    bin_stats.append({'label': label, 'low': low, 'high': high, 'rep': rep, 'p_hit': p_hit, 'aimed': bin_aimed})

# Fill empty bins by borrowing nearest populated bin
# For bins higher than the borrowed bin's average: increase rate by 10%
# For bins lower than the borrowed bin's average: decrease rate by 10%
increase_factor = 1.1
decrease_factor = 0.9
for i, b in enumerate(bin_stats):
    if b['p_hit'] is None:
        # Find nearest populated bin (checking lower first, then higher)
        lower_idx = next((j for j in range(i - 1, -1, -1) if bin_stats[j]['p_hit'] is not None), None)
        higher_idx = next((j for j in range(i + 1, len(bin_stats)) if bin_stats[j]['p_hit'] is not None), None)
        
        # Determine which is closer
        if lower_idx is not None and higher_idx is not None:
            dist_lower = i - lower_idx
            dist_higher = higher_idx - i
            source_idx = lower_idx if dist_lower <= dist_higher else higher_idx
        elif lower_idx is not None:
            source_idx = lower_idx
        elif higher_idx is not None:
            source_idx = higher_idx
        else:
            b['p_hit'] = overall_p_hit
            continue
        
        source_p_hit = bin_stats[source_idx]['p_hit']
        source_rep = bin_stats[source_idx]['rep']
        
        # If current bin average is higher, increase the rate; if lower, decrease
        if b['rep'] > source_rep:
            b['p_hit'] = source_p_hit * increase_factor
        else:
            b['p_hit'] = source_p_hit * decrease_factor

# Build results using finalized p_hit values
for b in bin_stats:
    label = b['label']
    low = b['low']
    high = b['high']
    rep = b['rep']
    p_hit = b['p_hit']

    # clamp
    p_hit = max(0.0, min(1.0, p_hit))

    # Monte Carlo
    hit_counts = [0, 0, 0, 0]  # counts for 0,1,2,3 hits
    miss_bed_counter = Counter()
    per_dart_hit_counts = [0, 0, 0]
    per_dart_miss_counters = [Counter() for _ in range(3)]
    sample_turns = []
    for t in range(TRIALS_PER_BIN):
        hits_in_turn = 0
        this_turn = []
        for d in range(3):
            if random.random() < p_hit:
                hits_in_turn += 1
                per_dart_hit_counts[d] += 1
                this_turn.append('t20') # hit if a random number is less than p_hit
            else:
                # sample a miss bed according to empirical miss distribution
                r = random.random()
                cumulative = 0.0
                chosen = None
                for bed, prob in empirical_miss_dist.items():
                    cumulative += prob
                    if r <= cumulative:
                        chosen = bed
                        break
                if chosen is None:
                    chosen = next(iter(empirical_miss_dist))
                miss_bed_counter[chosen] += 1
                per_dart_miss_counters[d][chosen] += 1
                this_turn.append(chosen)
        hit_counts[hits_in_turn] += 1
        if len(sample_turns) < SAMPLE_TURNS_PER_BIN:
            sample_turns.append(this_turn) # randomly choose a miss bed

    total_turns = TRIALS_PER_BIN
    probs = {f"{k}_hits": hit_counts[k] / total_turns for k in range(4)} # probabilities of 0,1,2,3 hits
    expected_hits = sum(k * hit_counts[k] for k in range(4)) / total_turns # expected hits per turn
    # normalize miss bed distribution
    total_missed_samples = sum(miss_bed_counter.values())
    miss_bed_dist = {bed: cnt / total_missed_samples for bed, cnt in miss_bed_counter.items()} if total_missed_samples > 0 else {} # miss bed distribution

    results[label] = {
        'rep_average': rep,
        'predicted_p_hit_per_dart': p_hit,
        'expected_hits_per_turn': expected_hits,
        'probabilities_0_to_3_hits': probs,
        'miss_bed_distribution': miss_bed_dist,
        'sample_turns': sample_turns,
        'trial_count': TRIALS_PER_BIN
    } # simulated turns results (first 100 stored)

# Save results
with open(OUTPUT_JSON, 'w', encoding='utf-8') as fh:
    json.dump({'model': {'slope': None, 'intercept': None}, 'empirical_miss_dist': empirical_miss_dist, 'bins': results}, fh, indent=2)

# Print a concise summary
print(f"Simulation completed. Results saved to: {OUTPUT_JSON}\n")
for label, info in results.items():
    print(f"Bin: {label} (rep avg {info['rep_average']:.1f})")
    print(f"  predicted p_hit per dart: {info['predicted_p_hit_per_dart']:.2%}")
    print(f"  expected hits per 3-dart turn: {info['expected_hits_per_turn']:.3f}")
    probs = info['probabilities_0_to_3_hits']
    print(f"  P(0 hits): {probs['0_hits']:.3%}, P(1 hit): {probs['1_hits']:.3%}, P(2 hits): {probs['2_hits']:.3%}, P(3 hits): {probs['3_hits']:.3%}")
    top_misses = sorted(info['miss_bed_distribution'].items(), key=lambda x: -x[1])[:5]
    if top_misses:
        print("  miss bed top distribution:")
        for bed, prob in top_misses:
            print(f"    {bed}: {prob:.2%}")
    # print a small sample of turns
    sample = info.get('sample_turns', [])[:10]
    if sample:
        print(f"  sample simulated turns (first {len(sample)}):")
        for turn in sample:
            print(f"    {turn}")
    print()

print("Done.")
