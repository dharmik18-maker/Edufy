

require('dotenv').config();

const express    = require('express');
const mongoose   = require('mongoose');
const Teacher    = require('./models/Teacher');
const cors       = require('cors');
const schedule   = require('node-schedule');
const { MongoClient, ObjectId } = require('mongodb');
const webPush    = require('./webpush');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const jwt = require('jsonwebtoken');

// New Route Files
const mentorRoutes     = require('./routes/mentorRoutes');
const smartNotifRoutes = require('./routes/smartNotifRoutes');

// App + Socket.io
const app    = express();
const PORT   = process.env.PORT || 5000;
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','DELETE','PATCH','PUT'] } });

app.use(cors());
app.use(express.json());
app.set('io', io);

// Socket.io
io.on('connection', socket => {
  console.log('🟢 Client connected:', socket.id);
  socket.on('disconnect', () => console.log('🔴 Disconnected:', socket.id));
});

// Mongoose (for Mentor, StudentProfile, SmartNotification models)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Mongoose connected'))
  .catch(err => console.error('❌ Mongoose error:', err.message));

// Direct MongoClient
const client = new MongoClient(process.env.MONGO_URI);
let studentsCol, timetablesCol;

async function startServer() {
  try {
    await client.connect();
    console.log('✅ MongoClient connected to Atlas!');

    const db      = client.db('edufy');
    studentsCol   = db.collection('students');
    timetablesCol = db.collection('timetables');

    app.locals.mongoClient = client;

    await fixAttendanceIndex(db);
    await scheduleReminders();
    console.log('✅ Server fully initialised');
  } catch (err) {
    console.error('❌ startServer error:', err.message);
    process.exit(1);
  }
}
startServer();

// ======================================================
// ATTENDANCE INDEX — safe fix (no crash if already exists)
// ======================================================
async function fixAttendanceIndex(db) {
  const col       = db.collection('attendance');
  const indexName = 'studentId_1_classId_1_dateKey_1';
  try {
    const list  = await col.indexes();
    const found = list.find(i => i.name === indexName);
    if (found) {
      if (found.sparse) { console.log('✅ Attendance index already OK'); return; }
      await col.dropIndex(indexName);
      console.log('🔁 Dropped old attendance index (no sparse)');
    }
    await col.createIndex(
      { studentId: 1, classId: 1, dateKey: 1 },
      { unique: true, sparse: true, name: indexName }
    );
    console.log('✅ Attendance index created (unique + sparse)');
  } catch (err) {
    console.warn('⚠️  Attendance index (non-fatal):', err.message);
  }
}


// HELPERS

const DAY_MAP = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

function toOid(id) {
  try { return id && ObjectId.isValid(id) ? new ObjectId(id) : null; }
  catch { return null; }
}
function teacherAuth(req,res,next){

const auth =
req.headers.authorization;

if(!auth){
return res.status(401).json({
message:"No token"
});
}

try{

const token=
auth.split(" ")[1];

const decoded=
jwt.verify(
token,
process.env.JWT_SECRET || "edufy_secret"
);

req.teacher=decoded;

next();

}
catch(err){

return res.status(401).json({
message:"Invalid token"
});

}

}

// SCHEDULER — weekly class reminders 5 min before

async function scheduleReminders() {
  try {
    const classes = await timetablesCol.find().toArray();
    classes.forEach(cls => {
      const dayNum = DAY_MAP[(cls.day || '').toLowerCase()];
      if (dayNum === undefined) return;
      const [h, m] = (cls.startTime || '00:00').split(':').map(Number);
      const nd     = new Date(1970, 0, 1, h, (m || 0) - 5);

      schedule.scheduleJob({ dayOfWeek: dayNum, hour: nd.getHours(), minute: nd.getMinutes() }, async () => {
        const msg = `${cls.subject} class starts at ${cls.startTime}`;
        await pushToSection(cls.classGroup, '⏰ Class Reminder', msg);
        io.emit('classReminder', {
          title: '⏰ Class Reminder', message: msg,
          classId: cls._id?.toString() || null,
          subject: cls.subject, classGroup: cls.classGroup,
          day: cls.day, startTime: cls.startTime, endTime: cls.endTime,
          teacher: cls.teacher || null, roomno: cls.roomno || null
        });
        const students = await studentsCol.find({ section: cls.classGroup }).toArray();
        for (const s of students) await storeNotification(s._id, '⏰ Class Reminder', msg);
      });
    });
    console.log(`✅ Scheduled ${classes.length} weekly reminders`);
  } catch (err) {
    console.error('❌ scheduleReminders:', err.message);
  }
}

async function pushToSection(section, title, message) {
  try {
    const students = await studentsCol.find({
      section, subscription: { $exists: true, $ne: null }
    }).toArray();
    for (const s of students) {
      try { await webPush.sendNotification(s.subscription, JSON.stringify({ title, message })); }
      catch (e) { console.error(`Push fail ${s.fullName}:`, e.message); }
    }
  } catch (err) { console.error('pushToSection:', err.message); }
}

async function storeNotification(studentId, title, message) {
  try {
    await client.db('edufy').collection('notifications').insertOne({
      studentId, title, message,
      timestamp: new Date(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
  } catch {}
}


// ROUTES


app.get('/',         (req, res) => res.send('🚀 EduFy Server running!'));
app.get('/api/ping', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/api/get-public-key', (req, res) => res.json({ publicKey: process.env.PUBLIC_VAPID_KEY }));

// ── STUDENT LOGIN ──────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const student = await studentsCol.findOne({ email: email.toLowerCase().trim() });
    if (student && student.password === password) {
      return res.json({
        message:     'Login successful',
        studentId:   student._id,
        studentName: student.fullName || student.name || '',
        email:       student.email,
        section:     student.section || '',
        role:        student.role || 'student'
      });
    }
    res.status(401).json({ message: 'Invalid email or password' });
  } catch (err) {
    console.error('/api/login error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── STUDENT REGISTER ───────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const { fullName, email, password, section } = req.body;
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'fullName, email and password required' });
    }
    const lower = email.toLowerCase().trim();
    if (await studentsCol.findOne({ email: lower })) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const result = await studentsCol.insertOne({
      fullName: fullName.trim(), email: lower, password,
      role: 'student', section: (section || '').trim(),
      subscription: null, createdAt: new Date()
    });
    res.status(201).json({ message: 'Student registered', studentId: result.insertedId });
  } catch (err) {
    console.error('/api/register error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── TEACHER LOGIN ──────────────────────────────────────
// Returns section so frontend can detect coordinator role
app.post('/api/teacher/login', async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password){
      return res.status(400).json({
        message:'Email and password required'
      });
    }

    const db = client.db('edufy');

    const teacher =
    await db.collection('teachers')
    .findOne({
      email:email.toLowerCase().trim()
    });

    if(!teacher || teacher.password!==password){

      return res.status(401).json({
        message:'Invalid credentials'
      });

    }


    const token = jwt.sign({

      id:String(teacher._id),

      assignedSections:
      teacher.assignedSections ||
      [teacher.section].filter(Boolean),

      role:"teacher"

    },
    process.env.JWT_SECRET || "edufy_secret");



    res.json({

      message:'Login successful',

      token,

      teacherId:teacher._id,

      teacherName:teacher.name,

      email:teacher.email,

      subject:teacher.subject || '',

      assignedSections:
      teacher.assignedSections ||
      [teacher.section].filter(Boolean),

      section:
      teacher.section || '',

     isCoordinator:teacher.isCoordinator || false,
     coordinatorSection:teacher.coordinatorSection || '',

    });

  }
  catch(err){

    console.error(
    '/api/teacher/login error:',
    err.message
    );

    res.status(500).json({
      message:'Server error'
    });

  }
});
// ── TEACHER REGISTER ───────────────────────────────────
app.post('/api/teacher/register', async (req, res) => {
  try {
    const { name, email, password, subject, section } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email, password required' });
    const db    = client.db('edufy');
    const lower = email.toLowerCase().trim();
    if (await db.collection('teachers').findOne({ email: lower })) {
      return res.status(400).json({ message: 'Teacher already exists' });
    }
    const result =await db.collection('teachers').insertOne({

name:name.trim(),

email:lower,

password,

subject:subject || '',

section:section || '',

assignedSections:
section
?
[section]
:
[],

isCoordinator:false,

coordinatorSection:'',

createdAt:new Date()

});
    res.status(201).json({ message: 'Teacher registered', teacherId: result.insertedId });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── TEACHER PROFILE ────────────────────────────────────
app.get('/api/teacher/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    const teacher = await client.db('edufy').collection('teachers').findOne({ _id: oid });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── TEACHER TIMETABLE ──────────────────────────────────
app.get('/api/teacher/:id/timetable', async (req, res) => {
  try {
    const db  = client.db('edufy');
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });

    const teacher = await db.collection('teachers').findOne({ _id: oid });
    if (!teacher) return res.json([]);

    const orQuery = [
      { teacher: { $regex: new RegExp(`^${teacher.name.trim()}$`, 'i') } }
    ];
    const firstName = teacher.name.trim().split(' ')[0];
    if (firstName.length > 2) orQuery.push({ teacher: { $regex: new RegExp(`^${firstName}`, 'i') } });
    if (teacher.section) orQuery.push({ classGroup: { $regex: new RegExp(`^${teacher.section.trim()}$`, 'i') } });

    const timetable = await db.collection('timetables')
      .find({ $or: orQuery })
      .sort({ day: 1, startTime: 1 })
      .toArray();
    res.json(timetable);
  } catch (err) {
    console.error('/api/teacher/:id/timetable error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── TEACHERS LIST (admin) ──────────────────────────────
app.get('/api/teachers', async (req, res) => {
  try {
    const teachers = await client.db('edufy').collection('teachers')
      .find({}, { projection:{

_id:1,

name:1,

email:1,

subject:1,

section:1,

isCoordinator:1,

coordinatorSection:1

} })
      .toArray();
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});
app.post(
'/api/teacher/assign-section',

async(req,res)=>{

try{

const {
teacherId,
section
}=req.body;

await Teacher.findByIdAndUpdate(

teacherId,

{

$set:{

section,

assignedSections:
section
.split(',')
.map(s=>s.trim())
.filter(Boolean)

}

}

);

res.json({
success:true
});

}
catch(e){

console.log(e);

res.status(500).json({
message:e.message
});

}

});
app.post(
'/api/teacher/make-coordinator',

async(req,res)=>{

try{

const {
teacherId,
section
}=req.body;

const db =
client.db('edufy');


// remove old coordinator
await db.collection('teachers')
.updateMany(

{
coordinatorSection:section
},

{
$set:{
isCoordinator:false,
coordinatorSection:''
}
}

);


// make new coordinator
await db.collection('teachers')
.updateOne(

{
_id:new ObjectId(teacherId)
},

{
$set:{

isCoordinator:true,

coordinatorSection:section

}

}

);


const updatedTeacher =

await db.collection('teachers')
.findOne({

_id:new ObjectId(teacherId)

});


console.log(
updatedTeacher
);

res.json({

success:true,

teacher:updatedTeacher

});

}
catch(err){

console.log(err);

res.status(500).json({

message:err.message

});

}

});




// ── DELETE TEACHER (admin) ─────────────────────────────
app.delete('/api/teachers/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    await client.db('edufy').collection('teachers').deleteOne({ _id: oid });
    res.json({ message: 'Teacher deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── ADMIN LOGIN ────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@edufy.com';
    const adminPass  = process.env.ADMIN_PASS  || 'admin123';
    if (email === adminEmail && password === adminPass) {
      return res.json({ success: true, message: 'Login successful', adminId: 'admin_1', name: 'Admin' });
    }
    res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── STUDENTS LIST ──────────────────────────────────────
app.get('/api/students', async (req, res) => {
  try {
    const raw = await studentsCol.find(
      { $or: [{ role: 'student' }, { role: { $exists: false } }] },
      { projection: { _id: 1, fullName: 1, name: 1, email: 1, section: 1, universityId: 1 } }
    ).sort({ section: 1 }).toArray();

    res.set('Cache-Control', 'no-store');
    res.json(raw.map(s => ({
      _id:          s._id.toString(),
      fullName:     s.fullName ?? s.name ?? 'N/A',
      email:        s.email ?? '-',
      section:      (s.section || '-').toString(),
      universityId: s.universityId || ''
    })));
  } catch (err) {
    console.error('/api/students error:', err.message);
    res.status(500).json({ message: 'Failed to fetch students' });
  }
});

// ── STUDENT PROFILE ────────────────────────────────────
app.get('/students/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid student id' });
    const student = await studentsCol.findOne({ _id: oid });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json({
      _id:          student._id,
      fullName:     student.fullName || student.name || '',
      email:        student.email,
      section:      student.section || '',
      universityId: student.universityId || '',
      role:         student.role || 'student'
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// ── STUDENT TIMETABLE ──────────────────────────────────
app.get(
'/students/:studentId/timetable',
async(req,res)=>{

try{

const studentId=
req.params.studentId;


const student=
await studentsCol.findOne({

_id:toOid(studentId)

});


if(!student){

return res.status(404)
.json({

message:'Student not found'

});

}


const section=
(student.section || '')
.trim()
.toUpperCase();



const classes=
await timetablesCol.find({

classGroup:section

})

.toArray();



res.json(
classes
);

}
catch(err){

console.log(err);

res.status(500).json({

message:'Server error'

});

}

});

// ── DELETE STUDENT (admin) ─────────────────────────────
app.delete('/api/students/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    await studentsCol.deleteOne({ _id: oid });
    res.json({ message: 'Student deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUSH SUBSCRIPTION ──────────────────────────────────
app.post('/api/save-subscription', async (req, res) => {
  try {
    const { studentId, subscription } = req.body;
    if (!studentId || !subscription) return res.status(400).json({ message: 'studentId and subscription required' });
    const oid = toOid(studentId);
    if (!oid) return res.status(400).json({ message: 'Invalid studentId' });
    const result = await studentsCol.updateOne({ _id: oid }, { $set: { subscription } });
    if (result.modifiedCount === 1) res.json({ message: 'Subscription saved' });
    else res.status(404).json({ message: 'Student not found' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ======================================================
// TIMETABLE CRUD — Full 4 operations
// ======================================================

// GET all timetable entries (optionally filter by section)
app.get('/api/timetable', async (req, res) => {
  try {
    const { section } = req.query;
    const filter = section
      ? { classGroup: { $regex: new RegExp(`^${section.trim()}$`, 'i') } }
      : {};
    const classes = await timetablesCol.find(filter).sort({ day: 1, startTime: 1 }).toArray();
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch timetable' });
  }
});

// POST — Create new class
app.post('/api/timetable', async (req, res) => {
  try {
    const { day, startTime, endTime, subject, teacher, classGroup, roomno } = req.body;
    if (!day || !startTime || !subject || !classGroup) {
      return res.status(400).json({ message: 'day, startTime, subject, classGroup required' });
    }
    const result = await timetablesCol.insertOne({
      day, startTime, endTime: endTime || '',
      subject: subject.trim(), teacher: (teacher || '').trim(),
      classGroup: classGroup.trim(), roomno: (roomno || '').trim()
    });

    // Schedule 5-min reminder for new class
    const dayNum = DAY_MAP[(day || '').toLowerCase()];
    if (dayNum !== undefined) {
      const [h, m] = (startTime || '00:00').split(':').map(Number);
      const nd     = new Date(1970, 0, 1, h, (m || 0) - 5);
      schedule.scheduleJob({ dayOfWeek: dayNum, hour: nd.getHours(), minute: nd.getMinutes() }, async () => {
        const msg = `${subject} class starts at ${startTime}`;
        await pushToSection(classGroup, '⏰ Class Reminder', msg);
        io.emit('classReminder', {
          title: '⏰ Class Reminder', message: msg,
          classId: result.insertedId?.toString(), subject, classGroup,
          day, startTime, endTime, teacher, roomno: (roomno || '').trim()
        });
      });
    }
    io.emit('timetable-update', { message: `New class: ${subject} (${day} ${startTime})` });
    res.status(201).json({ message: 'Class added successfully', class: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT — Update existing class (NEW — coordinator edit)
app.put('/api/timetable/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid timetable id' });

    const { day, startTime, endTime, subject, teacher, classGroup, roomno } = req.body;
    if (!day || !startTime || !subject) {
      return res.status(400).json({ message: 'day, startTime, and subject are required' });
    }

    const updateDoc = {
      day,
      startTime,
      endTime:    endTime    || '',
      subject:    subject.trim(),
      teacher:    (teacher   || '').trim(),
      classGroup: (classGroup|| '').trim(),
      roomno:     (roomno    || '').trim()
    };

    const result = await timetablesCol.updateOne({ _id: oid }, { $set: updateDoc });
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }

    io.emit('timetable-update', { message: `Class updated: ${subject} (${day} ${startTime})` });
    res.json({ message: 'Class updated successfully', updated: updateDoc });
  } catch (err) {
    console.error('PUT /api/timetable/:id error:', err.message);
    res.status(500).json({ message: 'Failed to update class' });
  }
});

// DELETE — Remove class
app.delete('/api/timetable/:id', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    await timetablesCol.deleteOne({ _id: oid });
    io.emit('timetable-update', { message: 'Class removed' });
    res.json({ message: 'Class deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ANNOUNCEMENTS ──────────────────────────────────────
app.post('/api/announcements', async (req, res) => {
  try {
    const { teacherName, message, imageUrl, section } = req.body;
    if (!teacherName || !message) return res.status(400).json({ message: 'teacherName and message required' });
    const db  = client.db('edufy');

    await db.collection('announcements').insertOne({
      teacherName, message,
      imageUrl:  imageUrl || null,
      section:   section  || null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });

    io.emit('new-announcement', {
      teacherName, message, imageUrl: imageUrl || null
    });

    if (imageUrl) {
      const { classifyNotification } = require('./logic/notificationClassifier');
      try {
        const { priority, detectedKeywords } = classifyNotification(message);
        io.emit('poster-analyzed', {
          teacherName, message, imageUrl, priority, detectedKeywords,
          classGroup: section || null
        });
      } catch (e) {}
    }

    res.status(201).json({ message: 'Announcement created' });
  } catch (err) {
    console.error('POST /api/announcements error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    const db         = client.db('edufy');
    const includeAll = req.query.all === '1';
    const filter     = includeAll ? {} : { expiresAt: { $gt: new Date() } };
    const anns       = await db.collection('announcements').find(filter).sort({ createdAt: -1 }).toArray();
    res.json(anns);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── STUDENT NOTIFICATIONS (bell) ───────────────────────
app.get('/api/student/:id/notifications', async (req, res) => {
  try {
    const oid = toOid(req.params.id);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    const db   = client.db('edufy');
    const data = await db.collection('notifications').find({
      studentId: oid, expiresAt: { $gt: new Date() }
    }).sort({ timestamp: -1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Hourly cleanup of expired notifications
schedule.scheduleJob('0 * * * *', async () => {
  const db  = client.db('edufy');
  const del = await db.collection('notifications').deleteMany({ expiresAt: { $lt: new Date() } });
  if (del.deletedCount > 0) console.log(`🧹 Cleaned ${del.deletedCount} expired notifications`);
});

// Test push
app.post('/api/notifications/test', async (req, res) => {
  try {
    const { studentId, title = 'Test Notification', message = 'This is a test from EduFy!' } = req.body;
    const db = client.db('edufy');
    let targets = [];
    if (studentId) {
      const oid = toOid(studentId);
      const s   = oid ? await db.collection('students').findOne({ _id: oid }) : null;
      if (!s) return res.status(404).json({ message: 'Student not found' });
      if (s.subscription) targets.push({ id: String(s._id), subscription: s.subscription });
    } else {
      const all = await db.collection('students').find({ subscription: { $exists: true, $ne: null } }).toArray();
      targets   = all.map(a => ({ id: String(a._id), subscription: a.subscription }));
    }
    let sent = 0, failed = 0;
    for (const t of targets) {
      try { await webPush.sendNotification(t.subscription, JSON.stringify({ title, message })); await storeNotification(t.id, title, message); sent++; }
      catch { failed++; }
    }
    res.json({ ok: true, sent, failed, targets: targets.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed' });
  }
});

// ── ATTENDANCE ─────────────────────────────────────────
app.post('/api/attendance/mark', async (req, res) => {
  try {
    let { studentId, studentEmail, email, status, classId, subject, startTime, classGroup } = req.body;
    studentEmail = studentEmail || email || null;

    if (!status || !classId || !subject || !startTime || !classGroup) {
      return res.status(400).json({ message: 'Missing: status, classId, subject, startTime, classGroup' });
    }

    let sidOid = toOid(studentId);
    if (!sidOid) {
      if (!studentEmail) return res.status(400).json({ message: 'Provide studentId or studentEmail' });
      const sDoc = await studentsCol.findOne({ email: studentEmail.toLowerCase() });
      if (!sDoc) return res.status(404).json({ message: 'Student not found by email' });
      sidOid = sDoc._id;
    }

    const cidOid = toOid(classId);
    if (!cidOid) return res.status(400).json({ message: 'Invalid classId' });

    const db  = client.db('edufy');
    const doc = { studentId: sidOid, classId: cidOid, subject: subject.trim(), classGroup: classGroup.trim(), startTime, status, markedAt: new Date() };

    await db.collection('attendance').updateOne(
      { studentId: sidOid, classId: cidOid, startTime, subject: subject.trim(), classGroup: classGroup.trim() },
      { $set: doc }, { upsert: true }
    );

    try {
      const cls = await db.collection('timetables').findOne({ _id: cidOid });
      io.emit('attendance-updated', {
        studentId: sidOid.toString(), classId: cidOid.toString(),
        subject: doc.subject, status: doc.status, markedAt: doc.markedAt,
        classGroup: doc.classGroup, startTime: doc.startTime, teacher: cls?.teacher || null
      });
    } catch {}

    res.json({ success: true, ok: true });
  } catch (err) {
    console.error('/api/attendance/mark error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/attendance/bulk', async (req, res) => {
  try {
    const { items = [], classId, subject, startTime, classGroup } = req.body;
    const db  = client.db('edufy');
    let cls   = null;
    if (classId) { const oid = toOid(classId); if (oid) cls = await db.collection('timetables').findOne({ _id: oid }); }
    if (!cls && subject && startTime && classGroup) {
      cls = await db.collection('timetables').findOne({
        subject: { $regex: new RegExp(`^${subject}$`, 'i') }, startTime,
        classGroup: { $regex: new RegExp(`^${classGroup}$`, 'i') }
      });
    }
    if (!cls) return res.status(404).json({ message: 'Class not found in timetable' });

    const dateKey = new Date().toISOString().slice(0, 10);
    const results = [];
    for (const it of items) {
      try {
        let sid = toOid(it.studentId);
        if (!sid && it.email) { const s = await db.collection('students').findOne({ email: it.email.toLowerCase() }); if (s) sid = s._id; }
        if (!sid) { results.push({ ok: false, email: it.email, reason: 'not found' }); continue; }
        await db.collection('attendance').updateOne(
          { studentId: sid, classId: cls._id, dateKey },
          { $set: { studentId: sid, classId: cls._id, subject: cls.subject, classGroup: cls.classGroup, startTime: cls.startTime, status: it.status, markedAt: new Date(), dateKey }},
          { upsert: true }
        );
        io.emit('attendance-updated', { studentId: String(sid), classId: String(cls._id), subject: cls.subject, status: it.status, markedAt: new Date(), classGroup: cls.classGroup, startTime: cls.startTime, teacher: cls.teacher || null });
        results.push({ ok: true, studentId: String(sid), status: it.status });
      } catch (e) { results.push({ ok: false, email: it.email, reason: e.message }); }
    }
    res.json({ ok: true, failed: results.filter(r => !r.ok).length, results });
  } catch (err) {
    res.status(500).json({ message: 'Bulk attendance failed' });
  }
});

app.get('/api/attendance/recent/:studentId', async (req, res) => {
  try {
    const oid = toOid(req.params.studentId);
    if (!oid) return res.status(400).json({ message: 'Invalid id' });
    const rows = await client.db('edufy').collection('attendance').find({ studentId: oid }).sort({ markedAt: -1 }).limit(10).toArray();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/attendance/subject-percent', async (req, res) => {
  try {
    const { studentId, subject, classGroup, from, to } = req.query;
    if (!studentId || !subject) return res.status(400).json({ message: 'studentId and subject required' });
    const oid = toOid(studentId);
    if (!oid) return res.status(400).json({ message: 'Invalid studentId' });
    const db    = client.db('edufy');
    const match = { studentId: oid, subject: { $regex: new RegExp(`^${subject}$`, 'i') } };
    if (classGroup) match.classGroup = { $regex: new RegExp(`^${classGroup}$`, 'i') };
    if (from || to) { match.markedAt = {}; if (from) match.markedAt.$gte = new Date(`${from}T00:00:00.000Z`); if (to) match.markedAt.$lte = new Date(`${to}T23:59:59.999Z`); }
    const agg = await db.collection('attendance').aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: 1 }, presents: { $sum: { $cond: [{ $eq: ['$status','present'] },1,0] } }, absents: { $sum: { $cond: [{ $eq: ['$status','absent'] },1,0] } } }},
      { $project: { _id:0, total:1, presents:1, absents:1, percent: { $cond: [{ $eq:['$total',0] },0, { $round: [{ $multiply: [{ $divide: ['$presents','$total'] },100] },2] }] } }}
    ]).toArray();
    res.json(agg[0] || { total:0, presents:0, absents:0, percent:0 });
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/attendance/student', async (req, res) => {
  try {
    const { studentId, limit=12, skip=0, subject, status, from, to } = req.query;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const oid = toOid(studentId);
    if (!oid) return res.status(400).json({ message: 'Invalid studentId' });
    const db    = client.db('edufy');
    const match = { studentId: oid };
    if (subject) match.subject = { $regex: new RegExp(`^${subject}$`, 'i') };
    if (status)  match.status  = status;
    if (from || to) { match.markedAt = {}; if (from) match.markedAt.$gte = new Date(`${from}T00:00:00.000Z`); if (to) match.markedAt.$lte = new Date(`${to}T23:59:59.999Z`); }
    const lim   = Math.min(200, parseInt(limit)||12);
    const sk    = Math.max(0,   parseInt(skip)||0);
    const col   = db.collection('attendance');
    const total = await col.countDocuments(match);
    const rows  = await col.find(match).sort({ markedAt:-1 }).skip(sk).limit(lim).toArray();
    const ttCol = db.collection('timetables');
    for (const r of rows) {
      if (!r.teacher && r.classId) { try { const cOid = toOid(r.classId.toString()); if (cOid) { const cls = await ttCol.findOne({ _id: cOid }); if (cls?.teacher) r.teacher = cls.teacher; } } catch {} }
      r.studentId = String(r.studentId); r.classId = r.classId ? String(r.classId) : null;
    }
    res.json({ rows, total });
  } catch (err) { console.error('/api/attendance/student error:', err.message); res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/attendance/summary', async (req, res) => {
  try {
    const { studentId, from, to } = req.query;
    if (!studentId) return res.status(400).json({ message: 'studentId required' });
    const oid = toOid(studentId);
    if (!oid) return res.status(400).json({ message: 'Invalid studentId' });
    const db    = client.db('edufy');
    const match = { studentId: oid };
    if (from || to) { match.markedAt = {}; if (from) match.markedAt.$gte = new Date(`${from}T00:00:00.000Z`); if (to) match.markedAt.$lte = new Date(`${to}T23:59:59.999Z`); }
    const rows = await db.collection('attendance').aggregate([
      { $match: match },
      { $group: { _id: { subject:'$subject', classGroup:'$classGroup' }, total:{$sum:1}, presents:{$sum:{$cond:[{$eq:['$status','present']},1,0]}}, absents:{$sum:{$cond:[{$eq:['$status','absent']},1,0]}} }},
      { $project: { _id:0, subject:'$_id.subject', classGroup:'$_id.classGroup', total:1, presents:1, absents:1, percent:{$cond:[{$eq:['$total',0]},0,{$round:[{$multiply:[{$divide:['$presents','$total']},100]},2]}]} }},
      { $sort: { subject:1 } }
    ]).toArray();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});

app.get('/api/attendance/all', async (req, res) => {
  try {
    const { section, date, limit=100 } = req.query;
    const db    = client.db('edufy');
    const match = {};
    if (section) match.classGroup = { $regex: new RegExp(`^${section}$`, 'i') };
    if (date) { match.markedAt = { $gte: new Date(`${date}T00:00:00.000Z`), $lte: new Date(`${date}T23:59:59.999Z`) }; }
    const rows    = await db.collection('attendance').find(match).sort({ markedAt:-1 }).limit(parseInt(limit)).toArray();
    const studCol = db.collection('students');
    const enriched = await Promise.all(rows.map(async r => {
      let studentName = '';
      try { const sid = toOid(r.studentId?.toString()); if (sid) { const s = await studCol.findOne({ _id:sid },{ projection:{fullName:1,name:1} }); studentName = s?.fullName||s?.name||''; } } catch {}
      return { ...r, studentId: String(r.studentId), classId: r.classId ? String(r.classId) : null, studentName };
    }));
    res.json({ rows: enriched, total: enriched.length });
  } catch (err) { res.status(500).json({ message: 'Failed' }); }
});
app.get(
"/api/teacher/my-sections",
teacherAuth,
async(req,res)=>{

res.json({

sections:
req.teacher.assignedSections || []

});

});
app.get(
"/api/teacher/students",
teacherAuth,
async(req,res)=>{

try{

const students=
await studentsCol.find({

section:{

$in:
req.teacher.assignedSections || []

}

})

.toArray();


res.json(students);

}
catch(err){

res.status(500).json({
message:"Server error"
});

}

});

// ── NEW FEATURE ROUTES ─────────────────────────────────
app.use('/api/mentor-system',       mentorRoutes);
app.use('/api/smart-notifications', smartNotifRoutes);

// ── STATIC FILES ───────────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/notification.mp3', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'notification.mp3'));
});

// ── START SERVER ───────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 EduFy running on http://localhost:${PORT}`);
  console.log(`📡 API ready  at http://localhost:${PORT}/api`);
});