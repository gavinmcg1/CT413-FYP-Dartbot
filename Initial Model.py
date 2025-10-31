import os
import csv
from collections import defaultdict

folder = os.path.dirname(os.path.abspath(__file__))
output = {}

csv_files = [f for f in os.listdir(folder) if f.lower().endswith('.csv')]

for fname in sorted(csv_files):
    path = os.path.join(folder, fname)
    total = 0
    misses = 0
    miss_beds = defaultdict(int)
    rows = []
    average = None
    try:
        # read file and filter out any leading comment lines (e.g. lines starting with //)
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
        rows_list = list(reader)
        if rows_list:
            try:
                average = float(rows_list[0].get('average') or 0.0)
            except Exception:
                average = None
        for i, row in enumerate(rows_list, start=1):
            aimedat = (row.get('aimedat') or '').strip().lower()
            bed = (row.get('bed') or '').strip()
            if aimedat == 't20':
                total += 1
                if bed.lower() != 't20':
                    misses += 1
                    miss_beds[bed] += 1
                    rows.append({'line': i+1, 'bed': bed})
    except Exception as e:
        print(f"Error reading {fname}: {e}")
        continue

    error_rate = (misses / total) if total > 0 else None
    output[fname] = {
        'file': fname,
        'average': average,
        'total_aimed_t20': total,
        'misses_when_aimed_t20': misses,
        'error_rate': error_rate,
        'miss_bed_counts': dict(miss_beds)
    }

# Print per-file summary
for fname, data in output.items():
    print(f"File: {fname}")
    avg = data['average']
    if avg is None:
        print("  average: N/A")
    else:
        print(f"  average: {avg:.2f}")
    print(f"  aimed at t20 count: {data['total_aimed_t20']}")
    print(f"  misses (bed != t20): {data['misses_when_aimed_t20']}")
    if data['error_rate'] is None:
        print("  error rate: N/A (no t20 aimed)")
    else:
        print(f"  error rate: {data['error_rate']:.2%}")
    if data['miss_bed_counts']:
        print("  miss bed breakdown:")
        for bed_val, cnt in sorted(data['miss_bed_counts'].items(), key=lambda x: (-x[1], x[0])):
            print(f"    {bed_val}: {cnt}")
    else:
        print("  no misses recorded")
    print()

# Build simple weighted linear model: average -> hit_rate (hit_rate = 1 - error_rate)
records = []
for data in output.values():
    avg = data['average']
    total = data['total_aimed_t20']
    misses = data['misses_when_aimed_t20']
    if avg is None or total == 0:
        continue
    hit_rate = 1.0 - (misses / total)
    records.append((avg, hit_rate, total))

if len(records) < 2:
    print("Not enough distinct data points to fit a model (need >= 2 files with average and aimed-t20 throws).")
else:
    # weighted linear regression (weights = number of aimed T20 throws)
    xs = [r[0] for r in records]
    ys = [r[1] for r in records]
    ws = [r[2] for r in records]
    sumw = sum(ws)
    mean_x = sum(w * x for x, w in zip(xs, ws)) / sumw
    mean_y = sum(w * y for y, w in zip(ys, ws)) / sumw
    cov_xy = sum(w * (x - mean_x) * (y - mean_y) for x, y, w in zip(xs, ys, ws)) / sumw
    var_x = sum(w * (x - mean_x) ** 2 for x, w in zip(xs, ws)) / sumw
    if var_x == 0:
        print("All averages identical — cannot fit slope.")
    else:
        slope = cov_xy / var_x
        intercept = mean_y - slope * mean_x
        # weighted R^2
        ss_tot = sum(w * (y - mean_y) ** 2 for y, w in zip(ys, ws))
        ss_res = sum(w * (y - (slope * x + intercept)) ** 2 for x, y, w in zip(xs, ys, ws))
        r2 = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else None

        print("Weighted linear model: hit_rate = slope * average + intercept")
        print(f"  slope: {slope:.6f}  intercept: {intercept:.6f}")
        if r2 is None:
            print("  weighted R²: N/A")
        else:
            print(f"  weighted R²: {r2:.4f}")

        # example predictions
        min_avg = min(xs)
        max_avg = max(xs)
        mean_avg = sum(xs) / len(xs)
        for label, a in (("min", min_avg), ("mean", mean_avg), ("max", max_avg)):
            pred = slope * a + intercept
            pred_clamped = max(0.0, min(1.0, pred))
            print(f"  predicted hit% at {label} average ({a:.2f}): {pred_clamped:.2%}")

        print("\nNote: small number of players/sessions makes this model exploratory only. Collect more distinct averages for a reliable model.")