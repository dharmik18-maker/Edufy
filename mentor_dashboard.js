 // ── Config ─────────────────────────────────────────────
  const API      = 'http://localhost:5002/api';
  const mentorId = localStorage.getItem('mentorId') || '';
  const mentorName = localStorage.getItem('mentorName') || localStorage.getItem('teacherName') || 'Mentor';

  if (!mentorId) {
    console.warn('No mentorId in localStorage. Please log in as mentor.');
  }

  document.getElementById('mentor-name-badge').textContent = '👤 ' + mentorName;
  document.getElementById('class-subtitle').textContent    = `Welcome back, ${mentorName} — your assigned students are below.`;

  // ── State ───────────────────────────────────────────────
  let students         = [];
  let filteredStudents = [];
  let currentPage      = 1;
  const PAGE_SIZE      = 8;
  let removeTargetEmail = null;

  // ── Toast ───────────────────────────────────────────────
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
    t.className   = 'show ' + type;
    setTimeout(() => { t.className = ''; }, 3000);
  }

  // ── Tab switching ───────────────────────────────────────
  function switchTab(tab) {
    ['students','add','transfer'].forEach(t => {
      document.getElementById('panel-' + t).classList.toggle('active', t === tab);
      document.getElementById('tab-'   + t).classList.toggle('active', t === tab);
    });
    if (tab === 'transfer') populateTransferSelect();
  }

  // ── LOAD STUDENTS ───────────────────────────────────────
  // Uses GET /api/mentor-system/mentor-students/:mentorId
  // This goes through StudentProfiles (where the real assignment lives)
  // and enriches with students collection data
  async function loadStudents() {
    document.getElementById('student-tbody').innerHTML =
      `<tr><td colspan="8" class="empty-state"><div class="empty-icon">⏳</div>Loading…</td></tr>`;

    if (!mentorId) {
      document.getElementById('student-tbody').innerHTML =
        `<tr><td colspan="8" class="empty-state"><div class="empty-icon">⚠️</div>Not logged in. <a href="login.html">Login here</a>.</td></tr>`;
      return;
    }

    try {
      // This route goes: mentor.assignedStudents[] → StudentProfiles → students collection
      const res  = await fetch(`${API}/mentor-system/mentor-students/${mentorId}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || d.message || `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed to load');

      students = (data.students || []).map(s => ({
        _id:        String(s._id),
        name:       s.name    || s.email || '—',
        email:      s.email   || '—',
        rollNo:     s.rollNo  || '—',
        section:    s.section || '—',
        status:     s.status  || 'active',
        totalScore: s.totalScore || 0,
        level:      s.level   || 'Low',
        createdAt:  s.createdAt || null
      }));

    } catch (err) {
      console.error('loadStudents error:', err.message);
      document.getElementById('student-tbody').innerHTML =
        `<tr><td colspan="8" class="empty-state"><div class="empty-icon">❌</div>Could not load: ${err.message}</td></tr>`;
      return;
    }

    updateStats();
    populateSectionFilter();
    filterStudents();
  }

  // ── Stats ───────────────────────────────────────────────
  function updateStats() {
    document.getElementById('stat-total').textContent  = students.length;
    document.getElementById('stat-high').textContent   = students.filter(s => s.level === 'High').length;
    document.getElementById('stat-medium').textContent = students.filter(s => s.level === 'Medium').length;
    document.getElementById('stat-low').textContent    = students.filter(s => s.level === 'Low').length;
  }

  // ── Filters ─────────────────────────────────────────────
  function populateSectionFilter() {
    const sel      = document.getElementById('filter-section');
    const sections = [...new Set(students.map(s => s.section).filter(x => x && x !== '—'))].sort();
    sel.innerHTML  = `<option value="">All Sections</option>` +
      sections.map(s => `<option value="${s}">${s}</option>`).join('');
  }

  function filterStudents() {
    const q       = document.getElementById('search-input').value.toLowerCase();
    const level   = document.getElementById('filter-level').value;
    const section = document.getElementById('filter-section').value;

    filteredStudents = students.filter(s => {
      const matchQ    = !q     || (s.name  || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
      const matchLvl  = !level || s.level === level;
      const matchSec  = !section || s.section === section;
      return matchQ && matchLvl && matchSec;
    });
    currentPage = 1;
    renderTable();
  }

  // ── Render table ────────────────────────────────────────
  function renderTable() {
    const tbody      = document.getElementById('student-tbody');
    const totalPages = Math.ceil(filteredStudents.length / PAGE_SIZE);
    const start      = (currentPage - 1) * PAGE_SIZE;
    const page       = filteredStudents.slice(start, start + PAGE_SIZE);

    if (!page.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">👤</div>No students found.</div></td></tr>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    const avatarColors = ['#007bff','#28a745','#fd7e14','#6f42c1','#e83e8c','#20c997'];

    tbody.innerHTML = page.map((s, i) => {
      const initials = (s.name || 'S').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color    = avatarColors[(s.name||'').charCodeAt(0) % avatarColors.length];
      const joined   = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
      const lvlBadge = `<span class="badge badge-${(s.level||'low').toLowerCase()}">${s.level || 'Low'}</span>`;
      return `
        <tr id="row-${s._id}" class="adding">
          <td style="color:var(--muted);font-size:12px;font-weight:600">${start+i+1}</td>
          <td>
            <div class="student-info">
              <div class="avatar" style="background:${color}">${initials}</div>
              <div>
                <div class="student-name">${s.name  || '—'}</div>
                <div class="student-email">${s.email || '—'}</div>
              </div>
            </div>
          </td>
          <td><span class="badge badge-section">${s.rollNo  || '—'}</span></td>
          <td><span class="badge badge-section">${s.section || '—'}</span></td>
          <td style="font-weight:700;color:var(--primary)">${s.totalScore ?? '—'}</td>
          <td>${lvlBadge}</td>
          <td style="font-size:12px;color:var(--muted)">${joined}</td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-outline btn-sm" onclick="openEditModal('${s._id}')">✏️ Edit</button>
              <button class="btn btn-danger  btn-sm" onclick="openRemoveModal('${s._id}')">🗑️ Remove</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Pagination
    const pag = document.getElementById('pagination');
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    pag.innerHTML = `
      <button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>
      ${Array.from({length:totalPages},(_,i)=>
        `<button class="page-btn ${i+1===currentPage?'active':''}" onclick="goPage(${i+1})">${i+1}</button>`
      ).join('')}
      <button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?'disabled':''}>›</button>`;
  }

  function goPage(p) {
    const total = Math.ceil(filteredStudents.length / PAGE_SIZE);
    if (p < 1 || p > total) return;
    currentPage = p; renderTable();
  }

  // ── ADD STUDENT ─────────────────────────────────────────
  async function addStudent() {
    const name    = document.getElementById('add-name').value.trim();
    const roll    = document.getElementById('add-roll').value.trim();
    const email   = document.getElementById('add-email').value.trim();
    const phone   = document.getElementById('add-phone').value.trim();
    const section = document.getElementById('add-section').value.trim();
    const okEl    = document.getElementById('add-ok');
    const errEl   = document.getElementById('add-err');
    okEl.style.display = errEl.style.display = 'none';

    if (!name || !roll || !email || !section) {
      errEl.textContent = '⚠️ Name, Roll No, Email and Section are required.';
      errEl.style.display = 'block'; return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      errEl.textContent = '⚠️ Enter a valid email address.';
      errEl.style.display = 'block'; return;
    }

    try {
      const res  = await fetch(`${API}/register`, {
        method:  'POST',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({ fullName:name, email, password:roll, section, universityId:roll, phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      clearAddForm();
      okEl.textContent   = `✅ ${name} registered in section ${section}. Default password = roll number.`;
      okEl.style.display = 'block';
      showToast(`${name} added!`, 'success');
      await loadStudents();
      setTimeout(() => switchTab('students'), 1500);
    } catch (err) {
      errEl.textContent   = `❌ ${err.message}`;
      errEl.style.display = 'block';
      showToast(err.message, 'error');
    }
  }

  function clearAddForm() {
    ['add-name','add-roll','add-email','add-phone','add-section'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('add-status').value = 'active';
    document.getElementById('add-ok').style.display = document.getElementById('add-err').style.display = 'none';
  }

  // ── REMOVE ──────────────────────────────────────────────
  function openRemoveModal(id) {
    const s = students.find(x => x._id === id);
    if (!s) return;
    removeTargetEmail = s.email;
    document.getElementById('modal-student-name').textContent = s.name;
    document.getElementById('modal-student-info').textContent = `Roll: ${s.rollNo} | Section: ${s.section} | ${s.email}`;
    document.getElementById('remove-modal').classList.add('open');
  }
  function closeModal() {
    document.getElementById('remove-modal').classList.remove('open');
    removeTargetEmail = null;
  }

  async function confirmRemove() {
    if (!removeTargetEmail) return;
    const email = removeTargetEmail;
    closeModal();

    const s   = students.find(x => x.email === email);
    const row = s ? document.getElementById('row-' + s._id) : null;
    if (row) { row.classList.add('removing'); await sleep(400); }

    try {
      const res = await fetch(`${API}/mentor-system/unassign`, {
        method:  'DELETE',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({ studentEmail: email })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || d.message || 'Unassign failed');
      }
    } catch (err) {
      showToast('Remove failed: ' + err.message, 'error');
      await loadStudents();
      return;
    }

    students         = students.filter(x => x.email !== email);
    filteredStudents = filteredStudents.filter(x => x.email !== email);
    updateStats();
    populateSectionFilter();
    renderTable();
    showToast(`${s?.name || 'Student'} removed from your class`, 'error');
  }

  // ── EDIT ────────────────────────────────────────────────
  function openEditModal(id) {
    const s = students.find(x => x._id === id);
    if (!s) return;
    document.getElementById('edit-id').value      = id;
    document.getElementById('edit-email').value   = s.email;
    document.getElementById('edit-name').value    = s.name    || '';
    document.getElementById('edit-roll').value    = s.rollNo  || '';
    document.getElementById('edit-section').value = s.section || '';
    document.getElementById('edit-modal').classList.add('open');
  }
  function closeEditModal() { document.getElementById('edit-modal').classList.remove('open'); }

  async function saveEdit() {
    const id      = document.getElementById('edit-id').value;
    const email   = document.getElementById('edit-email').value;
    const name    = document.getElementById('edit-name').value.trim();
    const rollNo  = document.getElementById('edit-roll').value.trim();
    const section = document.getElementById('edit-section').value.trim();

    if (!name || !rollNo || !section) { showToast('Please fill all fields', 'error'); return; }

    try {
      // PATCH the student record in the students collection
      await fetch(`${API}/students/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({ fullName:name, universityId:rollNo, section })
      });
    } catch { /* non-fatal — update local state anyway */ }

    const idx = students.findIndex(x => x._id === id);
    if (idx !== -1) students[idx] = { ...students[idx], name, rollNo, section };
    updateStats(); populateSectionFilter(); filterStudents();
    closeEditModal();
    showToast(`${name} updated`, 'success');
  }

  // ── TRANSFER ────────────────────────────────────────────
  function populateTransferSelect() {
    const sel     = document.getElementById('transfer-student');
    sel.innerHTML = `<option value="">— Select Student —</option>` +
      students.map(s => `<option value="${s.email}">${s.name} (${s.rollNo}) — ${s.section}</option>`).join('');
  }

  async function transferStudent() {
    const email      = document.getElementById('transfer-student').value;
    const newSection = document.getElementById('transfer-section').value.trim();
    const okEl       = document.getElementById('transfer-ok');
    const errEl      = document.getElementById('transfer-err');
    okEl.style.display = errEl.style.display = 'none';

    if (!email)      { errEl.textContent = '⚠️ Please select a student'; errEl.style.display = 'block'; return; }
    if (!newSection) { errEl.textContent = '⚠️ Please enter the new section'; errEl.style.display = 'block'; return; }

    const s          = students.find(x => x.email === email);
    const oldSection = s?.section;

    try {
      await fetch(`${API}/students/${s?._id}`, {
        method:  'PATCH',
        headers: { 'Content-Type':'application/json' },
        body:    JSON.stringify({ section: newSection })
      });
    } catch { /* non-fatal */ }

    const idx = students.findIndex(x => x.email === email);
    if (idx !== -1) students[idx].section = newSection;
    populateSectionFilter(); filterStudents(); populateTransferSelect();
    document.getElementById('transfer-section').value = '';
    okEl.textContent   = `✅ ${s?.name} transferred: ${oldSection} → ${newSection}`;
    okEl.style.display = 'block';
    showToast(`${s?.name} transferred to ${newSection}`, 'success');
  }

  // ── Utils ───────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  document.getElementById('remove-modal').addEventListener('click', e => { if (e.target === document.getElementById('remove-modal')) closeModal(); });
  document.getElementById('edit-modal').addEventListener('click',   e => { if (e.target === document.getElementById('edit-modal'))   closeEditModal(); });

  // ── Init ────────────────────────────────────────────────
  loadStudents();