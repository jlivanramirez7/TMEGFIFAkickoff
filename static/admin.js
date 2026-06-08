document.addEventListener("DOMContentLoaded", () => {
    // Helper to parse query params
    const getQueryParam = (name) => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    };

    const password = getQueryParam("password");
    if (!password) {
        alert("Password parameter missing! Access denied.");
        window.location.href = "/";
        return;
    }

    // DOM Elements
    const adminForm = document.getElementById("admin-form");
    const adminError = document.getElementById("admin-error");
    const adminSuccess = document.getElementById("admin-success");

    // Dynamic Lists Containers
    const mxScorersList = document.getElementById("mexico-scorers-list");
    const saScorersList = document.getElementById("sa-scorers-list");
    const mxGoaliesList = document.getElementById("mexico-goalies-list");
    const saGoaliesList = document.getElementById("sa-goalies-list");

    // --- Roster and State Load ---

    async function initAdminConsole() {
        try {
            // 1. Load Rosters
            const rostersRes = await fetch("/api/rosters");
            const rosters = await rostersRes.json();
            
            buildScorersList(rosters.Mexico.Outfield, mxScorersList, "admin-mx_scorer");
            buildScorersList(rosters["South Africa"].Outfield, saScorersList, "admin-sa_scorer");
            
            buildGoaliesList(rosters.Mexico.Goalies, mxGoaliesList, "admin-mx_goalie");
            buildGoaliesList(rosters["South Africa"].Goalies, saGoaliesList, "admin-sa_goalie");
            
            // 2. Load Current Game State to Pre-populate
            const stateRes = await fetch(`/api/admin/game-state?password=${encodeURIComponent(password)}`);
            if (!stateRes.ok) {
                throw new Error("Failed to fetch game state. Check password.");
            }
            const gameState = await stateRes.ok ? await stateRes.json() : null;
            
            if (gameState) {
                populateGameState(gameState);
            }
        } catch (err) {
            console.error("Initialization error:", err);
            adminError.textContent = "Error initializing admin console: " + err.message;
            adminError.classList.remove("hidden");
        }
    }

    function buildScorersList(players, container, prefix) {
        container.innerHTML = "";
        players.forEach((player, index) => {
            const id = `${prefix}-${index}`;
            const div = document.createElement("div");
            div.className = "checklist-item";
            div.innerHTML = `
                <input type="checkbox" id="${id}" value="${player.name}" name="actual_goal_scorers">
                <label for="${id}">${player.name} <span class="badge position-badge">${player.position}</span></label>
            `;
            container.appendChild(div);
        });
    }

    function buildGoaliesList(goalies, container, prefix) {
        container.innerHTML = "";
        goalies.forEach((goalie, index) => {
            const id = `${prefix}-${index}`;
            const div = document.createElement("div");
            div.className = "goalie-save-row";
            div.innerHTML = `
                <span>${goalie.name} <span class="badge goalie-badge">${goalie.string}</span></span>
                <input type="number" id="${id}" name="actual-save-${goalie.name}" min="0" value="0" class="actual-saves-input">
            `;
            container.appendChild(div);
        });
    }

    function populateGameState(state) {
        // 1. Scores
        if (state.scores) {
            document.getElementById("actual-mx-1st").value = state.scores.mexico_1st || 0;
            document.getElementById("actual-sa-1st").value = state.scores.south_africa_1st || 0;
            document.getElementById("actual-mx-2nd").value = state.scores.mexico_2nd || 0;
            document.getElementById("actual-sa-2nd").value = state.scores.south_africa_2nd || 0;
        }

        // 2. Goal Scorers
        if (state.goal_scorers) {
            state.goal_scorers.forEach(player => {
                const checkbox = document.querySelector(`input[value="${player}"][name="actual_goal_scorers"]`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // 3. Goalie Saves
        if (state.goalie_saves) {
            Object.entries(state.goalie_saves).forEach(([goalie, saves]) => {
                const input = document.querySelector(`input[name="actual-save-${goalie}"]`);
                if (input) input.value = saves;
            });
        }
    }

    // --- Submit Updates ---

    adminForm.addEventListener("submit", (e) => {
        e.preventDefault();

        adminError.classList.add("hidden");
        adminSuccess.classList.add("hidden");

        // Gather Scores
        const scores = {
            mexico_1st: parseInt(document.getElementById("actual-mx-1st").value) || 0,
            south_africa_1st: parseInt(document.getElementById("actual-sa-1st").value) || 0,
            mexico_2nd: parseInt(document.getElementById("actual-mx-2nd").value) || 0,
            south_africa_2nd: parseInt(document.getElementById("actual-sa-2nd").value) || 0
        };

        // Gather Scorers
        const goalScorers = [];
        document.querySelectorAll('input[name="actual_goal_scorers"]:checked').forEach(cb => {
            goalScorers.push(cb.value);
        });

        // Gather Goalie Saves
        const goalieSaves = {};
        document.querySelectorAll('.actual-saves-input').forEach(input => {
            const goalieName = input.name.replace("actual-save-", "");
            goalieSaves[goalieName] = parseInt(input.value) || 0;
        });

        const payload = {
            password: password,
            game_state: {
                scores: scores,
                goal_scorers: goalScorers,
                goalie_saves: goalieSaves
            }
        };

        fetch("/api/admin/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                adminSuccess.textContent = data.message;
                adminSuccess.classList.remove("hidden");
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                adminError.textContent = data.message;
                adminError.classList.remove("hidden");
            }
        })
        .catch(err => {
            console.error("Error updating game state:", err);
            adminError.textContent = "An error occurred while updating game state.";
            adminError.classList.remove("hidden");
        });
    });

    // Run initialization
    initAdminConsole();
});
