// Door scanner: reads QR codes from student ID cards with the camera and
// tells the server. Gives a big green/red flash plus a beep so students
// know it worked without the driver having to look.
(function () {
  const root = document.getElementById("scanner");
  const base = `/scan/${root.dataset.token}`;
  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const canvas = $("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let busy = false;
  let lastCode = null;
  let lastCodeAt = 0;
  let audio;

  function beep(ok) {
    try {
      audio = audio || new AudioContext();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.2;
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + (ok ? 0.15 : 0.4));
    } catch (e) { /* sound is optional */ }
  }

  function show(text, ok) {
    const r = $("result");
    r.textContent = text;
    r.className = `scan-result ${ok ? "good" : "bad"}`;
    r.hidden = false;
    beep(ok);
    if (navigator.vibrate) navigator.vibrate(ok ? 100 : [200, 100, 200]);
    clearTimeout(show.t);
    show.t = setTimeout(() => (r.hidden = true), 2500);
  }

  async function submit(code) {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(`${base}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) show(data.error || "Try again", false);
      else if (data.repeat) show(`${data.name}, you're already scanned ✓`, true);
      else show(`${data.type === "on" ? "Welcome" : "Bye"}, ${data.name}! ✓${data.wrongBus ? " (not your usual bus)" : ""}`, true);
      if (data.onBoard !== undefined) $("count").textContent = `${data.onBoard} on board`;
    } catch (e) {
      show("No internet — try again", false);
    } finally {
      busy = false;
    }
  }

  function loop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
      // The same card held in front of the camera is only sent once every few seconds.
      if (qr && (qr.data !== lastCode || Date.now() - lastCodeAt > 4000)) {
        lastCode = qr.data;
        lastCodeAt = Date.now();
        submit(qr.data);
      }
    }
    requestAnimationFrame(loop);
  }

  $("start-cam").onclick = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      video.srcObject = stream;
      await video.play();
      $("start-cam").hidden = true;
      if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(() => {});
      loop();
    } catch (e) {
      show("Camera not available. Use the box below to type codes.", false);
    }
  };

  $("manual").onsubmit = (e) => {
    e.preventDefault();
    const code = $("manual-code").value.trim();
    if (code) submit(code);
    $("manual-code").value = "";
  };

  async function refresh() {
    try {
      const s = await fetch(`${base}/state.json`).then((r) => r.json());
      $("trip").textContent = s.tripRunning ? ` · ${s.direction} run` : " · no trip running";
      $("count").textContent = s.tripRunning ? `${s.onBoard} on board` : "";
      $("hint-off").hidden = s.direction !== "afternoon";
    } catch (e) { /* retry next time */ }
  }
  refresh();
  setInterval(refresh, 10000);
})();
