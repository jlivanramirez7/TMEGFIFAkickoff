import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse

# Constants
ADMIN_PASSWORD = "TMEG_2026_Admin!"  # Default password
LOCK_TIME = datetime(2026, 6, 11, 19, 0, 0, tzinfo=timezone.utc)  # 3:00 PM EDT = 19:00 UTC

# Paths for local data storage (fallback)
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PREDICTIONS_FILE = os.path.join(DATA_DIR, "predictions.json")
GAME_STATE_FILE = os.path.join(DATA_DIR, "game_state.json")

# Rosters Definition with Positions, Strings & Starters
ROSTERS = {
    "Mexico": {
        "Goalies": [
            {"name": "Guillermo Ochoa", "string": "1st String", "is_starter": True},
            {"name": "Carlos Acevedo", "string": "2nd String", "is_starter": False},
            {"name": "Raúl Rangel", "string": "3rd String", "is_starter": False}
        ],
        "Outfield": [
            {"name": "Jorge Sánchez", "position": "Defender", "is_starter": True},
            {"name": "César Montes", "position": "Defender", "is_starter": True},
            {"name": "Edson Álvarez", "position": "Midfielder", "is_starter": True},
            {"name": "Johan Vásquez", "position": "Defender", "is_starter": True},
            {"name": "Gerardo Arteaga", "position": "Defender", "is_starter": True},
            {"name": "Jesús Gallardo", "position": "Defender/Midfielder", "is_starter": False},
            {"name": "Israel Reyes", "position": "Defender", "is_starter": False},
            {"name": "Luis Romo", "position": "Midfielder", "is_starter": True},
            {"name": "Álvaro Fidalgo", "position": "Midfielder", "is_starter": False},
            {"name": "Orbelín Pineda", "position": "Midfielder", "is_starter": False},
            {"name": "Luis Chávez", "position": "Midfielder", "is_starter": True},
            {"name": "Erick Sánchez", "position": "Midfielder", "is_starter": False},
            {"name": "Raúl Jiménez", "position": "Forward", "is_starter": False},
            {"name": "Santiago Giménez", "position": "Forward", "is_starter": True},
            {"name": "Alexis Vega", "position": "Forward", "is_starter": True},
            {"name": "César Huerta", "position": "Forward", "is_starter": False},
            {"name": "Julián Quiñones", "position": "Forward", "is_starter": True}
        ]
    },
    "South Africa": {
        "Goalies": [
            {"name": "Ronwen Williams", "string": "1st String", "is_starter": True},
            {"name": "Sipho Chaine", "string": "2nd String", "is_starter": False},
            {"name": "Ricardo Goss", "string": "3rd String", "is_starter": False}
        ],
        "Outfield": [
            {"name": "Thabang Matuludi", "position": "Defender", "is_starter": True},
            {"name": "Khulumani Ndamane", "position": "Defender", "is_starter": False},
            {"name": "Aubrey Modiba", "position": "Midfielder/Defender", "is_starter": True},
            {"name": "Nkosinathi Sibisi", "position": "Defender", "is_starter": True},
            {"name": "Khuliso Mudau", "position": "Defender", "is_starter": True},
            {"name": "Teboho Mokoena", "position": "Midfielder", "is_starter": True},
            {"name": "Themba Zwane", "position": "Midfielder", "is_starter": True},
            {"name": "Sphephelo Sithole", "position": "Midfielder", "is_starter": True},
            {"name": "Lyle Foster", "position": "Forward", "is_starter": True},
            {"name": "Iqraam Rayners", "position": "Forward", "is_starter": True},
            {"name": "Evidence Makgopa", "position": "Forward", "is_starter": True},
            {"name": "Oswin Appollis", "position": "Midfielder/Forward", "is_starter": False},
            {"name": "Tshepang Moremi", "position": "Forward/Midfielder", "is_starter": False}
        ]
    }
}

# --- Firestore / Local JSON Persistence Layer ---

# Try to initialize Google Cloud Firestore.
# If running in Cloud Run, it inherits credentials automatically.
# Locally, it will fall back to local JSON if no GCP project is configured.
USE_FIRESTORE = False
db = None

try:
    from google.cloud import firestore
    # Initialize with user-specified project and database
    db = firestore.Client(project="tmegfifa2026", database="tmegfifa")
    # Test connection
    USE_FIRESTORE = True
    print("[INFO] Firestore client initialized successfully. Persisting to Google Cloud Firestore (database: tmegfifa).")
except Exception as e:
    USE_FIRESTORE = False
    db = None
    print(f"[INFO] Firestore not initialized ({e}). Persisting locally to JSON files.")

# Local File Helper: Load JSON
def load_json(filepath):
    if not os.path.exists(filepath):
        return {}
    with open(filepath, "r") as f:
        return json.load(f)

# Local File Helper: Save JSON
def save_json(filepath, data):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)

# Helper: Get Current Game State
def get_game_state():
    if USE_FIRESTORE:
        doc_ref = db.collection("game_state").document("current")
        doc = doc_ref.get()
        if doc.exists:
            return doc.to_dict()
        else:
            # Initialize Firestore default state
            initial_state = {
                "status": "scheduled",  # "scheduled" | "live" | "final"
                "first_half_final": False,
                "second_half_final": False,
                "final_score_final": False,
                "saves_final": False,
                "scores": {
                    "mexico_1st": 0, "south_africa_1st": 0,
                    "mexico_2nd": 0, "south_africa_2nd": 0,
                    "mexico_final": 0, "south_africa_final": 0
                },
                "goal_scorers": [],
                "goalie_saves": {
                    goalie["name"]: 0 
                    for team in ROSTERS.values() 
                    for goalie in team["Goalies"]
                }
            }
            doc_ref.set(initial_state)
            return initial_state
    else:
        # Local JSON Initialization
        if not os.path.exists(GAME_STATE_FILE):
            initial_state = {
                "status": "scheduled",  # "scheduled" | "live" | "final"
                "first_half_final": False,
                "second_half_final": False,
                "final_score_final": False,
                "saves_final": False,
                "scores": {
                    "mexico_1st": 0, "south_africa_1st": 0,
                    "mexico_2nd": 0, "south_africa_2nd": 0,
                    "mexico_final": 0, "south_africa_final": 0
                },
                "goal_scorers": [],
                "goalie_saves": {
                    goalie["name"]: 0 
                    for team in ROSTERS.values() 
                    for goalie in team["Goalies"]
                }
            }
            save_json(GAME_STATE_FILE, initial_state)
            return initial_state
        return load_json(GAME_STATE_FILE)

# Helper: Save Game State
def save_game_state(state):
    if USE_FIRESTORE:
        db.collection("game_state").document("current").set(state)
    else:
        save_json(GAME_STATE_FILE, state)

# Helper: Get All Predictions
def get_all_predictions():
    if USE_FIRESTORE:
        preds = {}
        docs = db.collection("predictions").stream()
        for doc in docs:
            preds[doc.id] = doc.to_dict()
        return preds
    else:
        if not os.path.exists(PREDICTIONS_FILE):
            save_json(PREDICTIONS_FILE, {})
            return {}
        return load_json(PREDICTIONS_FILE)

# Helper: Save/Update User Prediction
def save_prediction(ldap, prediction_data):
    if USE_FIRESTORE:
        db.collection("predictions").document(ldap).set(prediction_data)
    else:
        all_predictions = load_json(PREDICTIONS_FILE)
        all_predictions[ldap] = prediction_data
        save_json(PREDICTIONS_FILE, all_predictions)

# Helper: Get Single User Prediction
def get_user_prediction(ldap):
    if USE_FIRESTORE:
        doc = db.collection("predictions").document(ldap).get()
        if doc.exists:
            return doc.to_dict()
        return None
    else:
        all_predictions = load_json(PREDICTIONS_FILE)
        return all_predictions.get(ldap)

# --- Scoring Engine (Safe Live-Scoring Rules) ---

def calculate_score(prediction, game_state):
    # If the match hasn't started yet, everyone has exactly 0 points.
    if game_state.get("status", "scheduled") == "scheduled":
        return 0
        
    score = 0
    status = game_state.get("status", "live")
    
    # Extract actual scores
    scores = game_state.get("scores", {})
    mx_1st = int(scores.get("mexico_1st", 0))
    sa_1st = int(scores.get("south_africa_1st", 0))
    mx_2nd = int(scores.get("mexico_2nd", 0))
    sa_2nd = int(scores.get("south_africa_2nd", 0))
    
    # 1. Goals Earned per Half (10 pts each)
    # 1st Half: Always evaluate if the match is live or final
    for key in ["mexico_1st", "south_africa_1st"]:
        user_val = prediction.get("scores", {}).get(key)
        actual_val = scores.get(key)
        if user_val is not None and actual_val is not None:
            if int(user_val) == int(actual_val):
                score += 10
                
    # 2nd Half: Evaluate if final, or if 2nd half has active scoring data (non-zero goals recorded)
    has_2nd_half_started = (mx_2nd > 0 or sa_2nd > 0 or status == "final")
    if has_2nd_half_started:
        for key in ["mexico_2nd", "south_africa_2nd"]:
            user_val = prediction.get("scores", {}).get(key)
            actual_val = scores.get(key)
            if user_val is not None and actual_val is not None:
                if int(user_val) == int(actual_val):
                    score += 10

    # 1.5 Final Score (10 pts each)
    # Always evaluate live based on current total final scores
    for key in ["mexico_final", "south_africa_final"]:
        user_val = prediction.get("scores", {}).get(key)
        actual_val = scores.get(key)
        if user_val is not None and actual_val is not None:
            if int(user_val) == int(actual_val):
                score += 10
                
    # 2. Goal Scorers (20 pts for correct, -10 pts penalty for incorrect guesses)
    # Evaluated live during match
    user_scorers = set(prediction.get("goal_scorers", []))
    actual_scorers = set(game_state.get("goal_scorers", []))
    
    correct_scorers = user_scorers.intersection(actual_scorers)
    incorrect_scorers = user_scorers.difference(actual_scorers)
    
    score += len(correct_scorers) * 20
    score -= len(incorrect_scorers) * 10
    
    # 3. Goalie Saves (5 pts each)
    # Evaluate goalie saves if status is final, or if any goalie save is recorded as non-zero
    actual_saves = game_state.get("goalie_saves", {})
    has_saves = any(int(val) > 0 for val in actual_saves.values()) or status == "final"
    if has_saves:
        user_saves = prediction.get("goalie_saves", {})
        for goalie, actual_val in actual_saves.items():
            user_val = user_saves.get(goalie)
            if user_val is not None and actual_val is not None:
                if int(user_val) == int(actual_val):
                    score += 5
                    
    return max(0, score)


class GameRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Allow standard request logging to stdout
        super().log_message(format, *args)

    def serve_file(self, relative_path, content_type):
        filepath = os.path.join(DATA_DIR, relative_path)
        if not os.path.exists(filepath):
            self.send_error_response(404, "File Not Found")
            return
        
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        with open(filepath, "rb") as f:
            self.wfile.write(f.read())

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def send_error_response(self, status, message):
        self.send_response(status)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(message.encode("utf-8"))

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # 1. Serve HTML & Static Files
        if path == "/":
            self.serve_file("templates/index.html", "text/html")
        elif path == "/admin":
            pwd = query.get("password", [None])[0]
            if pwd != ADMIN_PASSWORD:
                self.send_error_response(403, "Forbidden: Invalid password parameter.")
                return
            self.serve_file("templates/admin.html", "text/html")
        elif path == "/static/style.css":
            self.serve_file("static/style.css", "text/css")
        elif path == "/static/app.js":
            self.serve_file("static/app.js", "application/javascript")
        elif path == "/static/admin.js":
            self.serve_file("static/admin.js", "application/javascript")

        # 2. API Routes
        elif path == "/api/rosters":
            self.send_json_response(ROSTERS)
            
        elif path == "/api/lock-status":
            now = datetime.now(timezone.utc)
            locked = now > LOCK_TIME
            time_left = int((LOCK_TIME - now).total_seconds())
            self.send_json_response({
                "locked": locked,
                "time_left": max(0, time_left),
                "lock_time": LOCK_TIME.isoformat()
            })
            
        elif path == "/api/leaderboard":
            predictions = get_all_predictions()
            game_state = get_game_state()
            
            leaderboard = []
            for ldap, pred in predictions.items():
                score = calculate_score(pred, game_state)
                leaderboard.append({
                    "ldap": ldap,
                    "score": score
                })
                
            leaderboard.sort(key=lambda x: (-x["score"], x["ldap"]))
            
            ranked_leaderboard = []
            current_rank = 1
            for i, entry in enumerate(leaderboard):
                if i > 0 and entry["score"] < leaderboard[i-1]["score"]:
                    current_rank = i + 1
                ranked_leaderboard.append({
                    "rank": current_rank,
                    "ldap": entry["ldap"],
                    "score": entry["score"]
                })
            self.send_json_response(ranked_leaderboard)

        elif path == "/api/admin/game-state":
            pwd = query.get("password", [None])[0]
            if pwd != ADMIN_PASSWORD:
                self.send_json_response({"success": False, "message": "Unauthorized"}, status=403)
                return
            self.send_json_response(get_game_state())

        elif path.startswith("/api/predictions/"):
            ldap = path.split("/")[-1].strip().lower()
            viewer = query.get("viewer", [None])[0]
            if viewer:
                viewer = viewer.strip().lower()

            # Security Rules:
            # 1. You can ALWAYS view your own predictions.
            # 2. You can view others' predictions ONLY after the lock time (kick-off).
            now = datetime.now(timezone.utc)
            is_own_prediction = (viewer == ldap)
            is_after_lock = (now > LOCK_TIME)

            if not is_own_prediction and not is_after_lock:
                self.send_json_response({
                    "found": True,
                    "hidden": True,
                    "message": "Predictions are hidden until lock time (June 11, 3:00 PM EDT) to ensure a fair game!"
                })
                return

            user_pred = get_user_prediction(ldap)
            if not user_pred:
                self.send_json_response({"found": False})
            else:
                self.send_json_response({
                    "found": True,
                    "hidden": False,
                    "predictions": user_pred
                })

        else:
            self.send_error_response(404, "Not Found")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_json_response({"success": False, "message": "Invalid JSON"}, status=400)
            return

        if path == "/api/predictions":
            if datetime.now(timezone.utc) > LOCK_TIME:
                self.send_json_response({"success": False, "message": "Predictions are locked. The match has started!"}, status=400)
                return
                
            ldap = data.get("ldap")
            predictions = data.get("predictions")
            
            if not ldap or not predictions:
                self.send_json_response({"success": False, "message": "LDAP and predictions are required."}, status=400)
                return
                
            ldap = ldap.strip().lower()
            if not ldap:
                self.send_json_response({"success": False, "message": "LDAP cannot be empty."}, status=400)
                return

            # Airtight Backend Consistency Validation
            mexico_outfield = {p["name"] for p in ROSTERS["Mexico"]["Outfield"]}
            sa_outfield = {p["name"] for p in ROSTERS["South Africa"]["Outfield"]}
            
            submitted_scorers = predictions.get("goal_scorers", [])
            mx_scorers_count = sum(1 for s in submitted_scorers if s in mexico_outfield)
            sa_scorers_count = sum(1 for s in submitted_scorers if s in sa_outfield)
            
            pred_scores = predictions.get("scores", {})
            mx_final_pred = int(pred_scores.get("mexico_final", 0))
            sa_final_pred = int(pred_scores.get("south_africa_final", 0))
            
            if mx_scorers_count > mx_final_pred:
                self.send_json_response({
                    "success": False,
                    "message": f"Validation Error: You selected {mx_scorers_count} Mexico scorers, but you only predicted {mx_final_pred} goals."
                }, status=400)
                return
                
            if sa_scorers_count > sa_final_pred:
                self.send_json_response({
                    "success": False,
                    "message": f"Validation Error: You selected {sa_scorers_count} South Africa scorers, but you only predicted {sa_final_pred} goals."
                }, status=400)
                return
                
            predictions["submitted_at"] = datetime.now(timezone.utc).isoformat()
            save_prediction(ldap, predictions)
            self.send_json_response({"success": True, "message": "Predictions submitted successfully!"})

        elif path == "/api/admin/update":
            password = data.get("password")
            new_state = data.get("game_state")
            
            if password != ADMIN_PASSWORD:
                self.send_json_response({"success": False, "message": "Unauthorized"}, status=403)
                return
                
            if not new_state:
                self.send_json_response({"success": False, "message": "Invalid game state payload."}, status=400)
                return
                
            save_game_state(new_state)
            self.send_json_response({"success": True, "message": "Game state updated successfully!"})

        else:
            self.send_error_response(404, "Not Found")


def run(port=5000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, GameRequestHandler)
    print(f"Server starting on port {port}... Open http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopping...")
        httpd.server_close()

if __name__ == "__main__":
    # Cloud Run injects the PORT environment variable
    port = int(os.environ.get("PORT", 5000))
    run(port=port)
