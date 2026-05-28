const API = 'http://localhost:5002/api';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {

  const tName = localStorage.getItem('teacherName');

  const section =
  localStorage.getItem('teacherSection') || '';
  const coordinatorSection =localStorage.getItem(
'teacherCoordinatorSection'
) || '';
const teacherSections =section
.split(',')
.map(s=>s.trim())
.filter(Boolean);
const sections =
  section
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const isCoordinator =
  localStorage.getItem('teacherIsCoordinator') === 'true';


  if (tName) {

    document.getElementById(
      'welcomeTitle'
    ).textContent =
      `Welcome, ${tName} 👨‍🏫`;

    document.getElementById(
      'notif-sender'
    ).value = tName;

  }


  // EVERY teacher can VIEW timetable
// Every teacher can VIEW timetable

const ttLink =
document.getElementById(
'sideTimetable'
);

if(ttLink){

ttLink.style.display='flex';

}


// ONLY coordinator can MANAGE timetable
if(
sections.length > 0 &&
isCoordinator
){

console.log(
'Coordinator UI Enabled'
);

initCoordinatorUI(
sections.join(', '),
tName
);

document.getElementById(
'timetable-sec'
).style.display='block';

const ttCard =
document.getElementById(
'cardTimetable'
);

if(ttCard){

ttCard.style.display='block';

}

}
else{

const ttCard =
document.getElementById(
'cardTimetable'
);

if(ttCard){

ttCard.style.display='none';

}

document.getElementById(
'timetable-sec'
).style.display='none';

}


  // Logout
  document.getElementById(
    'btnLogout'
  ).onclick = () => {

    localStorage.removeItem('teacherId');

    localStorage.removeItem('teacherName');

    localStorage.removeItem('teacherSection');

    localStorage.removeItem('teacherSubject');

    localStorage.removeItem('teacherIsCoordinator');

    location.href='login.html';

  };


  // Announcements
  const annModal =
    document.getElementById(
      'annModal'
    );

  const openAnn = () => {

    annModal.classList.add('show');

    if(window.loadAnns)
      window.loadAnns();

  };

  const closeAnn =
    ()=>annModal.classList.remove(
      'show'
    );

  document.getElementById(
    'cardPastAnns'
  ).onclick = openAnn;

  document.getElementById(
    'sideOpenAnns'
  ).onclick = e=>{

    e.preventDefault();

    openAnn();

  };

  document.getElementById(
    'annClose'
  ).onclick=closeAnn;

  document.getElementById(
    'annClose2'
  ).onclick=closeAnn;

  annModal.querySelector(
    '.modal__overlay'
  ).onclick=closeAnn;



  // Sidebar links
const notifBtn =
document.getElementById(
'sideSmartNotifs'
);

if(notifBtn){

notifBtn.onclick=e=>{

e.preventDefault();

toggleSection(
'smart-notif-sec'
);

loadSmartNotifs();

};

}



  const mentorBtn =
document.getElementById(
'sideMentorSystem'
);

if(mentorBtn){

mentorBtn.onclick=e=>{

e.preventDefault();

toggleSection(
'mentor-sys-sec'
);

loadMentors();

};

}



  const ttBtn =
document.getElementById(
'sideTimetable'
);

if(ttBtn){
ttBtn.onclick=e=>{

e.preventDefault();

toggleSection(
'teacher-view-timetable'
);

loadTeacherTimetable();

};
}

});


// ===== SECTION TOGGLE =====
function toggleSection(id) {

const el =
document.getElementById(id);

el.style.display =
el.style.display === 'none'
? 'block'
: 'none';

if(el.style.display==='block'){

el.scrollIntoView({

behavior:'smooth'

});

if(id==='smart-notif-sec')
loadSmartNotifs();

if(id==='mentor-sys-sec')
loadMentors();

if(id==='timetable-sec')
loadTimetable();

}

}
    // ===================================================================
    // ===== TIMETABLE CRUD ==============================================
    // ===================================================================

    const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

   async function loadTimetable() {

const section =
localStorage.getItem(
'teacherSection'
) || '';

const coordinatorSection =
localStorage.getItem(
'teacherCoordinatorSection'
) || '';

if (!section) return;

const sections =
section
.split(',')
.map(s => s.trim());

const tbody =
document.getElementById(
'tt-tbody'
);

tbody.innerHTML =
'<tr><td colspan="7" class="tt-empty">Loading...</td></tr>';

try {

const res = await fetch(

`${API}/timetable?section=${encodeURIComponent(

coordinatorSection || section

)}`

);

const data =
await res.json();


// Filter by coordinator section
const classes =

Array.isArray(data)

?

data.filter(c =>

(c.classGroup || '')
.trim()
.toUpperCase()

===

(coordinatorSection || section)
.toUpperCase()

)

: [];


renderTimetableTable(
classes
);

updateTTStats(
classes
);

}
catch (e) {

tbody.innerHTML =

`<tr>
<td colspan="7"
class="tt-empty"
style="color:#dc3545;">

Failed to load timetable.

</td>
</tr>`;

console.log(e);

}

}

    function renderTimetableTable(classes) {
      const tbody = document.getElementById('tt-tbody');
      if (!classes.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="tt-empty">No classes yet. Add your first class above ☝️</td></tr>';
        return;
      }

      // Sort by day order then start time
      classes.sort((a, b) => {
        const da = DAY_ORDER.indexOf(a.day);
        const db = DAY_ORDER.indexOf(b.day);
        if (da !== db) return da - db;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });

      tbody.innerHTML = classes.map(cls => `
        <tr>
          <td><span class="day-badge">${cls.day || '—'}</span></td>
          <td class="time-cell">${cls.startTime || '—'}</td>
          <td class="time-cell">${cls.endTime   || '—'}</td>
          <td class="subject-cell">${cls.subject || '—'}</td>
          <td>${cls.teacher || '—'}</td>
          <td>${cls.roomno  || '—'}</td>
          <td>
            <button class="btn btn-orange btn-sm" onclick="openEditModal('${cls._id}','${escQ(cls.day)}','${cls.startTime||''}','${cls.endTime||''}','${escQ(cls.subject)}','${escQ(cls.teacher||'')}','${escQ(cls.roomno||'')}')">
              ✏️ Edit
            </button>
            &nbsp;
            <button class="btn btn-red btn-sm" onclick="deleteTimetableClass('${cls._id}')">
              🗑️ Delete
            </button>
          </td>
        </tr>
      `).join('');
    }

    function updateTTStats(classes) {
      const statsEl = document.getElementById('ttStats');
      statsEl.style.display = 'flex';
      const days = new Set(classes.map(c => c.day).filter(Boolean));
      document.getElementById('ttTotalClasses').textContent = `${classes.length} Classes`;
      document.getElementById('ttTotalDays').textContent    = `${days.size} Days/week`;
    }

    async function addTimetableClass() {
      const section = localStorage.getItem('teacherSection') || '';
      const coordinatorSection =
localStorage.getItem(
'teacherCoordinatorSection'
) || '';
      if (!section) { showToast('No section assigned to you!', 'error'); return; }

      const day      = document.getElementById('tt-day').value.trim();
      const start    = document.getElementById('tt-start').value.trim();
      const subject  = document.getElementById('tt-subject').value.trim();
      const end      = document.getElementById('tt-end').value.trim();
      const teacher  = document.getElementById('tt-teacher').value.trim() || (localStorage.getItem('teacherName') || '');
      const room     = document.getElementById('tt-room').value.trim();

      if (!day)     { showToast('Please select a day!', 'error'); return; }
      if (!start)   { showToast('Please set a start time!', 'error'); return; }
      if (!subject) { showToast('Please enter a subject name!', 'error'); return; }

      const btn = document.getElementById('btnAddClass');
      btn.disabled = true; btn.textContent = 'Adding...';

      try {
        const res  = await fetch(`${API}/timetable`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({

day,

startTime: start,

endTime: end,

subject,

teacher,

classGroup:

coordinatorSection || section,

roomno: room

})
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to add class');

        showToast(`✅ ${subject} added on ${day}!`, 'success');
        // Clear form
        ['tt-day','tt-start','tt-end','tt-subject','tt-room'].forEach(id => {
          const el = document.getElementById(id);
          if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
        });
        loadTimetable();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = '➕ Add Class';
      }
    }

    async function deleteTimetableClass(id) {
      if (!confirm('Delete this class from the timetable?')) return;
      try {
        const res = await fetch(`${API}/timetable/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');
        showToast('🗑️ Class deleted', 'success');
        loadTimetable();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    // ===== EDIT MODAL =====
    function openEditModal(id, day, start, end, subject, teacher, room) {
      document.getElementById('edit-id').value      = id;
      document.getElementById('edit-day').value     = day;
      document.getElementById('edit-start').value   = start;
      document.getElementById('edit-end').value     = end;
      document.getElementById('edit-subject').value = subject;
      document.getElementById('edit-teacher').value = teacher;
      document.getElementById('edit-room').value    = room;
      document.getElementById('editModal').classList.add('show');
    }

    function closeEditModal() {
      document.getElementById('editModal').classList.remove('show');
    }

    async function saveEditClass() {
      const section = localStorage.getItem('teacherSection') || '';
      const id      = document.getElementById('edit-id').value;
      const day     = document.getElementById('edit-day').value.trim();
      const start   = document.getElementById('edit-start').value.trim();
      const subject = document.getElementById('edit-subject').value.trim();

      if (!day || !start || !subject) {
        showToast('Day, start time and subject are required!', 'error'); return;
      }

      try {
        const res = await fetch(`${API}/timetable/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            day,
            startTime: start,
            endTime:   document.getElementById('edit-end').value.trim(),
            subject,
            teacher:   document.getElementById('edit-teacher').value.trim(),
            classGroup:
coordinatorSection || section,
            roomno:    document.getElementById('edit-room').value.trim()
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Update failed');
        showToast('✅ Class updated!', 'success');
        closeEditModal();
        loadTimetable();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }

    // Close edit modal on overlay click
    document.getElementById('editModal').addEventListener('click', function(e) {
      if (e.target === this) closeEditModal();
    });

    // Helper to escape quotes for inline onclick attributes
    function escQ(str) {
      return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // ===== SMART NOTIFICATIONS =====
    const HIGH_KW   = ['exam','examination','test','viva','deadline','last date','urgent','important','critical','mandatory','compulsory','registration','fee','payment','alert','warning','emergency','cancelled','postponed'];
    const MEDIUM_KW = ['assignment','homework','project','submission','quiz','class','lecture','lab','schedule','timetable','seminar','workshop','event','reminder','notice','update','announcement','meeting'];

    function previewPriority(msg) {
      const lower = msg.toLowerCase();
      const el    = document.getElementById('priority-preview');
      if (!msg.trim()) { el.className = 'priority-preview'; return; }
      let p = 'Low';
      for (const k of HIGH_KW)   { if (lower.includes(k)) { p = 'High';   break; } }
      if (p !== 'High') for (const k of MEDIUM_KW) { if (lower.includes(k)) { p = 'Medium'; break; } }
      document.getElementById('preview-text').textContent = p;
      el.className = `priority-preview ${p} visible`;
    }

    async function sendSmartNotif() {
      const msg    = document.getElementById('notif-msg').value.trim();
      const sentBy = document.getElementById('notif-sender').value.trim();
      const target = document.getElementById('notif-target').value;
      if (!msg) { showToast('Please write a message!', 'error'); return; }
      const btn = document.getElementById('send-notif-btn');
      btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const res  = await fetch(`${API}/smart-notifications/send-notification`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, sentBy: sentBy || 'Teacher', targetRole: target })
        });
        const data = await res.json();
        if (data.success) {
          const emoji = { High:'🔴', Medium:'🟠', Low:'🟢' }[data.priority];
          showToast(`${emoji} Sent as ${data.priority} priority!`, 'success');
          document.getElementById('notif-msg').value = '';
          document.getElementById('priority-preview').className = 'priority-preview';
          loadSmartNotifs();
        } else throw new Error(data.error);
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Send Notification ➤'; }
    }

    async function loadSmartNotifs() {
      try {
        const res  = await fetch(`${API}/smart-notifications/all-grouped`);
        const data = await res.json();
        if (!data.success) return;
        document.getElementById('tc-high').textContent   = data.counts.high;
        document.getElementById('tc-medium').textContent = data.counts.medium;
        document.getElementById('tc-low').textContent    = data.counts.low;
        document.getElementById('tcnt-high').textContent   = `(${data.counts.high})`;
        document.getElementById('tcnt-medium').textContent = `(${data.counts.medium})`;
        document.getElementById('tcnt-low').textContent    = `(${data.counts.low})`;
        renderNList('tn-high',   data.notifications.high,   'high');
        renderNList('tn-medium', data.notifications.medium, 'medium');
        renderNList('tn-low',    data.notifications.low,    'low');
      } catch (e) {}
    }

    function renderNList(id, notifs, type) {
      const el = document.getElementById(id);
      if (!notifs?.length) { el.innerHTML = '<p style="color:#888;font-size:13px;padding:10px;">No notifications</p>'; return; }
      el.innerHTML = notifs.map(n => `
        <div class="notif-item ni-${type}">
          <div>${n.message}</div>
          <div class="ni-meta">📤 ${n.sentBy || 'System'} &nbsp;·&nbsp; 🕐 ${timeAgo(n.createdAt)}
            ${n.detectedKeywords.slice(0,3).map(k => `<span class="kw-tag kw-${type}">#${k}</span>`).join('')}
          </div>
        </div>`).join('');
    }

    function switchNTab(type, btn) {
      document.querySelectorAll('.ntab').forEach(t => t.className = 'ntab');
      btn.classList.add(`tab-${type}`);
      document.querySelectorAll('.notif-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`tn-${type}`).classList.add('active');
    }

    // ===== MENTOR SYSTEM =====
    async function createMentor() {
      const name  = document.getElementById('m-name').value.trim();
      const email = document.getElementById('m-email').value.trim();
      if (!name || !email) { showToast('Name and Email are required!', 'error'); return; }
      try {
        const res  = await fetch(`${API}/mentor-system/create-mentor`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, email,
            subject:    document.getElementById('m-subject').value.trim(),
            phone:      document.getElementById('m-phone').value.trim(),
            maxStudents: parseInt(document.getElementById('m-max').value) || 5
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`✅ Mentor ${name} created!`, 'success');
          ['m-name','m-email','m-subject','m-phone','m-max'].forEach(id => document.getElementById(id).value = '');
          loadMentors();
        } else throw new Error(data.error);
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }

    async function loadMentors() {
      const el = document.getElementById('mentor-list');
      try {
        const res  = await fetch(`${API}/mentor-system/mentors`);
        const data = await res.json();
        if (!data.success || !data.mentors.length) {
          el.innerHTML = '<p style="color:#888;font-size:13px;">No mentors created yet.</p>'; return;
        }
        el.innerHTML = `
          <table class="std-table">
            <thead><tr><th>Name</th><th>Email</th><th>Subject</th><th>Students</th><th>Action</th></tr></thead>
            <tbody>
              ${data.mentors.map(m => `
                <tr>
                  <td>${m.name}</td>
                  <td>${m.email}</td>
                  <td>${m.subject || '—'}</td>
                  <td>${m.assignedStudents?.length || 0} / ${m.maxStudents}</td>
                  <td><button class="btn" style="padding:5px 10px;font-size:12px;" onclick="loadMentorStudents('${m._id}','${escQ(m.name)}')">View Students</button></td>
                </tr>`).join('')}
            </tbody>
          </table>`;
      } catch (e) { el.innerHTML = '<p style="color:#dc3545;font-size:13px;">Failed to load mentors.</p>'; }
    }

    async function loadMentorStudents(mentorId, name) {
      document.getElementById('selected-mentor-name').textContent = name;
      document.getElementById('mentor-students-wrap').style.display = 'block';
      const tbody = document.getElementById('mentor-students-body');
      tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
      try {
        const res  = await fetch(`${API}/mentor-system/mentor/${mentorId}/students`);
        const data = await res.json();
        if (!data.success || !data.students.length) {
          tbody.innerHTML = '<tr><td colspan="4" style="color:#888;text-align:center;">No students assigned yet.</td></tr>'; return;
        }
        const lc = { Low:'lc-low', Medium:'lc-medium', High:'lc-high' };
        tbody.innerHTML = data.students.map(s => `
          <tr>
            <td>${s.studentName}</td>
            <td>${s.studentEmail}</td>
            <td>${s.totalScore ?? '—'}</td>
            <td><span class="level-chip ${lc[s.level] || ''}">${s.level || 'N/A'}</span></td>
          </tr>`).join('');
      } catch (e) { tbody.innerHTML = '<tr><td colspan="4" style="color:#dc3545;">Failed to load.</td></tr>'; }
    }

    // ===== UTILS =====
    function timeAgo(dateStr) {
      const diff = Date.now() - new Date(dateStr);
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }

    function showToast(msg, type = '') {
      const t = document.getElementById('toast');
      t.textContent = msg; t.className = `toast ${type} show`;
      setTimeout(() => t.classList.remove('show'), 3500);
    }

    // ===== ATTENDANCE glue =====
    document.addEventListener('DOMContentLoaded', () => {
      const takeBtn = document.getElementById('btnTakeAttendance');
      if (takeBtn) takeBtn.addEventListener('click', () => window.openAttendance && window.openAttendance());
    });
    // ===== COORDINATOR UI =====
function initCoordinatorUI(
section,
teacherName
){

// Banner
const banner =
document.getElementById(
'coordinatorBanner'
);

banner.style.display='flex';

document.getElementById(
'coordinatorBadge'
).textContent =
`Section ${section}`;

document.getElementById(
'coordinatorDesc'
).textContent =
`You can manage timetable for ${section}`;


// Sidebar button
const ttBtn =
document.getElementById(
'sideTimetable'
);

if(ttBtn){

ttBtn.style.display='flex';

}


const ttCard =
document.getElementById(
'cardTimetable'
);

if(ttCard){

ttCard.style.display='block';

}


// Badge
document.getElementById(
'ttSectionBadge'
).textContent =
`Section ${section}`;

}
// ===== CLASS REMINDER NOTIFICATIONS =====

let shownReminders = {};

async function checkUpcomingClasses(){

try{

const section =
localStorage.getItem(
'teacherSection'
) || '';

if(!section) return;

const teacherSections =

section
.split(',')
.map(s=>s.trim())
.filter(Boolean);


const res =
await fetch(
`${API}/timetable`
);

const data =
await res.json();

if(!Array.isArray(data)) return;


// only my sections
const myClasses =

data.filter(c =>

teacherSections.includes(

(c.classGroup || '').trim()

)

);


const now = new Date();

const currentDay = now.toLocaleDateString(
'en-US',
{ weekday:'long' }
);


myClasses.forEach(cls => {

if(cls.day !== currentDay) return;

if(!cls.startTime) return;

const [hour,minute] =
cls.startTime.split(':');

const classTime =
new Date();

classTime.setHours(hour);
classTime.setMinutes(minute);
classTime.setSeconds(0);


const diff =
(classTime - now) / 60000;


// 5 min before
if(diff > 0 && diff <= 5){

const uniqueKey =

`${cls._id}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

if(shownReminders[uniqueKey]) return;

shownReminders[uniqueKey] = true;


// browser notification
if(Notification.permission === 'granted'){

new Notification(

`Upcoming Class: ${cls.subject}`,

{

body:
`${cls.classGroup} • ${cls.startTime} • Room ${cls.roomno || 'N/A'}`

}

);

}


// toast notification
showToast(

`📚 ${cls.subject} class in ${Math.ceil(diff)} min (${cls.classGroup})`,

'success'

);

}

});

}
catch(err){

console.log(err);

}

}


// ask permission
if('Notification' in window){

Notification.requestPermission();

}


// check every 1 minute
setInterval(

checkUpcomingClasses,

60000

);


// initial check
checkUpcomingClasses();
async function loadTeacherTimetable(){

const section =
localStorage.getItem(
'teacherSection'
) || '';

if(!section) return;

const sections =
section
.split(',')
.map(s=>s.trim())
.filter(Boolean);

const select =
document.getElementById(
'teacher-tt-section'
);

if(select){

select.innerHTML = sections
.map(sec => `
<option value="${sec}">
${sec}
</option>
`)
.join('');

}

const currentSection =
select?.value || sections[0];

const tbody =
document.getElementById(
'teacher-tt-body'
);

tbody.innerHTML =
'<tr><td colspan="6">Loading...</td></tr>';

try{

const res =
await fetch(

`${API}/timetable?section=${encodeURIComponent(currentSection)}`

);

const data =
await res.json();

if(!Array.isArray(data) || !data.length){

tbody.innerHTML =
'<tr><td colspan="6">No timetable found</td></tr>';

return;

}

tbody.innerHTML = data.map(cls => `

<tr>

<td>${cls.day || '-'}</td>
<td>${cls.startTime || '-'}</td>
<td>${cls.endTime || '-'}</td>
<td>${cls.subject || '-'}</td>
<td>${cls.teacher || '-'}</td>
<td>${cls.roomno || '-'}</td>

</tr>

`).join('');

}
catch(err){

console.log(err);

tbody.innerHTML =
'<tr><td colspan="6">Failed to load timetable</td></tr>';

}

}