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
    try:
        with open(path, newline='', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
            # ensure required columns exist
            if not all(col in reader.fieldnames for col in ['aimedat', 'bed', 'average']):
                print(f"Skipping {fname}: missing required column(s)")
                continue
            # Get average from first row (they're all the same in the file)
            average = None
            for row in reader:
                average = float(row['average'])
                break
            fh.seek(0)  # Reset to start of file
            next(reader)  # Skip header row
            for i, row in enumerate(reader, start=1):
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

# Print a concise table to stdout
for fname, data in output.items():
    print(f"File: {fname}")
    print(f"  average: {data['average']:.2f}")
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
