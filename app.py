import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse

# Constants
ADMIN_PASSWORD = "TMEG_2026_Admin!"  # Default password
LOCK_TIME = datetime(2026, 6, 11, 19, 0, 0, tzinfo=timezone.utc)  # 3:00 PM EDT = 19:00 UTC

# Paths for data storage
DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PREDICTIONS_FILE = os.path.join(DATA_DIR, "predictions.json")
GAME_STATE_FILE = os.path.join(DATA_DIR, "game_state.json")

# Rosters Definition
ROSTERS = {
    "Mexico": {
        "Goalies": ["Guillermo Ochoa", "Carlos Acevedo", "Raúl Rangel"],
        "Outfield": [
            "Jorge Sánchez", "César Montes", "Edson Álvarez", "Johan Vásquez",
            "Gerardo Arteaga", "Jesús Gallardo", "Israel Reyes", "Luis Romo",
            "Álvaro Fidalgo", "Orbelín Pineda", "Luis Chávez", "Erick Sánchez",
            "Raúl Jiménez", "Santiago Giménez", "Alexis Vega", "César Huerta",
            "Julián Quiñones"
        ]
    },
    "South Africa": {
        "Goalies": ["Ronwen Williams", "Sipho Chaine", "Ricardo Goss"],
        "Outfield": [
            "Thabang Matuludi", "Khulumani Ndamane", "Aubrey Modiba",
            "Nkosinathi Sibisi", "Khuliso Mudau", "Teboho Mokoena",
            "Themba Zwane", "Sphephelo Sithole", "Lyle Foster",
            "Iqraam Rayners", "Evidence Makgopa", "Oswin Appollis",
            "Tshepang Moremi"
        ]
    }
}

# Helper: Initialize files if they don't exist
def init_data_files():
    if not os.path.exists(PREDICTIONS_FILE):
        with open(PREDICTIONS_FILE, "w") as f:
            json.dump({}, f)
            
    if not os.path.exists(GAME_STATE_FILE):
        initial_state = {
            "scores": {
                "mexico_1st": 0,
                "south_africa_1st": 0,
                "mexico_2nd": 0,
                "south_africa_2nd": 0
            },
            "goal_scorers": [],
            "goalie_saves": {
                goalie: 0 
                for team in ROSTERS.values() 
                for goalie in team["Goalies"]
            }
        }
        with open(GAME_STATE_FILE, "w") as f:
            json.dump(initial_state, f)

init_data_files()

# Helper: Load JSON
def load_json(filepath):
    with open(filepath, "r") as f:
        return json.load(f)

# Helper: Save JSON
def save_json(filepath, data):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)

# Helper: Calculate user score
def calculate_score(prediction, game_state):
    score = 0
    
    # 1. Scores per Half (10 pts each)
    for key in ["mexico_1st", "south_africa_1st", "mexico_2nd", "south_africa_2nd"]:
        user_val = prediction.get("scores", {}).get(key)
        actual_val = game_state.get("scores", {}).get(key)
        if user_val is not None and actual_val is not None:
            if int(user_val) == int(actual_val):
                score += 10
                
    # 2. Goal Scorers (20 pts for each correctly predicted goal scorer)
    user_scorers = set(prediction.get("goal_scorers", []))
    actual_scorers = set(game_state.get("goal_scorers", []))
    correct_scorers = user_scorers.intersection(actual_scorers)
    score += len(correct_scorers) * 20
    
    # 3. Goalie Saves (5 pts for each correctly predicted saves count)
    user_saves = prediction.get("goalie_saves", {})
    actual_saves = game_state.get("goalie_saves", {})
    for goalie, actual_val in actual_saves.items():
        user_val = user_saves.get(goalie)
        if user_val is not None and actual_val is not None:
            if int(user_val) == int(actual_val):
                score += 5
                
    return score


class GameRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress server logging to keep terminal clean, or let it log
        super().log_message(format, *args)

    def serve_file(self, relative_path, content_type):
        filepath = os.path.join(DATA_DIR, relative_path)
        if not os.path.exists(filepath):
            self.send_error_response(404, "File Not Found")
            return
        
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        # Prevent caching for live development
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
            predictions = load_json(PREDICTIONS_FILE)
            game_state = load_json(GAME_STATE_FILE)
            
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
            self.send_json_response(load_json(GAME_STATE_FILE))

        elif path.startswith("/api/predictions/"):
            ldap = path.split("/")[-1].strip().lower()
            all_predictions = load_json(PREDICTIONS_FILE)
            user_pred = all_predictions.get(ldap)
            if not user_pred:
                self.send_json_response({"found": False})
            else:
                self.send_json_response({"found": True, "predictions": user_pred})

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
                
            all_predictions = load_json(PREDICTIONS_FILE)
            predictions["submitted_at"] = datetime.now(timezone.utc).isoformat()
            all_predictions[ldap] = predictions
            save_json(PREDICTIONS_FILE, all_predictions)
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
                
            save_json(GAME_STATE_FILE, new_state)
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
    run()
