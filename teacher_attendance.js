"use strict";

// State
let _currentClass     = null;
let _rosterStudents   = [];
let _attendanceMap    = {};
let _savingInProgress = false;

// Boot
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("mark-all-present")?.addEventListener("click", _markAllPresent);
    document.getElementById("save-att")         ?.addEventListener("click", _saveAttendance);
    document.getElementById("close-class")      ?.addEventListener("click", _closeAndMarkAbsent);
});

window.openAttendance = async function () {
    const panel = document.getElementById("att-panel");
    if (!panel) return;

    if (panel.style.display === "block") {
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";
    panel.scrollIntoView({ behavior: "smooth" });

    const rosterWrap = document.getElementById("att-roster-wrap");
    if (rosterWrap) rosterWrap.style.display = "none";

    await _loadTodaysClasses();
};

// Timetable
async function _loadTodaysClasses() {
    const container = document.getElementById("att-classes");
    if (!container) return;

    container.innerHTML = `<p style="color:#888;font-size:13px;padding:8px 0;">⏳ Loading today's classes…</p>`;

    try {
        const res = await fetch(`${API}/timetable`);
        if (!res.ok) throw new Error("Timetable API returned " + res.status);
        const all = await res.json();

        const dayName        = _todayDayName();
        const teacherName    = (localStorage.getItem("teacherName")    || "").trim().toLowerCase();
        const teacherSection = (localStorage.getItem("teacherSection") || "").trim().toUpperCase();

        // Filter
        let todayClasses = all.filter(c =>
            (c.day || "").trim().toLowerCase() === dayName.toLowerCase()
        );

        if (teacherName) {
            const now = new Date();

const currentMinutes =
now.getHours() * 60 +
now.getMinutes();


// ONLY MY CLASSES + ACTIVE TIME
todayClasses = todayClasses.filter(c => {

const classTeacher =
(c.teacher || '')
.trim()
.toLowerCase();

if(classTeacher !== teacherName)
return false;


if(!c.startTime || !c.endTime)
return false;


const startDate =
new Date(`1970-01-01 ${c.startTime}`);

const endDate =
new Date(`1970-01-01 ${c.endTime}`);

const startMinutes =
(startDate.getHours() * 60) +
startDate.getMinutes();

const endMinutes =
(endDate.getHours() * 60) +
endDate.getMinutes() + 10;




return (
currentMinutes >= startMinutes &&
currentMinutes <= endMinutes
);

});

}

        if (!todayClasses.length) {
            container.innerHTML = `
                <div style="padding:22px;text-align:center;background:#f8faff;
                            border-radius:10px;border:1px dashed #cce0ff;">
                    <div style="font-size:32px;margin-bottom:8px;">📅</div>
                    <div style="font-weight:700;color:#007bff;margin-bottom:4px;">
                        No classes today (${dayName})
                    </div>
                    <div style="font-size:13px;color:#888;">
                        You have no scheduled classes for today.
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div style="font-size:13px;font-weight:600;color:#555;margin-bottom:12px;">
                📅 ${dayName}'s Classes — click a class to load the student list:
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;" id="class-card-row"></div>`;

        todayClasses.forEach(cls => {
            const card = document.createElement("div");
            card.dataset.classId = cls._id;
            card.style.cssText = `
                padding:14px 18px; background:#fff; border:2px solid #007bff;
                border-radius:10px; cursor:pointer; min-width:160px; max-width:230px;
                box-shadow:0 2px 8px rgba(0,123,255,.08); transition:all 0.18s;`;

            card.innerHTML = `
                <div style="font-weight:700;font-size:14px;color:#007bff;margin-bottom:5px;">
                    📚 ${cls.subject || "—"}
                </div>
                <div style="font-size:12px;color:#555;line-height:1.7;">
                    🕐 ${cls.startTime || "—"}${cls.endTime ? " – " + cls.endTime : ""}<br>
                    ${cls.classGroup ? "👥 Section " + cls.classGroup : ""}
                    ${cls.roomno    ? " · 🚪 Room " + cls.roomno   : ""}
                </div>`;

            card.addEventListener("mouseenter", () => {
                if (card.dataset.classId !== (_currentClass?._id || "")) {
                    card.style.background = "#e8f0fe";
                }
            });
            card.addEventListener("mouseleave", () => {
                if (card.dataset.classId !== (_currentClass?._id || "")) {
                    card.style.background = "#fff";
                }
            });
            card.addEventListener("click", () => _selectClass(cls, card));

            document.getElementById("class-card-row").appendChild(card);
        });

    } catch (err) {
        console.error("[AttendanceJS] _loadTodaysClasses:", err);
        container.innerHTML = `
            <div style="padding:16px;background:#fff5f5;border-radius:8px;border-left:4px solid #dc3545;">
                <strong style="color:#dc3545;">❌ Failed to load classes</strong>
                <div style="font-size:13px;color:#555;margin-top:4px;">${err.message}</div>
                <button onclick="window.openAttendance()"
                    style="margin-top:10px;padding:7px 16px;background:#007bff;color:#fff;
                           border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
                    ↻ Retry
                </button>
            </div>`;
    }
}

// Roster
async function _selectClass(cls, clickedCard) {
    _currentClass   = cls;
    _attendanceMap  = {};
    _rosterStudents = [];

    document.querySelectorAll("#class-card-row > div").forEach(c => {
        c.style.background   = "#fff";
        c.style.borderColor  = "#007bff";
        c.style.boxShadow    = "0 2px 8px rgba(0,123,255,.08)";
    });
    if (clickedCard) {
        clickedCard.style.background  = "#007bff";
        clickedCard.style.borderColor = "#0056b3";
        clickedCard.style.boxShadow   = "0 4px 16px rgba(0,123,255,.3)";
        clickedCard.querySelectorAll("div").forEach(d => { d.style.color = "#fff"; });
    }

    const rosterWrap = document.getElementById("att-roster-wrap");
    const titleEl    = document.getElementById("att-class-title");
    const tbody      = document.getElementById("att-roster");

    if (titleEl) {
        titleEl.innerHTML = `
            ✅ <span style="color:#007bff;">${cls.subject}</span>
            <span style="font-size:13px;font-weight:400;color:#666;">
                &nbsp; ${cls.startTime || ""}${cls.endTime ? " – " + cls.endTime : ""}
                ${cls.classGroup ? " &nbsp;|&nbsp; Section " + cls.classGroup : ""}
                ${cls.roomno     ? " &nbsp;|&nbsp; Room "    + cls.roomno     : ""}
            </span>`;
    }

    if (tbody) {
        tbody.innerHTML = `
            <tr><td colspan="3" style="text-align:center;padding:24px;color:#888;">
                ⏳ Loading students…
            </td></tr>`;
    }

    if (rosterWrap) {
        rosterWrap.style.display = "block";
        setTimeout(() => rosterWrap.scrollIntoView({ behavior: "smooth" }), 100);
    }

    // API
    try {
        const section = (cls.classGroup || "").trim();
        let students  = [];

        if (section) {
            const r1 = await fetch(`${API}/students?section=${encodeURIComponent(section)}`);
            if (r1.ok) {
                let d = await r1.json();
                if (d && Array.isArray(d.students)) d = d.students;
                if (Array.isArray(d)) students = d;
            }
        }
        students = students.filter(s => {

const studentSection =

(s.section || s.classGroup || '')
.trim()
.toUpperCase();

const classSection =

(section || '')
.trim()
.toUpperCase();

return studentSection === classSection;

});

       

        _rosterStudents = students;

        if (!students.length) {
            tbody.innerHTML = `
                <tr><td colspan="3" style="text-align:center;padding:28px;color:#888;">
                    <div style="font-size:26px;margin-bottom:8px;">👥</div>
                    No students found${section ? " for Section " + section : ""}.<br>
                    <span style="font-size:12px;">Make sure students have the correct section set in their profiles.</span>
                </td></tr>`;
            return;
        }

        students.forEach(s => { _attendanceMap[String(s._id)] = "absent"; });
        _renderRoster(tbody, students);

    } catch (err) {
        console.error("[AttendanceJS] _selectClass:", err);
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="3" style="color:#dc3545;text-align:center;padding:20px;">
                    ❌ ${err.message}
                </td></tr>`;
        }
    }
}

function _renderRoster(tbody, students) {
    tbody.innerHTML = "";

    students.forEach((s, idx) => {
        const sid = String(s._id);
        const tr  = document.createElement("tr");
        tr.id     = `att-row-${sid}`;
        tr.style.cssText = `background:${idx % 2 === 0 ? "#fff" : "#f8faff"};transition:background 0.3s;`;

        tr.innerHTML = `
            <td style="padding:11px 12px;font-weight:600;font-size:13px;">
                ${s.fullName || s.name || "—"}
            </td>
            <td style="padding:11px 12px;color:#666;font-size:12px;">
                ${s.email || "—"}
                ${s.section ? `<span style="margin-left:6px;background:#e6f0ff;color:#007bff;
                    padding:1px 8px;border-radius:10px;font-size:10px;font-weight:700;">
                    ${s.section}</span>` : ""}
            </td>
            <td style="padding:11px 12px;">
                <label id="lbl-${sid}" style="
                    display:inline-flex;align-items:center;gap:8px;cursor:pointer;
                    padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700;
                    border:2px solid #dc3545;background:#fff5f5;color:#dc3545;
                    transition:all 0.18s;user-select:none;white-space:nowrap;">
                    <input
                        type="checkbox"
                        id="chk-${sid}"
                        style="width:16px;height:16px;accent-color:#28a745;cursor:pointer;"
                        onchange="_attToggle('${sid}', this.checked)"
                    />
                    <span id="lbl-text-${sid}">❌ Absent</span>
                </label>
            </td>`;

        tbody.appendChild(tr);
    });

    const tfoot = document.createElement("tr");
    tfoot.innerHTML = `
        <td colspan="3" id="att-summary"
            style="padding:10px 14px;font-size:13px;font-weight:700;color:#007bff;
                   background:#f0f7ff;border-top:2px solid #dde8ff;">
            0 / ${students.length} marked present
        </td>`;
    tbody.appendChild(tfoot);
}

// Toggle
window._attToggle = function (sid, isChecked) {
    _attendanceMap[sid] = isChecked ? "present" : "absent";
    _refreshRowStyle(sid, isChecked);
    _refreshSummary();
};

function _refreshRowStyle(sid, isPresent) {
    const lbl     = document.getElementById(`lbl-${sid}`);
    const lblText = document.getElementById(`lbl-text-${sid}`);
    if (!lbl) return;

    if (isPresent) {
        lbl.style.borderColor = "#28a745";
        lbl.style.background  = "#f5fff8";
        lbl.style.color       = "#28a745";
        if (lblText) lblText.textContent = "✅ Present";
    } else {
        lbl.style.borderColor = "#dc3545";
        lbl.style.background  = "#fff5f5";
        lbl.style.color       = "#dc3545";
        if (lblText) lblText.textContent = "❌ Absent";
    }
}

function _refreshSummary() {
    const el = document.getElementById("att-summary");
    if (!el) return;
    const total   = _rosterStudents.length;
    const present = Object.values(_attendanceMap).filter(v => v === "present").length;
    el.textContent = `${present} / ${total} marked present`;
    el.style.color = present === total ? "#28a745" : present > 0 ? "#007bff" : "#dc3545";
}

// Attendance
function _markAllPresent() {
    if (!_rosterStudents.length) {
        _toast("Select a class first!", "error"); return;
    }
    _rosterStudents.forEach(s => {
        const sid = String(s._id);
        _attendanceMap[sid] = "present";
        const chk = document.getElementById(`chk-${sid}`);
        if (chk) chk.checked = true;
        _refreshRowStyle(sid, true);
    });
    _refreshSummary();
    _toast(`✓ All ${_rosterStudents.length} students marked Present`, "success");
}

// API
async function _saveAttendance() {
    if (!_currentClass) {
        _toast("No class selected!", "error"); return;
    }
    if (!_rosterStudents.length) {
        _toast("No students to save!", "error"); return;
    }
    if (_savingInProgress) return;
    _savingInProgress = true;

    const saveBtn = document.getElementById("save-att");
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "⏳ Saving…"; }

    const teacherName = localStorage.getItem("teacherName") || "Teacher";
    let successCount  = 0;
    let failCount     = 0;

    await Promise.all(_rosterStudents.map(async s => {
        const sid    = String(s._id);
        const status = _attendanceMap[sid] || "absent";

        try {
            const res = await fetch(`${API}/attendance/mark`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    studentId:    sid,
                    studentEmail: s.email      || "",
                    classId:      _currentClass._id,
                    subject:      _currentClass.subject    || "",
                    startTime:    _currentClass.startTime  || "",
                    endTime:      _currentClass.endTime    || "",
                    classGroup:   _currentClass.classGroup || "",
                    roomno:       _currentClass.roomno     || "",
                    status,
                    markedBy:     teacherName,
                }),
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok && (data.ok || data.success)) {
                successCount++;
                const row = document.getElementById(`att-row-${sid}`);
                if (row) {
                    row.style.background = status === "present" ? "#e8f5e9" : "#fff5f5";
                    setTimeout(() => {
                        row.style.background = "";
                    }, 2000);
                }
            } else {
                failCount++;
                console.warn(`[Attendance] Save failed for ${s.email || sid}:`, data);
            }
        } catch (err) {
            failCount++;
            console.error(`[Attendance] Network error for ${s.email || sid}:`, err.message);
        }
    }));

    _savingInProgress = false;
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "💾 Save Attendance"; }

    if (failCount === 0) {
        _toast(`✅ Attendance saved! ${successCount} student(s) recorded.`, "success");
    } else if (successCount > 0) {
        _toast(`⚠️ Saved ${successCount}, failed ${failCount}. Check console.`, "");
    } else {
        _toast(`❌ All saves failed. Is the server running?`, "error");
    }
}

async function _closeAndMarkAbsent() {
    if (!_currentClass) {
        _toast("No class selected!", "error"); return;
    }
    if (!confirm(`Mark all unchecked students ABSENT for "${_currentClass.subject}" and save?`)) return;

    _rosterStudents.forEach(s => {
        const sid = String(s._id);
        if (!_attendanceMap[sid]) _attendanceMap[sid] = "absent";
    });

    await _saveAttendance();

    setTimeout(() => {
        const rosterWrap = document.getElementById("att-roster-wrap");
        if (rosterWrap) rosterWrap.style.display = "none";
        _currentClass   = null;
        _rosterStudents = [];
        _attendanceMap  = {};

        document.querySelectorAll("#class-card-row > div").forEach(c => {
            c.style.background  = "#fff";
            c.style.borderColor = "#007bff";
            c.style.boxShadow   = "0 2px 8px rgba(0,123,255,.08)";
            c.querySelectorAll("div").forEach(d => {
                d.style.color = d === c.firstElementChild ? "#007bff" : "#555";
            });
        });

        _toast("🔒 Class closed. Attendance finalised.", "success");
    }, 900);
}

function _todayDayName() {
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
}

// Notifications
function _toast(msg, type) {
    if (typeof showToast === "function") {
        showToast(msg, type);
        return;
    }
    const bg = type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#fd7e14";
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = `
        position:fixed;bottom:24px;right:24px;background:${bg};color:#fff;
        padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;
        box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:99999;
        opacity:0;transition:opacity .3s;pointer-events:none;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = "1"));
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 350); }, 4500);
}