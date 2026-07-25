// ===== shared.js — used by BOTH public and admin pages =====

let config = {
  channel: '', apiKey: '',
  labels: ['Party A', 'Party B', 'Party C'],
  interval: 30,
  adminPass: 'admin123',
  totalVoters: 100,
};

let appState = {
  votes: [0, 0, 0],
  prevVotes: [0, 0, 0],
  voteHashes: [],
  electionEnded: false,
  electionEndTime: null,
  autoRefreshTimer: null,
  timerInterval: null,
};

let pieChart = null;
let lineChart = null;

// ---- CLOCK ----
function updateClock() {
  const n = new Date();
  const el = document.getElementById('clock');
  if (el) el.textContent = `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }

// ---- THEME ----
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('svm_theme', isDark ? 'light' : 'dark');
}

function applyTheme() {
  const t = localStorage.getItem('svm_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '🌙' : '☀️';
}

// ---- TOAST ----
function showToast(title, body, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-body">${body}</div>`;
  toast.onclick = () => toast.remove();
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ---- LOAD CONFIG ----
function loadConfig() {
  const s = localStorage.getItem('svm_config');
  if (s) {
    try { config = { ...config, ...JSON.parse(s) }; } catch(e) {}
  }
  const hs = localStorage.getItem('svm_hashes');
  if (hs) {
    try { appState.voteHashes = JSON.parse(hs); } catch(e) {}
  }
  const ended = localStorage.getItem('svm_election_ended');
  if (ended === '1') appState.electionEnded = true;
  const et = localStorage.getItem('svm_end_time');
  if (et) appState.electionEndTime = new Date(et);
}

function applyLabels() {
  ['name-1','name-2','name-3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = config.labels[i];
  });
  ['cand-name-0','cand-name-1','cand-name-2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = config.labels[i];
  });
  ['cand-label-0','cand-label-1','cand-label-2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = config.labels[i];
  });
  const imgs = JSON.parse(localStorage.getItem('svm_images') || '[]');
  imgs.forEach((url, i) => {
    if (url) {
      ['photo-'+i, 'cand-preview-'+i].forEach(pid => {
        const el = document.getElementById(pid);
        if (el) el.innerHTML = `<img src="${url}" alt=""/>`;
      });
    }
  });
}

// ---- FETCH DATA (admin full data) ----
async function fetchAllData() {
  if (!config.channel || !config.apiKey) {
    const el = document.getElementById('no-config-notice');
    if (el) el.style.display = 'flex';
    setStatus('Not configured', false);
    return;
  }
  setStatus('Fetching…', null);
  try {
    await fetchLatestVotes();
    await fetchHistoryForChart();
    setStatus('Online · Updated', true);
  } catch(err) {
    setStatus('Fetch Error', false);
    logEntry(`Error: ${err.message}`, 'error');
  }
}

async function fetchLatestVotes() {
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

  setEl('channel-id', config.channel);
  setEl('last-update', ts);
  setEl('total-votes', total);

  for (let i = 0; i < 3; i++) {
    if (v[i] > appState.votes[i] && appState.votes[i] !== 0) {
      const diff = v[i] - appState.votes[i];
      notifyNewVote(config.labels[i], diff, v[i]);
      for (let d = 0; d < diff; d++) {
        const hash = generateVoteHash(i);
        appState.voteHashes.unshift(hash);
        logEntry(`New vote! Hash: ${hash.id} → ${config.labels[i]}`, 'success');
      }
      saveHashes();
    }
  }

  appState.prevVotes = [...appState.votes];
  appState.votes = v;

  for (let i = 0; i < 3; i++) animateCount(`votes-${i+1}`, appState.prevVotes[i], v[i]);
  updateBars(v, total);
  updatePieChart(v);
  updateWinner(v, total);
  updateTurnout(total);

  if (appState.electionEnded) {
    const b = document.getElementById('closed-banner');
    if (b) b.style.display = 'block';
  }
}

async function fetchHistoryForChart() {
  const url = `https://api.thingspeak.com/channels/${config.channel}/feeds.json?api_key=${config.apiKey}&results=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const feeds = data.feeds || [];
  const labels = feeds.map(f => {
    const d = new Date(f.created_at);
    return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  updateLineChart(labels,
    feeds.map(f => parseFloat(f.field1)||0),
    feeds.map(f => parseFloat(f.field2)||0),
    feeds.map(f => parseFloat(f.field3)||0)
  );
}

// ---- UI HELPERS ----
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateCount(elId, from, to) {
  const el = document.getElementById(elId);
  if (!el) return;
  const steps = 28; const step = (to - from) / steps; let cur = from, i = 0;
  el.classList.remove('count-update'); void el.offsetWidth; el.classList.add('count-update');
  const t = setInterval(() => { cur += step; i++; el.textContent = Math.round(cur); if(i>=steps){el.textContent=to;clearInterval(t);} }, 18);
}

function updateBars(votes, total) {
  for (let i = 0; i < 3; i++) {
    const pct = total > 0 ? Math.round((votes[i]/total)*100) : 0;
    const bar = document.getElementById(`bar-${i+1}`);
    const pctEl = document.getElementById(`pct-${i+1}`);
    if (bar) bar.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }
}

function updateWinner(votes, total) {
  const banner = document.getElementById('winner-banner');
  if (!banner) return;
  if (total === 0) { banner.style.display = 'none'; return; }
  const maxV = Math.max(...votes);
  const wIdx = votes.indexOf(maxV);
  const pct = Math.round((maxV/total)*100);
  banner.style.display = 'flex';
  setEl('winner-text', `${config.labels[wIdx]} IS LEADING WITH ${maxV} VOTES (${pct}%)`);
}

function updateTurnout(total) {
  const reg = config.totalVoters || 100;
  const pct = Math.min(Math.round((total/reg)*100), 100);
  setEl('turnout-pct', `${pct}%`);
  setEl('turnout-numbers', `${total} / ${reg} voters`);
  const fill = document.getElementById('turnout-fill');
  if (fill) fill.style.width = `${pct}%`;
}

function setStatus(msg, ok) {
  const el = document.getElementById('sys-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : '';
}

function logEntry(msg, type = '') {
  const body = document.getElementById('log-body');
  if (!body) return;
  const el = document.createElement('div');
  el.className = `log-entry ${type}`;
  const n = new Date();
  el.innerHTML = `<span class="log-ts">[${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}]</span><span>${msg}</span>`;
  body.prepend(el);
  while (body.children.length > 80) body.removeChild(body.lastChild);
}

function clearLog() {
  const body = document.getElementById('log-body');
  if (body) { body.innerHTML = ''; logEntry('Log cleared.', 'init'); }
}

// ---- NOTIFICATIONS ----
function notifyNewVote(party, count, total) {
  const notifEl = document.getElementById('notif-enabled');
  const enabled = notifEl ? notifEl.checked : true;
  if (!enabled) return;
  showToast(`🗳 New Vote — ${party}`, `${count} new vote${count>1?'s':''} recorded! Total: ${total}`, 'success');
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🗳 Smart Voting Machine', {
      body: `${count} vote${count>1?'s':''} for ${party}! Total: ${total}`
    });
  }
}

if ('Notification' in window && Notification.permission === 'default') {
  setTimeout(() => Notification.requestPermission(), 3000);
}

// ---- VOTE HASH ----
function generateVoteHash(partyIdx) {
  const chars = 'ABCDEF0123456789';
  let id = 'VT-';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return {
    id, party: partyIdx,
    partyName: config.labels[partyIdx],
    timestamp: new Date().toISOString(),
    display: new Date().toLocaleTimeString(),
  };
}

function saveHashes() {
  if (appState.voteHashes.length > 300) appState.voteHashes = appState.voteHashes.slice(0, 300);
  localStorage.setItem('svm_hashes', JSON.stringify(appState.voteHashes));
}

// ---- CHARTS (admin only) ----
function initCharts() {
  const pieCtx = document.getElementById('pieChart');
  const lineCtx = document.getElementById('lineChart');
  if (!pieCtx || !lineCtx) return;

  pieChart = new Chart(pieCtx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: config.labels,
      datasets: [{
        data: [1,1,1],
        backgroundColor: ['rgba(0,255,136,0.7)','rgba(0,170,255,0.7)','rgba(255,215,0,0.7)'],
        borderColor: ['#00ff88','#0af','#ffd700'],
        borderWidth: 2, hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#c8d8e8', font:{family:"'IBM Plex Mono',monospace",size:11}, padding:12 } },
        tooltip: {
          callbacks:{ label: ctx => ` ${ctx.label}: ${ctx.parsed} votes` },
          backgroundColor:'#0d1117', borderColor:'#1e2d3d', borderWidth:1,
          titleColor:'#fff', bodyColor:'#c8d8e8',
          titleFont:{family:"'IBM Plex Mono',monospace"}, bodyFont:{family:"'IBM Plex Mono',monospace"},
        }
      }
    }
  });

  lineChart = new Chart(lineCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label:config.labels[0], data:[], borderColor:'#00ff88', backgroundColor:'rgba(0,255,136,0.07)', tension:0.3, fill:true, pointRadius:3, borderWidth:2 },
        { label:config.labels[1], data:[], borderColor:'#0af',    backgroundColor:'rgba(0,170,255,0.07)', tension:0.3, fill:true, pointRadius:3, borderWidth:2 },
        { label:config.labels[2], data:[], borderColor:'#ffd700', backgroundColor:'rgba(255,215,0,0.05)',  tension:0.3, fill:true, pointRadius:3, borderWidth:2 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction:{ intersect:false, mode:'index' },
      scales: {
        x: { ticks:{color:'#5a7a9a',font:{family:"'IBM Plex Mono',monospace",size:10},maxTicksLimit:8,maxRotation:45}, grid:{color:'rgba(30,45,61,0.8)'}, border:{color:'#1e2d3d'} },
        y: { ticks:{color:'#5a7a9a',font:{family:"'IBM Plex Mono',monospace",size:10},stepSize:1}, grid:{color:'rgba(30,45,61,0.8)'}, border:{color:'#1e2d3d'}, beginAtZero:true }
      },
      plugins: {
        legend:{ labels:{color:'#c8d8e8',font:{family:"'IBM Plex Mono',monospace",size:11},padding:12} },
        tooltip:{ backgroundColor:'#0d1117', borderColor:'#1e2d3d', borderWidth:1, titleColor:'#fff', bodyColor:'#c8d8e8', titleFont:{family:"'IBM Plex Mono',monospace"}, bodyFont:{family:"'IBM Plex Mono',monospace"} }
      }
    }
  });
}

function updatePieChart(votes) {
  if (!pieChart) return;
  pieChart.data.labels = config.labels;
  pieChart.data.datasets[0].data = votes;
  pieChart.update('active');
}

function updateLineChart(labels, f1, f2, f3) {
  if (!lineChart) return;
  lineChart.data.labels = labels;
  lineChart.data.datasets[0].label = config.labels[0];
  lineChart.data.datasets[0].data = f1;
  lineChart.data.datasets[1].label = config.labels[1];
  lineChart.data.datasets[1].data = f2;
  lineChart.data.datasets[2].label = config.labels[2];
  lineChart.data.datasets[2].data = f3;
  lineChart.update('active');
}

// ---- CONFETTI ----
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#00ff88','#0af','#ffd700','#ff3860','#ff9500','#ffffff'];
  const particles = Array.from({length:200}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: Math.random() * 7 + 4,
    d: Math.random() * 180,
    color: colors[Math.floor(Math.random()*colors.length)],
    tilt: Math.floor(Math.random()*10)-10,
    tiltAngle: 0,
    tiltInc: Math.random() * 0.07 + 0.05,
    vx: Math.random() * 2 - 1,
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p => {
      ctx.beginPath(); ctx.lineWidth = p.r/2; ctx.strokeStyle = p.color;
      ctx.moveTo(p.x+p.tilt+p.r/4, p.y);
      ctx.lineTo(p.x+p.tilt, p.y+p.tilt+p.r/4);
      ctx.stroke();
      p.tiltAngle += p.tiltInc;
      p.y += (Math.cos(p.d)+3+p.r/2)/2;
      p.x += p.vx;
      p.tilt = Math.sin(p.tiltAngle)*15;
      if (p.y > canvas.height) { p.y=-10; p.x=Math.random()*canvas.width; }
    });
    frame++;
    if (frame < 350) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  draw();
}

// ---- AUTO REFRESH ----
function startAutoRefresh() {
  if (appState.autoRefreshTimer) clearInterval(appState.autoRefreshTimer);
  const ms = (config.interval || 30) * 1000;
  appState.autoRefreshTimer = setInterval(fetchAllData, ms);
}

// ---- ELECTION TIMER (admin page version — full) ----
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
    } else {
      const h = Math.floor(diff/3600000);
      const m = Math.floor((diff%3600000)/60000);
      const s = Math.floor((diff%60000)/1000);
      setEl('election-timer', `${pad(h)}:${pad(m)}:${pad(s)}`);
    }
  }, 1000);
}

// ---- IS VOTING OPEN? (checks timer) ----
function isVotingOpen() {
  if (appState.electionEnded) return false;
  if (appState.electionEndTime && new Date() > appState.electionEndTime) return false;
  return true;
}
