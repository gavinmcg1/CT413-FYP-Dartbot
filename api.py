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
IMPOSSIBLE_CHECKOUT_SCORES = {1, 159, 162, 163, 165, 166, 168, 169}

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

simulation_results_data = {}
try:
    sim_path = os.path.join(FOLDER, 'simulation_results.json')
    with open(sim_path, 'r', encoding='utf-8') as fh:
        simulation_results_data = json.load(fh)
    print(f"Loaded simulation results from {sim_path}")
except Exception as e:
    print(f"Warning: Could not load simulation results: {e}")

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
    
    # Find the best remaining score among reachable finish/checkouts.
    # Prefer higher checkout leaves (closer to 170) over very low leaves.
    reachable_checkoutish = [
        item for item in analysis['reachable_scores']
        if item['finishable'] or item['has_checkout']
    ]
    if reachable_checkoutish:
        under_171 = [item for item in reachable_checkoutish if item['score'] <= 170]
        preferred_pool = under_171 if under_171 else reachable_checkoutish
        analysis['best_remaining'] = max(preferred_pool, key=lambda x: x['score'])['score']
    
    return analysis


def find_best_approach_segment(score: int, out_rule: str = 'double', darts_available: int = 3) -> dict:
    """
    Find the best starting segment for approach play.
    Compares all trebles (1-20) and picks the one that leaves the best finishing positions.
    Returns {'segment': int, 'reason': str, 'alternatives': [...]}
    """
    preferred_treble_segments = [20, 19, 18, 17]
    preferred_single_segments = [20, 19, 18, 17, 25, 50]
    impossible_checkouts = IMPOSSIBLE_CHECKOUT_SCORES - {1}

    # Deterministic overrides for specific score/dart scenarios.
    # Grouped by target so tuning is easy (e.g. all T20 starts together).
    t20_overrides = {
        (215, 3),
        (231, 3),
        (235, 3),
        (190, 1),
        (171, 1),
        (171, 3),
        (172, 3),
        (172, 1),
        (175, 1),
        (175, 3),
        (176, 1),
        (176, 3),
        (177, 3),
        (177, 1),
        (178, 1),
        (178, 3),
        (180, 1),
        (181, 1),
        (181, 3),
        (184, 1),
        (184, 3),
        (185, 3),
        (186, 3),
        (187, 3),
        (187, 1),
        (191, 3),
        (191, 1),
        (192, 3),
        (193, 3),
        (193, 1),
        (194, 3),
        (194, 1),
        (196, 1),
        (197, 1),
        (198, 1),
        (199, 1),
        (199, 3),
        (200, 1),
        (201, 1),
        (201, 3),
        (202, 1),
        (203, 1),
        (204, 1),
        (205, 1),
        (206, 1),
        (207, 1),
        (208, 1),
        (209, 3),
        (210, 1),
        (211, 1),
        (211, 3),
        (212, 3),
        (213, 3),
        (214, 1),
        (217, 1),
        (217, 3),
        (219, 3),
        (220, 1),
        (221, 3),
        (222, 3),
        (223, 3),
        (224, 3),
        (225, 3),
        (226, 3),
        (227, 3),
        (228, 3),
        (229, 3),
        (243, 3),
        (244, 3),
        (246, 3),
        (251, 3),
        (253, 3),
        (257, 3),
        (261, 3),
        (267, 3),
    }
    t19_overrides = {
        (265, 3),
        (271, 3),
        (173, 1),
        (179, 1),
        (211, 2),
        (214, 2),
        (219, 1),
        (233, 3),
        (243, 2),
        (246, 2),
        (249, 2),
    }
    t18_overrides = {
        (174, 1),
        (213, 2),
        (242, 2),
        (245, 2),
        (248, 2),
    }

    override_key = (score, darts_available)
    override_target = None
    if override_key in t20_overrides:
        override_target = 't20'
    elif override_key in t19_overrides:
        override_target = 't19'
    elif override_key in t18_overrides:
        override_target = 't18'

    if override_target and 171 <= score <= 271:
        segment = 20
        if len(override_target) > 1 and override_target[1:].isdigit():
            segment = int(override_target[1:])

        return {
            'segment': segment,
            'target': override_target,
            'reason': f"Override profile: start on {override_target.upper()} for score {score} with {darts_available} darts",
            'approach_play': True,
            'alternatives': [
                {'segment': 20, 'target': 't20', 'quality': 0},
                {'segment': 19, 'target': 't19', 'quality': 0},
                {'segment': 18, 'target': 't18', 'quality': 0},
                {'segment': 17, 'target': 't17', 'quality': 0},
                {'segment': 25, 'target': 's25', 'quality': 0},
            ],
        }

    if score <= 170:
        # Score is already in checkout range, no approach play needed
        return {
            'segment': 20,
            'target': 't20',
            'reason': 'Score <= 170, use checkout logic',
            'approach_play': False,
        }

    # Approach play is only intended for 171-271.
    # Outside this range, use power scoring on T20.
    if score > 271:
        return {
            'segment': 20,
            'target': 't20',
            'reason': 'Score > 271, power scoring on T20',
            'approach_play': False,
            'alternatives': [
                {'segment': 20, 'target': 't20', 'quality': 0},
                {'segment': 19, 'target': 't19', 'quality': 0},
                {'segment': 18, 'target': 't18', 'quality': 0},
                {'segment': 17, 'target': 't17', 'quality': 0},
                {'segment': 25, 'target': 's25', 'quality': 0},
            ],
        }

    # With one dart left, prioritize leaving the highest reachable checkout score
    # using practical setup singles from 20/19/18/17/25/50.
    if darts_available <= 1:
        one_dart_options = []
        for single_segment in preferred_single_segments:
            remaining = score - single_segment
            if remaining < 2:
                continue

            has_path = has_checkout_path(remaining)
            finishable = is_finishable_score(remaining, out_rule)
            if not has_path and not finishable:
                continue

            # Prefer highest reachable checkout score (e.g., leave 170 from 189 with S19)
            quality = remaining
            one_dart_options.append({
                'target': f's{single_segment}',
                'segment': single_segment,
                'remaining': remaining,
                'quality': quality,
                'finishable': finishable,
                'has_checkout': has_path,
            })

        if one_dart_options:
            one_dart_options.sort(key=lambda x: (-x['quality'], x['segment']))
            best = one_dart_options[0]
            return {
                'segment': best['segment'],
                'target': best['target'],
                'reason': f"1 dart left: aim {best['target'].upper()} to leave {best['remaining']}",
                'approach_play': True,
                'alternatives': [
                    {'segment': option['segment'], 'target': option['target'], 'quality': option['quality']}
                    for option in one_dart_options[:5]
                ],
            }

    # Evaluate preferred treble segments for strategic setup.
    evaluations = []
    for segment in preferred_treble_segments:
        analysis = evaluate_approach_segment(score, segment, out_rule, darts_available)

        # Score segment quality with setup-first priorities.
        quality_score = (
            (120 if analysis['immediately_finishable'] else 0) +
            (analysis['finishable_count'] * 12) +
            (analysis['has_checkout_path_count'] * 8) +
            (20 if analysis['best_remaining'] is not None and analysis['best_remaining'] <= 170 else 0)
        )

        # Encourage high scoring when setup value is tied.
        quality_score += segment

        evaluations.append({
            'segment': segment,
            'target': f"t{segment}",
            'quality_score': quality_score,
            'analysis': analysis,
        })

    evaluations.sort(key=lambda x: (-x['quality_score'], -x['segment']))
    best = evaluations[0]

    treble_hit_leave = score - (best['segment'] * 3)
    if best['analysis']['immediately_finishable']:
        reason = f"{best['target'].upper()} can reach 0 (immediate finish)"
    elif best['analysis']['best_remaining'] is not None and best['analysis']['best_remaining'] <= 170:
        if treble_hit_leave >= 2:
            reason = (
                f"{best['target'].upper()} leaves {treble_hit_leave} on treble hit "
                f"(best setup leave {best['analysis']['best_remaining']})"
            )
        else:
            reason = f"{best['target'].upper()} leaves {best['analysis']['best_remaining']} (checkout available)"
    elif best['analysis']['best_remaining'] is not None:
        if treble_hit_leave >= 2:
            reason = (
                f"{best['target'].upper()} leaves {treble_hit_leave} on treble hit "
                f"(best setup leave {best['analysis']['best_remaining']})"
            )
        else:
            reason = f"{best['target'].upper()} leaves {best['analysis']['best_remaining']}"
    else:
        if treble_hit_leave >= 2:
            reason = f"{best['target'].upper()} leaves {treble_hit_leave} on treble hit"
        else:
            reason = f"{best['target'].upper()} best setup among preferred segments"

    return {
        'segment': best['segment'],
        'target': best['target'],
        'reason': reason,
        'approach_play': True,
        'alternatives': [
            {
                'segment': e['segment'],
                'target': e['target'],
                'quality': e['quality_score'],
            }
            for e in evaluations[:5]
        ]
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
    if not simulation_results_data:
        print("[API] simulation_results_data is empty")
        return jsonify({'error': 'No simulation results data available'}), 404
    
    try:
        response = jsonify(simulation_results_data)
        response.headers['Access-Control-Allow-Origin'] = '*'
        data_size = len(str(simulation_results_data))
        print(f"[API] Returning simulation results: {data_size} bytes")
        return response, 200
    except Exception as e:
        print(f"[API] Error returning simulation results: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/double/outcomes', methods=['GET'])
def get_double_outcomes():
    """Return double_outcomes.json contents"""
    if not double_outcomes_data:
        print("[API] double_outcomes_data is empty")
        return jsonify({'error': 'No double outcomes data available'}), 404
    
    try:
        response = jsonify(double_outcomes_data)
        response.headers['Access-Control-Allow-Origin'] = '*'
        data_size = len(str(double_outcomes_data))
        print(f"[API] Returning double outcomes: {data_size} bytes")
        return response, 200
    except Exception as e:
        print(f"[API] Error returning double outcomes: {e}")
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
        "out_rule": str ("straight" or "double", default "double"),
        "darts_available": int (1-3, default 3)
    }
    
    Response: {
        "segment": int (1-20),
        "target": str (e.g. "t20", "s19"),
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
    darts_available = data.get('darts_available', 3)
    
    if score is None:
        return jsonify({'error': 'Score is required'}), 400
    
    if not isinstance(score, int) or score < 2:
        return jsonify({'error': 'Score must be an integer >= 2'}), 400

    if not isinstance(darts_available, int) or darts_available < 1 or darts_available > 3:
        return jsonify({'error': 'darts_available must be an integer between 1 and 3'}), 400
    
    try:
        result = find_best_approach_segment(score, out_rule, darts_available)
        target_for_log = result.get('target', f"t{result['segment']}")
        print(f"[API] Approach suggestion for {score} ({darts_available} darts): {target_for_log.upper()} - {result['reason']}")
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
    impossible_checkouts = IMPOSSIBLE_CHECKOUT_SCORES
    
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
    print("\nListening on http://0.0.0.0:8000")
    app.run(host='0.0.0.0', port=8000, debug=True)
