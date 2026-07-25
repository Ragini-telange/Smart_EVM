// ===== public.js — PUBLIC PAGE ONLY =====
// Hides per-party vote counts. Shows only total + turnout.
// Enforces election timer — shows CLOSED if time expired.

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  updateClock();
  setInterval(updateClock, 1000);
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  loadConfig();
  applyLabels();

  // Check election state
  checkElectionState();

  if (appState.electionEndTime) startElectionTimerDisplay();

  if (config.channel && config.apiKey) {
    fetchPublicData();
    setInterval(fetchPublicData, (config.interval || 30) * 1000);
  } else {
    const notice = document.getElementById('no-config-notice');
    if (notice) notice.style.display = 'flex';
    setStatus('Not configured', false);
  }
});

// ---- ELECTION STATE CHECK ----
function checkElectionState() {
  const now = new Date();
  const ended = appState.electionEnded;
  const timerExpired = appState.electionEndTime && now > appState.electionEndTime;

  if (ended || timerExpired) {
    // Show post-election view
    showClosedState();
  } else if (appState.electionEndTime) {
    // Election is scheduled and running
    showOpenState();
  } else {
    // No timer set — show the active voting section by default
    showOpenState();
  }
}

function showClosedState() {
  const closedBanner = document.getElementById('closed-banner');
  const openBanner = document.getElementById('open-banner');
  const confirmSection = document.getElementById('confirm-section');
  const postSection = document.getElementById('post-election-section');
  const liveBadge = document.getElementById('live-badge');

  if (closedBanner) closedBanner.style.display = 'block';
  if (openBanner) openBanner.style.display = 'none';
  if (confirmSection) confirmSection.style.display = 'none';
  if (postSection) postSection.style.display = 'block';
  if (liveBadge) { liveBadge.style.background = '#ff3860'; liveBadge.querySelector('span:last-child').textContent = 'CLOSED'; }

  // Update post-election stats (totals only, NO per-party breakdown)
  updatePostStats();
}

function showOpenState() {
  const closedBanner = document.getElementById('closed-banner');
  const openBanner = document.getElementById('open-banner');
  const confirmSection = document.getElementById('confirm-section');
  const postSection = document.getElementById('post-election-section');

  if (closedBanner) closedBanner.style.display = 'none';
  if (openBanner) openBanner.style.display = 'block';
  if (confirmSection) confirmSection.style.display = 'block';
  if (postSection) postSection.style.display = 'none';
}

function updatePostStats() {
  const total = appState.votes.reduce((a, b) => a + b, 0);
  const reg = config.totalVoters || 100;
  const pct = Math.min(Math.round((total / reg) * 100), 100);
  setEl('post-total', total);
  setEl('post-turnout', pct + '%');
  setEl('post-candidates', config.labels.length);
}

// ---- FETCH PUBLIC DATA (total only, no per-party display) ----
async function fetchPublicData() {
  if (!config.channel || !config.apiKey) return;
  setStatus('Fetching…', null);
  try {
    const url = `https://api.thingspeak.com/channels/${config.channel}/feeds/last.json?api_key=${config.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const v = [
      parseFloat(data.field1) || 0,
      parseFloat(data.field2) || 0,
      parseFloat(data.field3) || 0,
    ];
    const total = v.reduce((a, b) => a + b, 0);
    const ts = data.created_at ? new Date(data.created_at).toLocaleString() : '—';

    // Detect new votes (for success notification)
    let newVoteDetected = false;
    for (let i = 0; i < 3; i++) {
      if (v[i] > appState.votes[i] && appState.votes[i] !== 0) {
        const diff = v[i] - appState.votes[i];
        for (let d = 0; d < diff; d++) {
          const hash = generateVoteHash(i);
          appState.voteHashes.unshift(hash);
        }
        saveHashes();
        newVoteDetected = true;
        // Show generic "vote recorded" toast — NOT which party
        showToast('✅ New Vote Recorded', `A new vote has been securely counted. Total: ${total}`, 'success');
      }
    }

    appState.prevVotes = [...appState.votes];
    appState.votes = v;

    // Update ONLY total counts on public page
    setEl('total-votes', total);
    updateTurnout(total);
    setStatus('Online · Updated', true);

    // Re-check election state after data update
    checkElectionState();
    if (appState.electionEnded || (appState.electionEndTime && new Date() > appState.electionEndTime)) {
      updatePostStats();
    }

  } catch (err) {
    setStatus('Fetch Error', false);
  }
}

// ---- TIMER: auto-close election when timer expires ----
const _origStartTimer = window.startElectionTimerDisplay;
function startElectionTimerDisplay() {
  if (!appState.electionEndTime) return;
  const divider = document.getElementById('timer-divider');
  const item = document.getElementById('timer-item');
  if (divider) divider.style.display = '';
  if (item) item.style.display = '';

  if (appState.timerInterval) clearInterval(appState.timerInterval);
  appState.timerInterval = setInterval(() => {
    const diff = appState.electionEndTime - new Date();
    if (diff <= 0) {
      setEl('election-timer', 'ENDED');
      clearInterval(appState.timerInterval);
      // Auto-switch to closed state
      showClosedState();
    } else {
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setEl('election-timer', `${pad(h)}:${pad(m)}:${pad(s)}`);
    }
  }, 1000);
}

// ---- PUBLIC VOTE VERIFICATION (shows "vote counted" but NOT which party) ----
function publicVerifyVote() {
  doPublicVerify('pub-verify-input', 'pub-verify-result');
}
function publicVerifyVote2() {
  doPublicVerify('pub-verify-input-2', 'pub-verify-result-2');
}
function doPublicVerify(inputId, resultId) {
  const input = document.getElementById(inputId);
  const result = document.getElementById(resultId);
  if (!input || !result) return;
  const val = input.value.trim().toUpperCase();
  if (!val) { result.textContent = 'Please enter your Hash ID.'; result.className = 'pub-verify-result'; return; }

  const found = appState.voteHashes.find(h => h.id === val);
  if (found) {
    result.className = 'pub-verify-result success';
    // Do NOT show which party — just confirm it was counted
    result.innerHTML = `
      ✅ <strong>VOTE VERIFIED &amp; COUNTED</strong><br/><br/>
      Hash ID: <strong>${found.id}</strong><br/>
      Recorded At: <strong>${new Date(found.timestamp).toLocaleString()}</strong><br/>
      <span style="color:var(--green);font-size:0.85em">Your vote has been securely recorded in the system.</span>
    `;
  } else {
    result.className = 'pub-verify-result fail';
    result.innerHTML = `❌ <strong>NOT FOUND</strong><br/><br/>Hash <strong>${val}</strong> was not found in the records of this session.<br/><span style="font-size:0.85em;opacity:0.7">If you voted, please contact the election officer.</span>`;
  }
}
