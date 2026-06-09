document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const loginView = document.getElementById("login-view");
    const predictionView = document.getElementById("prediction-view");
    const loginForm = document.getElementById("login-form");
    const ldapInput = document.getElementById("ldap-input");
    const userLdapDisplay = document.getElementById("user-ldap");
    const logoutBtn = document.getElementById("logout-btn");
    
    const predictionForm = document.getElementById("prediction-form");
    const countdownEl = document.getElementById("countdown");
    const timerBox = document.getElementById("timer-box");
    const submitBtn = document.getElementById("submit-btn");
    const formError = document.getElementById("form-error");
    const formSuccess = document.getElementById("form-success");
    
    const leaderboardTableBody = document.querySelector("#leaderboard-table tbody");

    // Dynamic Lists Containers
    const mxScorersList = document.getElementById("mexico-scorers-list");
    const saScorersList = document.getElementById("sa-scorers-list");
    const mxGoaliesList = document.getElementById("mexico-goalies-list");
    const saGoaliesList = document.getElementById("sa-goalies-list");

    // Live calculation of Final Scores
    const mx1st = document.getElementById("pred-mx-1st");
    const mx2nd = document.getElementById("pred-mx-2nd");
    const mxFinal = document.getElementById("pred-mx-final");
    const sa1st = document.getElementById("pred-sa-1st");
    const sa2nd = document.getElementById("pred-sa-2nd");
    const saFinal = document.getElementById("pred-sa-final");

    function showFormWarning(msg) {
        formError.textContent = msg;
        formError.classList.remove("hidden");
        // Auto hide after 3.5 seconds
        setTimeout(() => {
            if (formError.textContent === msg) {
                formError.classList.add("hidden");
            }
        }, 3500);
    }

    function enforceScorerLimits() {
        const mxLimit = parseInt(mxFinal.value) || 0;
        const saLimit = parseInt(saFinal.value) || 0;
        
        const mxChecked = document.querySelectorAll('#mexico-scorers-list input[name="goal_scorers"]:checked');
        const saChecked = document.querySelectorAll('#sa-scorers-list input[name="goal_scorers"]:checked');
        
        if (mxChecked.length > mxLimit) {
            for (let i = mxLimit; i < mxChecked.length; i++) {
                mxChecked[i].checked = false;
            }
            showFormWarning(`Mexico selected scorers reduced to ${mxLimit} to match your goals prediction.`);
        }
        
        if (saChecked.length > saLimit) {
            for (let i = saLimit; i < saChecked.length; i++) {
                saChecked[i].checked = false;
            }
            showFormWarning(`South Africa selected scorers reduced to ${saLimit} to match your goals prediction.`);
        }
    }

    const updateMxFinal = () => {
        mxFinal.value = (parseInt(mx1st.value) || 0) + (parseInt(mx2nd.value) || 0);
        enforceScorerLimits();
    };
    const updateSaFinal = () => {
        saFinal.value = (parseInt(sa1st.value) || 0) + (parseInt(sa2nd.value) || 0);
        enforceScorerLimits();
    };

    mx1st.addEventListener("input", updateMxFinal);
    mx2nd.addEventListener("input", updateMxFinal);
    sa1st.addEventListener("input", updateSaFinal);
    sa2nd.addEventListener("input", updateSaFinal);

    // Dynamic click check: Block selecting scorers beyond predicted goals
    predictionForm.addEventListener("change", (e) => {
        if (e.target.name === "goal_scorers") {
            const isMexico = e.target.closest("#mexico-scorers-list") !== null;
            const limit = isMexico ? (parseInt(mxFinal.value) || 0) : (parseInt(saFinal.value) || 0);
            const listId = isMexico ? "#mexico-scorers-list" : "#sa-scorers-list";
            const checkedCount = document.querySelectorAll(`${listId} input[name="goal_scorers"]:checked`).length;
            
            if (e.target.checked && checkedCount > limit) {
                e.target.checked = false; // Prevent selection
                showFormWarning(`You predicted ${isMexico ? "Mexico" : "South Africa"} will score ${limit} goals. You cannot select more scorers than goals!`);
            }
        }
    });

    let isLocked = false;
    let timerInterval = null;
    let leaderboardInterval = null;
    let localCountdownInterval = null;

    // --- Authentication Flow ---
    
    function initAuth() {
        const storedLdap = localStorage.getItem("tmeg_ldap");
        if (storedLdap) {
            login(storedLdap);
        } else {
            showLoginView();
        }
    }

    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const ldap = ldapInput.value.trim().toLowerCase();
        if (ldap) {
            localStorage.setItem("tmeg_ldap", ldap);
            login(ldap);
        }
    });

    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("tmeg_ldap");
        showLoginView();
        predictionForm.reset();
        // Clear all dynamically checked items
        document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.goalie-save-row input[type="number"]').forEach(input => input.value = 0);
    });

    function login(ldap) {
        userLdapDisplay.textContent = ldap;
        loginView.classList.add("hidden");
        predictionView.classList.remove("hidden");
        
        // Load app data
        loadRosters().then(() => {
            loadUserPredictions(ldap);
        });
        
        // Start lock status monitoring if not already running
        startLockStatusCheck();
    }

    function showLoginView() {
        loginView.classList.remove("hidden");
        predictionView.classList.add("hidden");
    }

    // --- Lock Status & Countdown Timer ---

    function startLockStatusCheck() {
        if (timerInterval) clearInterval(timerInterval);
        
        const checkStatus = () => {
            fetch("/api/lock-status")
                .then(res => res.json())
                .then(data => {
                    isLocked = data.locked;
                    if (isLocked) {
                        countdownEl.textContent = "PREDICTIONS LOCKED!";
                        countdownEl.classList.add("locked-msg");
                        timerBox.style.borderLeftColor = "#dc3545";
                        disablePredictionForm();
                        clearInterval(timerInterval);
                        if (localCountdownInterval) clearInterval(localCountdownInterval);
                    } else {
                        updateCountdown(data.time_left);
                    }
                })
                .catch(err => console.error("Error fetching lock status:", err));
        };
        
        checkStatus();
        // Poll lock status every 10 seconds to sync time
        timerInterval = setInterval(checkStatus, 10000);
    }

    function updateCountdown(secondsLeft) {
        if (localCountdownInterval) clearInterval(localCountdownInterval);

        if (secondsLeft <= 0) {
            countdownEl.textContent = "PREDICTIONS LOCKED!";
            countdownEl.classList.add("locked-msg");
            disablePredictionForm();
            return;
        }
        
        const targetTime = Date.now() + (secondsLeft * 1000);
        
        const tick = () => {
            const now = Date.now();
            const diff = targetTime - now;
            
            if (diff <= 0 || isLocked) {
                countdownEl.textContent = "PREDICTIONS LOCKED!";
                countdownEl.classList.add("locked-msg");
                disablePredictionForm();
                if (localCountdownInterval) clearInterval(localCountdownInterval);
                return;
            }
            
            const totalSeconds = Math.round(diff / 1000);
            const days = Math.floor(totalSeconds / (3600 * 24));
            const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const secs = Math.floor(totalSeconds % 60);
            
            countdownEl.textContent = `${days}d ${hours}h ${minutes}m ${secs}s`;
        };
        
        tick();
        localCountdownInterval = setInterval(tick, 1000);
    }

    function disablePredictionForm() {
        // Disable all inputs in the form
        const inputs = predictionForm.querySelectorAll("input, button[type='submit']");
        inputs.forEach(input => {
            input.disabled = true;
        });
        submitBtn.textContent = "Predictions Locked";
        submitBtn.classList.remove("btn-primary");
        submitBtn.classList.add("btn-secondary");
    }

    // --- Load Rosters & Populate Form ---

    async function loadRosters() {
        try {
            const res = await fetch("/api/rosters");
            const rosters = await res.json();
            
            buildScorersList(rosters.Mexico.Outfield, mxScorersList, "mx_scorer");
            buildScorersList(rosters["South Africa"].Outfield, saScorersList, "sa_scorer");
            
            buildGoaliesList(rosters.Mexico.Goalies, mxGoaliesList, "mx_goalie");
            buildGoaliesList(rosters["South Africa"].Goalies, saGoaliesList, "sa_goalie");
            
            // Draw starting lineups on the soccer field graphic
            renderStartingLineupsOnField(rosters);
        } catch (err) {
            console.error("Failed to load rosters:", err);
        }
    }

    function buildScorersList(players, container, prefix) {
        container.innerHTML = "";
        players.forEach((player, index) => {
            const id = `${prefix}-${index}`;
            const div = document.createElement("div");
            div.className = "checklist-item";
            const starterBadge = player.is_starter 
                ? '<span class="badge starter-badge">Starter</span>' 
                : '<span class="badge bench-badge">Bench</span>';
            div.innerHTML = `
                <input type="checkbox" id="${id}" value="${player.name}" name="goal_scorers">
                <label for="${id}">
                    <span>${player.name} <span class="player-pos">(${player.position})</span></span>
                    ${starterBadge}
                </label>
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
            const starterBadge = goalie.is_starter 
                ? '<span class="badge starter-badge">Starter</span>' 
                : '<span class="badge bench-badge">Bench</span>';
            div.innerHTML = `
                <div class="goalie-info">
                    <span>${goalie.name} <span class="player-pos">(${goalie.string})</span></span>
                    ${starterBadge}
                </div>
                <input type="number" id="${id}" name="save-${goalie.name}" min="0" value="0" class="saves-input">
            `;
            container.appendChild(div);
        });
    }

    // --- Fetch & Fill User Predictions ---

    function loadUserPredictions(ldap) {
        fetch(`/api/predictions/${ldap}`)
            .then(res => res.json())
            .then(data => {
                if (data.found) {
                    const preds = data.predictions;
                    
                    // 1. Scores
                    if (preds.scores) {
                        document.getElementById("pred-mx-1st").value = preds.scores.mexico_1st || 0;
                        document.getElementById("pred-sa-1st").value = preds.scores.south_africa_1st || 0;
                        document.getElementById("pred-mx-2nd").value = preds.scores.mexico_2nd || 0;
                        document.getElementById("pred-sa-2nd").value = preds.scores.south_africa_2nd || 0;
                        document.getElementById("pred-mx-final").value = preds.scores.mexico_final || 0;
                        document.getElementById("pred-sa-final").value = preds.scores.south_africa_final || 0;
                    }
                    
                    // 2. Goal Scorers
                    if (preds.goal_scorers) {
                        preds.goal_scorers.forEach(player => {
                            const checkbox = document.querySelector(`input[value="${player}"][name="goal_scorers"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                    
                    // 3. Goalie Saves
                    if (preds.goalie_saves) {
                        Object.entries(preds.goalie_saves).forEach(([goalie, saves]) => {
                            const input = document.querySelector(`input[name="save-${goalie}"]`);
                            if (input) input.value = saves;
                        });
                    }
                }
            })
            .catch(err => console.error("Error loading user predictions:", err));
    }

    // --- Submit Predictions ---

    predictionForm.addEventListener("submit", (e) => {
        e.preventDefault();
        
        if (isLocked) {
            alert("Predictions are locked. You cannot submit now.");
            return;
        }

        const ldap = localStorage.getItem("tmeg_ldap");
        if (!ldap) return;

        // Gather Scores
        const scores = {
            mexico_1st: parseInt(document.getElementById("pred-mx-1st").value) || 0,
            south_africa_1st: parseInt(document.getElementById("pred-sa-1st").value) || 0,
            mexico_2nd: parseInt(document.getElementById("pred-mx-2nd").value) || 0,
            south_africa_2nd: parseInt(document.getElementById("pred-sa-2nd").value) || 0,
            mexico_final: parseInt(document.getElementById("pred-mx-final").value) || 0,
            south_africa_final: parseInt(document.getElementById("pred-sa-final").value) || 0
        };

        // Gather Scorers
        const goalScorers = [];
        const mxScorersCount = document.querySelectorAll('#mexico-scorers-list input[name="goal_scorers"]:checked').length;
        const saScorersCount = document.querySelectorAll('#sa-scorers-list input[name="goal_scorers"]:checked').length;

        // Airtight Submit Validation
        formError.classList.add("hidden");
        formSuccess.classList.add("hidden");

        if (mxScorersCount > scores.mexico_final) {
            formError.textContent = `Validation Error: You selected ${mxScorersCount} Mexico goal scorers, but you only predicted ${scores.mexico_final} goals. Please reduce your selected scorers.`;
            formError.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        if (saScorersCount > scores.south_africa_final) {
            formError.textContent = `Validation Error: You selected ${saScorersCount} South Africa goal scorers, but you only predicted ${scores.south_africa_final} goals. Please reduce your selected scorers.`;
            formError.classList.remove("hidden");
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        document.querySelectorAll('input[name="goal_scorers"]:checked').forEach(cb => {
            goalScorers.push(cb.value);
        });

        // Gather Goalie Saves
        const goalieSaves = {};
        document.querySelectorAll('.saves-input').forEach(input => {
            const goalieName = input.name.replace("save-", "");
            goalieSaves[goalieName] = parseInt(input.value) || 0;
        });

        const payload = {
            ldap: ldap,
            predictions: {
                scores: scores,
                goal_scorers: goalScorers,
                goalie_saves: goalieSaves
            }
        };

        fetch("/api/predictions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                formSuccess.textContent = data.message;
                formSuccess.classList.remove("hidden");
                // Refresh leaderboard immediately to account for new participant
                updateLeaderboard();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                formError.textContent = data.message;
                formError.classList.remove("hidden");
            }
        })
        .catch(err => {
            console.error("Error submitting predictions:", err);
            formError.textContent = "An error occurred while saving your predictions. Please try again.";
            formError.classList.remove("hidden");
        });
    });

    // --- Leaderboard Sync ---

    function updateLeaderboard() {
        fetch("/api/leaderboard")
            .then(res => res.json())
            .then(data => {
                leaderboardTableBody.innerHTML = "";
                if (data.length === 0) {
                    leaderboardTableBody.innerHTML = `
                        <tr>
                            <td colspan="3" class="text-center">No predictions submitted yet. Be the first!</td>
                        </tr>
                    `;
                    return;
                }
                data.forEach(entry => {
                    const row = document.createElement("tr");
                    // Highlight logged in user
                    const currentLdap = localStorage.getItem("tmeg_ldap");
                    if (entry.ldap === currentLdap) {
                        row.style.fontWeight = "bold";
                        row.style.borderLeft = "4px solid var(--primary-color)";
                    }
                    row.innerHTML = `
                        <td>${entry.rank}</td>
                        <td>${entry.ldap}</td>
                        <td><strong>${entry.score}</strong></td>
                    `;
                    leaderboardTableBody.appendChild(row);
                });
            })
            .catch(err => console.error("Error loading leaderboard:", err));
    }

    // --- Leaderboard Click & Modal Logic ---

    leaderboardTableBody.addEventListener("click", (e) => {
        const row = e.target.closest("tr");
        if (!row) return;
        
        // Find LDAP in the second td
        const ldapCell = row.cells[1];
        if (ldapCell) {
            const ldap = ldapCell.textContent.trim();
            // Don't trigger if it's the "No predictions" placeholder row
            if (ldap && !ldap.startsWith("No predictions")) {
                openPredictionModal(ldap);
            }
        }
    });

    function openPredictionModal(ldap) {
        const modal = document.getElementById("prediction-modal");
        const modalTitle = document.getElementById("modal-user-title");
        const modalDetails = document.getElementById("modal-prediction-details");
        const myLdap = localStorage.getItem("tmeg_ldap") || "";
        
        modalTitle.textContent = `Predictions for ${ldap}`;
        modalDetails.innerHTML = "<p class='text-center'>Loading predictions...</p>";
        modal.classList.remove("hidden");
        
        fetch(`/api/predictions/${ldap}?viewer=${encodeURIComponent(myLdap)}`)
            .then(res => res.json())
            .then(data => {
                if (!data.found) {
                    modalDetails.innerHTML = "<p class='text-center error-msg'>No predictions found for this user.</p>";
                    return;
                }
                
                if (data.hidden) {
                    modalDetails.innerHTML = `
                        <div class="locked-overlay text-center">
                            <div class="locked-icon" style="font-size: 3.5rem; margin-bottom: 15px;">🔒</div>
                            <h3 style="margin-bottom: 10px; color: var(--primary-color)">Predictions Hidden</h3>
                            <p style="color: #666; max-width: 300px; margin: 0 auto; font-size: 0.9rem;">${data.message}</p>
                        </div>
                    `;
                    return;
                }
                
                const preds = data.predictions;
                
                // Format goal scorers list
                const scorersHtml = preds.goal_scorers.length === 0 
                    ? "<em>No goal scorers predicted.</em>" 
                    : preds.goal_scorers.map(player => `<span class="badge position-badge" style="margin-bottom: 5px;">${player}</span>`).join(" ");
                
                // Format goalie saves list
                const savesHtml = Object.entries(preds.goalie_saves).map(([goalie, saves]) => `
                    <li style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eee;">
                        <span>${goalie}</span>
                        <strong>${saves} saves</strong>
                    </li>
                `).join("");

                let html = `
                    <div class="modal-section" style="margin-bottom: 20px;">
                        <h4 style="color: var(--primary-color); border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 12px;">Goals Predictions</h4>
                        <table class="modal-table" style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                            <thead>
                                <tr style="background-color: #f8f9fa;">
                                    <th style="padding: 6px 8px; text-align: left; border-bottom: 1px solid #dee2e6;">Segment</th>
                                    <th style="padding: 6px 8px; text-align: center; border-bottom: 1px solid #dee2e6; color: var(--primary-color);">MX</th>
                                    <th style="padding: 6px 8px; text-align: center; border-bottom: 1px solid #dee2e6; color: #495057;">SA</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">First Half</td>
                                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold;">${preds.scores.mexico_1st}</td>
                                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold;">${preds.scores.south_africa_1st}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px; border-bottom: 1px solid #eee;">Second Half</td>
                                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold;">${preds.scores.mexico_2nd}</td>
                                    <td style="padding: 8px; text-align: center; border-bottom: 1px solid #eee; font-weight: bold;">${preds.scores.south_africa_2nd}</td>
                                </tr>
                                <tr style="background-color: rgba(245, 196, 0, 0.05);">
                                    <td style="padding: 8px; font-weight: bold;">Final Score</td>
                                    <td style="padding: 8px; text-align: center; font-weight: 800; color: var(--primary-color);">${preds.scores.mexico_final}</td>
                                    <td style="padding: 8px; text-align: center; font-weight: 800; color: #495057;">${preds.scores.south_africa_final}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="modal-section" style="margin-bottom: 20px;">
                        <h4 style="color: var(--primary-color); border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 12px;">Goal Scorers predicted</h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${scorersHtml}
                        </div>
                    </div>
                    
                    <div class="modal-section">
                        <h4 style="color: var(--primary-color); border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 12px;">Goalie Saves predicted</h4>
                        <ul style="list-style: none; padding-left: 0; margin: 0; font-size: 0.9rem;">
                            ${savesHtml}
                        </ul>
                    </div>
                `;
                modalDetails.innerHTML = html;
            })
            .catch(err => {
                console.error("Error fetching modal predictions:", err);
                modalDetails.innerHTML = "<p class='text-center error-msg'>An error occurred while loading predictions.</p>";
            });
    }

    // Close Modal Event Listeners
    document.querySelector(".close-modal-btn").addEventListener("click", () => {
        document.getElementById("prediction-modal").classList.add("hidden");
    });
    
    window.addEventListener("click", (e) => {
        const modal = document.getElementById("prediction-modal");
        if (e.target === modal) {
            modal.classList.add("hidden");
        }
    });

    // --- Soccer Field Lineup Rendering Logic ---

    function renderStartingLineupsOnField(rosters) {
        const container = document.getElementById("field-players-container");
        if (!container) return;
        container.innerHTML = "";
        
        const MEXICO_COORDS = {
            goalies: [{ x: 50, y: 92 }],
            defenders: [{ x: 15, y: 81 }, { x: 38, y: 83 }, { x: 62, y: 83 }, { x: 85, y: 81 }],
            midfielders: [{ x: 23, y: 67 }, { x: 50, y: 72 }, { x: 77, y: 67 }],
            forwards: [{ x: 18, y: 56 }, { x: 50, y: 55 }, { x: 82, y: 56 }]
        };

        const SA_COORDS = {
            goalies: [{ x: 50, y: 8 }],
            defenders: [{ x: 15, y: 19 }, { x: 38, y: 17 }, { x: 62, y: 17 }, { x: 85, y: 19 }],
            midfielders: [{ x: 23, y: 33 }, { x: 50, y: 28 }, { x: 77, y: 33 }],
            forwards: [{ x: 18, y: 44 }, { x: 50, y: 45 }, { x: 82, y: 44 }]
        };

        // Render Mexico (bottom half)
        const mxStarters = getStartersCategorized(rosters.Mexico);
        renderTeamOnField(mxStarters, MEXICO_COORDS, "mx-dot", container);

        // Render South Africa (top half)
        const saStarters = getStartersCategorized(rosters["South Africa"]);
        renderTeamOnField(saStarters, SA_COORDS, "sa-dot", container);
    }

    function getStartersCategorized(teamRoster) {
        const starters = {
            goalies: [],
            defenders: [],
            midfielders: [],
            forwards: []
        };

        // Goalies
        teamRoster.Goalies.forEach(g => {
            if (g.is_starter) starters.goalies.push(g.name);
        });

        // Outfield
        teamRoster.Outfield.forEach(p => {
            if (p.is_starter) {
                const pos = p.position.toLowerCase();
                if (pos.includes("def")) {
                    starters.defenders.push(p.name);
                } else if (pos.includes("mid")) {
                    starters.midfielders.push(p.name);
                } else if (pos.includes("for") || pos.includes("striker") || pos.includes("wing")) {
                    starters.forwards.push(p.name);
                }
            }
        });

        return starters;
    }

    function renderTeamOnField(starters, coords, dotClass, container) {
        const placeGroup = (players, positionsCoords) => {
            players.forEach((player, idx) => {
                const coord = positionsCoords[idx];
                if (!coord) return; // Safeguard if roster structure changes

                const playerEl = document.createElement("div");
                playerEl.className = "field-player";
                playerEl.style.left = `${coord.x}%`;
                playerEl.style.top = `${coord.y}%`;

                const displayName = getFieldDisplayName(player);

                playerEl.innerHTML = `
                    <div class="player-dot ${dotClass}" title="${player}"></div>
                    <div class="player-name-label">${displayName}</div>
                `;
                container.appendChild(playerEl);
            });
        };

        placeGroup(starters.goalies, coords.goalies);
        placeGroup(starters.defenders, coords.defenders);
        placeGroup(starters.midfielders, coords.midfielders);
        placeGroup(starters.forwards, coords.forwards);
    }

    function getFieldDisplayName(fullName) {
        const parts = fullName.split(" ");
        if (parts.length === 1) return fullName;
        if (parts.length === 2) {
            return `${parts[0].charAt(0)}. ${parts[1]}`;
        }
        return `${parts[0].charAt(0)}. ${parts[parts.length - 1]}`;
    }

    // --- Collapsible Rules Toggle ---
    const rulesToggle = document.getElementById("rules-toggle");
    const rulesCard = document.getElementById("rules-card");
    const rulesIcon = document.querySelector("#rules-toggle .toggle-icon");

    if (rulesToggle && rulesCard) {
        rulesToggle.addEventListener("click", () => {
            const isCollapsed = rulesCard.classList.toggle("collapsed");
            rulesIcon.textContent = isCollapsed ? "▼" : "▲";
        });
    }

    // --- App Init ---
    initAuth();
    updateLeaderboard();
    
    // Poll Leaderboard every 15 seconds
    leaderboardInterval = setInterval(updateLeaderboard, 15000);
});
