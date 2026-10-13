(function () {
  'use strict';
  var SCRIPT = JSON.parse(document.getElementById('call-script').textContent);
  var AUDIO = JSON.parse(document.getElementById('call-audio').textContent);
  var player = new Audio();
  var L = SCRIPT.lines;
  var $ = function (id) { return document.getElementById(id); };
  var keypad = $('keypad'), log = $('log'), caption = $('caption'), dash = $('dash');
  var sound = $('sound'), answerWrap = $('answer-wrap');
  var micStatus = $('mic-status'), liveText = $('live-text');

  var CANCEL = {};
  var run = 0, phase = 'idle', tries = 1, startedAt = 0, timerId = 0, lead = null, waitKey = null;

  // ---- Keypad ----
  var SUB = { '0': 'The Boss', '*': 'Repeat' };
  if (SCRIPT.website) SUB[SCRIPT.website.digit] = 'Website';
  SCRIPT.options.forEach(function (o) { SUB[o.digit] = o.service; });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].forEach(function (k) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'key'; b.dataset.key = k; b.disabled = true;
    b.setAttribute('aria-label', 'Key ' + k + (SUB[k] ? ': ' + SUB[k] : ''));
    b.innerHTML = '<span>' + k + (SUB[k] ? '<small>' + SUB[k] + '</small>' : '') + '</span>';
    b.addEventListener('click', function () { press(k); });
    keypad.appendChild(b);
  });
  function setKeys(allowed) {
    Array.prototype.forEach.call(keypad.children, function (b) {
      var on = allowed === 'all' || (allowed || '').indexOf(b.dataset.key) >= 0;
      b.disabled = !on;
      b.classList.toggle('hint', on && allowed !== 'all' && allowed.length === 1);
    });
  }

  // ---- Speech ----
  var voice = null;
  // Pick the most natural-sounding English voice the device offers.
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var score = function (v) {
      var n = v.name;
      var s = 0;
      if (/natural|neural|premium|enhanced|online/i.test(n)) s += 4;
      if (/google/i.test(n)) s += 2;
      if (/en-(US|GB)/i.test(v.lang)) s += 1;
      if (/guy|andrew|brian|christopher|eric|davis|daniel|matthew|male/i.test(n) && !/female/i.test(n)) s += 1;
      if (/compact|espeak|zarvox|bad news|bells|whisper|novelty/i.test(n)) s -= 5;
      return s;
    };
    voice = vs.sort(function (a, b) { return score(b) - score(a); })[0] || null;
  }
  try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { /* no speech */ }

  function speak(text, my) {
    return new Promise(function (resolve, reject) {
      var done = function () { my === run ? resolve() : reject(CANCEL); };
      var wait = Math.min(900 + text.length * 28, 6000);
      if (!sound.checked || !('speechSynthesis' in window)) return setTimeout(done, wait);
      try {
        var u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.rate = 0.97;
        var fallback = setTimeout(done, wait + text.length * 60 + 4000);
        // A short breath between lines so the call flows like a person talking.
        u.onend = u.onerror = function () { clearTimeout(fallback); setTimeout(done, 350); };
        speechSynthesis.speak(u);
      } catch (e) { setTimeout(done, wait); }
    });
  }
  function hush() {
    try { player.pause(); player.onended = player.onerror = null; } catch (e) { /* ignore */ }
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  // Play the real recording (the same MP3 the phone call uses).
  function play(src, my, text) {
    return new Promise(function (resolve, reject) {
      var done = function () { my === run ? setTimeout(resolve, 250) : reject(CANCEL); };
      player.onended = done;
      player.onerror = function () { speak(text, my).then(resolve, reject); };
      player.src = src;
      var p = player.play();
      if (p && p.catch) p.catch(function () { player.onended = player.onerror = null; speak(text, my).then(resolve, reject); });
    });
  }

  // ---- Transcript ----
  function addLine(cls, tag, text) {
    if (log.querySelector('.empty-flow')) log.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'line ' + cls;
    if (tag) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; d.appendChild(t); }
    var p = document.createElement('span'); p.textContent = text; d.appendChild(p);
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }
  function setCaption(tag, text, rec) {
    caption.className = 'caption' + (rec ? ' rec' : '');
    caption.innerHTML = '';
    if (rec) {
      var r = document.createElement('div'); r.className = 'recbar';
      r.innerHTML = '<span class="dot"></span><span>Recording answer</span>';
      caption.appendChild(r);
    }
    var t = document.createElement('span'); t.className = 'tag'; t.textContent = tag; caption.appendChild(t);
    var p = document.createElement('span'); p.textContent = text; caption.appendChild(p);
  }
  async function say(line, my) {
    if (my !== run) throw CANCEL;
    setCaption(line.audio, line.text);
    addLine('', line.audio, line.text);
    if (sound.checked && AUDIO[line.audio]) await play(AUDIO[line.audio], my, line.text);
    else await speak(line.text, my);
  }
  function sys(text) { addLine('sys', '', text); }
  function textSent(body) { addLine('sms', 'Text message sent to the customer', body); }

  function showFlow() {
    log.innerHTML = '';
    var d = document.createElement('div');
    d.className = 'line sys empty-flow';
    d.innerHTML = '<span><b>How the call goes:</b> thank-you greeting → options (' +
      SCRIPT.options.map(function (o) { return o.digit + ' ' + o.service; }).join(', ') +
      ', ' + (SCRIPT.website ? SCRIPT.website.digit + ' texts the website link, ' : '') + '0 reaches you, * repeats) → short pitch and a booking link by text → ' + (SCRIPT.questions || []).length +
      ' questions, each answered after a beep → thank you.</span>';
    log.appendChild(d);
  }

  // ---- Call lifecycle ----
  function tick() {
    var s = Math.floor((Date.now() - startedAt) / 1000);
    $('timer').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function begin(label) {
    run++; hush(); tries = 1; lead = null; waitKey = null;
    log.innerHTML = '';
    $('who-label').textContent = label;
    $('start-buttons').hidden = true; $('call-controls').hidden = false;
    startedAt = Date.now(); clearInterval(timerId); tick(); timerId = setInterval(tick, 1000);
    renderDash();
    return run;
  }
  function end(reason) {
    run++; hush(); phase = 'ended'; waitKey = null;
    clearInterval(timerId);
    setKeys(''); answerWrap.hidden = true; $('silent').hidden = true;
    releaseMic();
    $('who-label').textContent = 'Call ended';
    $('start-buttons').hidden = false; $('call-controls').hidden = true;
    setCaption('Call ended', 'Press Start call to try again.');
    sys('Call ended' + (reason ? ' (' + reason + ')' : '') + '.');
  }
  function guard(fn) {
    return function () {
      return fn.apply(null, arguments).catch(function (e) { if (e !== CANCEL) console.error(e); });
    };
  }

  var outgoing = guard(async function () {
    var my = begin('On call');
    await say(L.greeting, my);
    await menu(my);
  });
  async function menu(my) {
    phase = 'menu';
    setKeys('all');
    $('silent').hidden = false;
    await say(L.menu, my);
    if (my === run) setCaption('Waiting for a key', 'Press a key on the keypad, or tap "Stay silent".');
  }

  var silent = guard(async function () {
    var my = ++run; hush();
    addLine('you', 'Customer', '(no key pressed)');
    if (++tries > 3) { setKeys(''); $('silent').hidden = true; await say(L.goodbye, my); return end('no choice after 3 tries'); }
    await say(L.noInput, my);
    await menu(my);
  });

  var press = guard(async function (k) {
    if (phase === 'question') {
      if (k !== '#') return;
      if (waitKey) waitKey();
      return;
    }
    if (phase !== 'menu') return;
    var my = ++run; hush();
    addLine('you', 'Customer pressed', k + (SUB[k] ? ' (' + SUB[k] + ')' : ''));
    $('silent').hidden = true;
    setKeys('');
    phase = 'busy';

    if (SCRIPT.website && k === SCRIPT.website.digit) {
      lead = { service: 'Website link', answers: [], texted: true }; renderDash();
      textSent(SCRIPT.sms.website.replace('{link}', 'selfietvboss.com'));
      await say(SCRIPT.website, my);
      return end('website link texted');
    }
    if (k === '*') return menu(my);
    if (k === '0') {
      lead = { service: 'Speak to Selfie TV Boss', answers: [] }; renderDash();
      await say(L.connecting, my);
      sys('Your phone rings now and you speak with the customer. If you can\'t answer, the call continues like this:');
      await say(L.ownerUnavailable, my);
      return questions(my);
    }
    var opt = SCRIPT.options.filter(function (o) { return o.digit === k; })[0];
    if (!opt) { await say(L.invalid, my); return menu(my); }
    lead = { service: opt.service, answers: [], texted: true }; renderDash();
    textSent(SCRIPT.sms.service.replace('{service}', opt.service).replace('{link}', 'selfietvboss.com/?service=' + encodeURIComponent(opt.service) + '#book'));
    sys('You also get a text alert: new customer interested in ' + opt.service + '.');
    await say(opt, my);
    await say(L.linkSent, my);
    await questions(my, opt);
  });

  // ---- Microphone: record the spoken answer and type it out live ----
  var micStream, currentAnswer = null, muted = false;
  function setMuted(m) {
    muted = m;
    var btn = $('mute');
    btn.setAttribute('aria-pressed', String(m));
    btn.setAttribute('aria-label', m ? 'Unmute microphone' : 'Mute microphone');
    btn.title = m ? 'Unmute microphone' : 'Mute microphone';
    $('mute-label').textContent = m ? 'Unmute' : 'Mute';
    if (micStream) micStream.getAudioTracks().forEach(function (t) { t.enabled = !m; });
    if (currentAnswer) currentAnswer.setMuted(m);
  }
  async function getMic() {
    if (micStream !== undefined) return micStream;
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { micStream = null; }
    return micStream;
  }
  function releaseMic() {
    if (currentAnswer) { currentAnswer.stop(); currentAnswer = null; }
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    micStream = undefined;
    setMuted(false);
  }
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      var ctx = beep.ctx || (beep.ctx = new Ctx());
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch (e) { /* no beep */ }
    return new Promise(function (r) { setTimeout(r, 350); });
  }
  function startAnswer(stream) {
    var chunks = [], mr = null, recog = null, finalText = '', interim = '';
    liveText.textContent = '';
    if (stream && window.MediaRecorder) {
      try {
        mr = new MediaRecorder(stream);
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.start();
        if (muted && mr.pause) mr.pause();
      } catch (e) { mr = null; }
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (stream && SR) {
      try {
        recog = new SR();
        recog.lang = 'en-US'; recog.continuous = true; recog.interimResults = true;
        recog.onresult = function (ev) {
          interim = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) finalText += t + ' '; else interim += t;
          }
          liveText.textContent = (finalText + interim).trim();
        };
        recog.onerror = function () { /* keep recording audio */ };
        // Browsers end recognition after a pause; keep it going while the mic is on.
        recog.onend = function () { if (!stopped && !muted) { try { recog.start(); } catch (e) { /* ignore */ } } };
        if (!muted) recog.start();
      } catch (e) { recog = null; }
    }
    var listening = 'Listening… speak your answer, then press <b>#</b>.' + (recog ? '' : ' (Your answer is recorded; typing it out isn\'t supported in this browser.)');
    var mutedMsg = 'Your microphone is muted. Tap the microphone button to talk, or press <b>#</b> to skip.';
    var stopped = false;
    micStatus.innerHTML = !stream
      ? 'The customer speaks their answer here. The microphone isn\'t available on this page, so press <b>#</b> to continue.'
      : muted ? mutedMsg : listening;
    return {
      setMuted: function (m) {
        if (!stream || stopped) return;
        micStatus.innerHTML = m ? mutedMsg : listening;
        try {
          if (mr && m && mr.state === 'recording' && mr.pause) mr.pause();
          if (mr && !m && mr.state === 'paused') mr.resume();
        } catch (e) { /* ignore */ }
        try { if (recog) { if (m) recog.stop(); else recog.start(); } } catch (e) { /* already running */ }
      },
      stop: function () {
        if (stopped) return Promise.resolve({ text: '', url: '' });
        stopped = true;
        return new Promise(function (resolve) {
          try { if (recog) recog.stop(); } catch (e) { /* ignore */ }
          var finish = function () {
            setTimeout(function () {   // let the last words arrive
              resolve({
                text: (finalText + interim).trim(),
                url: chunks.length ? URL.createObjectURL(new Blob(chunks, { type: (mr && mr.mimeType) || 'audio/webm' })) : '',
              });
            }, 400);
          };
          if (mr && mr.state !== 'inactive') { mr.onstop = finish; try { mr.stop(); } catch (e) { finish(); } }
          else finish();
        });
      },
    };
  }

  async function questions(my, opt) {
    await say(L.questionsIntro, my);
    var qs = (opt && opt.questions) || SCRIPT.questions || [];
    for (var i = 0; i < qs.length; i++) {
      await say(qs[i], my);
      var stream = await getMic();
      if (my !== run) throw CANCEL;
      await beep();
      phase = 'question';
      answerWrap.hidden = false;
      setKeys('#');
      setCaption(qs[i].label + ' · up to ' + (qs[i].maxSeconds || 30) + 's', qs[i].text, true);
      currentAnswer = startAnswer(stream);
      var limit = setTimeout(function () { if (waitKey) waitKey(); }, (qs[i].maxSeconds || 30) * 1000);
      await new Promise(function (resolve) { waitKey = resolve; });
      clearTimeout(limit);
      waitKey = null;
      if (my !== run) throw CANCEL;
      var heard = await currentAnswer.stop();
      currentAnswer = null;
      if (my !== run) throw CANCEL;
      answerWrap.hidden = true;
      setKeys('');
      phase = 'busy';
      addLine('you', 'Customer answers', heard.text || (heard.url ? '(spoken answer recorded)' : '(answer recorded)'));
      lead.answers.push({ label: qs[i].label, text: heard.text, url: heard.url });
      renderDash();
    }
    await say(L.thanks, my);
    end('all questions answered');
  }

  function renderDash() {
    dash.innerHTML = '';
    if (!lead) {
      dash.innerHTML = '<p class="empty">Pick a service on the keypad and answer the questions. The lead appears here the way it will in your <code>/admin</code> dashboard.</p>';
      return;
    }
    var s = document.createElement('span'); s.className = 'svc'; s.textContent = 'Wants: ' + lead.service; dash.appendChild(s);
    var p = document.createElement('p'); p.className = 'note'; p.textContent = 'Customer +1 (876) 555-0101 · just now' + (lead.texted ? ' · ✓ website link texted' : ''); dash.appendChild(p);
    if (!lead.answers.length) return;
    var dl = document.createElement('dl');
    lead.answers.forEach(function (a) {
      var dt = document.createElement('dt'); dt.textContent = a.label;
      var dd = document.createElement('dd');
      var q = document.createElement('div');
      q.textContent = a.text ? '“' + a.text + '”' : (a.url ? '(no text: listen below)' : 'Audio and typed-out text appear here on real calls.');
      dd.appendChild(q);
      if (a.url) { var au = document.createElement('audio'); au.controls = true; au.src = a.url; dd.appendChild(au); }
      dl.appendChild(dt); dl.appendChild(dd);
    });
    dash.appendChild(dl);
  }

  $('start-out').addEventListener('click', outgoing);
  $('silent').addEventListener('click', silent);
  $('hangup').addEventListener('click', function () { end('you hung up'); });
  $('mute').addEventListener('click', function () { setMuted(!muted); });
  sound.addEventListener('change', function () { if (!sound.checked) hush(); });
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-9*#]$/.test(e.key)) { var b = keypad.querySelector('[data-key="' + e.key + '"]'); if (b && !b.disabled) press(e.key); }
  });
  showFlow();
})();
