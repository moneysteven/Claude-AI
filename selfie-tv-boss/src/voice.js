// Twilio phone menu (IVR). Twilio calls these URLs during a call and we
// reply with TwiML: instructions telling Twilio what to play and do next.
// The same menu answers outbound campaign calls AND people calling in.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { twiml: { VoiceResponse } } = require('twilio');
const config = require('./config');
const store = require('./store');
const phone = require('./phone');
const { notifyOwner, sendText, validateTwilioRequest } = require('./twilio-client');

const router = express.Router();
router.use(express.urlencoded({ extended: false }), validateTwilioRequest);

// Re-read on each call so edits to call-script.json apply without a restart.
function loadScript() {
  return JSON.parse(fs.readFileSync(config.scriptFile, 'utf8'));
}

// Play the recorded MP3 if it exists, otherwise read the text aloud.
function speak(node, script, line) {
  if (!line) return;
  if (line.audio && /^https?:\/\//.test(line.audio)) {
    node.play(line.audio);
  } else if (line.audio && fs.existsSync(path.join(config.audioDir, path.basename(line.audio)))) {
    node.play(`${config.publicUrl}/audio/${encodeURIComponent(path.basename(line.audio))}`);
  } else {
    node.say({ voice: script.voice, language: script.language }, line.text);
  }
}

const url = (p) => `${config.publicUrl}/voice/${p}`;

function send(res, twiml) {
  res.type('text/xml').send(twiml.toString());
}

// The other person on the line, whichever way the call went.
function caller(body) {
  return body.Direction === 'inbound' ? body.From : body.To;
}

function existingCall(body) {
  return store.readAll('calls').find((c) => c.callSid === body.CallSid) || {};
}

function recordCall(body, patch) {
  return store.upsert('calls', 'callSid', body.CallSid, {
    phone: phone.normalize(caller(body)),
    direction: body.Direction === 'inbound' ? 'inbound' : 'outbound',
    ...patch,
  });
}

// Hand over to the question-by-question interview.
function startQuestions(twiml, script) {
  speak(twiml, script, script.lines.questionsIntro);
  twiml.redirect(url('question?q=0'));
}

// Text the caller a link to the website (or straight to booking a service).
function textWebsiteLink(body, script, service) {
  const to = phone.normalize(caller(body));
  const templates = script.sms || {};
  const link = service
    ? `${config.websiteUrl}/?service=${encodeURIComponent(service)}#book`
    : config.websiteUrl;
  const text = (service ? templates.service : templates.website) || 'Selfie TV Boss Entertainment: {link}';
  sendText(to, text.replace('{link}', link).replace('{service}', service || '')).then((result) => {
    recordCall(body, { linkTexted: result.ok, linkError: result.ok ? '' : result.error });
  });
}

// The questions for this call: the chosen service's own list, or the default.
function questionsFor(script, body) {
  const service = existingCall(body).service;
  const option = script.options.find((o) => o.service === service);
  return (option && option.questions) || script.questions || [];
}

// Save one answer onto the call (answers[q]), keeping the others.
function saveAnswer(body, q, patch) {
  const existing = existingCall(body);
  const answers = Array.isArray(existing.answers) ? existing.answers.slice() : [];
  answers[q] = { ...(answers[q] || {}), ...patch };
  return recordCall(body, { answers });
}

// 1. Call connects.
router.post('/answer', (req, res) => {
  const script = loadScript();
  const twiml = new VoiceResponse();
  const answeredBy = req.body.AnsweredBy || '';

  if (answeredBy.startsWith('machine') || answeredBy === 'fax') {
    recordCall(req.body, { status: 'voicemail', answeredBy });
    speak(twiml, script, script.lines.voicemail);
    twiml.hangup();
    return send(res, twiml);
  }

  recordCall(req.body, { status: 'answered', answeredBy: answeredBy || 'human' });
  speak(twiml, script, script.lines.greeting);
  twiml.redirect(url('menu'));
  send(res, twiml);
});

// 2. Main menu, repeated up to 3 times if nobody presses anything.
router.post('/menu', (req, res) => {
  const script = loadScript();
  const twiml = new VoiceResponse();
  const attempt = parseInt(req.query.attempt, 10) || 1;

  if (attempt > 3) {
    speak(twiml, script, script.lines.goodbye);
    twiml.hangup();
    return send(res, twiml);
  }
  if (attempt > 1) speak(twiml, script, script.lines.noInput);

  const gather = twiml.gather({ numDigits: 1, action: url('choice'), timeout: 8 });
  speak(gather, script, script.lines.menu);
  twiml.redirect(url(`menu?attempt=${attempt + 1}`));
  send(res, twiml);
});

// 3. Caller pressed a key.
router.post('/choice', (req, res) => {
  const script = loadScript();
  const twiml = new VoiceResponse();
  const digit = req.body.Digits;

  if (digit === '*') {
    twiml.redirect(url('menu'));
    return send(res, twiml);
  }

  if (digit === '0') {
    recordCall(req.body, { status: 'asked for owner', service: 'Speak to Selfie TV Boss' });
    if (config.ownerPhone) {
      speak(twiml, script, script.lines.connecting);
      const dial = twiml.dial({ callerId: config.twilio.phoneNumber, timeout: 25, action: url('after-dial') });
      dial.number(config.ownerPhone);
    } else {
      startQuestions(twiml, script);
    }
    return send(res, twiml);
  }

  if (script.website && digit === script.website.digit) {
    const call = recordCall(req.body, { status: 'wanted website link', service: existingCall(req.body).service || 'Website link' });
    notifyOwner(`${call.phone} asked for your website link on the call system. It was texted to them.`);
    textWebsiteLink(req.body, script);
    speak(twiml, script, script.website);
    twiml.hangup();
    return send(res, twiml);
  }

  const option = script.options.find((o) => o.digit === digit);
  if (!option) {
    speak(twiml, script, script.lines.invalid);
    twiml.redirect(url('menu'));
    return send(res, twiml);
  }

  const call = recordCall(req.body, { status: 'interested', service: option.service });
  notifyOwner(`New lead from the call system: ${call.phone} wants ${option.service}. Details in /admin.`);
  textWebsiteLink(req.body, script, option.service);
  speak(twiml, script, option);
  speak(twiml, script, script.lines.linkSent);
  startQuestions(twiml, script);
  send(res, twiml);
});

// 4. Forwarded call to the owner finished (or wasn't answered).
router.post('/after-dial', (req, res) => {
  const script = loadScript();
  const twiml = new VoiceResponse();
  if (req.body.DialCallStatus === 'completed') {
    recordCall(req.body, { status: 'spoke with owner' });
    twiml.hangup();
  } else {
    notifyOwner(`Missed transfer: ${phone.normalize(caller(req.body))} pressed 0 to speak with you. Please call back.`);
    speak(twiml, script, script.lines.ownerUnavailable);
    startQuestions(twiml, script);
  }
  send(res, twiml);
});

// 5. Ask question number q (from "questions" in call-script.json).
router.post('/question', (req, res) => {
  const script = loadScript();
  const twiml = new VoiceResponse();
  const questions = questionsFor(script, req.body);
  const q = parseInt(req.query.q, 10) || 0;

  if (q >= questions.length) {
    const call = recordCall(req.body, { status: 'answered questions' });
    const answered = (call.answers || []).filter(Boolean).length;
    if (answered) notifyOwner(`${call.phone} answered your questions about ${call.service || 'an event'}. Listen in /admin.`);
    speak(twiml, script, script.lines.thanks);
    twiml.hangup();
    return send(res, twiml);
  }

  const question = questions[q];
  speak(twiml, script, question);
  twiml.record({
    action: url(`reply?q=${q}`),
    maxLength: question.maxSeconds || 30,
    timeout: 5,
    finishOnKey: '#',
    playBeep: true,
    ...(config.transcribeAnswers ? { transcribe: true, transcribeCallback: url(`transcribed?q=${q}`) } : {}),
  });
  // Reached only if the caller stayed silent: skip to the next question.
  twiml.redirect(url(`question?q=${q + 1}`));
  send(res, twiml);
});

// 6. An answer was recorded.
router.post('/reply', (req, res) => {
  const script = loadScript();
  const q = parseInt(req.query.q, 10) || 0;
  const question = questionsFor(script, req.body)[q] || {};
  saveAnswer(req.body, q, {
    question: question.label || question.text || `Question ${q + 1}`,
    recordingUrl: req.body.RecordingUrl ? `${req.body.RecordingUrl}.mp3` : '',
    seconds: Number(req.body.RecordingDuration) || 0,
  });
  const twiml = new VoiceResponse();
  twiml.redirect(url(`question?q=${q + 1}`));
  send(res, twiml);
});

// 7. Twilio finished typing out an answer (arrives a minute or so later).
router.post('/transcribed', (req, res) => {
  const q = parseInt(req.query.q, 10) || 0;
  if (req.body.TranscriptionStatus === 'completed') {
    saveAnswer(req.body, q, { transcript: String(req.body.TranscriptionText || '').slice(0, 2000) });
  }
  res.sendStatus(204);
});

// Twilio reports how each call ended (busy, no-answer, completed, ...).
router.post('/status', (req, res) => {
  const existing = existingCall(req.body);
  recordCall(req.body, {
    callStatus: req.body.CallStatus,
    durationSeconds: Number(req.body.CallDuration) || 0,
    // Keep the more useful menu status if the call got that far.
    status: existing.status ? existing.status : req.body.CallStatus,
  });
  res.sendStatus(204);
});

module.exports = router;
