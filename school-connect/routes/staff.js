const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const store = require("../lib/store");
const school = require("../lib/school");
const notify = require("../lib/notify");
const bus = require("../lib/bus");
const { today, dateOf, formatDate, formatTime, daysUntil, newId, newToken } = require("../lib/util");

// Helpers available in every staff page.
router.use((req, res, next) => {
  Object.assign(res.locals, { dateOf, formatDate, formatTime, daysUntil, path: req.path });
  next();
});

function requireStaff(req, res, next) {
  if (req.session.isStaff) return next();
  res.redirect("/login");
}

function publicUrl(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// ---------- Login ----------

router.get("/login", (req, res) => {
  res.render("login", { title: "Staff login", error: null });
});

router.post("/login", (req, res) => {
  const expected = process.env.STAFF_PASSWORD || "";
  const given = req.body.password || "";
  const ok =
    expected &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (ok) {
    req.session.isStaff = true;
    return res.redirect("/");
  }
  res.render("login", { title: "Staff login", error: "Incorrect password." });
});

router.post("/logout", (req, res) => {
  req.session = null;
  res.redirect("/login");
});

router.use(requireStaff);

// ---------- Dashboard ----------

router.get("/", (req, res) => {
  const date = today();
  const students = store.all("students");
  const attendance = school.attendanceFor(date);
  const messagesToday = store.all("messages").filter((m) => dateOf(m.at) === date);
  res.render("dashboard", {
    title: "Dashboard",
    date,
    totalStudents: students.length,
    present: attendance.filter((a) => a.status === "present").length,
    late: attendance.filter((a) => a.status === "late").length,
    absent: attendance.filter((a) => a.status === "absent").length,
    marked: attendance.length,
    lunchCollected: school.lunchFor(date).filter((l) => l.collectedAt).length,
    lunchUncollected: school.uncollectedLunch(date).length,
    messagesToday: messagesToday.length,
    sbaBehind: school.sbaBehind().length,
    buses: store.all("buses"),
  });
});

// ---------- Attendance ----------

router.get("/attendance", (req, res) => {
  const classes = store.all("classes");
  const classId = req.query.class || classes[0].id;
  const date = req.query.date || today();
  const records = school.attendanceFor(date);
  res.render("attendance", {
    title: "Attendance",
    classes,
    classId,
    date,
    students: store.all("students").filter((s) => s.classId === classId),
    statusOf: (id) => (records.find((r) => r.studentId === id) || {}).status || "present",
    saved: records.some((r) => store.find("students", r.studentId)?.classId === classId),
  });
});

router.post("/attendance", async (req, res) => {
  const { classId, date } = req.body;
  const marks = {};
  for (const s of store.all("students").filter((s) => s.classId === classId)) {
    const status = req.body[`status_${s.id}`];
    marks[s.id] = ["present", "absent", "late"].includes(status) ? status : "present";
  }
  const { sent } = await school.saveAttendance(date, marks);
  req.session.flash = `Register saved. ${plural(sent, "parent")} notified.`;
  res.redirect(`/attendance?class=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`);
});

// ---------- Lunch ----------

router.get("/lunch", (req, res) => {
  const date = today();
  const attendance = school.attendanceFor(date);
  const lunch = school.lunchFor(date);
  const rows = store
    .all("students")
    .filter((s) => s.lunchProgram)
    .map((s) => ({
      student: s,
      attendance: (attendance.find((a) => a.studentId === s.id) || {}).status || null,
      lunch: lunch.find((l) => l.studentId === s.id) || null,
    }));
  res.render("lunch", {
    title: "Lunch",
    date,
    rows,
    classes: store.all("classes"),
    uncollected: school.uncollectedLunch(date).filter((u) => !u.alerted).length,
    registerTaken: attendance.length > 0,
  });
});

router.post("/lunch/:studentId/collected", (req, res) => {
  school.markLunchCollected(req.params.studentId);
  res.redirect("/lunch");
});

router.post("/lunch/alerts", async (req, res) => {
  const { sent } = await school.sendLunchAlerts(today());
  req.session.flash = `${plural(sent, "parent")} told their child didn't collect lunch.`;
  res.redirect("/lunch");
});

// ---------- Broadcast ----------

function audienceParents(audience) {
  const students = store.all("students");
  const parents = store.all("parents");
  let chosen = students;
  if (audience.startsWith("class:")) chosen = students.filter((s) => s.classId === audience.slice(6));
  if (audience.startsWith("bus:")) chosen = students.filter((s) => s.busId === audience.slice(4));
  const ids = new Set(chosen.map((s) => s.parentId));
  return parents.filter((p) => ids.has(p.id));
}

router.get("/broadcast", (req, res) => {
  const classes = store.all("classes");
  const buses = store.all("buses");
  const counts = { all: audienceParents("all").length };
  classes.forEach((c) => (counts[`class:${c.id}`] = audienceParents(`class:${c.id}`).length));
  buses.forEach((b) => (counts[`bus:${b.id}`] = audienceParents(`bus:${b.id}`).length));
  res.render("broadcast", { title: "Message parents", classes, buses, counts });
});

router.post("/broadcast", async (req, res) => {
  const body = String(req.body.body || "").trim();
  const audience = String(req.body.audience || "all");
  if (!body) {
    req.session.flash = "Type a message first.";
    return res.redirect("/broadcast");
  }
  const results = await notify.sendToParents(
    audienceParents(audience),
    () => `${notify.schoolName()}: ${body}`,
    req.body.urgent ? "broadcast-urgent" : "broadcast"
  );
  const failed = results.filter((r) => r.status === "failed").length;
  req.session.flash =
    `Message sent to ${plural(results.length - failed, "parent")}.` + (failed ? ` ${failed} failed — see Messages.` : "");
  res.redirect("/messages");
});

// ---------- Messages log ----------

router.get("/messages", (req, res) => {
  res.render("messages", { title: "Messages", messages: store.all("messages").slice().reverse().slice(0, 300) });
});

// ---------- SBAs ----------

router.get("/sba", (req, res) => {
  const classes = store.all("classes");
  const classId = req.query.class || "";
  const students = store.all("students");
  const progress = store.all("sbaProgress");
  const components = store
    .all("sbaComponents")
    .filter((c) => !classId || c.classId === classId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((c) => ({ ...c, stats: school.componentStats(c, students, progress) }));
  res.render("sba", {
    title: "SBA tracker",
    classes,
    classId,
    components,
    behind: school.sbaBehind(classId),
    warningDays: school.sbaWarningDays(),
    className: (id) => (classes.find((c) => c.id === id) || {}).name,
  });
});

router.post("/sba", (req, res) => {
  const { subject, title, classId, dueDate } = req.body;
  if (subject && title && classId && /^\d{4}-\d{2}-\d{2}$/.test(dueDate || "")) {
    store.append("sbaComponents", { id: newId("sba"), subject, title, classId, dueDate });
    req.session.flash = `Added ${subject} – ${title}.`;
  } else {
    req.session.flash = "Fill in subject, task, class and due date.";
  }
  res.redirect("/sba");
});

router.post("/sba/alerts", async (req, res) => {
  const { sent } = await school.sendSbaAlerts(req.body.classId || "");
  req.session.flash = `${plural(sent, "parent")} sent an SBA reminder.`;
  res.redirect(`/sba${req.body.classId ? `?class=${encodeURIComponent(req.body.classId)}` : ""}`);
});

router.get("/sba/:id", (req, res) => {
  const component = store.find("sbaComponents", req.params.id);
  if (!component) return res.status(404).render("404", { title: "Not found" });
  const progress = store.all("sbaProgress");
  res.render("sba-component", {
    title: `${component.subject} SBA`,
    component,
    klass: store.find("classes", component.classId),
    students: school.studentsForComponent(component),
    statusOf: (studentId) => school.sbaStatus(component.id, studentId, progress),
    statuses: school.SBA_STATUSES,
  });
});

router.post("/sba/:id", (req, res) => {
  const component = store.find("sbaComponents", req.params.id);
  if (!component) return res.status(404).render("404", { title: "Not found" });
  const statuses = {};
  for (const s of school.studentsForComponent(component)) statuses[s.id] = req.body[`status_${s.id}`];
  school.saveSbaProgress(component.id, statuses);
  req.session.flash = "SBA progress saved.";
  res.redirect(`/sba/${component.id}`);
});

// ---------- Buses ----------

router.get("/buses", (req, res) => {
  const buses = store.all("buses");
  const students = store.all("students");
  res.render("buses", {
    title: "Buses",
    buses: buses.map((b) => ({ ...b, riders: bus.studentsOnBus(b, students).length })),
    baseUrl: publicUrl(req),
  });
});

router.get("/buses.json", (req, res) => {
  res.json(
    store.all("buses").map((b) => ({
      id: b.id,
      name: b.name,
      route: b.route,
      stops: b.stops,
      location: b.trip ? b.trip.location : null,
      direction: b.trip ? b.trip.direction : null,
    }))
  );
});

// ---------- Students & parents ----------

router.get("/students", (req, res) => {
  res.render("students", {
    title: "Students & parents",
    students: store.all("students"),
    parents: store.all("parents"),
    classes: store.all("classes"),
    buses: store.all("buses"),
    baseUrl: publicUrl(req),
  });
});

router.post("/students", (req, res) => {
  const { name, classId, parentName, phone, channel, path, busStop } = req.body;
  const cleanPhone = String(phone || "").replace(/[^\d+]/g, "");
  if (!name || !classId || !parentName || !/^\+\d{10,15}$/.test(cleanPhone)) {
    req.session.flash = "Enter the student, class, parent and a phone number like +18765551234.";
    return res.redirect("/students");
  }
  // Reuse the parent if this phone number is already on file (siblings).
  let parent = store.all("parents").find((p) => p.phone === cleanPhone);
  if (!parent) {
    parent = {
      id: newId("p"),
      name: parentName,
      phone: cleanPhone,
      channel: channel === "whatsapp" ? "whatsapp" : "sms",
      token: newToken(),
      alertRadiusM: bus.DEFAULT_ALERT_RADIUS_M,
    };
    store.append("parents", parent);
  }
  const [busId, stopId] = busStop ? busStop.split("|") : [null, null];
  store.append("students", {
    id: newId("st"),
    name,
    classId,
    parentId: parent.id,
    path: !!path,
    lunchProgram: !!path,
    busId: busId || null,
    stopId: stopId || null,
  });
  req.session.flash = `${name} added.`;
  res.redirect("/students");
});

router.post("/parents/:id/send-link", async (req, res) => {
  const parent = store.find("parents", req.params.id);
  if (!parent) return res.status(404).render("404", { title: "Not found" });
  const url = `${publicUrl(req)}/track/${parent.token}`;
  await notify.sendToParent(parent, notify.templates.trackingLink(parent, url), "tracking-link");
  req.session.flash = `Tracking link sent to ${parent.name}.`;
  res.redirect("/students");
});

module.exports = router;
