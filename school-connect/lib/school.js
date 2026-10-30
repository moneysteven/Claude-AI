// Attendance, lunch and SBA logic. Routes call these; these call the store
// and notify modules.

const store = require("./store");
const notify = require("./notify");
const { today, daysUntil } = require("./util");

function parentOf(student, parents = store.all("parents")) {
  return parents.find((p) => p.id === student.parentId) || null;
}

// ---------- Attendance ----------

function attendanceFor(date) {
  return store.all("attendance").filter((a) => a.date === date);
}

// marks = { studentId: "present" | "absent" | "late" }
// Saves the register, then texts parents of anyone absent/late. A parent is
// only texted once per status per day, so re-saving the register (e.g. to
// fix a typo) won't spam them.
async function saveAttendance(date, marks) {
  const records = store.all("attendance");
  const students = store.all("students");
  const parents = store.all("parents");
  const toAlert = [];

  for (const [studentId, status] of Object.entries(marks)) {
    let rec = records.find((r) => r.date === date && r.studentId === studentId);
    if (!rec) {
      rec = { date, studentId, alertedFor: [] };
      records.push(rec);
    }
    rec.status = status;
    if ((status === "absent" || status === "late") && !rec.alertedFor.includes(status)) {
      rec.alertedFor.push(status);
      toAlert.push({ studentId, status });
    }
  }
  store.saveAll("attendance", records);

  let sent = 0;
  for (const { studentId, status } of toAlert) {
    const student = students.find((s) => s.id === studentId);
    const parent = student && parentOf(student, parents);
    if (!parent) continue;
    await notify.sendToParent(parent, notify.templates[status](student, parent, date), `attendance-${status}`);
    sent++;
  }
  return { sent };
}

// ---------- Lunch ----------

function lunchFor(date) {
  return store.all("lunch").filter((l) => l.date === date);
}

function markLunchCollected(studentId, date = today()) {
  const records = store.all("lunch");
  let rec = records.find((r) => r.date === date && r.studentId === studentId);
  if (!rec) {
    rec = { date, studentId };
    records.push(rec);
  }
  if (!rec.collectedAt) rec.collectedAt = new Date().toISOString();
  store.saveAll("lunch", records);
  return rec;
}

// Students on the lunch programme who are at school today but haven't
// collected lunch, and whose parent hasn't already been told.
function uncollectedLunch(date) {
  const present = new Set(
    attendanceFor(date).filter((a) => a.status !== "absent").map((a) => a.studentId)
  );
  const lunch = lunchFor(date);
  return store
    .all("students")
    .filter((s) => s.lunchProgram && present.has(s.id))
    .filter((s) => !lunch.find((l) => l.studentId === s.id && l.collectedAt))
    .map((s) => ({ student: s, alerted: !!lunch.find((l) => l.studentId === s.id && l.alertedAt) }));
}

async function sendLunchAlerts(date) {
  const parents = store.all("parents");
  const records = store.all("lunch");
  let sent = 0;
  for (const { student, alerted } of uncollectedLunch(date)) {
    if (alerted) continue;
    const parent = parentOf(student, parents);
    if (!parent) continue;
    await notify.sendToParent(parent, notify.templates.lunchNotCollected(student, parent), "lunch");
    let rec = records.find((r) => r.date === date && r.studentId === student.id);
    if (!rec) {
      rec = { date, studentId: student.id };
      records.push(rec);
    }
    rec.alertedAt = new Date().toISOString();
    sent++;
  }
  store.saveAll("lunch", records);
  return { sent };
}

// ---------- SBAs ----------

const SBA_STATUSES = ["not_started", "in_progress", "submitted"];

function sbaWarningDays() {
  return Number(process.env.SBA_WARNING_DAYS || 14);
}

function sbaStatus(componentId, studentId, progress = store.all("sbaProgress")) {
  const p = progress.find((x) => x.componentId === componentId && x.studentId === studentId);
  return p ? p.status : "not_started";
}

function studentsForComponent(component, students = store.all("students")) {
  return students.filter((s) => s.classId === component.classId);
}

function componentStats(component, students, progress) {
  const list = studentsForComponent(component, students);
  const submitted = list.filter((s) => sbaStatus(component.id, s.id, progress) === "submitted").length;
  return { total: list.length, submitted, daysLeft: daysUntil(component.dueDate) };
}

// Students with at least one SBA that isn't submitted and is due soon or
// overdue — the list a teacher/principal needs to act on.
function sbaBehind(classId) {
  const students = store.all("students").filter((s) => !classId || s.classId === classId);
  const progress = store.all("sbaProgress");
  const components = store.all("sbaComponents");
  const warn = sbaWarningDays();

  return students
    .map((student) => {
      const items = components
        .filter((c) => c.classId === student.classId)
        .filter((c) => daysUntil(c.dueDate) <= warn)
        .filter((c) => sbaStatus(c.id, student.id, progress) !== "submitted")
        .map((c) => ({ ...c, status: sbaStatus(c.id, student.id, progress), daysLeft: daysUntil(c.dueDate) }))
        .sort((a, b) => a.daysLeft - b.daysLeft);
      return { student, items };
    })
    .filter((row) => row.items.length > 0)
    .sort((a, b) => a.items[0].daysLeft - b.items[0].daysLeft);
}

function saveSbaProgress(componentId, statuses) {
  const progress = store.all("sbaProgress").filter((p) => p.componentId !== componentId);
  for (const [studentId, status] of Object.entries(statuses)) {
    if (SBA_STATUSES.includes(status)) progress.push({ componentId, studentId, status });
  }
  store.saveAll("sbaProgress", progress);
}

async function sendSbaAlerts(classId) {
  const parents = store.all("parents");
  let sent = 0;
  for (const { student, items } of sbaBehind(classId)) {
    const parent = parentOf(student, parents);
    if (!parent) continue;
    await notify.sendToParent(parent, notify.templates.sbaBehind(student, parent, items), "sba");
    sent++;
  }
  return { sent };
}

module.exports = {
  parentOf,
  attendanceFor,
  saveAttendance,
  lunchFor,
  markLunchCollected,
  uncollectedLunch,
  sendLunchAlerts,
  SBA_STATUSES,
  sbaStatus,
  componentStats,
  studentsForComponent,
  sbaBehind,
  saveSbaProgress,
  sendSbaAlerts,
  sbaWarningDays,
};
