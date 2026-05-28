// ============================================================
// student_dashboard.js — Complete merged JS
// ============================================================

const API_BASE      = 'http://localhost:5002/api';
const API           = 'http://localhost:5002/api';
const studentEmail  = localStorage.getItem('userEmail') || localStorage.getItem('studentEmail') || '';
const studentNameLS = localStorage.getItem('userName')  || localStorage.getItem('studentName')  || 'Student';

// ── Sidebar & nav ──────────────────────────────────────────
document.getElementById('menuBtn').addEventListener('click', () =>
  document.getElementById('leftSidebar').classList.toggle('active'));

document.getElementById('settings-link').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('settings-submenu').classList.toggle('show');
});

function scrollToEl(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('open-quiz-link').addEventListener('click', e => {
  e.preventDefault(); showSection('quiz-sec'); loadQuizOrResult();
});
document.getElementById('open-mentor-link').addEventListener('click', e => {
  e.preventDefault(); showSection('mentor-sec'); loadMentorSection();
});
document.getElementById('open-notifs-link').addEventListener('click', e => {
  e.preventDefault(); scrollToEl('smart-notifs-sec'); loadSmartNotifs();
});

function showSection(id) {
  ['quiz-sec', 'mentor-sec'].forEach(s =>
    document.getElementById(s).style.display = (s === id) ? 'block' : 'none');
  document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

// ── Bell ───────────────────────────────────────────────────
function toggleBell() {
  const d = document.getElementById('bell-dropdown');
  d.style.display = d.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', e => {
  const nc = document.querySelector('.notification-container');
  if (nc && !nc.contains(e.target))
    document.getElementById('bell-dropdown').style.display = 'none';
});

// ── Smart Notifications ────────────────────────────────────
let _lastNotifTotal = -1;
async function loadSmartNotifs() {
  try {
    const res  = await fetch(`${API_BASE}/smart-notifications/all-grouped`);
    const data = await res.json();
    if (!data.success) return;
    const { high, medium, low } = data.notifications;
    const counts = data.counts;
    // Play sound if new notifications arrived
    if (_lastNotifTotal >= 0 && counts.total > _lastNotifTotal) playNotificationSound();
    _lastNotifTotal = counts.total;
    document.getElementById('stat-notifs').textContent     = counts.total || 0;
    document.getElementById('cnt-high-chip').textContent   = counts.high;
    document.getElementById('cnt-medium-chip').textContent = counts.medium;
    document.getElementById('cnt-low-chip').textContent    = counts.low;
    document.getElementById('cnt-high').textContent   = `(${counts.high})`;
    document.getElementById('cnt-medium').textContent = `(${counts.medium})`;
    document.getElementById('cnt-low').textContent    = `(${counts.low})`;
    renderNotifList('ns-high',   high,   'high');
    renderNotifList('ns-medium', medium, 'medium');
    renderNotifList('ns-low',    low,    'low');
  } catch (e) {
    document.getElementById('ns-high').innerHTML =
      '<p style="color:#dc3545;font-size:13px;padding:10px;">Server offline or no notifications yet.</p>';
  }
}

function renderNotifList(containerId, notifs, type) {
  const el = document.getElementById(containerId);
  if (!notifs || !notifs.length) {
    el.innerHTML = '<p style="color:#888;font-size:13px;padding:10px;">No notifications in this category.</p>';
    return;
  }
  el.innerHTML = notifs.map(n => `
    <div class="notif-item ni-${type}">
      <div style="font-size:13px;">${n.message}</div>
      ${n.imageUrl ? `<img src="${n.imageUrl}" style="max-width:100%;max-height:160px;border-radius:8px;margin-top:8px;" alt="Poster">` : ''}
      <div class="ni-meta">
        📤 ${n.sentBy || 'System'} &nbsp;·&nbsp; 🕐 ${timeAgo(n.createdAt)}
        ${(n.detectedKeywords || []).slice(0,4).map(k => `<span class="kw-tag kw-${type}">#${k}</span>`).join('')}
      </div>
    </div>`).join('');
}

function switchNotifTab(type, btn) {
  document.querySelectorAll('.ntab').forEach(t => t.className = 'ntab');
  btn.classList.add(`tab-${type}`);
  document.querySelectorAll('.notif-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`ns-${type}`).classList.add('active');
}

// ── Quiz ───────────────────────────────────────────────────
let allAnswers = {}, questionsArr = [];

async function loadQuizOrResult() {
  try {
    const res  = await fetch(`${API_BASE}/mentor-system/student-profile/${studentEmail}`);
    const data = await res.json();
    if (data.success && data.profile.hasCompletedQuestionnaire) {
      showResultView(data.profile); return;
    }
  } catch { }
  document.getElementById('quiz-intro').style.display  = 'block';
  document.getElementById('quiz-form').style.display   = 'none';
  document.getElementById('quiz-result').style.display = 'none';
}

async function startQuiz() {
  document.getElementById('quiz-intro').style.display = 'none';
  document.getElementById('quiz-form').style.display  = 'block';
  try {
    const res  = await fetch(`${API_BASE}/mentor-system/questionnaire`);
    const data = await res.json();
    questionsArr = data.questionnaire;
    renderQuestions(questionsArr);
  } catch { showToast('Failed to load questions. Check server.'); }
}

function renderQuestions(questions) {
  let html = '', domain = '';
  const icons = { Academic:'📚', Discipline:'⏰', Communication:'💬', 'Self-Study':'🔍' };
  questions.forEach(q => {
    if (q.domain !== domain) {
      domain = q.domain;
      html += `<div class="domain-label">${icons[domain]||''} ${domain} (Q${q.id}–${Math.min(q.id+9,40)})</div>`;
    }
    html += `
      <div class="q-card" id="qc-${q.id}">
        <div class="q-text"><span class="q-num">${q.id}.</span>${q.text}</div>
        <div class="rating-row">
          ${[1,2,3,4,5].map(v => `<button class="rbtn" onclick="pickAnswer(${q.id},${v},this)">${v}</button>`).join('')}
        </div>
        <div class="rating-hint"><span>Never</span><span>Rarely</span><span>Sometimes</span><span>Often</span><span>Always</span></div>
      </div>`;
  });
  document.getElementById('quiz-questions').innerHTML = html;
}

function pickAnswer(qid, val, btn) {
  document.querySelectorAll(`#qc-${qid} .rbtn`).forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById(`qc-${qid}`).classList.add('answered');
  allAnswers[qid] = val;
  const pct = (Object.keys(allAnswers).length / questionsArr.length) * 100;
  document.getElementById('quiz-progress').style.width = pct + '%';
  document.getElementById('quiz-submit-btn').disabled  = Object.keys(allAnswers).length < questionsArr.length;
}

async function submitQuiz() {
  const btn = document.getElementById('quiz-submit-btn');
  btn.disabled = true; btn.textContent = 'Analyzing...';
  const answersArray = Array.from({length:40}, (_, i) => allAnswers[i+1]);
  const sName = document.getElementById('welcome').textContent.replace('Welcome, ','').replace(' 👩‍🎓','') || studentNameLS;
  try {
    const res  = await fetch(`${API_BASE}/mentor-system/analyze-student`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body:   JSON.stringify({ studentEmail, studentName: sName, answers: answersArray })
    });
    const data = await res.json();
    if (data.success) {
      const mentorName = data.assignedMentor?.name;
      showToast(mentorName ? `✅ Mentor assigned: ${mentorName}` : `✅ Level: ${data.level}`);
      showResultView({ totalScore: data.score, level: data.level, scoreBreakdown: data.breakdown, assignedMentor: data.assignedMentor });
      updateStatCards(data.score, data.level, mentorName);
      renderMentorCard({ totalScore: data.score, level: data.level, scoreBreakdown: data.breakdown, assignedMentor: data.assignedMentor, hasCompletedQuestionnaire: true });
    } else throw new Error(data.error);
  } catch (e) {
    showToast('Error: ' + e.message);
    btn.disabled = false; btn.textContent = 'Submit Assessment';
  }
}

function showResultView(profile) {
  document.getElementById('quiz-intro').style.display  = 'none';
  document.getElementById('quiz-form').style.display   = 'none';
  document.getElementById('quiz-result').style.display = 'block';
  const lvlColors = { Low:'#dc3545', Medium:'#fd7e14', High:'#28a745' };
  const lvlClass  = { Low:'lc-low',  Medium:'lc-medium', High:'lc-high' };
  const b     = profile.scoreBreakdown || {};
  const color = lvlColors[profile.level] || '#007bff';
  document.getElementById('quiz-result').innerHTML = `
    <div class="result-box">
      <div class="result-top">
        <div class="score-circle" style="border-color:${color};">
          <span class="sc-val" style="color:${color};">${profile.totalScore}</span>
          <span class="sc-sub">/100</span>
        </div>
        <div>
          <div style="font-size:17px;font-weight:700;color:#007bff;">Assessment Complete!</div>
          <div style="margin-top:6px;">Level: <span class="level-chip ${lvlClass[profile.level]}">${profile.level}</span></div>
          ${profile.assignedMentor ? `<div style="margin-top:8px;font-size:13px;color:#28a745;font-weight:600;">✅ Mentor: ${profile.assignedMentor.name}</div>` : ''}
          <button class="btn-primary" style="background:#007bff;color:#fff;margin-top:10px;padding:8px 16px;" onclick="retakeQuiz()">Retake</button>
        </div>
      </div>
      ${Object.keys(b).length ? `
        <div style="font-weight:700;color:#007bff;margin-bottom:10px;">📊 Score Breakdown</div>
        <div class="result-breakdown">
          ${Object.entries(b).map(([k,v]) => `
            <div class="bd-item">
              <div class="bd-label">${k.charAt(0).toUpperCase()+k.slice(1)}</div>
              <div class="bd-bar-wrap"><div class="bd-bar-fill" style="width:${v}%"></div></div>
              <div class="bd-val">${v}<span style="color:#999;font-size:11px;">/100</span></div>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
}

function retakeQuiz() {
  allAnswers = {};
  document.getElementById('quiz-intro').style.display  = 'block';
  document.getElementById('quiz-result').style.display = 'none';
  document.getElementById('quiz-form').style.display   = 'none';
}

function updateStatCards(score, level, mentorName) {
  if (score) document.getElementById('stat-score').textContent = score;
  if (level) {
    const el = document.getElementById('stat-level');
    el.textContent = level;
    el.style.color = {Low:'#dc3545',Medium:'#fd7e14',High:'#28a745'}[level] || '#007bff';
  }
  if (mentorName) document.getElementById('stat-mentor').textContent = mentorName;
}

// ── Mentor Section ─────────────────────────────────────────
async function loadMentorSection() {
  const container = document.getElementById('mentor-card-container');
  container.innerHTML = '<p style="color:#666;font-size:13px;">Loading...</p>';
  try {
    if (!studentEmail) throw new Error('Not logged in');
    const res  = await fetch(`${API_BASE}/mentor-system/student-profile/${encodeURIComponent(studentEmail)}`);
    if (!res.ok) throw new Error('Profile API error');
    const data = await res.json();
    renderMentorCard(data.profile);
  } catch (err) {
    container.innerHTML = `<p style="color:#dc3545;font-size:13px;">Could not load mentor info: ${err.message}</p>`;
  }
}

function renderMentorCard(profile) {
  const container = document.getElementById('mentor-card-container');
  if (!container) return;

  if (!profile) {
    container.innerHTML = `
      <div class="no-mentor-box">
        <p style="font-size:24px;">📋</p>
        <p style="margin-top:8px;">Complete the questionnaire to get started.</p>
        <button class="btn-msg" style="margin-top:12px;" onclick="showSection('quiz-sec');loadQuizOrResult()">Take Assessment</button>
      </div>`;
    return;
  }

  if (!profile.hasCompletedQuestionnaire) {
    container.innerHTML = `
      <div class="no-mentor-box">
        <p style="font-size:24px;">📋</p>
        <p style="margin-top:8px;">You haven't completed the questionnaire yet.<br>Complete it to get a mentor assigned.</p>
        <button class="btn-msg" style="margin-top:12px;" onclick="showSection('quiz-sec');loadQuizOrResult()">Take Assessment →</button>
      </div>`;
    return;
  }

  const level  = profile.level || '—';
  const score  = profile.totalScore ?? '—';
  const mentor = profile.assignedMentor;
  const lvlColor = level === 'Low' ? '#dc3545' : level === 'Medium' ? '#fd7e14' : '#28a745';
  const pilClass = `lp-${(level||'low').toLowerCase()}`;

  const bd = profile.scoreBreakdown || {};
  const breakdownHTML = Object.entries({
    Academic: bd.academic, Discipline: bd.discipline,
    Communication: bd.communication, 'Self-Study': bd.selfStudy
  }).filter(([,v]) => v !== undefined).map(([label, val]) => `
    <div style="margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#6c757d;margin-bottom:2px;">
        <span>${label}</span><span>${val}%</span>
      </div>
      <div style="background:#e9ecef;border-radius:99px;height:5px;">
        <div style="width:${val}%;background:${val>=70?'#28a745':val>=40?'#fd7e14':'#dc3545'};height:5px;border-radius:99px;"></div>
      </div>
    </div>`).join('');

  if (!mentor) {
    container.innerHTML = `
      <div class="mentor-assigned-card" style="border-left-color:${lvlColor};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
          <div style="font-size:32px;">👤</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:700;color:#2c3e50;">No mentor assigned yet</div>
            <div style="font-size:13px;color:#6c757d;margin-top:2px;">Your admin will assign one soon.</div>
          </div>
          <span class="level-pill ${pilClass}">${level} · ${score}/100</span>
        </div>
        <div>${breakdownHTML}</div>
      </div>`;
    return;
  }

  const initials = (mentor.name||'M').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  document.getElementById(
'stat-mentor'
).textContent =
mentor.name || '✓';

  container.innerHTML = `
    <div class="mentor-assigned-card">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="mentor-avatar-circle">${initials}</div>
        <div style="flex:1;min-width:0;">
          <div class="mentor-name-text">👨‍🏫 ${mentor.name}</div>
          <div class="mentor-detail">📚 ${mentor.subject || 'General'}</div>
          <div class="mentor-detail">📧 <a href="mailto:${mentor.email}" style="color:#007bff;text-decoration:none;">${mentor.email}</a></div>
          ${mentor.phone ? `<div class="mentor-detail">📞 ${mentor.phone}</div>` : ''}
        </div>
        <span class="level-pill ${pilClass}">${level} · ${score}/100</span>
      </div>
      <div style="margin-bottom:14px;">${breakdownHTML}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-call" onclick="openCallModal('${mentor.name.replace(/'/g,"\\'")}')">📞 Call</button>
        <button class="btn-msg"  onclick="showToast('📨 Message feature coming soon!')">✉️ Message</button>
      </div>
      <div style="font-size:11px;color:#adb5bd;margin-top:10px;">Mentor auto-assigned based on your assessment score</div>
    </div>`;
}

function openCallModal(name) {
  document.getElementById('call-mentor-name').textContent = name;
  document.getElementById('call-modal').classList.add('show');
}
function closeCallModal() {
  document.getElementById('call-modal').classList.remove('show');
  showToast('📞 Call ended');
}



// ── Sound ──────────────────────────────────────────────────
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
document.addEventListener('click', () => { try { _getAudioCtx(); } catch {} }, { once: true });

function playNotificationSound() {
  try {
    const ctx   = _getAudioCtx();
    const osc1  = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1); gain1.connect(ctx.destination);
    osc1.type = 'sine'; osc1.frequency.value = 880;
    gain1.gain.setValueAtTime(0.4, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.25);
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.type = 'sine'; osc2.frequency.value = 1100;
    gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.50);
    osc2.start(ctx.currentTime + 0.18); osc2.stop(ctx.currentTime + 0.50);
  } catch (err) { console.warn('playNotificationSound error:', err.message); }
}

// ── Utilities ──────────────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs/24)}d ago`;
}

function formatDT(t) {
  try { return new Date(t).toLocaleString(); } catch { return ''; }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Fetch Student Info ─────────────────────────────────────
async function fetchStudentInfo(studentId) {
  const profileDiv = document.getElementById('student-info');
  const welcome    = document.getElementById('welcome');
  const res = await fetch(`http://localhost:5002/students/${studentId}`);
  if (!res.ok) throw new Error('Failed to load student profile.');
  const student = await res.json();
  localStorage.setItem('student',   JSON.stringify(student));
  localStorage.setItem('userEmail', student.email    || '');
  localStorage.setItem('userName',  student.fullName || student.name || '');
  localStorage.setItem('section',   student.section  || '');
  if (welcome)    welcome.textContent = `Welcome, ${student.fullName || student.name} 👩‍🎓`;
  if (profileDiv) profileDiv.innerHTML = `
    <h3>👤 My Profile</h3>
    <p><strong>Name:</strong> ${student.fullName || student.name}</p>
    <p><strong>Email:</strong> ${student.email}</p>
    <p><strong>Section:</strong> ${student.section}</p>
    ${student.universityId ? `<p><strong>ID:</strong> ${student.universityId}</p>` : ''}`;
  return student;
}

// ── Announcements ──────────────────────────────────────────
async function fetchAnnouncements() {
  const list = document.getElementById('announcement-list');
  if (!list) return;
  try {
    const res = await fetch(`${API_BASE}/announcements`);
    if (!res.ok) throw new Error('announcements API error');
    const announcements = await res.json();
    list.innerHTML = '';
    if (!announcements.length) { list.innerHTML = '<li>No announcements right now.</li>'; return; }
    announcements.forEach(a => {
      const li = document.createElement('li');
      const posterHtml = a.imageUrl
        ? `<div style="margin-top:10px;"><img src="${a.imageUrl}" alt="Poster" style="max-width:100%;max-height:220px;border-radius:10px;border:2px solid #dde8ff;display:block;cursor:pointer;object-fit:cover;" onclick="window.open('${a.imageUrl}','_blank')" onerror="this.style.display='none'" /><div style="font-size:11px;color:#aaa;margin-top:4px;">🖼️ Click image to view full size</div></div>`
        : '';
      li.innerHTML = `<strong>${a.teacherName}:</strong> ${a.message}${posterHtml}<br><small>Posted ${new Date(a.createdAt).toLocaleString()}</small>`;
      list.appendChild(li);
    });
  } catch (e) {
    list.innerHTML = '<li>Could not load announcements.</li>';
  }
}

// ── Bell Notifications ─────────────────────────────────────
async function fetchStoredNotifications(studentId) {
  const bellList = document.getElementById('bell-dropdown');
  const badge    = document.getElementById('bell-badge');
  if (!bellList || !badge) return;
  try {
    const res = await fetch(`${API_BASE}/student/${studentId}/notifications`);
    if (!res.ok) throw new Error('notifications API error');
    const notifications = await res.json();
    bellList.innerHTML = '';
    if (!notifications.length) { bellList.innerHTML = '<li>No new notifications</li>'; badge.style.display = 'none'; return; }
    notifications.forEach(n => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${n.title}</strong><br>${n.message}<br><small>${new Date(n.timestamp).toLocaleString()}</small>`;
      bellList.appendChild(li);
    });
    badge.textContent = notifications.length; badge.style.display = 'inline-block';
  } catch { }
}

// ── Load Subjects for Attendance ───────────────────────────
async function loadSubjects(studentId) {
  const subSelect = document.getElementById('subSelect');
  if (!subSelect) return;
  try {
    const res    = await fetch(`http://localhost:5002/students/${studentId}/timetable`);
    const classes = await res.json();
    const unique  = [...new Set(classes.map(c => c.subject))].filter(Boolean).sort();
    subSelect.innerHTML = '';
    unique.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s; subSelect.appendChild(opt);
    });
  } catch { }
}

// ── Subject Attendance % ───────────────────────────────────
async function refreshSubjectPercent() {
  const subSelect   = document.getElementById('subSelect');
  const fromDate    = document.getElementById('fromDate');
  const toDate      = document.getElementById('toDate');
  const subjectStat = document.getElementById('subjectStat');
  const studentId   = localStorage.getItem('studentId');
  if (!subSelect || !subjectStat || !studentId) return;
  const subject = subSelect.value;
  if (!subject) { subjectStat.textContent = '—'; return; }
  const params = new URLSearchParams({ studentId, subject });
  if (fromDate?.value) params.append('from', fromDate.value);
  if (toDate?.value)   params.append('to',   toDate.value);
  try {
    const res  = await fetch(`${API_BASE}/attendance/subject-percent?` + params.toString());
    const data = await res.json();
    subjectStat.textContent = `${subject}: ${data.percent ?? 0}%  (Present: ${data.presents ?? 0}/${data.total ?? 0})`;
  } catch { }
}

// ── Recent Attendance ──────────────────────────────────────
async function loadRecentAttendance(studentId) {
  const ul = document.getElementById('att-list');
  if (!ul) return;
  ul.innerHTML = `<li class="att-item">Loading…</li>`;
  try {
    const res  = await fetch(`${API_BASE}/attendance/recent/${studentId}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    renderRecentAttendance(await res.json());
  } catch { ul.innerHTML = `<li class="att-item">Could not load attendance.</li>`; }
}

function renderRecentAttendance(rows) {
  const ul = document.getElementById('att-list');
  if (!ul) return;
  ul.innerHTML = '';
  if (!rows?.length) { ul.innerHTML = `<li class="att-item">No records yet</li>`; return; }
  rows.forEach((r, i) => {
    const li = document.createElement('li');
    li.className = `att-item ${r.status === 'present' ? 'att-present' : 'att-absent'}`;
    li.innerHTML = `<div><strong>${r.subject}</strong> (${r.classGroup || '—'}) — <b>${r.status.toUpperCase()}</b></div><div class="meta">${formatDT(r.markedAt)} · ${r.startTime || ''}</div>`;
    ul.appendChild(li);
    setTimeout(() => li.classList.add('in'), 30 + i * 30);
  });
}

function prependRecentAttendance(item) {
  const ul = document.getElementById('att-list');
  if (!ul) return;
  const li = document.createElement('li');
  li.className = `att-item ${item.status === 'present' ? 'att-present' : 'att-absent'}`;
  li.innerHTML = `<div><strong>${item.subject}</strong> (${item.classGroup || '—'}) — <b>${item.status.toUpperCase()}</b></div><div class="meta">${formatDT(item.markedAt)} · ${item.startTime || ''}</div>`;
  ul.prepend(li);
  requestAnimationFrame(() => li.classList.add('in'));
  const nodes = ul.querySelectorAll('.att-item');
  if (nodes.length > 10) ul.removeChild(nodes[nodes.length - 1]);
}

// ── Socket.IO ──────────────────────────────────────────────
function initSocketListeners(classGroup) {
  if (typeof io === 'undefined') return;
  const socket = io('http://localhost:5002', { transports: ['websocket', 'polling'] });

  socket.on('new-announcement', (data) => {
    playNotificationSound();
    fetchAnnouncements().catch(() => {});
    showToast(`📢 New announcement from ${data.teacherName}`);
  });

  socket.on('attendance-updated', (data) => {
    const myId = String(localStorage.getItem('studentId') || '');
    if (!data || String(data.studentId) !== myId) return;
    playNotificationSound();
    refreshSubjectPercent().catch(() => {});
    prependRecentAttendance(data);
    showToast(`✅ Attendance: ${data.subject} → ${String(data.status).toUpperCase()}`);
  });

  socket.on('timetable-update', (data) => {
    showToast(`🗓️ ${data.message}`);
  });

  socket.on('mentor-assigned', (data) => {
    const myId = String(localStorage.getItem('studentId') || '');
    if (data.studentId && String(data.studentId) !== myId) return;
    playNotificationSound();
    showToast(`👨‍🏫 Mentor assigned: ${data.mentorName}`);
    loadMentorSection().catch(() => {});
  });
}

// ── DOMContentLoaded — Main Init ───────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const studentId = localStorage.getItem('studentId');
  if (!studentId) { window.location.href = 'login.html'; return; }

  // Load student info first (sets welcome name + profile)
  let student = null;
  try { student = await fetchStudentInfo(studentId); }
  catch (err) { console.error('fetchStudentInfo failed:', err); }

  const section = student?.section || localStorage.getItem('section') || '';
  initSocketListeners(section);

  // Load everything else
  try { await fetchAnnouncements(); }            catch (e) { console.warn(e); }
  try { await fetchStoredNotifications(studentId); } catch (e) { console.warn(e); }
  try { await loadSubjects(studentId); }         catch (e) { console.warn(e); }
  try { await refreshSubjectPercent(); }         catch (e) { console.warn(e); }
  try { await loadRecentAttendance(studentId); } catch (e) { console.warn(e); }
  try { await loadSmartNotifs(); }               catch (e) { console.warn(e); }

  // Load quiz/mentor stat cards
  if (studentEmail) {
    try {
      const res  = await fetch(`${API_BASE}/mentor-system/student-profile/${studentEmail}`);
      const data = await res.json();
      if (data.success && data.profile) {
        const p = data.profile;
        if (p.totalScore) updateStatCards(p.totalScore, p.level, p.assignedMentor?.name);
      }
    } catch { }
  }

  // Auto-refresh every 2 minutes
  setInterval(() => {
    fetchAnnouncements().catch(() => {});
    fetchStoredNotifications(studentId).catch(() => {});
    loadSmartNotifs().catch(() => {});
  }, 2 * 60 * 1000);
});