"""
Flask API wrapper for Dartbot simulator
Exposes the Python simulation logic as REST endpoints
"""
import os
import json
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Configuration
FOLDER = os.path.dirname(os.path.abspath(__file__))
CANDIDATES_JSON = os.path.join(FOLDER, 'checkout_candidates.json')
OUTPUT_JSON = os.path.join(FOLDER, 'checkout_simulation_results.json')
DOUBLE_OUTCOMES_JSON = os.path.join(FOLDER, 'double_outcomes.json')

# Load checkout candidates (optimal routes for all scores)
checkout_candidates = {}
try:
    with open(CANDIDATES_JSON, 'r', encoding='utf-8') as fh:
        checkout_candidates = json.load(fh)
    print(f"Loaded checkout candidates from {CANDIDATES_JSON}")
except Exception as e:
    print(f"Warning: Could not load checkout candidates: {e}")

# Load precomputed results on startup
checkout_data = {}
try:
    with open(OUTPUT_JSON, 'r', encoding='utf-8') as fh:
        checkout_data = json.load(fh)
    print(f"Loaded checkout data from {OUTPUT_JSON}")
except Exception as e:
    print(f"Warning: Could not load checkout data: {e}")

double_outcomes_data = {}
try:
    with open(DOUBLE_OUTCOMES_JSON, 'r', encoding='utf-8') as fh:
        double_outcomes_data = json.load(fh)
    print(f"Loaded double outcomes data from {DOUBLE_OUTCOMES_JSON}")
except Exception as e:
    print(f"Warning: Could not load double outcomes data: {e}")


def is_finishable_score(score: int, out_rule: str = 'double') -> bool:
    """
    Check if a score is immediately finishable (1 dart finish)
    For double-out: 2, 4, 6, ..., 40 (even numbers) or 50 (bull)
    For straight-out: 1-20, 25, 50
    """
    if out_rule == 'double':
        # Doubles 2-40 (all even) or bull (50)
        return score == 50 or (score >= 2 and score <= 40 and score % 2 == 0)
    else:  # straight
        # Any single 1-50
        return (score >= 1 and score <= 20) or score == 25 or score == 50


def has_checkout_path(score: int) -> bool:
    """
    Check if a score has a checkout path available in checkout_candidates
    """
    return str(score) in checkout_candidates and len(checkout_candidates[str(score)]) > 0


def evaluate_approach_segment(score: int, segment: int, out_rule: str = 'double', darts_available: int = 3) -> dict:
    """
    Evaluate how good a treble segment is for approach play.
    Returns analysis of what remaining scores are reachable.
    """
    if segment < 1 or segment > 20:
        return {'valid': False, 'reason': 'Invalid segment'}
    
    treble_value = 3 * segment
    analysis = {
        'segment': segment,
        'treble_value': treble_value,
        'reachable_scores': [],
        'finishable_count': 0,
        'has_checkout_path_count': 0,
        'immediately_finishable': False,
        'best_remaining': None,
    }
    
    # Calculate all possible remaining scores by hitting treble different numbers of times
    # Then hitting lower value alternatives for remaining darts
    visited = set()
    
    # Try hitting treble N times (0 to darts_available)
    for trebles_hit in range(darts_available + 1):
        score_after_trebles = score - (treble_value * trebles_hit)
        if score_after_trebles < 0:
            continue
        
        remaining_darts = darts_available - trebles_hit
        
        # Base case: hit exactly right number of trebles
        if score_after_trebles not in visited:
            visited.add(score_after_trebles)
            is_finishable = is_finishable_score(score_after_trebles, out_rule)
            has_path = has_checkout_path(score_after_trebles) if score_after_trebles >= 2 else False
            
            analysis['reachable_scores'].append({
                'score': score_after_trebles,
                'finishable': is_finishable,
                'has_checkout': has_path,
            })
            
            if is_finishable:
                analysis['finishable_count'] += 1
            if has_path:
                analysis['has_checkout_path_count'] += 1
            if score_after_trebles == 0:
                analysis['immediately_finishable'] = True
        
        # Try mixing in single hits with remaining darts
        if remaining_darts > 0:
            # Include common segments AND the actual segment being evaluated
            # This allows proper evaluation of sequences like T19 + S19 + S19
            single_segments_to_try = set([20, 19, 18, 17, segment])
            for single_segment in single_segments_to_try:
                single_value = single_segment
                for singles_hit in range(remaining_darts + 1):
                    score_after_mixed = score_after_trebles - (single_value * singles_hit)
                    if score_after_mixed < 0:
                        continue
                    
                    if score_after_mixed not in visited:
                        visited.add(score_after_mixed)
                        is_finishable = is_finishable_score(score_after_mixed, out_rule)
                        has_path = has_checkout_path(score_after_mixed) if score_after_mixed >= 2 else False
                        
                        analysis['reachable_scores'].append({
                            'score': score_after_mixed,
                            'finishable': is_finishable,
                            'has_checkout': has_path,
                        })
                        
                        if is_finishable:
                            analysis['finishable_count'] += 1
                        if has_path:
                            analysis['has_checkout_path_count'] += 1
            
            # Try bullseye values separately (outer bull = 25, inner bull = 50)
            bullseye_values = [25, 50]
            for bull_value in bullseye_values:
                for bull_hits in range(remaining_darts + 1):
                    score_after_bull = score_after_trebles - (bull_value * bull_hits)
                    if score_after_bull < 0:
                        continue
                    
                    if score_after_bull not in visited:
                        visited.add(score_after_bull)
                        is_finishable = is_finishable_score(score_after_bull, out_rule)
                        has_path = has_checkout_path(score_after_bull) if score_after_bull >= 2 else False
                        
                        analysis['reachable_scores'].append({
                            'score': score_after_bull,
                            'finishable': is_finishable,
                            'has_checkout': has_path,
                        })
                        
                        if is_finishable:
                            analysis['finishable_count'] += 1
                        if has_path:
                            analysis['has_checkout_path_count'] += 1
    
    # Find the best remaining score (immediately finishable, or has checkout path)
    for remaining in sorted(analysis['reachable_scores'], key=lambda x: (not x['finishable'], not x['has_checkout'], x['score'])):
        if remaining['finishable'] or remaining['has_checkout']:
            analysis['best_remaining'] = remaining['score']
            break
    
    return analysis


def find_best_approach_segment(score: int, out_rule: str = 'double') -> dict:
    """
    Find the best starting segment for approach play.
    Compares all trebles (1-20) and picks the one that leaves the best finishing positions.
    Returns {'segment': int, 'reason': str, 'alternatives': [...]}
    """
    if score <= 170:
        # Score is already in checkout range, no approach play needed
        return {
            'segment': 20,  # Default to 20
            'reason': 'Score <= 170, use checkout logic',
            'approach_play': False,
        }
    
    # Evaluate all segments
    evaluations = []
    for segment in range(1, 21):
        analysis = evaluate_approach_segment(score, segment, out_rule)
        
        # Score the segment quality
        # Priority 1: Can it reach an immediately finishable score?
        # Priority 2: How many finishable scores are reachable?
        # Priority 3: How many have checkout paths?
        quality_score = (
            (100 if analysis['immediately_finishable'] else 0) +
            (analysis['finishable_count'] * 10) +
            (analysis['has_checkout_path_count'] * 5) +
            (analysis['best_remaining'] is not None and analysis['best_remaining'] <= 170)
        )
        
        evaluations.append({
            'segment': segment,
            'quality_score': quality_score,
            'analysis': analysis,
        })
    
    # Sort by quality score (descending)
    evaluations.sort(key=lambda x: (-x['quality_score'], x['segment']))
    
    best = evaluations[0]
    reason = ""
    
    if best['analysis']['immediately_finishable']:
        reason = f"T{best['segment']} can reach 0 (immediate finish)"
    elif best['analysis']['best_remaining'] is not None:
        if best['analysis']['best_remaining'] <= 170:
            reason = f"T{best['segment']} leaves {best['analysis']['best_remaining']} (checkout available)"
        else:
            reason = f"T{best['segment']} leaves {best['analysis']['best_remaining']}"
    else:
        reason = f"T{best['segment']} best of available options"
    
    return {
        'segment': best['segment'],
        'reason': reason,
        'approach_play': True,
        'alternatives': [{'segment': e['segment'], 'quality': e['quality_score']} for e in evaluations[:5]]
    }


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    has_data = bool(checkout_data.get('bins'))
    return jsonify({
        'status': 'ok',
        'has_data': has_data,
        'message': 'Dartbot API is running'
    }), 200


@app.route('/', methods=['GET'])
def root():
    """Root endpoint with API info"""
    return jsonify({
        'name': 'Dartbot API',
        'version': '1.0',
        'endpoints': {
            'GET /api/health': 'Health check',
            'GET /api/checkout/bins': 'List available average bins',
            'GET /api/double/outcomes': 'Get double_outcomes.json data',
            'GET /api/simulation/results': 'Get simulation_results.json data',
            'POST /api/checkout/recommend': 'Get checkout recommendation (score, average)',
            'POST /api/bot/strategy': 'Get bot throw strategy based on level and current score'
        }
    }), 200


@app.route('/api/checkout/bins', methods=['GET'])
def get_checkout_bins():
    """List all available checkout average bins"""
    if not checkout_data.get('bins'):
        return jsonify({'error': 'No checkout data available'}), 404
    
    bins = list(checkout_data['bins'].keys())
    return jsonify({
        'bins': bins,
        'count': len(bins)
    }), 200


@app.route('/api/simulation/results', methods=['GET'])
def get_simulation_results():
    """Return simulation_results.json contents"""
    sim_path = os.path.join(FOLDER, 'simulation_results.json')
    try:
        with open(sim_path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/double/outcomes', methods=['GET'])
def get_double_outcomes():
    """Return double_outcomes.json contents"""
    if double_outcomes_data:
        return jsonify(double_outcomes_data), 200

    try:
        with open(DOUBLE_OUTCOMES_JSON, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        return jsonify(data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def calculate_sequence_value(sequence: str) -> int:
    """
    Calculate the actual dart score value for a checkout sequence.
    Sequences are comma-separated targets like "t20,t14,d11" or "o16,t16,d20".
    Returns the sum of all dart values, or -1 if sequence is invalid.
    
    Target notation:
    - t<num>: Triple (3x segment value)
    - d<num>: Double (2x segment value)  
    - s<num>: Single (1x segment value)
    - o<num>: Outer Bull (25 points) - "outer bull"
    - i<num>: Inner Bull (50 points) - "inner bull", but treated as 25 here
    - ibull: Inner Bull (50 points)
    - obull: Outer Bull (25 points)
    """
    if not sequence or not isinstance(sequence, str):
        return -1
    
    total = 0
    targets = sequence.split(',')
    
    for target in targets:
        target = target.strip().lower()
        
        # Handle special bull cases
        if target == 'ibull':
            total += 50
            continue
        elif target == 'obull':
            total += 25
            continue
        
        # Parse standard notation: multiplier(t/d/s) + segment (o/i means 25/50 for non-standard)
        if len(target) < 2:
            return -1
        
        mult_char = target[0]
        rest = target[1:]
        
        # Handle 'o' and 'i' as segment parts (obull/ibull already handled)
        if mult_char == 'o':
            # Outer segment/bull variant (rare, but means 25)
            try:
                segment = int(rest)
                total += 25
            except:
                return -1
            continue
        elif mult_char == 'i':
            # Inner segment/bull variant (rare, but means 50)
            try:
                segment = int(rest)
                total += 50
            except:
                return -1
            continue
        
        # Standard multiplier notation
        multiplier = 1
        if mult_char == 't':
            multiplier = 3
        elif mult_char == 'd':
            multiplier = 2
        elif mult_char == 's':
            multiplier = 1
        else:
            return -1
        
        try:
            segment = int(rest)
            if segment < 1 or segment > 20:
                return -1
            total += multiplier * segment
        except:
            return -1
    
    return total


@app.route('/api/checkout/recommend', methods=['POST'])
def get_checkout_recommendation():
    """
    Get checkout recommendation for a given score and average range
    Request body: {
        "score": int (2-170),
        "average_range": str (e.g., "30-39", "40-49")
    }
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No JSON body provided'}), 400
    
    score = data.get('score')
    average_range = data.get('average_range', '30-39')
    
    if score is None:
        return jsonify({'error': 'Score is required'}), 400
    
    if not isinstance(score, int) or score < 2 or score > 170:
        return jsonify({'error': 'Score must be an integer between 2 and 170'}), 400
    
    # First try to get from checkout candidates (optimal routes)
    score_str = str(score)
    if score_str in checkout_candidates:
        candidates = checkout_candidates[score_str]
        best_sequence = candidates[0] if candidates else None
        print(f"[API] Found {len(candidates)} checkout candidates for {score}, best={best_sequence}")
        return jsonify({
            'score': score,
            'average_range': average_range,
            'recommendation': {
                'best': {
                    'sequence': best_sequence
                },
                'all_candidates': candidates
            }
        }), 200
    
    print(f"[API] No checkout candidate found for {score}, falling back to old format")
    
    # Fallback to old data format if available
    try:
        bins = checkout_data.get('bins', {})
        bin_data = bins.get(average_range, {})
        
        if score_str not in bin_data:
            print(f"[API] No bin data for {score} in range {average_range}")
            return jsonify({
                'score': score,
                'average_range': average_range,
                'recommendation': None,
                'message': f'No checkout data available for score {score}'
            }), 200
        
        recommendation = bin_data[score_str]
        return jsonify({
            'score': score,
            'average_range': average_range,
            'recommendation': recommendation
        }), 200
    except Exception as e:
        print(f"[API] Error getting checkout recommendation: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/approach/suggest', methods=['POST'])
def suggest_approach_segment():
    """
    Suggest the best starting segment for approach play on high scores (>170).
    Analyzes all treble segments and finds which leaves the best finishing positions.
    
    Request body: {
        "score": int (typically > 170),
        "out_rule": str ("straight" or "double", default "double")
    }
    
    Response: {
        "segment": int (1-20),
        "reason": str,
        "approach_play": bool,
        "alternatives": [{"segment": int, "quality": int}, ...]
    }
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No JSON body provided'}), 400
    
    score = data.get('score')
    out_rule = data.get('out_rule', 'double')
    
    if score is None:
        return jsonify({'error': 'Score is required'}), 400
    
    if not isinstance(score, int) or score < 2:
        return jsonify({'error': 'Score must be an integer >= 2'}), 400
    
    try:
        result = find_best_approach_segment(score, out_rule)
        print(f"[API] Approach suggestion for {score}: T{result['segment']} - {result['reason']}")
        return jsonify(result), 200
    except Exception as e:
        print(f"[API] Error getting approach suggestion: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/bot/strategy', methods=['POST'])
def get_bot_strategy():
    """
    Get bot throw strategy based on level and current score
    Request body: {
        "level": int (1-18),
        "current_score": int,
        "out_rule": str ("straight" or "double"),
        "average_range": str (optional, default "30-39")
    }
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No JSON body provided'}), 400
    
    level = data.get('level', 10)
    current_score = data.get('current_score')
    out_rule = data.get('out_rule', 'double')
    average_range = data.get('average_range', '30-39')
    
    if current_score is None:
        return jsonify({'error': 'current_score is required'}), 400
    
    # Bot strategy based on level and score
    # Level 1-18 maps to mean score: 44-112 (approximately)
    mean_score = 40 + level * 4
    
    # Check if we can finish (using checkout data)
    checkout_eligible = [2, 170]  # Score range for checkouts
    impossible_checkouts = [1, 159, 162, 163, 165, 166, 168, 169]
    
    can_attempt_checkout = (
        current_score >= checkout_eligible[0] and 
        current_score <= checkout_eligible[1] and 
        current_score not in impossible_checkouts and
        (out_rule != 'double' or current_score % 2 == 0)
    )
    
    # Get recommended checkout if available
    checkout_rec = None
    if can_attempt_checkout:
        try:
            bins = checkout_data.get('bins', {})
            bin_data = bins.get(average_range, {})
            score_str = str(current_score)
            if score_str in bin_data:
                checkout_rec = bin_data[score_str].get('best', {})
        except Exception:
            pass
    
    return jsonify({
        'level': level,
        'current_score': current_score,
        'out_rule': out_rule,
        'mean_score': mean_score,
        'can_attempt_checkout': can_attempt_checkout,
        'checkout_recommendation': checkout_rec,
        'strategy': {
            'finish_if_possible': can_attempt_checkout,
            'target_mean': mean_score,
            'is_finishing': current_score == mean_score and can_attempt_checkout
        }
    }), 200


if __name__ == '__main__':
    print("Starting Dartbot API...")
    print("Available endpoints:")
    print("  GET /api/health - Health check")
    print("  GET /api/checkout/bins - List available average bins")
    print("  POST /api/checkout/recommend - Get checkout recommendation")
    print("  POST /api/bot/strategy - Get bot strategy")
    print("\nListening on http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
