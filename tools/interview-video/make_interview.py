#!/usr/bin/env python3
"""Build a branded side-by-side interview video.

Layout (1920x1080):
  * Top banner: "Visit StevenScaleSolutions.com"
  * Interviewer and interviewee side by side
  * Now and then the video cuts to whoever is talking, with a slow
    zoom-in, and the other person shown in a small picture-in-picture.

The speaker is picked from the audio levels of the two recordings. You can
override this with --focus, e.g. --focus "B:12-20,A:41.5-50".

Usage:
  python3 make_interview.py --interviewer host.mp4 --interviewee guest.mp4 \
      --out interview.mp4 [--interviewer-name "Steven"] [--interviewee-name "Guest"]
"""

import argparse
import io
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
BANNER_H = 130
MARGIN = 24
STAGE_Y = BANNER_H
STAGE_H = H - BANNER_H
PANEL_W = (W - 3 * MARGIN) // 2            # 924
PANEL_H = STAGE_H - 2 * MARGIN             # 902
PIP_W, PIP_H = 420, 300
ZOOM_MAX = 1.12                            # how far the focus shot pushes in

GOLD = (232, 182, 70)
NAVY = (12, 20, 38)
WHITE = (255, 255, 255)

FONT_DIRS = ["/usr/share/fonts/opentype/inter", "/usr/share/fonts/truetype/dejavu"]


def font(names, size):
    for d in FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def bold(size):
    return font(["InterDisplay-ExtraBold.otf", "Inter-ExtraBold.otf", "DejaVuSans-Bold.ttf"], size)


def medium(size):
    return font(["Inter-SemiBold.otf", "Inter-Medium.otf", "DejaVuSans.ttf"], size)


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, **kw)


def probe(path):
    """Return (duration, has_audio, is_portrait) as the video is displayed."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
         "-of", "json", path], check=True, capture_output=True, text=True).stdout
    info = json.loads(out)
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    # Decode one frame so phone rotation metadata is already applied.
    png = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-frames:v", "1",
                          "-f", "image2pipe", "-c:v", "png", "-"],
                         check=True, capture_output=True).stdout
    w, h = Image.open(io.BytesIO(png)).size
    return float(info["format"]["duration"]), has_audio, h > w


# ---------------------------------------------------------------- graphics

def make_banner(path, url):
    img = Image.new("RGBA", (W, BANNER_H))
    d = ImageDraw.Draw(img)
    for y in range(BANNER_H):                       # vertical navy gradient
        k = y / BANNER_H
        c = tuple(int(NAVY[i] * (1 - k) + (4, 8, 16)[i] * k) for i in range(3))
        d.line([(0, y), (W, y)], fill=c + (255,))
    d.rectangle([0, BANNER_H - 5, W, BANNER_H], fill=GOLD + (255,))

    visit, domain = "VISIT", url
    f_visit, f_dom = medium(34), bold(68)
    gap = 26
    vw = d.textlength(visit, font=f_visit) + 6 * (len(visit) - 1)
    dw = d.textlength(domain, font=f_dom)
    x = (W - (vw + gap + dw)) / 2
    cy = (BANNER_H - 5) / 2

    # letter-spaced "VISIT"
    for ch in visit:
        d.text((x, cy), ch, font=f_visit, fill=WHITE + (235,), anchor="lm")
        x += d.textlength(ch, font=f_visit) + 6
    x += gap - 6

    # soft glow behind the domain, then the domain in gold
    glow = Image.new("RGBA", img.size)
    ImageDraw.Draw(glow).text((x, cy), domain, font=f_dom, fill=GOLD + (150,), anchor="lm")
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(10)))
    ImageDraw.Draw(img).text((x, cy), domain, font=f_dom, fill=GOLD + (255,), anchor="lm")
    img.save(path)


def make_interviewer_card(path, name, url):
    """Stand-in for the interviewer when there's no interviewer video."""
    size = 1080
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        k = y / size
        d.line([(0, y), (size, y)], fill=(int(22 - 12 * k), int(34 - 20 * k), int(62 - 36 * k)))
    cx, cy, r = size // 2, int(size * 0.40), 170
    d.ellipse([cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10], outline=GOLD, width=6)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(16, 26, 48))
    d.text((cx, cy + 6), name[:1].upper(), font=bold(200), fill=GOLD, anchor="mm")
    d.text((cx, cy + r + 90), name, font=bold(72), fill=WHITE, anchor="mm")
    d.text((cx, cy + r + 160), url, font=medium(36), fill=GOLD, anchor="mm")
    img.save(path)


def make_background(path):
    img = Image.new("RGB", (W, H), (8, 12, 22))
    d = ImageDraw.Draw(img)
    for y in range(STAGE_Y, H):
        k = (y - STAGE_Y) / STAGE_H
        d.line([(0, y), (W, y)], fill=(int(14 - 8 * k), int(22 - 12 * k), int(40 - 22 * k)))
    img.save(path)


def name_tag(draw, x, y, name, role, scale=1.0, right=False):
    """Lower-third tag anchored at its bottom-left (or bottom-right) corner (x, y)."""
    f_name, f_role = bold(int(38 * scale)), medium(int(22 * scale))
    pad = int(18 * scale)
    nw = draw.textlength(name, font=f_name)
    rw = draw.textlength(role.upper(), font=f_role)
    w = int(max(nw, rw) + 2 * pad + 8 * scale)
    if right:
        x -= w
    h = int((38 + 22 + 30) * scale)
    top = y - h
    draw.rounded_rectangle([x, top, x + w, y], radius=int(10 * scale), fill=(8, 12, 22, 200))
    draw.rectangle([x, top, x + int(7 * scale), y], fill=GOLD + (255,))
    tx = x + pad + int(4 * scale)
    draw.text((tx, top + int(10 * scale)), role.upper(), font=f_role, fill=GOLD + (255,))
    draw.text((tx, top + int(34 * scale)), name, font=f_name, fill=WHITE + (255,))


def make_split_overlay(path, a_name, b_name):
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    for i, (name, role) in enumerate([(a_name, "Interviewer"), (b_name, "Interviewee")]):
        x0 = MARGIN + i * (PANEL_W + MARGIN)
        y0 = STAGE_Y + MARGIN
        d.rounded_rectangle([x0 - 2, y0 - 2, x0 + PANEL_W + 1, y0 + PANEL_H + 1],
                            radius=6, outline=(255, 255, 255, 40), width=2)
        name_tag(d, x0 + 24, y0 + PANEL_H - 24, name, role)
    img.save(path)


def pip_xy(focus):
    """PiP sits bottom-right when A is in focus, bottom-left when B is."""
    y = H - MARGIN - PIP_H
    return (W - MARGIN - PIP_W, y) if focus == "A" else (MARGIN, y)


def make_focus_overlay(path, focus, a_name, b_name):
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    speaker = (a_name, "Interviewer") if focus == "A" else (b_name, "Interviewee")
    other = (b_name, "Interviewee") if focus == "A" else (a_name, "Interviewer")
    px, py = pip_xy(focus)
    d.rectangle([px - 4, py - 4, px + PIP_W + 3, py + PIP_H + 3], outline=GOLD + (255,), width=4)
    name_tag(d, px + 12, py + PIP_H - 12, other[0], other[1], scale=0.6)
    if focus == "A":
        name_tag(d, MARGIN + 16, H - MARGIN - 16, speaker[0], speaker[1])
    else:
        name_tag(d, W - MARGIN - 16, H - MARGIN - 16, speaker[0], speaker[1], right=True)
    img.save(path)


# ---------------------------------------------------------------- speaker detection

def levels_db(path, start, dur, win):
    """Return per-window RMS level in dB for the audio of `path`."""
    rate = 8000
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(dur), "-i", path,
         "-vn", "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"],
        check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    n = int(rate * win)
    count = int(dur / win)
    x = np.pad(x, (0, max(0, count * n - len(x))))[: count * n].reshape(count, n)
    return 20 * np.log10(np.sqrt((x ** 2).mean(axis=1)) + 1e-6)


def detect_focus(a_db, b_db, win, duration, min_run=5.0, max_focus=10.0, min_gap=8.0):
    # Normalise each mic to its own speaking level so a quiet mic isn't penalised.
    a = a_db - np.percentile(a_db, 90)
    b = b_db - np.percentile(b_db, 90)
    floor = -25.0
    lab = np.zeros(len(a), dtype=int)              # 0 none, 1 A, 2 B
    lab[(a > b + 6) & (a > floor)] = 1
    lab[(b > a + 6) & (b > floor)] = 2

    # Fill short dropouts (breaths, pauses) so a turn is one run.
    k = int(2.0 / win)
    smooth = lab.copy()
    for i in range(len(lab)):
        seg = lab[max(0, i - k): i + k + 1]
        seg = seg[seg > 0]
        if len(seg):
            smooth[i] = np.bincount(seg).argmax()

    runs, i = [], 0
    while i < len(smooth):
        j = i
        while j < len(smooth) and smooth[j] == smooth[i]:
            j += 1
        if smooth[i] and (j - i) * win >= min_run:
            runs.append(("A" if smooth[i] == 1 else "B", i * win, j * win))
        i = j

    segs, last_end = [], 4.0 - min_gap             # open on the two-shot for a few seconds
    for who, start, end in runs:
        s = max(start + 1.0, last_end + min_gap)    # cut in a beat after they start
        while True:                                  # long turns get a zoom every ~25s
            e = min(end - 0.3, s + max_focus, duration)
            if e - s < 3.0:
                break
            segs.append((who, s, e))
            last_end = e
            s = e + 15.0
    return segs


def fallback_focus(duration, every=25.0, length=7.0, only=None):
    segs, t, who = [], 10.0, "B"
    while t + length < duration:
        segs.append((only or who, t, t + length))
        who = "A" if who == "B" else "B"
        t += every
    return segs


def parse_focus(spec):
    segs = []
    for part in spec.split(","):
        who, rng = part.strip().split(":")
        s, e = (float(v) for v in rng.split("-"))
        segs.append((who.strip().upper(), s, e))
    return segs


# ---------------------------------------------------------------- render

def cover(w, h, portrait=False, x=0.5):
    """Scale+crop to exactly w x h, filling the box. `x` is where the person
    sits across the frame (0 = left edge, 1 = right edge), used when the
    sides get cropped. Portrait (phone) video is cropped from near the top so
    the face stays in frame."""
    y = 0.08 if portrait else 0.5
    return (f"scale={w}:{h}:force_original_aspect_ratio=increase,"
            f"crop={w}:{h}:(in_w-out_w)*{min(1.0, max(0.0, x)):.3f}:(in_h-out_h)*{y},setsar=1")


def stage_fill(src, dst, portrait, tag, x=0.5):
    """Fill the W x STAGE_H stage. Landscape video is cropped to fill;
    portrait video becomes a head-and-shoulders close-up centred on the
    person, over a blurred copy of itself."""
    if not portrait:
        return [f"[{src}]{cover(W, STAGE_H)}[{dst}]"]
    fw = 1180
    fx = int(min(W - fw, max(0, W / 2 - x * fw)))
    return [
        f"[{src}]split[{tag}bgi][{tag}fgi]",
        f"[{tag}bgi]{cover(W // 4, STAGE_H // 4)},boxblur=12:2,"
        f"scale={W}:{STAGE_H},eq=brightness=-0.12:saturation=0.8[{tag}bg]",
        f"[{tag}fgi]scale={fw}:-2,crop={fw}:{STAGE_H}:0:(in_h-out_h)*0.1,setsar=1[{tag}fg]",
        f"[{tag}bg][{tag}fg]overlay={fx}:0[{dst}]",
    ]


def render(args, segs, duration, tmp, a_audio, b_audio, a_portrait, b_portrait):
    banner = os.path.join(tmp, "banner.png")
    bg = os.path.join(tmp, "bg.png")
    split_ov = os.path.join(tmp, "split.png")
    fa_ov = os.path.join(tmp, "focusA.png")
    fb_ov = os.path.join(tmp, "focusB.png")
    make_banner(banner, args.url)
    make_background(bg)
    make_split_overlay(split_ov, args.interviewer_name, args.interviewee_name)
    make_focus_overlay(fa_ov, "A", args.interviewer_name, args.interviewee_name)
    make_focus_overlay(fb_ov, "B", args.interviewer_name, args.interviewee_name)

    def enable(who):
        parts = [f"between(t,{s:.3f},{e:.3f})" for w_, s, e in segs if w_ == who]
        return "+".join(parts) if parts else "0"

    def zoom(who):
        # Slow push-in from 1.0 to ZOOM_MAX across each focus segment.
        parts = [f"between(t,{s:.3f},{e:.3f})*(t-{s:.3f})/{e - s:.3f}"
                 for w_, s, e in segs if w_ == who]
        return f"(1+{ZOOM_MAX - 1:.3f}*({'+'.join(parts) if parts else '0'}))"

    fa_x, fa_y = pip_xy("A")
    fb_x, fb_y = pip_xy("B")
    fs = f"fps={FPS},trim=duration={duration:.3f},setpts=PTS-STARTPTS"
    push_in = (lambda who: f"scale=w='trunc({W}*{zoom(who)}/2)*2':"
               f"h='trunc({STAGE_H}*{zoom(who)}/2)*2':eval=frame,"
               f"crop={W}:{STAGE_H}:x='(in_w-out_w)/2':y='(in_h-out_h)*0.35'")

    vf = [
        f"[0:v]{fs},split=3[a0][a1][a2]",
        f"[1:v]{fs},split=3[b0][b1][b2]",
        f"[a0]{cover(PANEL_W, PANEL_H, a_portrait, args.interviewer_x)}[as]",
        f"[b0]{cover(PANEL_W, PANEL_H, b_portrait, args.interviewee_x)}[bs]",
        *stage_fill("a1", "afill", a_portrait, "a", args.interviewer_x),
        *stage_fill("b1", "bfill", b_portrait, "b", args.interviewee_x),
        f"[afill]{push_in('A')}[ab]",
        f"[bfill]{push_in('B')}[bb]",
        f"[a2]{cover(PIP_W, PIP_H, a_portrait, args.interviewer_x)}[ap]",
        f"[b2]{cover(PIP_W, PIP_H, b_portrait, args.interviewee_x)}[bp]",
        # split view
        f"[2:v]loop=-1:1,{fs},format=yuv420p[bg]",
        f"[bg][as]overlay={MARGIN}:{STAGE_Y + MARGIN}[v1]",
        f"[v1][bs]overlay={2 * MARGIN + PANEL_W}:{STAGE_Y + MARGIN}[v2]",
        f"[v2][4:v]overlay=0:0[split]",
        # focus on A: A full stage, B in PiP
        f"[ab]pad={W}:{H}:0:{STAGE_Y}[fa0]",
        f"[fa0][bp]overlay={fa_x}:{fa_y}[fa1]",
        f"[fa1][5:v]overlay=0:0[focA]",
        # focus on B
        f"[bb]pad={W}:{H}:0:{STAGE_Y}[fb0]",
        f"[fb0][ap]overlay={fb_x}:{fb_y}[fb1]",
        f"[fb1][6:v]overlay=0:0[focB]",
        # cut between layouts, then the banner on top of everything
        f"[split][focA]overlay=0:0:enable='{enable('A')}'[m1]",
        f"[m1][focB]overlay=0:0:enable='{enable('B')}'[m2]",
        f"[m2][3:v]overlay=0:0,format=yuv420p[vout]",
    ]

    if a_audio and b_audio:
        vf.append(f"[0:a]atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[aa];"
                  f"[1:a]atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[ba];"
                  "[aa][ba]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]")
    elif a_audio or b_audio:
        idx = 0 if a_audio else 1
        vf.append(f"[{idx}:a]atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[aout]")

    if args.interviewer:
        a_input = ["-ss", str(args.trim_interviewer), "-i", args.interviewer]
    else:
        card = os.path.join(tmp, "interviewer.png")
        make_interviewer_card(card, args.interviewer_name, args.url)
        a_input = ["-loop", "1", "-framerate", str(FPS), "-t", f"{duration:.3f}", "-i", card]
    cmd = ["ffmpeg", "-y", "-v", "error", "-stats", *a_input,
           "-ss", str(args.trim_interviewee), "-i", args.interviewee,
           "-i", bg, "-loop", "1", "-i", banner,
           "-loop", "1", "-i", split_ov, "-loop", "1", "-i", fa_ov, "-loop", "1", "-i", fb_ov,
           "-filter_complex", ";".join(vf), "-map", "[vout]"]
    if a_audio or b_audio:
        cmd += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-t", f"{duration:.3f}", "-c:v", "libx264", "-preset", args.preset,
            "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-movflags", "+faststart", args.out]
    run(cmd)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--interviewer", help="video of the interviewer (shown left); "
                   "leave out to show a branded name card instead")
    p.add_argument("--interviewee", required=True, help="video of the interviewee (shown right)")
    p.add_argument("--out", default="interview.mp4")
    p.add_argument("--interviewer-name", default="Steven")
    p.add_argument("--interviewee-name", default="Guest")
    p.add_argument("--url", default="StevenScaleSolutions.com")
    p.add_argument("--trim-interviewer", type=float, default=0.0,
                   help="seconds to skip at the start of the interviewer video (to sync)")
    p.add_argument("--trim-interviewee", type=float, default=0.0,
                   help="seconds to skip at the start of the interviewee video (to sync)")
    p.add_argument("--interviewer-x", type=float, default=0.5,
                   help="where the interviewer sits across their frame, 0 (left) to 1 (right)")
    p.add_argument("--interviewee-x", type=float, default=0.5,
                   help="where the interviewee sits across their frame, 0 (left) to 1 (right)")
    p.add_argument("--focus", help='manual focus shots, e.g. "B:12-20,A:41.5-50" (A=interviewer)')
    p.add_argument("--preset", default="veryfast", help="x264 preset (faster = quicker render)")
    args = p.parse_args()

    b_dur, b_audio, b_portrait = probe(args.interviewee)
    if args.interviewer:
        a_dur, a_audio, a_portrait = probe(args.interviewer)
    else:
        a_dur, a_audio, a_portrait = b_dur, False, False
    duration = min(a_dur - args.trim_interviewer, b_dur - args.trim_interviewee)
    if duration <= 0:
        sys.exit("Nothing left to render after trimming.")

    if args.focus:
        segs = parse_focus(args.focus)
    elif a_audio and b_audio:
        win = 0.25
        segs = detect_focus(levels_db(args.interviewer, args.trim_interviewer, duration, win),
                            levels_db(args.interviewee, args.trim_interviewee, duration, win),
                            win, duration)
        if not segs:
            print("Couldn't tell speakers apart from the audio; using timed focus shots.")
            segs = fallback_focus(duration)
    else:
        segs = fallback_focus(duration, only=None if args.interviewer else "B")

    print(f"Duration {duration:.1f}s, {len(segs)} focus shots:")
    for who, s, e in segs:
        print(f"  {'interviewer' if who == 'A' else 'interviewee'}: {s:7.1f}s - {e:7.1f}s")

    with tempfile.TemporaryDirectory() as tmp:
        render(args, segs, duration, tmp, a_audio, b_audio, a_portrait, b_portrait)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
