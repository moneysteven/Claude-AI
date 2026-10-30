// Sends messages to parents and keeps a log of every one in data/messages.json
// (the Messages page). All message wording lives here so it's easy to edit.

const store = require("./store");
const { getProvider } = require("./messaging");
const { newId, formatDate, formatTime, firstName } = require("./util");

function schoolName() {
  return process.env.SCHOOL_NAME || "Demo High School";
}

function schoolPhone() {
  return process.env.SCHOOL_PHONE || "the school office";
}

async function sendToParent(parent, body, kind) {
  const entry = {
    id: newId("msg"),
    at: new Date().toISOString(),
    parentId: parent.id,
    parentName: parent.name,
    to: parent.phone,
    channel: parent.channel || "sms",
    kind,
    body,
  };
  try {
    const result = await getProvider().send({ to: parent.phone, body, channel: entry.channel });
    entry.status = result.status;
    entry.providerRef = result.providerRef;
  } catch (err) {
    entry.status = "failed";
    entry.error = err.message;
  }
  store.append("messages", entry);
  return entry;
}

// Sends one message per parent, even if they have several children in the
// audience. `bodyFor(parent)` lets each message be personalised.
async function sendToParents(parents, bodyFor, kind) {
  const seen = new Set();
  const results = [];
  for (const parent of parents) {
    if (!parent || seen.has(parent.id)) continue;
    seen.add(parent.id);
    results.push(await sendToParent(parent, bodyFor(parent), kind));
  }
  return results;
}

const templates = {
  absent: (student, parent, date) =>
    `${schoolName()}: Good day ${parent.name}, ${student.name} was marked ABSENT today (${formatDate(date)}). ` +
    `If this is a mistake please call ${schoolPhone()}.`,

  late: (student, parent, date) =>
    `${schoolName()}: Good day ${parent.name}, ${student.name} was marked LATE today (${formatDate(date)}).`,

  lunchNotCollected: (student, parent) =>
    `${schoolName()}: ${parent.name}, ${firstName(student.name)} is at school today but did not collect lunch. ` +
    `Please check in with them.`,

  sbaBehind: (student, parent, items) =>
    `${schoolName()}: ${parent.name}, ${firstName(student.name)} has SBA work outstanding: ` +
    items.map((i) => `${i.subject} - ${i.title} (due ${formatDate(i.dueDate)})`).join("; ") +
    `. Please encourage them to complete it on time.`,

  busNear: (student, parent, bus, stop, etaMin, direction) =>
    direction === "morning"
      ? `${schoolName()}: ${bus.number} (${bus.plate}) is about ${etaMin} min from ${stop.name}. Time to head to the stop!`
      : `${schoolName()}: ${bus.number} (${bus.plate}) is about ${etaMin} min from ${stop.name} with ${firstName(student.name)}. Please meet them at the stop.`,

  boarded: (student, bus, at) =>
    `${schoolName()}: ${firstName(student.name)} got ON ${bus.number} (${bus.name}, ${bus.plate}) at ${formatTime(at)}. ` +
    `Driver: ${bus.driverName}, ${bus.driverPhone}.`,

  gotOff: (student, bus, at, placeName) =>
    `${schoolName()}: ${firstName(student.name)} got OFF ${bus.number} at ${placeName} at ${formatTime(at)}.`,

  arrivedSchool: (student, bus, at) =>
    `${schoolName()}: ${firstName(student.name)} arrived at school on ${bus.number} at ${formatTime(at)}.`,

  trackingLink: (parent, url) =>
    `${schoolName()}: ${parent.name}, follow your child's school bus live and get an alert when it's close: ${url}`,
};

module.exports = { sendToParent, sendToParents, templates, schoolName };
