
  
    // API
    const API = 'http://localhost:5002/api';
    const teacherName = localStorage.getItem('teacherName') || 'Teacher';

    const CLOUDINARY_CLOUD_NAME = 'dj1qpoqvp';
    const CLOUDINARY_UPLOAD_PRESET = 'edufy_posters';

    let uploadedImageURL = null;
    let analyzedResult = null;

    // Keywords
    const HIGH_KW = ['exam', 'examination', 'test', 'viva', 'deadline', 'last date', 'urgent', 'important', 'critical', 'mandatory', 'compulsory', 'registration', 'fee', 'payment', 'alert', 'warning', 'emergency', 'cancelled', 'postponed'];
    const MEDIUM_KW = ['assignment', 'homework', 'project', 'submission', 'quiz', 'class', 'lecture', 'lab', 'schedule', 'timetable', 'seminar', 'workshop', 'event', 'reminder', 'notice', 'update', 'announcement', 'meeting'];

    function clientClassify(text) {
      const lower = text.toLowerCase();
      const hFound = HIGH_KW.filter(k => lower.includes(k));
      if (hFound.length) return { priority: 'High', keywords: hFound };
      const mFound = MEDIUM_KW.filter(k => lower.includes(k));
      if (mFound.length) return { priority: 'Medium', keywords: mFound };
      return { priority: 'Low', keywords: [] };
    }

    function analyzeLive(text, targetId = 'live-analysis') {
      const container = document.getElementById(targetId);
      const resultEl = document.getElementById(targetId === 'live-analysis' ? 'live-result' : 'poster-live-result');
      if (!text.trim()) { container.style.display = 'none'; return; }
      container.style.display = 'block';
      const { priority, keywords } = clientClassify(text);
      const pColors = { High: '#dc3545', Medium: '#fd7e14', Low: '#28a745' };
      const pEmoji = { High: '🔴', Medium: '🟠', Low: '🟢' };
      resultEl.innerHTML = `
        <span style="color:${pColors[priority]};font-weight:700;">${pEmoji[priority]} ${priority} Priority</span>
        ${keywords.length ? ' — Keywords: ' + keywords.map(k => `<span style="background:#e0ebff;color:#007bff;padding:1px 7px;border-radius:4px;font-size:11px;margin-left:3px;">#${k}</span>`).join('') : ''}
      `;
    }

    async function postTextAnnouncement() {
      const message = document.getElementById('ann-message').value.trim();
      const target = document.getElementById('ann-target').value;
      const okEl = document.getElementById('ann-ok');
      const errEl = document.getElementById('ann-err');
      okEl.style.display = 'none'; errEl.style.display = 'none';
      if (!message) { errEl.textContent = 'Please enter a message!'; errEl.style.display = 'block'; return; }

      try {
        const res1 = await fetch(`${API}/announcements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacherName, message })
        });
        if (!res1.ok) throw new Error((await res1.json()).message || 'Failed');

        const res2 = await fetch(`${API}/smart-notifications/send-notification`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sentBy: teacherName, targetRole: target })
        });
        const data2 = await res2.json();

        const pEmoji = { High: '🔴', Medium: '🟠', Low: '🟢' };
        okEl.textContent = `✅ Announcement posted! Auto-classified as ${pEmoji[data2.priority] || ''} ${data2.priority || ''} Priority`;
        okEl.style.display = 'block';
        document.getElementById('ann-message').value = '';
        document.getElementById('live-analysis').style.display = 'none';
        loadAnnouncements();
      } catch (e) {
        errEl.textContent = '❌ ' + e.message; errEl.style.display = 'block';
      }
    }

    function handleFileSelect(input) {
      const file = input.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        document.getElementById('poster-err').textContent = '❌ File too large (max 5MB)';
        document.getElementById('poster-err').style.display = 'block';
        return;
      }

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('preview-img').src = e.target.result;
          document.getElementById('img-preview').style.display = 'block';
          document.getElementById('img-name').textContent = file.name;
        };
        reader.readAsDataURL(file);
      }

      uploadToCloudinary(file);
    }

    function uploadToCloudinary(file) {
      const progressWrap = document.getElementById('upload-progress');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');
      const errEl = document.getElementById('poster-err');

      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      progressText.textContent = 'Uploading... 0%';
      errEl.style.display = 'none';

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('folder', 'edufy_posters');

      const xhr = new XMLHttpRequest();
      const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = `Uploading... ${pct}%`;
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          uploadedImageURL = data.secure_url;
          progressFill.style.width = '100%';
          progressText.textContent = '✅ Image uploaded successfully!';

          document.getElementById('post-poster-btn').disabled = false;

          const caption = document.getElementById('poster-caption').value.trim();
          if (caption) runMLAnalysis(caption);
        } else {
          const errData = JSON.parse(xhr.responseText);
          progressText.textContent = '❌ Upload failed';
          errEl.textContent = '❌ Cloudinary error: ' + (errData.error?.message || 'Unknown error');
          errEl.style.display = 'block';
        }
      });

      xhr.addEventListener('error', () => {
        progressText.textContent = '❌ Network error during upload';
        errEl.textContent = '❌ Upload failed — check your internet connection';
        errEl.style.display = 'block';
      });

      xhr.open('POST', url);
      xhr.send(formData);
    }

    function runMLAnalysis(text) {
      const result = clientClassify(text);
      analyzedResult = result;

      const mlDiv = document.getElementById('ml-result');
      const pText = document.getElementById('ml-priority-text');
      const msgText = document.getElementById('ml-message-text');
      const kwDiv = document.getElementById('ml-keywords');

      const pColors = { High: '#dc3545', Medium: '#fd7e14', Low: '#28a745' };
      const pEmoji = { High: '🔴', Medium: '🟠', Low: '🟢' };

      mlDiv.className = `ml-result ${result.priority}`;
      pText.innerHTML = `<span style="color:${pColors[result.priority]}">${pEmoji[result.priority]} ${result.priority} Priority</span>`;
      msgText.textContent = result.keywords.length ? 'Detected keywords:' : 'No specific keywords found';
      kwDiv.innerHTML = result.keywords.map(k => `<span class="kw">#${k}</span>`).join('');
      mlDiv.style.display = 'block';
    }

    async function postPosterAnnouncement() {
      const caption = document.getElementById('poster-caption').value.trim();
      const section = document.getElementById('poster-section').value.trim() || 'ALL';
      const okEl = document.getElementById('poster-ok');
      const errEl = document.getElementById('poster-err');
      okEl.style.display = 'none'; errEl.style.display = 'none';

      if (!caption) { errEl.textContent = 'Please enter a caption for the poster'; errEl.style.display = 'block'; return; }

      const btn = document.getElementById('post-poster-btn');
      btn.disabled = true; btn.textContent = '⏳ Posting...';

      try {
        await fetch(`${API}/announcements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teacherName,
            message: caption,
            imageUrl: uploadedImageURL || null,
            section
          })
        });

        const notifRes = await fetch(`${API}/smart-notifications/send-notification`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: caption,
            sentBy: teacherName,
            targetRole: 'student',
            imageUrl: uploadedImageURL || null,
            classGroup: section
          })
        });
        const notifData = await notifRes.json();

        const pEmoji = { High: '🔴', Medium: '🟠', Low: '🟢' };
        okEl.textContent = `✅ Poster posted! ML Priority: ${pEmoji[notifData.priority] || ''} ${notifData.priority}`;
        okEl.style.display = 'block';

        document.getElementById('poster-caption').value = '';
        document.getElementById('poster-file').value = '';
        document.getElementById('img-preview').style.display = 'none';
        document.getElementById('ml-result').style.display = 'none';
        document.getElementById('upload-progress').style.display = 'none';
        document.getElementById('poster-live').style.display = 'none';
        uploadedImageURL = null;
        analyzedResult = null;

        loadAnnouncements();
      } catch (e) {
        errEl.textContent = '❌ ' + e.message; errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = '🖼️ Analyze & Post Poster';
      }
    }

    // Feed
    async function loadAnnouncements(all = false) {
      const list = document.getElementById('ann-list');
      list.innerHTML = '<li class="spinner">Loading...</li>';
      try {
        const url = `${API}/announcements${all ? '?all=1' : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!data.length) { list.innerHTML = '<li class="empty-state">No announcements yet.</li>'; return; }
        list.innerHTML = data.map(a => {
          const pClass = a.priority ? `${a.priority.toLowerCase()}-chip` : '';
          return `
          <li class="ann-item">
            <strong>${a.teacherName || 'Teacher'}:</strong> ${a.message || ''}
            ${a.imageUrl ? `<img src="${a.imageUrl}" class="poster-img" alt="Poster">` : ''}
            ${a.priority ? `<span class="priority-chip ${pClass}">${a.priority} Priority</span>` : ''}
            <small>📅 ${new Date(a.createdAt).toLocaleString()}</small>
          </li>`;
        }).join('');
      } catch (e) {
        list.innerHTML = '<li class="empty-state" style="color:#dc3545;">Failed to load.</li>';
      }
    }

    const uploadZone = document.getElementById('upload-zone');
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.style.background = '#e0f0ff'; });
    uploadZone.addEventListener('dragleave', () => uploadZone.style.background = '#f8faff');
    uploadZone.addEventListener('drop', e => {
      e.preventDefault(); uploadZone.style.background = '#f8faff';
      const file = e.dataTransfer.files[0];
      if (file) { document.getElementById('poster-file').files = e.dataTransfer.files; handleFileSelect({ files: [file] }); }
    });

    loadAnnouncements();
