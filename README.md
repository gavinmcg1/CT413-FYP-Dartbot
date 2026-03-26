# FYP Dartbot

A darts training and simulation project that combines:

- a **Python/Flask backend** for checkout strategy, approach play logic, and precomputed simulation data
- an **Expo React Native mobile app** for gameplay, setup, stats, and bot interaction
- a set of **datasets and simulation scripts** used to build and evaluate dart outcome models

## Project goals

The project aims to:

- simulate realistic dart outcomes from historical/player data
- recommend checkout routes based on score and skill range
- suggest approach shots for non-finishable scores
- drive an in-app Dartbot opponent with configurable difficulty

## Repository structure

- `api.py` — Flask API exposing strategy/simulation endpoints
- `simulate_checkouts.py`, `compute_t20_errors.py`, `Initial_Model.py` — model/simulation scripts
- `Datasets/` — player and target CSV data used for modeling
- `checkout_candidates.json`, `checkout_simulation_results.json`, `simulation_results.json`, `double_outcomes.json` — generated data consumed by API
- `DartbotMobile/` — Expo app (TypeScript + Expo Router)

## Tech stack

- **Backend:** Python, Flask, Flask-CORS
- **Frontend:** React Native, Expo, Expo Router, TypeScript, Axios
- **Data/Modeling:** CSV datasets and Python simulation pipeline

## Quick start

### 1) Backend (Flask)

From repository root:

```powershell
pip install -r requirements.txt
python api.py
```

API starts on:

- `http://localhost:8000`

### 2) Mobile app (Expo)

From `DartbotMobile/`:

```powershell
npm install
npm run start:tunnel
```

Alternative:

```powershell
npm run start
```

## Mobile ↔ API connection

The mobile app API client is in `DartbotMobile/services/dartbotAPI.ts`.

It resolves API base URL in this order:

1. `EXPO_PUBLIC_DARTBOT_API_URL`
2. `API_CONFIG.BASE_URL` from `DartbotMobile/config.ts`
3. auto-detected Expo host / localhost fallback (`http://<host>:8000` or `http://localhost:8000`)

If running on a physical device, ensure the device can reach your machine on port `8000`.

## Key backend endpoints

- `GET /api/health`
- `POST /api/checkout/recommend`
- `POST /api/approach/suggest`
- `POST /api/bot/strategy`
- `GET /api/simulation/results`
- `GET /api/double/outcomes`

## Notes

- API reads precomputed JSON files at startup; missing files will log warnings.
- Current Flask run config in `api.py` uses `host='0.0.0.0'`, `port=8000`, `debug=True`.

## Future improvements

- tighten backend dependency list (current `requirements.txt` includes notebook tooling)
- add automated tests for API contracts and strategy edge cases
- document data generation workflow end-to-end
