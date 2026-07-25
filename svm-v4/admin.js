// ===== admin.js — ADMIN PAGE ONLY =====

const ADMIN_SESSION_KEY = 'svm_admin_session';

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  updateClock();
  setInterval(updateClock, 1000);

  loadConfig();

  // Check if already logged in this session
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === '1') {
    showAdminContent();
  }

  // Enter key on login
  const passInput = document.getElementById('login-pass');
  if (passInput) {
    passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    setTimeout(() => passInput.focus(), 200);
  }
});

// =============================================
// LOGIN / LOGOUT
// =============================================
function doLogin() {
  const val = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  if (val === config.adminPass) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    err.textContent = '';
    showAdminContent();
  } else {
    err.textContent = '✕ Incorrect password. Try again.';
    document.getElementById('login-pass').value = '';
    document.getElementById('login-pass').focus();
    // Shake effect
    const box = document.querySelector('.login-box');
    box.style.animation = 'none';
    void box.offsetWidth;
    box.style.animation = 'shake 0.4s ease';
  }
}

function doLogout() {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  location.reload();
}

function showAdminContent() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-content').classList.remove('hidden');

  applyLabels();
  loadFormValues();
  initCharts();
  renderHashTable();

  if (config.channel && config.apiKey) {
    fetchAllData();
    startAutoRefresh();
    logEntry('Admin panel ready. Fetching live data…', 'info');
  } else {
    setStatus('Configure ThingSpeak first', false);
    switchTab('config');
    logEntry('No ThingSpeak config. Please go to Config tab.', 'error');
  }

  if (appState.electionEndTime) {
    startElectionTimerDisplay();
    const td = document.getElementById('timer-display');
    if (td) td.textContent = appState.electionEndTime.toLocaleString();
  }
  updateTimerStatus();
}

// Shake animation for wrong password
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }`;
document.head.appendChild(shakeStyle);

// =============================================
// TABS
// =============================================
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const btn = document.getElementById(`tab-${name}`);
  const content = document.getElementById(`tab-content-${name}`);
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  // Refresh hash table when switching to verify tab
  if (name === 'verify') renderHashTable();
}

// =============================================
// CONFIG
// =============================================
function loadFormValues() {
  setInputVal('cfg-channel', config.channel);
  setInputVal('cfg-apikey', config.apiKey);
  setInputVal('cfg-p1', config.labels[0]);
  setInputVal('cfg-p2', config.labels[1]);
  setInputVal('cfg-p3', config.labels[2]);
  setInputVal('cfg-interval', config.interval);
  setInputVal('cfg-voters', config.totalVoters);
}

function setInputVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

function saveConfig() {
  const ch = document.getElementById('cfg-channel').value.trim();
  const ak = document.getElementById('cfg-apikey').value.trim();
  if (!ch || !ak) { showToast('Error', 'Channel ID and API Key are required!', 'error'); return; }

  const newPass = document.getElementById('cfg-newpass').value;
  config = {
    channel: ch,
    apiKey: ak,
    labels: [
      document.getElementById('cfg-p1').value.trim() || 'Party A',
      document.getElementById('cfg-p2').value.trim() || 'Party B',
      document.getElementById('cfg-p3').value.trim() || 'Party C',
    ],
    interval: Math.max(parseInt(document.getElementById('cfg-interval').value)||30, 10),
    adminPass: newPass || config.adminPass,
    totalVoters: parseInt(document.getElementById('cfg-voters').value)||100,
  };

  localStorage.setItem('svm_config', JSON.stringify(config));
  applyLabels();
  showToast('Saved', `Channel ${ch} configured. Refresh: ${config.interval}s`, 'success');
  logEntry(`Config saved. Channel: ${ch}`, 'info');
  startAutoRefresh();
  fetchAllData();
  switchTab('dashboard');
}

// =============================================
// VERIFY VOTE
// =============================================
function verifyVote() {
  const input = document.getElementById('verify-input');
  if (!input) return;
  const val = input.value.trim().toUpperCase();
  const result = document.getElementById('verify-result');
  if (!val) { result.textContent = 'Please enter a Hash ID.'; result.className = 'verify-result'; return; }

  const found = appState.voteHashes.find(h => h.id === val);
  if (found) {
    result.className = 'verify-result success';
    result.innerHTML = `
      ✅ VOTE VERIFIED<br><br>
      Hash ID: <strong>${found.id}</strong><br>
      Party Voted: <strong>${found.partyName}</strong><br>
      Recorded At: <strong>${new Date(found.timestamp).toLocaleString()}</strong>
    `;
  } else {
    result.className = 'verify-result fail';
    result.innerHTML = `❌ NOT FOUND<br><br>Hash <strong>${val}</strong> was not found in the records of this session.`;
  }
}

// Also allow Enter key in verify input
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('verify-input') === document.activeElement) {
    verifyVote();
  }
});

function renderHashTable() {
  const tbody = document.getElementById('hash-table-body');
  if (!tbody) return;
  if (appState.voteHashes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No votes recorded yet in this session</td></tr>';
    return;
  }
  tbody.innerHTML = appState.voteHashes.map((h, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="hash-id-cell">${h.id}</td>
      <td class="party-cell-${h.party}">${h.partyName}</td>
      <td class="time-cell">${new Date(h.timestamp).toLocaleString()}</td>
    </tr>
  `).join('');
}

// =============================================
// EXPORT PDF
// =============================================
function exportPDF() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const total = appState.votes.reduce((a,b)=>a+b,0);

    doc.setFillColor(8,12,16);
    doc.rect(0,0,210,38,'F');
    doc.setTextColor(0,255,136);
    doc.setFontSize(20); doc.setFont('helvetica','bold');
    doc.text('SMART VOTING MACHINE', 18,16);
    doc.setFontSize(9); doc.setTextColor(180,200,220);
    doc.text('Official Election Results Report', 18,25);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 18,32);

    doc.setTextColor(30,30,30);
    doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text('Election Summary', 18,52);
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.text(`Channel: ${config.channel}`, 18,62);
    doc.text(`Total Votes: ${total}`, 18,70);
    doc.text(`Registered Voters: ${config.totalVoters}`, 18,78);
    doc.text(`Voter Turnout: ${Math.round((total/config.totalVoters)*100)}%`, 18,86);

    doc.setFontSize(13); doc.setFont('helvetica','bold');
    doc.text('Results by Party', 18,100);

    const colors = [[0,200,100],[0,150,220],[200,160,0]];
    appState.votes.forEach((v, i) => {
      const y = 112 + i * 26;
      const pct = total > 0 ? Math.round((v/total)*100) : 0;
      doc.setFillColor(...colors[i]); doc.rect(18,y-6,3,18,'F');
      doc.setFontSize(12); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
      doc.text(config.labels[i], 26, y+2);
      doc.setFont('helvetica','normal'); doc.setFontSize(11);
      doc.text(`${v} votes  (${pct}%)`, 26, y+10);
      doc.setFillColor(220,230,240); doc.rect(108,y-1,78,7,'F');
      doc.setFillColor(...colors[i]); doc.rect(108,y-1,pct*0.78,7,'F');
    });

    // Winner
    const maxV = Math.max(...appState.votes);
    const wIdx = appState.votes.indexOf(maxV);
    doc.setFillColor(240,255,245);
    doc.rect(18,194,174,18,'F');
    doc.setTextColor(0,140,70); doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text(`Winner: ${config.labels[wIdx]} with ${maxV} votes (${Math.round(maxV/total*100)}%)`, 24, 207);

    // Hash summary
    if (appState.voteHashes.length > 0) {
      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
      doc.text(`Vote Records (last ${Math.min(appState.voteHashes.length,10)})`, 18, 224);
      appState.voteHashes.slice(0,10).forEach((h, i) => {
        const y = 232 + i * 8;
        doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
        doc.text(`${h.id}  →  ${h.partyName}  |  ${new Date(h.timestamp).toLocaleString()}`, 18, y);
      });
    }

    doc.setFontSize(8); doc.setTextColor(160,160,160);
    doc.text('Generated by Smart Voting Machine Dashboard — ESP32 + ThingSpeak IoT', 18, 285);

    doc.save(`voting-results-${Date.now()}.pdf`);
    showToast('PDF Exported', 'Results report downloaded', 'success');
    logEntry('PDF exported', 'success');
  } catch(e) {
    showToast('PDF Error', e.message, 'error');
  }
}

// =============================================
// EXPORT EXCEL
// =============================================
function exportExcel() {
  try {
    const total = appState.votes.reduce((a,b)=>a+b,0);
    const data = [
      ['Smart Voting Machine — Results Report'],
      ['Generated', new Date().toLocaleString()],
      ['Channel ID', config.channel],
      ['Registered Voters', config.totalVoters],
      [],
      ['Party','Votes','Percentage','Turnout %'],
      ...appState.votes.map((v,i) => [
        config.labels[i], v,
        total>0?`${Math.round((v/total)*100)}%`:'0%',
        `${Math.round((v/config.totalVoters)*100)}%`
      ]),
      [],['TOTAL', total,'100%',`${Math.round((total/config.totalVoters)*100)}%`],
      [],
      ['Vote Hash Log'],['Hash ID','Party','Timestamp'],
      ...appState.voteHashes.map(h=>[h.id, h.partyName, new Date(h.timestamp).toLocaleString()]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:32},{wch:12},{wch:14},{wch:14}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `voting-results-${Date.now()}.xlsx`);
    showToast('Excel Exported', 'Spreadsheet downloaded', 'success');
    logEntry('Excel exported', 'success');
  } catch(e) {
    showToast('Excel Error', e.message, 'error');
  }
}

// =============================================
// EXPORT CSV
// =============================================
function exportCSV() {
  const total = appState.votes.reduce((a,b)=>a+b,0);
  const rows = [
    ['Party','Votes','Percentage'],
    ...appState.votes.map((v,i)=>[config.labels[i],v,total>0?`${Math.round(v/total*100)}%`:'0%']),
    ['TOTAL',total,'100%'],
  ];
  const csv = rows.map(r=>r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download = `voting-results-${Date.now()}.csv`;
  a.click();
  showToast('CSV Exported', 'Data file downloaded', 'success');
  logEntry('CSV exported', 'success');
}

// =============================================
// EMAIL REPORT
// =============================================
function sendEmailReport() {
  const email = document.getElementById('admin-email').value.trim();
  if (!email) { showToast('Error', 'Enter an email address first', 'error'); return; }
  const total = appState.votes.reduce((a,b)=>a+b,0);
  const wIdx = appState.votes.indexOf(Math.max(...appState.votes));
  const subject = encodeURIComponent('Smart Voting Machine — Election Results');
  const body = encodeURIComponent(
`SMART VOTING MACHINE — OFFICIAL RESULTS
Generated: ${new Date().toLocaleString()}
Channel: ${config.channel}
==========================================
RESULTS:
${appState.votes.map((v,i)=>`${config.labels[i]}: ${v} votes (${total>0?Math.round(v/total*100):0}%)`).join('\n')}

TOTAL VOTES: ${total}
REGISTERED VOTERS: ${config.totalVoters}
VOTER TURNOUT: ${Math.round(total/config.totalVoters*100)}%
WINNER: ${config.labels[wIdx]} with ${appState.votes[wIdx]} votes
--
Generated by Smart Voting Machine Dashboard`
  );
  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  showToast('Email Prepared', 'Your email client will open', 'info');
}

// =============================================
// CANDIDATE PHOTOS
// =============================================
function setCandidateImage(idx, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const url = e.target.result;
    // Save to localStorage
    const imgs = JSON.parse(localStorage.getItem('svm_images')||'[]');
    imgs[idx] = url;
    localStorage.setItem('svm_images', JSON.stringify(imgs));
    // Update previews
    ['photo-'+idx, 'cand-preview-'+idx].forEach(pid => {
      const el = document.getElementById(pid);
      if (el) el.innerHTML = `<img src="${url}" alt=""/>`;
    });
    showToast('Photo Saved', `Image set for ${config.labels[idx]}`, 'success');
    logEntry(`Candidate photo updated: ${config.labels[idx]}`, 'info');
  };
  reader.readAsDataURL(file);
}

// =============================================
// ELECTION CONTROL
// =============================================
function setElectionTimer() {
  const val = document.getElementById('end-time-input').value;
  if (!val) { showToast('Error', 'Please select an end date and time', 'error'); return; }
  const newEndTime = new Date(val);
  if (newEndTime <= new Date()) {
    showToast('Error', 'End time must be in the future!', 'error');
    return;
  }
  appState.electionEndTime = newEndTime;
  appState.electionEnded = false; // re-open if previously closed
  localStorage.setItem('svm_end_time', appState.electionEndTime.toISOString());
  localStorage.removeItem('svm_election_ended');
  startElectionTimerDisplay();
  updateTimerStatus();
  showToast('Timer Set', `Voting window open until: ${appState.electionEndTime.toLocaleString()}`, 'success');
  logEntry(`Election timer set. Voting closes: ${appState.electionEndTime.toLocaleString()}`, 'info');
}

function clearElectionTimer() {
  appState.electionEndTime = null;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  localStorage.removeItem('svm_end_time');
  setEl('election-timer', '—');
  const divider = document.getElementById('timer-divider');
  const item = document.getElementById('timer-item');
  if (divider) divider.style.display = 'none';
  if (item) item.style.display = 'none';
  updateTimerStatus();
  showToast('Timer Cleared', 'No voting deadline set. Voting is open indefinitely.', 'info');
  logEntry('Election timer cleared by admin', 'info');
}

function updateTimerStatus() {
  const statusEl = document.getElementById('timer-status');
  if (!statusEl) return;
  const now = new Date();
  if (appState.electionEnded) {
    statusEl.innerHTML = `<span style="color:var(--red)">🏁 ELECTION OFFICIALLY ENDED</span> — Public page shows closed state. Results hidden from voters.`;
  } else if (appState.electionEndTime && now > appState.electionEndTime) {
    statusEl.innerHTML = `<span style="color:var(--red)">⏰ TIMER EXPIRED</span> — Voting automatically closed on public page at <strong>${appState.electionEndTime.toLocaleString()}</strong>.`;
  } else if (appState.electionEndTime) {
    statusEl.innerHTML = `<span style="color:var(--green)">✅ VOTING OPEN</span> — Public page shows active voting. Closes automatically at <strong>${appState.electionEndTime.toLocaleString()}</strong>.`;
  } else {
    statusEl.innerHTML = `<span style="color:var(--yellow)">ℹ No timer set</span> — Public page shows voting as open. Set a timer to auto-close voting at a specific time.`;
  }
}

function endElection() {
  if (!confirm('End election and announce winner? The public page will switch to CLOSED state immediately.')) return;
  appState.electionEnded = true;
  localStorage.setItem('svm_election_ended', '1');
  launchConfetti();
  const v = appState.votes;
  const total = v.reduce((a,b)=>a+b,0);
  const wIdx = v.indexOf(Math.max(...v));
  const pct = total > 0 ? Math.round(v[wIdx]/total*100) : 0;
  showToast('🏁 Election Ended!', `Winner: ${config.labels[wIdx]} (${pct}%) — Public page now shows CLOSED.`, 'success');
  logEntry(`Election officially ended by admin. Winner: ${config.labels[wIdx]} with ${v[wIdx]} votes (${pct}%)`, 'info');
  updateTimerStatus();
}

function resetVoteData() {
  if (!confirm('Reset all local data? This clears vote hashes, timer, and election state. ThingSpeak data is NOT affected.')) return;
  appState.voteHashes = [];
  appState.electionEnded = false;
  appState.electionEndTime = null;
  if (appState.timerInterval) clearInterval(appState.timerInterval);
  localStorage.removeItem('svm_hashes');
  localStorage.removeItem('svm_election_ended');
  localStorage.removeItem('svm_end_time');
  renderHashTable();
  updateTimerStatus();
  setEl('election-timer', '—');
  const divider = document.getElementById('timer-divider');
  const item = document.getElementById('timer-item');
  if (divider) divider.style.display = 'none';
  if (item) item.style.display = 'none';
  showToast('Reset', 'All local data cleared. Election is now open again.', 'warn');
  logEntry('Full local data reset by admin', 'error');
}
