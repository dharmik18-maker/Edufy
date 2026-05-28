 const API = "http://localhost:5002/api";
      let selectedRole = "student";

      function selectRole(role, el) {
        selectedRole = role;
        document
          .querySelectorAll(".role-btn")
          .forEach((b) => b.classList.remove("selected"));
        el.classList.add("selected");
      }

      // Password toggle
      const passInput = document.getElementById("password");
      document.getElementById("togglePass").addEventListener("click", () => {
        passInput.type = passInput.type === "password" ? "text" : "password";
        document
          .getElementById("togglePass")
          .setAttribute(
            "name",
            passInput.type === "password" ? "show" : "hide",
          );
      });

      // ── Login form submit ──────────────────────────────────
      document
        .getElementById("login-form")
        .addEventListener("submit", async (e) => {
          e.preventDefault();
          const email = document.getElementById("email").value.trim();
          const password = document.getElementById("password").value.trim();
          const errEl = document.getElementById("error-message");
          const sucEl = document.getElementById("success-message");
          const btn = document.getElementById("login-btn");
          errEl.style.display = "none";
          sucEl.style.display = "none";

          btn.textContent = "Logging in...";
          btn.disabled = true;

          try {
            // ── STUDENT ──────────────────────────────────────
            if (selectedRole === "student") {
              const res = await fetch(`${API}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const data = await res.json();
              if (res.ok) {
                localStorage.setItem("studentId", data.studentId);
                localStorage.setItem("userEmail", email);
                localStorage.setItem("userName", data.studentName || "");
                localStorage.setItem("userRole", "student");
                localStorage.setItem("role", "student");
                sucEl.textContent = "✅ Login successful! Redirecting...";
                sucEl.style.display = "block";
                setTimeout(
                  () => (window.location.href = "student_dashboard.html"),
                  800,
                );
              } else throw new Error(data.message || "Invalid credentials");

              // ── TEACHER ──────────────────────────────────────
              // The API response is expected to return:
              //   { teacherId, teacherName, subject, section, isCoordinator? }
              // where:
              //   • subject   → the subject the teacher teaches (e.g. "Mathematics")
              //   • section   → the class section this teacher is coordinator of (e.g. "FD", "FE", "FC")
              //                 Leave empty / null if the teacher is NOT a coordinator.
              //   • isCoordinator → optional boolean; if omitted we infer from section being non-empty
            } else if (selectedRole === "teacher") {
              const res = await fetch(`${API}/teacher/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const data = await res.json();

              if (res.ok) {
                // ── Core fields (always present) ──
                localStorage.setItem("teacherId", data.teacherId || "");
                localStorage.setItem("teacherName", data.teacherName || "");
                localStorage.setItem("userEmail", email);
                localStorage.setItem("userName", data.teacherName || "");
                localStorage.setItem("userRole", "teacher");
                localStorage.setItem("role", "teacher");

                // ── Coordinator fields ─────────────────────────────────
                // teacherSection  → used by teacher_dashboard.html to show
                //                   the coordinator banner + timetable panel
                // teacherSubject  → pre-fills the teacher name in timetable rows
                const section =
                  data.section ||
                  data.classSection ||
                  data.teacherSection ||
                  "";
                const subject = data.subject || data.teacherSubject || "";

                localStorage.setItem("teacherSection", section);
                localStorage.setItem("teacherSubject", subject);
                localStorage.setItem("teacherIsCoordinator",
                  data.isCoordinator || false);

                // ── Show teacher info card briefly ─────────────────────
                const card = document.getElementById("teacherInfoCard");
                document.getElementById("ti-name").textContent =
                  data.teacherName || "—";
                document.getElementById("ti-subject").textContent =
                  subject || "Not assigned";
                document.getElementById("ti-section").textContent =
                  section || "Not assigned";

                // Show "Class Coordinator" badge only if section is set
               const isCoordinator =

localStorage.getItem(
'teacherIsCoordinator'
)==='true';
localStorage.setItem(

'teacherCoordinatorSection',

data.coordinatorSection || ''

);

if(isCoordinator){

document.getElementById(
'ti-coord-row'
).style.display='flex';

}

                card.style.display = "block";

                sucEl.textContent = "✅ Login successful! Redirecting...";
                sucEl.style.display = "block";
                setTimeout(
                  () => (window.location.href = "teacher_dashboard.html"),
                  1800,
                );
              } else {
                throw new Error(data.message || "Invalid credentials");
              }

              // ── MENTOR ───────────────────────────────────────
            } else if (selectedRole === "mentor") {
              const res = await fetch(`${API}/mentor-system/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });

              const text = await res.text();
              console.log("RAW RESPONSE:", text);

              // Try converting to JSON safely
              let data;
              try {
                data = JSON.parse(text);
              } catch (err) {
                throw new Error("Server did not return JSON");
              }

              if (res.ok) {
                localStorage.setItem("mentorId", data.mentorId || "");
                localStorage.setItem("mentorName", data.mentorName || "");
                localStorage.setItem("mentorEmail", email);
                localStorage.setItem("userEmail", email);
                localStorage.setItem("userName", data.mentorName || "");
                localStorage.setItem("userRole", "mentor");
                localStorage.setItem("role", "mentor");

                sucEl.textContent = "✅ Login successful! Redirecting...";
                sucEl.style.display = "block";

                setTimeout(() => {
                  window.location.href = "mentor_dashboard.html";
                }, 800);
              } else {
                throw new Error(data.message || "Invalid credentials");
              }

              // ── ADMIN ─────────────────────────────────────────
            } else if (selectedRole === "admin") {
              const res = await fetch(`${API}/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
              });
              const data = await res.json();
              if (res.ok) {
                localStorage.setItem("adminId", data.adminId || "");
                localStorage.setItem("userEmail", email);
                localStorage.setItem("userName", data.name || "Admin");
                localStorage.setItem("userRole", "admin");
                localStorage.setItem("role", "admin");
                sucEl.textContent = "✅ Login successful! Redirecting...";
                sucEl.style.display = "block";
                setTimeout(
                  () => (window.location.href = "admin_dashboard.html"),
                  800,
                );
              } else
                throw new Error(data.message || "Invalid admin credentials");
            }
          } catch (err) {
            errEl.textContent = "❌ " + err.message;
            errEl.style.display = "block";
          } finally {
            btn.textContent = "Login";
            btn.disabled = false;
          }
        });