import os
import csv
import json
from collections import defaultdict, Counter

# Configuration
FOLDER = os.path.dirname(os.path.abspath(__file__))
OUTPUT_JSON = os.path.join(FOLDER, 'checkout_simulation_results.json')
OUTPUT_CSV = os.path.join(FOLDER, 'checkout_simulation_summary.csv')
BIN_START = 30
BIN_END = 110
BIN_WIDTH = 10
MIN_EMPIRICAL_SAMPLES = 10  # minimum aimed at samples to use empirical distribution

# Board order (clockwise) for neighbors
BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] # store dartboard ordering clockwise to find realistic neighbours
NUM_SEGMENTS = len(BOARD_ORDER)
segment_index = {n: i for i, n in enumerate(BOARD_ORDER)}

# score mapping - converting everything into numeric points
def score_of(bed):
    bed = bed.lower()
    if bed in ('ibull',):
        return 50
    if bed in ('obull',):
        return 25
    if bed.startswith('t'):
        try:
            return 3 * int(bed[1:])
        except:
            return 0
    if bed.startswith('d'):
        try:
            return 2 * int(bed[1:])
        except:
            return 0
    if bed.startswith('i') or bed.startswith('o'):
        try:
            return int(bed[1:])
        except:
            return 0
    # sometimes data uses old 's20' format; treat as single 20
    if bed.startswith('s'):
        try:
            return int(bed[1:])
        except:
            return 0
    if bed[0].isdigit():
        try:
            return int(bed)
        except:
            return 0
    # unknown
    return 0

# checking if the it is a double bed
def is_double(bed):
    bed = bed.lower()
    if bed in ('ibull',):
        return True
    if bed in ('obull',):
        return False
    return bed.startswith('d')

# Read CSVs to build empirical distributions and per-file averages
files = [f for f in os.listdir(FOLDER) if f.lower().endswith('.csv')]
aim_empirical = defaultdict(Counter)  # how many landed in each bed per aimedat
aim_counts = Counter()  # total aimed at
per_file_records = []  # headings

for fname in sorted(files):
    path = os.path.join(FOLDER, fname)
    try:
        with open(path, newline='', encoding='utf-8') as fh:
            raw = fh.read().splitlines()
        filtered = [ln for ln in raw if not ln.strip().startswith('//') and ln.strip() != '']
        if not filtered:
            continue
        reader = csv.DictReader(filtered)
        if not reader.fieldnames:
            continue
        rows = list(reader)
        if not rows:
            continue
        try:
            avg = float(rows[0].get('average') or 0.0)
        except:
            avg = None
        # accumulate per aim empirical
        for row in rows:
            aimed = (row.get('aimedat') or '').strip().lower()
            bed = (row.get('bed') or '').strip().lower()
            if aimed:
                aim_empirical[aimed][bed] += 1
                aim_counts[aimed] += 1
        # also capture t20 stats for model
        aimed_t20 = sum(1 for r in rows if (r.get('aimedat') or '').strip().lower() == 't20')
        hits_t20 = sum(1 for r in rows if (r.get('aimedat') or '').strip().lower() == 't20' and (r.get('bed') or '').strip().lower() == 't20')
        per_file_records.append((fname, avg, aimed_t20, hits_t20))
    except Exception as e:
        print(f"Error reading {fname}: {e}")

# Fit weighted linear model for t20 hit rate like before
data_points = []
for fname, avg, aimed, hits in per_file_records:
    if avg is None or aimed == 0:
        continue
    data_points.append((avg, hits / aimed, aimed))

slope = None
intercept = None
if len(data_points) >= 2:
    xs = [d[0] for d in data_points]
    ys = [d[1] for d in data_points]
    ws = [d[2] for d in data_points]
    W = sum(ws)
    mean_x = sum(x * w for x, w in zip(xs, ws)) / W
    mean_y = sum(y * w for y, w in zip(ys, ws)) / W
    cov_xy = sum(w * (x - mean_x) * (y - mean_y) for x, y, w in zip(xs, ys, ws)) / W
    var_x = sum(w * (x - mean_x) ** 2 for x, w in zip(xs, ws)) / W
    slope = cov_xy / var_x if var_x != 0 else 0.0
    intercept = mean_y - slope * mean_x

# Compute type multipliers (trebles/doubles/singles) relative to t20 using empirical data
# average hit rate for t* aims where available
def avg_hit_rate_for_type(*prefixes):
    total_hits = 0
    total_aims = 0
    for aimed, counter in aim_empirical.items():
        if not any(aimed.startswith(p) for p in prefixes):
            continue
        total_aims += sum(counter.values())
        # hits when actual bed equals aimed (has to be an exact match)
        total_hits += counter.get(aimed, 0)
    return (total_hits / total_aims) if total_aims > 0 else None

avg_treble = avg_hit_rate_for_type('t')
avg_t20 = None
if 't20' in aim_empirical and sum(aim_empirical['t20'].values())>0:
    avg_t20 = aim_empirical['t20'].get('t20',0)/sum(aim_empirical['t20'].values())
# use t20-specific if available otherwise avg_treble
base_treble_rate = avg_t20 or avg_treble
avg_double = avg_hit_rate_for_type('d')
avg_single = avg_hit_rate_for_type('o', 'i')

# derive multipliers relative to t20
mult_treble = 1.0
mult_double = (avg_double / base_treble_rate) if (avg_double and base_treble_rate) else 0.6
mult_single = (avg_single / base_treble_rate) if (avg_single and base_treble_rate) else 0.9

# allowed aim targets (for enumeration)
all_aims = []
for n in range(1,21):
    all_aims.append(f't{n}')
    all_aims.append(f'd{n}')
    all_aims.append(f'o{n}')
    all_aims.append(f'i{n}')
all_aims.append('obull')
all_aims.append('ibull')

# prioritised aims for first darts in 3-dart sequences (common trebles and high singles)
prioritised_aims = [f't{n}' for n in range(20,11,-1)] + [f'o{n}' for n in [20,19,18,17,16,15,14]] + [f'i{n}' for n in [20,19,18,17,16,15,14]]

# Build P(actual_bed|aim, avg)
# if empirical samples for aim >= MIN_EMPIRICAL_SAMPLES then use empirical distribution
# else fallback: construct distribution: P(hit aimed bed) = model_p * type_multiplier, rest split to neighbors

def build_distribution_for_aim(aimed, avg):
    aimed = aimed.lower()
    # empirical
    total = aim_counts.get(aimed, 0)
    if total >= MIN_EMPIRICAL_SAMPLES:
        counter = aim_empirical[aimed]
        return {bed: cnt/total for bed, cnt in counter.items()}
    # fallback model
    # determine target type and number
    if aimed in ('obull','ibull'):
        target_num = 25
        typ = 'i' if aimed == 'ibull' else 'o'
    else:
        typ = aimed[0]
        target_num = int(aimed[1:]) if len(aimed)>1 and aimed[1:].isdigit() else None
    # compute base p_hit for t20 at this avg
    p_hit_t20 = slope * avg + intercept if slope is not None else 0.2
    p_hit_t20 = max(0.0, min(1.0, p_hit_t20))
    # choose multiplier
    if typ == 't':
        mult = mult_treble
    elif typ == 'd':
        mult = mult_double
    else:
        mult = mult_single
    p_hit = p_hit_t20 * mult
    p_hit = max(0.0, min(0.99, p_hit))
    dist = {}
    # primary hit
    dist[aimed] = p_hit
    # remaining probability distribute among neighbor singles and same number single/double
    rem = 1.0 - p_hit
    neighbors = []
    if target_num is not None and target_num in segment_index:
        idx = segment_index[target_num]
        left = BOARD_ORDER[(idx - 1) % NUM_SEGMENTS]
        right = BOARD_ORDER[(idx + 1) % NUM_SEGMENTS]
        neighbors = [f'i{left}', f'i{right}']
    same_num = []
    if target_num is not None:
        same_num = [f'i{target_num}', f'd{target_num}']
    choices = neighbors + same_num
    if not choices:
        choices = ['o20']
    per = rem / len(choices)
    for c in choices:
        dist[c] = dist.get(c,0)+per
    return dist

# Build per bin distributions for all aim targets I will consider
bins = []
start = BIN_START
while start <= BIN_END - BIN_WIDTH:
    low = start
    high = start + BIN_WIDTH - 1
    rep = (low + high) / 2.0
    label = f"{low}-{high}"
    bins.append((label, rep))
    start += BIN_WIDTH
bins.append((f"{BIN_END}+", BIN_END + BIN_WIDTH/2.0))

# For performance, precompute distributions for aim targets and bins
aim_targets_to_consider = set(list(aim_empirical.keys()) + all_aims + prioritised_aims)

aim_targets_to_consider = {a.lower() for a in aim_targets_to_consider}

bin_distributions = {}  # store precomputed probabilities for each aim target at each average bin
for label, rep in bins:
    d = {}
    for aimed in aim_targets_to_consider:
        d[aimed] = build_distribution_for_aim(aimed, rep)
    bin_distributions[label] = d

# Load candidate strategies, initially created empty one to input my values
CAN_PATH = os.path.join(FOLDER, 'checkout_candidates.json')
if os.path.exists(CAN_PATH):
    try:
        with open(CAN_PATH, 'r', encoding='utf-8') as fh:
            candidates = json.load(fh)
    except Exception:
        print(f"Warning: could not read {CAN_PATH}; continuing with auto-generated strategies")
        candidates = {}
else:
    candidates = {str(t): [] for t in range(2, 171)}
    try:
        with open(CAN_PATH, 'w', encoding='utf-8') as fh:
            json.dump(candidates, fh, indent=2)
        print(f"Wrote template candidate file to {CAN_PATH}. Edit it to add your preferred approaches per total.")
    except Exception:
        pass

def parse_candidate_sequence(item):
    if isinstance(item, list):
        return [s.strip().lower() for s in item]
    if isinstance(item, str):
        if '|' in item:
            parts = item.split('|')
        else:
            parts = item.split(',')
        return [p.strip().lower() for p in parts if p.strip()]
    return []

# DP probability computation for a given sequence and bin (using precomputed distributions)

def compute_success_prob_for_seq_given_T(seq, T, bin_label):
    dist_map = bin_distributions[bin_label]
    # states: mapping from remaining score -> prob
    states = {T: 1.0}
    success = 0.0
    for aimed in seq:
        new_states = defaultdict(float)
        aimed = aimed.lower()
        if aimed not in dist_map:
            # build on the fly
            probs = build_distribution_for_aim(aimed, float(bin_label.split('-')[0]) if '-' in bin_label else BIN_END)
        else:
            probs = dist_map[aimed]
        for rem, p_rem in list(states.items()):
            if p_rem <= 0:
                continue
            for actual_bed, p_actual in probs.items():
                sc = score_of(actual_bed)
                p = p_rem * p_actual
                # handling bust conditions
                if sc > rem:
                    # bust = turn ends (fail) (don't carry over)
                    continue
                new_rem = rem - sc
                if new_rem == 0:
                    # must be double
                    if is_double(actual_bed):
                        success += p
                    else:
                        # not double = bust
                        continue
                elif new_rem == 1:
                    # cannot finish on 1 = bust
                    continue
                else:
                    new_states[new_rem] += p
        states = new_states
        if not states:
            break
    return success

# Calculate "safety" score: how forgiving is this sequence if you miss the first dart
# Higher safety means neighbors leave you in a better position for finishing
def calculate_safety_score(seq, T):
    if len(seq) < 2:
        return 1.0  # 1-dart finishes have inherent risk
    
    first_aim = seq[0].lower()
    first_score = score_of(first_aim)
    
    if first_score == 0:
        return 0.5  # Unknown first dart
    
    # Get neighbors of the first aim
    target_num = int(first_aim[1:]) if len(first_aim) > 1 and first_aim[1:].isdigit() else None
    if target_num is None or target_num not in segment_index:
        return 0.7  # Can't determine neighbors, moderate safety
    
    idx = segment_index[target_num]
    left_num = BOARD_ORDER[(idx - 1) % NUM_SEGMENTS]
    right_num = BOARD_ORDER[(idx + 1) % NUM_SEGMENTS]
    
    # Calculate neighbor scores
    neighbor_first_type = first_aim[0]  # t, d, i, or o
    left_score = score_of(f'{neighbor_first_type}{left_num}')
    right_score = score_of(f'{neighbor_first_type}{right_num}')
    
    # If hitting a neighbor still leaves a double on the board, it's safer
    remaining_after_left = T - left_score
    remaining_after_right = T - right_score
    
    safety = 0.5
    # Check if remaining scores allow a double finish
    for n in range(1, 21):
        if 2*n == remaining_after_left or 2*n == remaining_after_right:
            safety = 0.9  # Good safety - neighbors leave doubles available
            break
        if remaining_after_left in [1, 0] or remaining_after_right in [1, 0]:
            safety = 0.3  # Poor safety - neighbors bust or can't finish
            break
    
    return safety

# Now run through totals and bins
results = {}
summary_rows = []
for label, rep in bins:
    results[label] = {}
    print(f"Processing bin {label} (rep avg {rep})")
    # precompute list of sequences for each total
    for T in range(2, 171):
        # determine candidate sequences from checkout candidates file
        cand_raw = candidates.get(str(T), []) if isinstance(candidates, dict) else []
        cand_seqs = [parse_candidate_sequence(x) for x in cand_raw] if cand_raw else []
        model_seqs = cand_seqs

        # evaluate sequences, keeping top 5 by success probability
        scored = []
        for seq in model_seqs:
            prob = compute_success_prob_for_seq_given_T(seq, T, label)
            # Weight sequences by number of darts: 1 dart > 2 dart > 3 dart
            if len(seq) == 1:
                prob_weighted = prob * 1.3  # 30% bonus for one-dart finishes
            elif len(seq) == 2:
                prob_weighted = prob * 1.1  # 10% bonus for two-dart finishes
            else:
                prob_weighted = prob  # No bonus for three-dart finishes

            # Slightly penalise bull finishes because the bull is a smaller target
            try:
                final_aim = seq[-1].lower() if seq else ''
            except Exception:
                final_aim = str(seq[-1]).lower() if seq else ''
            if final_aim == 'ibull':
                prob_weighted *= 0.85  # 15% penalty for ibull finishes
            
            # Penalise 2-dart sequences starting with treble or double (harder to hit than singles)
            if len(seq) == 2:
                try:
                    first_aim = seq[0].lower() if seq else ''
                except Exception:
                    first_aim = str(seq[0]).lower() if seq else ''
                if first_aim.startswith('t') or first_aim.startswith('d'):
                    prob_weighted *= 0.90  # 10% penalty for starting with treble/double
            
            safety = calculate_safety_score(seq, T)
            
            if prob > 0:
                scored.append({
                    'sequence': seq,
                    'success_prob': prob,
                    'success_prob_weighted': prob_weighted,
                    'safety': safety,
                    'is_one_dart': len(seq) == 1
                })
        
        # Sort by weighted probability first, then by safety
        scored.sort(key=lambda x: (-x['success_prob_weighted'], -x['safety']))
        
        # Find best and safest approaches
        best_seq = scored[0]['sequence'] if scored else None
        best_prob = scored[0]['success_prob'] if scored else None
        best_safety = scored[0]['safety'] if scored else None
        
        # Find highest safety score
        safest_seq = max(scored, key=lambda x: x['safety'])['sequence'] if scored else None
        
        results[label][str(T)] = {
            'best': {
                'sequence': '|'.join(best_seq) if best_seq else '',
                'success_prob': best_prob if best_prob is not None else 0,
                'safety': best_safety if best_safety is not None else 0
            },
            'safest': {
                'sequence': '|'.join(safest_seq) if safest_seq else '',
                'safety': max([s['safety'] for s in scored]) if scored else 0
            },
            'top_5': [
                {
                    'sequence': s['sequence'],
                    'success_prob': s['success_prob'],
                    'safety': s['safety'],
                    'is_one_dart': s['is_one_dart']
                } 
                for s in scored[:5]
            ]
        }

        # add best to CSV summary
        summary_rows.append({
            'average_level': label,
            'avg_rep': rep,
            'total': T,
            'best_sequence': '|'.join(best_seq) if best_seq else '',
            'best_success_prob': best_prob if best_prob is not None else '',
            'safest_sequence': '|'.join(safest_seq) if safest_seq else '',
        })

# write outputs
with open(OUTPUT_JSON, 'w', encoding='utf-8') as fh:
    json.dump({'bins': results}, fh, indent=2)

with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as fh:
    writer = csv.DictWriter(fh, fieldnames=['average_level','avg_rep','total','best_sequence','best_success_prob','safest_sequence'])
    writer.writeheader()
    for r in summary_rows:
        writer.writerow(r)

print(f"Checkout simulation done. Results written to {OUTPUT_JSON} and {OUTPUT_CSV}.")
