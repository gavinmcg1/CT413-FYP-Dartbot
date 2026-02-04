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
OUTPUT_JSON = os.path.join(FOLDER, 'checkout_simulation_results.json')

# Load precomputed results on startup
checkout_data = {}
try:
    with open(OUTPUT_JSON, 'r', encoding='utf-8') as fh:
        checkout_data = json.load(fh)
    print(f"Loaded checkout data from {OUTPUT_JSON}")
except Exception as e:
    print(f"Warning: Could not load checkout data: {e}")


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
    
    # Get recommendation from data
    try:
        bins = checkout_data.get('bins', {})
        bin_data = bins.get(average_range, {})
        score_str = str(score)
        
        if score_str not in bin_data:
            return jsonify({
                'score': score,
                'average_range': average_range,
                'recommendation': None,
                'message': f'No checkout data available for score {score} in range {average_range}'
            }), 200
        
        recommendation = bin_data[score_str]
        return jsonify({
            'score': score,
            'average_range': average_range,
            'recommendation': recommendation
        }), 200
    
    except Exception as e:
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
