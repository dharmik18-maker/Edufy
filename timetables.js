const days     = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName= ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

  // Highlight today's column header
  const dayIdx = days.indexOf(todayName);
  const thIds  = ['th-mon','th-tue','th-wed','th-thu','th-fri','th-sat'];
  if (dayIdx >= 0) document.getElementById(thIds[dayIdx]).style.background = '#0056b3';

  async function loadTimetable() {
    const studentId = localStorage.getItem('studentId');
    if (!studentId) { window.location.href='login.html'; return; }
    const tbody = document.getElementById('tt-body');
    try {
      const res     = await fetch(`http://localhost:5002/students/${studentId}/timetable`);
      const classes = await res.json();
      if (!classes.length) {
        tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:#888;padding:24px;">No classes scheduled yet.</td></tr>'; return;
      }
      const slots = [...new Set(classes.map(c=>`${c.startTime} - ${c.endTime}`))].sort((a,b)=>a.localeCompare(b));
      const grid  = {};
      classes.forEach(c => { const sl=`${c.startTime} - ${c.endTime}`; if(!grid[sl]) grid[sl]={}; grid[sl][c.day]=c; });
      tbody.innerHTML = slots.map(sl => `
        <tr>
          <td style="font-weight:700;color:#007bff;background:#f8faff;white-space:nowrap;">${sl}</td>
          ${days.map((d,i) => {
            const cls = grid[sl]?.[d];
            const isToday = d === todayName;
            return cls
              ? `<td class="${isToday?'today-col':''}"><div class="subj">${cls.subject}</div><div class="teacher">${cls.teacher||''}</div>${cls.roomno?`<div class="room">Room ${cls.roomno}</div>`:''}</td>`
              : `<td class="${isToday?'today-col':''}"><span class="empty-cell">—</span></td>`;
          }).join('')}
        </tr>`).join('');
    } catch(e) {
      tbody.innerHTML='<tr><td colspan="7" style="color:#dc3545;text-align:center;padding:20px;">Failed to load timetable</td></tr>';
    }
  }

  window.addEventListener('DOMContentLoaded', loadTimetable);