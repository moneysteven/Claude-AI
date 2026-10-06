#!/usr/bin/env python3
"""Join two phone videos into one "live" scene, as if both people sat at the
same table, with a virtual camera that pushes in on whoever is talking.

Built for two people filmed from opposite sides of one table, each phone
showing the shared vase at the edge of its frame (interviewer: vase at the
right edge, interviewee: vase at the left edge). The two frames are placed
edge to edge, the interviewee is scaled so the vase lines up, and the join is
feathered through the vase so it reads as one object.

The two input videos must already be time-aligned (same length, the person
who isn't talking muted). The soundtrack comes from --audio.

  python3 make_live_scene.py --interviewer A.mov --interviewee B.mov \
      --audio mix.wav --out interview.mp4
"""

import argparse
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw

import make_interview as mi

W, H, FPS = mi.W, mi.H, mi.FPS
STAGE_Y, STAGE_H = mi.BANNER_H, H - mi.BANNER_H

SRC_W, SRC_H = 576, 1024      # portrait phone frame
FEATHER = 48                  # px of blend across the vase
FOCUS_ZOOM = 1.45
RAMP = 0.9                    # seconds for each camera move


def smooth_expr(keys, var="t"):
    """Piecewise smoothstep between (time, value) keyframes, as an ffmpeg expression."""
    expr = f"{keys[-1][1]:.4f}"
    for (t0, v0), (t1, v1) in reversed(list(zip(keys, keys[1:]))):
        if v0 == v1:
            seg = f"{v0:.4f}"
        else:
            u = f"(({var}-{t0:.3f})/{t1 - t0:.3f})"
            seg = f"({v0:.4f}+{v1 - v0:.4f}*{u}*{u}*(3-2*{u}))"
        expr = f"if(lt({var},{t1:.3f}),{seg},{expr})"
    return f"if(lt({var},{keys[0][0]:.3f}),{keys[0][1]:.4f},{expr})"


def camera_keys(segs, duration, intro_until, reveal_at):
    """Keyframes for zoom and horizontal aim (0 = interviewer side, 1 = interviewee side)."""
    zk = [(0, 1.45), (reveal_at, 1.45), (reveal_at + 2.0, 1.0)]
    xk = [(0, 1.0), (reveal_at, 1.0), (reveal_at + 2.0, 0.5)]
    for who, s, e in segs:
        if s < intro_until:
            continue
        aim = 0.0 if who == "A" else 1.0
        for t, z, x in ((s, 1.0, 0.5), (s + RAMP, FOCUS_ZOOM, aim),
                        (e - RAMP, FOCUS_ZOOM, aim), (e, 1.0, 0.5)):
            zk.append((t, z)); xk.append((t, x))
    zk.append((duration, 1.0)); xk.append((duration, 0.5))
    return zk, xk


def make_mask(path, w, h):
    m = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(m)
    for x in range(FEATHER):
        k = x / (FEATHER - 1)
        d.line([(x, 0), (x, h)], fill=int(255 * k * k * (3 - 2 * k)))
    m.save(path)


def make_tags(path, a_name, b_name):
    img = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(img)
    mi.name_tag(d, 40, H - 40, a_name, "Interviewer")
    mi.name_tag(d, W - 40, H - 40, b_name, "Interviewee", right=True)
    img.save(path)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--interviewer", required=True)
    p.add_argument("--interviewee", required=True)
    p.add_argument("--audio", required=True, help="finished soundtrack")
    p.add_argument("--out", default="interview_live.mp4")
    p.add_argument("--interviewer-name", default="Steven")
    p.add_argument("--interviewee-name", default="Guest")
    p.add_argument("--url", default="StevenScaleSolutions.com")
    p.add_argument("--b-scale", type=float, default=1.12,
                   help="scale of the interviewee frame so the vase and people match")
    p.add_argument("--vase-base-y", type=int, default=830,
                   help="y of the vase base in both frames (the scale anchor)")
    p.add_argument("--crop-top", type=int, default=105, help="top row of the scene to show")
    p.add_argument("--reveal-at", type=float, default=3.4,
                   help="when the camera pulls back from the interviewee to show both")
    p.add_argument("--tags", default="6.5-24", help="when to show name tags, start-end seconds")
    p.add_argument("--preset", default="medium")
    args = p.parse_args()

    duration = min(mi.probe(args.interviewer)[0], mi.probe(args.interviewee)[0])
    win = 0.25
    segs = mi.detect_focus(mi.levels_db(args.interviewer, 0, duration, win),
                           mi.levels_db(args.interviewee, 0, duration, win), win, duration)
    zk, xk = camera_keys(segs, duration, intro_until=19.0, reveal_at=args.reveal_at)
    print(f"Duration {duration:.1f}s; push-ins:")
    for who, s, e in segs:
        if s >= 19.0:
            print(f"  {'interviewer' if who == 'A' else 'interviewee'}: {s:6.1f}-{e:6.1f}s")

    bw, bh = int(SRC_W * args.b_scale) // 2 * 2, int(SRC_H * args.b_scale) // 2 * 2
    bx = SRC_W - FEATHER
    by = int(round(args.vase_base_y - args.b_scale * args.vase_base_y))
    scene_w = bx + bw
    scene_h = int(scene_w * STAGE_H / W) // 2 * 2
    z, fx = smooth_expr(zk), smooth_expr(xk)
    t0, t1 = (float(v) for v in args.tags.split("-"))

    with tempfile.TemporaryDirectory() as tmp:
        mask, tags, banner = (os.path.join(tmp, n) for n in ("mask.png", "tags.png", "banner.png"))
        make_mask(mask, bw, bh)
        make_tags(tags, args.interviewer_name, args.interviewee_name)
        mi.make_banner(banner, args.url)

        fc = ";".join([
            f"[0:v]fps={FPS},scale={SRC_W}:{SRC_H},setsar=1,format=rgba[a]",
            f"[1:v]fps={FPS},scale={bw}:{bh},setsar=1,format=rgba[b0]",
            f"[2:v]format=gray,scale={bw}:{bh}[m]",
            "[b0][m]alphamerge[b]",
            f"color=c=black:s={scene_w}x{SRC_H}:r={FPS}:d={duration:.3f}[base]",
            "[base][a]overlay=0:0:shortest=1[s1]",
            f"[s1][b]overlay={bx}:{by}:shortest=1,"
            f"crop={scene_w}:{scene_h}:0:{args.crop_top},"
            # virtual camera: zoom, then pick a window aimed at the speaker
            f"scale=w='trunc({W}*({z})/2)*2':h='trunc({STAGE_H}*({z})/2)*2':eval=frame,"
            f"crop={W}:{STAGE_H}:x='(in_w-{W})*({fx})':y='(in_h-{STAGE_H})*0.3',"
            f"pad={W}:{H}:0:{STAGE_Y},format=yuv420p[scene]",
            f"[3:v]format=rgba,fade=t=in:st={t0}:d=0.6:alpha=1,fade=t=out:st={t1 - 0.6}:d=0.6:alpha=1[tg]",
            "[scene][tg]overlay=0:0[v1]",
            "[v1][4:v]overlay=0:0,"
            f"fade=t=in:st=0:d=0.8,fade=t=out:st={duration - 1.5:.3f}:d=1.5,format=yuv420p[vout]",
        ])
        subprocess.run([
            "ffmpeg", "-y", "-v", "error", "-stats",
            "-i", args.interviewer, "-i", args.interviewee,
            "-loop", "1", "-i", mask,
            "-loop", "1", "-framerate", str(FPS), "-t", f"{duration:.3f}", "-i", tags,
            "-loop", "1", "-i", banner,
            "-i", args.audio,
            "-filter_complex", fc, "-map", "[vout]", "-map", "5:a",
            "-t", f"{duration:.3f}", "-c:v", "libx264", "-preset", args.preset, "-crf", "20",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", args.out,
        ], check=True)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
