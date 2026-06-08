# TMEG FIFA 2026 WATCH PARTY

A self-contained web application for a prediction game during the 2026 World Cup Kick-off match: **Mexico vs. South Africa**.

## Features

- **Frontend User Experience**:
  - LDAP Login (session persisted locally).
  - Live Countdown timer until the Prediction Lock Time (**Thursday, June 11, 2026, at 3:00 PM EDT**).
  - Predictions for:
    - First & Second Half Scores for both teams.
    - Goal Scorers (checkbox rosters).
    - Goalie Saves (numerical inputs).
  - Dynamic Leaderboard visible at all times, updating in real-time.
- **Admin Console**:
  - Secure view accessed via URL parameter password (e.g., `/admin?password=TMEG_2026_Admin!`).
  - Update actual game state (scores, scorers, saves) to dynamically recalculate leaderboard scores.
- **Backend**:
  - Python (Flask) backend.
  - JSON-based persistence (`predictions.json` and `game_state.json`).
  - Dynamic scoring engine:
    - **10 points** per correct half-time score segment.
    - **20 points** per correct goal scorer.
    - **5 points** per correct goalie saves count.

---

## Setup & Run Instructions

### Prerequisites
Make sure you have Python 3 installed. **No external dependencies are required!**

### 1. Set Workspace (Optional but Recommended)
For optimal development with Jetski, you can configure this directory as your active workspace:
```bash
/usr/local/google/home/ivanramirez/.gemini/jetski/scratch/tmeg_fifa_2026
```

### 2. Run the Application
Run the native Python server:
```bash
python3 app.py
```
By default, the application runs on: `http://localhost:5000`.

---

## How to Use

### 1. Participant View (Frontend)
- Open `http://localhost:5000` in your browser.
- Enter your **LDAP** to log in.
- Submit your score, goal scorer, and goalie saves predictions.
- You can change your predictions at any time **before** the lock time (Thursday, June 11, 2026, 3:00 PM EDT / 19:00 UTC).

### 2. Admin Console (Updates & Scoring)
- Open:
  `http://localhost:5000/admin?password=TMEG_2026_Admin!`
- As events occur during the live game, select the scorers, actual scores, and saves.
- Click **"Update Game Data"**.
- Go back to the main page or check the side panel: the leaderboard will recalculate and rank participants dynamically!

---

## Scoring System Details

- **Scores per Half**: Checks whether the predicted first-half and second-half scores match the actual outcomes. Up to 40 points total.
- **Goal Scorers**: 20 points for each player the user correctly predicted would score *and* who actually scored.
- **Goalie Saves**: 5 points for each goalie whose actual saves match the predicted saves count.
