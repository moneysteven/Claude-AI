// Creates demo data the first time the app starts (or on `npm run seed`,
// which wipes and recreates it). Every parent and driver link gets a fresh
// random token, so links from one install never work on another.
//
// For a real school, replace this with the school's own class lists. The
// Students page also lets staff add students one at a time.

const store = require("./store");
const { newToken, today } = require("./util");

function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function seed() {
  const classes = [
    { id: "c10a", name: "10A", teacher: "Mrs. Brown" },
    { id: "c11b", name: "11B", teacher: "Mr. Campbell" },
    { id: "c11c", name: "11C", teacher: "Ms. Grant" },
  ];

  // Demo routes. Coordinates are approximate — for a real school, drive the
  // route once with the driver page open and use those points, or plot them
  // on a map.
  const buses = [
    {
      id: "bus1",
      name: "Route 1 – Portmore",
      number: "Bus 12",
      plate: "PE 4521",
      description: "White Toyota Coaster",
      driverName: "Mr. Davis",
      driverPhone: "876-555-0201",
      driverToken: newToken(),
      scannerToken: newToken(),
      route: [
        [17.9556, -76.8822],
        [17.9583, -76.8705],
        [17.9612, -76.8545],
        [17.9655, -76.8360],
        [17.9701, -76.8160],
        [17.9762, -76.8010],
        [17.9898, -76.7952],
        [18.0049, -76.7931],
        [18.0127, -76.7966],
      ],
      stops: [
        { id: "s1", name: "Portmore Mall", lat: 17.9556, lng: -76.8822 },
        { id: "s2", name: "Portmore Pines", lat: 17.9612, lng: -76.8545 },
        { id: "s3", name: "Causeway", lat: 17.9701, lng: -76.816 },
        { id: "s4", name: "Three Miles", lat: 17.9898, lng: -76.7952 },
      ],
      school: { lat: 18.0127, lng: -76.7966 },
      trip: null,
    },
    {
      id: "bus2",
      name: "Route 2 – Constant Spring",
      number: "Bus 7",
      plate: "PF 9310",
      description: "Yellow Nissan Civilian",
      driverName: "Miss Walters",
      driverPhone: "876-555-0202",
      driverToken: newToken(),
      scannerToken: newToken(),
      route: [
        [18.0512, -76.7958],
        [18.0435, -76.7949],
        [18.0352, -76.7962],
        [18.0255, -76.7971],
        [18.0127, -76.7966],
      ],
      stops: [
        { id: "s1", name: "Constant Spring Market", lat: 18.0512, lng: -76.7958 },
        { id: "s2", name: "Manor Park", lat: 18.0435, lng: -76.7949 },
        { id: "s3", name: "Mary Brown's Corner", lat: 18.0255, lng: -76.7971 },
      ],
      school: { lat: 18.0127, lng: -76.7966 },
      trip: null,
    },
  ];

  // [student, class, parent, phone, channel, PATH, bus, stop]
  // Phone numbers use 555, which is never assigned to a real line.
  const rows = [
    ["Shanique Williams", "c11b", "Marcia Williams", "+18765550101", "sms", true, "bus1", "s1"],
    ["Tajay Brown", "c11b", "Andrew Brown", "+18765550102", "whatsapp", false, "bus1", "s2"],
    ["Kemar Campbell", "c11b", "Sophia Campbell", "+18765550103", "sms", true, "bus1", "s3"],
    ["Alicia Thompson", "c11b", "Nadine Thompson", "+18765550104", "sms", false, null, null],
    ["Jordan Reid", "c11c", "Paul Reid", "+18765550105", "whatsapp", true, "bus1", "s4"],
    ["Tashana Clarke", "c11c", "Joan Clarke", "+18765550106", "sms", false, "bus2", "s1"],
    ["Damani Morgan", "c11c", "Keisha Morgan", "+18765550107", "sms", true, "bus2", "s2"],
    ["Brianna Lewis", "c11c", "Carlene Lewis", "+18765550108", "whatsapp", false, null, null],
    ["Rushawn Gordon", "c10a", "Marlon Gordon", "+18765550109", "sms", true, "bus2", "s3"],
    ["Kimone Henry", "c10a", "Sherene Henry", "+18765550110", "sms", false, "bus1", "s2"],
    ["Andre Walker", "c10a", "Dwayne Walker", "+18765550111", "sms", true, null, null],
    ["Jada McKenzie", "c10a", "Tanya McKenzie", "+18765550112", "whatsapp", false, "bus1", "s1"],
    // Tajay's younger brother: same parent phone, so one parent with two children.
    ["Jaden Brown", "c10a", "Andrew Brown", "+18765550102", "whatsapp", false, "bus1", "s2"],
  ];

  const parents = [];
  const students = [];
  rows.forEach(([name, classId, parentName, phone, channel, path, busId, stopId], i) => {
    const n = String(i + 1).padStart(2, "0");
    let parent = parents.find((p) => p.phone === phone);
    if (!parent) {
      parent = { id: `p${n}`, name: parentName, phone, channel, token: newToken(), alertRadiusM: 1000 };
      parents.push(parent);
    }
    students.push({
      id: `st${n}`,
      name,
      classId,
      parentId: parent.id,
      path,
      lunchProgram: path,
      busId,
      stopId,
    });
  });

  // CSEC SBAs for the two fifth-form (grade 11) classes, due at different
  // times so the "behind" list has something in it.
  const t = today();
  const sbaComponents = [];
  for (const classId of ["c11b", "c11c"]) {
    sbaComponents.push(
      { id: `${classId}-eng`, classId, subject: "English A", title: "Portfolio – 3 pieces", dueDate: addDays(t, 6) },
      { id: `${classId}-math`, classId, subject: "Mathematics", title: "Statistics project", dueDate: addDays(t, 12) },
      { id: `${classId}-it`, classId, subject: "Information Technology", title: "Spreadsheet & database", dueDate: addDays(t, -2) },
      { id: `${classId}-pob`, classId, subject: "Principles of Business", title: "Business plan", dueDate: addDays(t, 45) }
    );
  }
  sbaComponents.push({ id: "c10a-sci", classId: "c10a", subject: "Integrated Science", title: "Lab book – Term 1", dueDate: addDays(t, 9) });

  // Some progress already entered, so the screens aren't empty.
  const statuses = ["submitted", "in_progress", "not_started", "submitted", "submitted", "in_progress"];
  const sbaProgress = [];
  sbaComponents.forEach((c, ci) => {
    students
      .filter((s) => s.classId === c.classId)
      .forEach((s, si) => {
        sbaProgress.push({ componentId: c.id, studentId: s.id, status: statuses[(ci + si) % statuses.length] });
      });
  });

  store.saveAll("classes", classes);
  store.saveAll("buses", buses);
  store.saveAll("parents", parents);
  store.saveAll("students", students);
  store.saveAll("sbaComponents", sbaComponents);
  store.saveAll("sbaProgress", sbaProgress);
  for (const name of ["attendance", "lunch", "busEvents", "messages"]) store.saveAll(name, []);
}

function seedIfEmpty() {
  if (!store.isSeeded()) {
    seed();
    console.log(`Demo data created in ${store.DATA_DIR}`);
  }
}

if (require.main === module) {
  require("dotenv").config();
  seed();
  console.log(`Demo data reset in ${store.DATA_DIR}`);
}

module.exports = { seed, seedIfEmpty };
