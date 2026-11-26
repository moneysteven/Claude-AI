"""A steady, gliding camera from a handheld walk-through.

    python3 tools/steady.py video/source/intro-walk-clean.mp4 video/source/intro-walk-steady.mp4 [--zoom 1.12]

1. ffmpeg's vidstab measures how the picture moves from one frame to the next.
2. For up-down and for sideways separately, it works out the smoothest camera path that never strays further from
   the real one than the spare room allows: held shots where it can, steady glides where the camera has to move,
   with eased starts and stops (the "L1-optimal camera path" of Grundmann, Kwatra and Essa, 2011). That takes out
   the up-and-down float of walking and keeps the turns.
3. Each frame is moved onto that path and enlarged a little (--zoom, 12% by default) so the edges never show.
   Tilt is left as filmed: measured against the vertical lines in the picture, it is already level.

Needs ffmpeg built with libvidstab (Homebrew's and most Linux builds are) and Python 3 with numpy, scipy and
Pillow. The output is a new original for video/source; then run "npm run video" and "npm run build".
"""
import argparse
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import sparse
from scipy.optimize import linprog

FPS = 24


def motions(src):
    """Frame-to-frame movement of the picture (dx, dy in pixels), as vidstab sees it."""
    src = os.path.abspath(src)
    work = tempfile.mkdtemp()
    trf = os.path.join(work, 'local.trf')
    detect = f'vidstabdetect=shakiness=10:accuracy=15:stepsize=6:mincontrast=0.2:result={trf}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', detect, '-f', 'null', '-'], check=True)
    # debug=1 writes the global (whole-frame) motion of every frame to global_motions.trf in the working folder
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-vf', f'vidstabtransform=input={trf}:debug=1', '-f', 'null', '-'], check=True, cwd=work)
    rows = []
    for line in open(os.path.join(work, 'global_motions.trf')):
        parts = line.split()
        if line.startswith('#') or len(parts) < 5:
            continue
        rows.append([float(parts[1]), float(parts[2])])
    return np.array(rows)


def smoothest(raw, room, weights=(10.0, 1.0, 100.0)):
    """The smoothest path within +-room of the raw one: few moves, steady speeds, eased changes."""
    n = len(raw)
    diffs = [
        sparse.diags([-1.0, 1.0], [0, 1], shape=(n - 1, n)),
        sparse.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(n - 2, n)),
        sparse.diags([-1.0, 3.0, -3.0, 1.0], [0, 1, 2, 3], shape=(n - 3, n)),
    ]
    sizes = [d.shape[0] for d in diffs]
    total = n + sum(sizes)
    cost = np.concatenate([np.zeros(n)] + [np.full(k, w) for k, w in zip(sizes, weights)])
    blocks, at = [], n
    for d, k in zip(diffs, sizes):
        slack = sparse.hstack([sparse.csr_matrix((k, at)), -sparse.eye(k), sparse.csr_matrix((k, total - at - k))])
        path = sparse.hstack([d, sparse.csr_matrix((k, total - n))])
        blocks += [path + slack, -path + slack]      # |difference| <= slack
        at += k
    a = sparse.vstack(blocks).tocsr()
    bounds = [(raw[t] - room, raw[t] + room) for t in range(n)] + [(0, None)] * sum(sizes)
    result = linprog(cost, A_ub=a, b_ub=np.zeros(a.shape[0]), bounds=bounds, method='highs')
    if result.status != 0:
        sys.exit(f'steady: no smooth path found ({result.message})')
    return result.x[:n]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--zoom', type=float, default=1.12, help='how much each frame is enlarged to hide the edges (1.12 = 12%%)')
    args = ap.parse_args()

    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', args.src], capture_output=True, text=True, check=True)
    w, h = (int(v) for v in probe.stdout.strip().split(','))
    zoom = args.zoom

    m = motions(args.src)
    path = np.vstack([[0.0, 0.0], np.cumsum(m, axis=0)])[: len(m)]      # where the camera has got to
    room_x = w * (1 - 1 / zoom) / 2 - 1.5                              # spare room on each side, in the original's pixels
    room_y = h * (1 - 1 / zoom) / 2 - 1.5
    smooth = np.stack([smoothest(path[:, 0], room_x), smoothest(path[:, 1], room_y)], axis=1)
    shift = np.clip(smooth - path, [-room_x, -room_y], [room_x, room_y])      # how far to look from, to see the smooth path's view

    def wobble(p, axis):
        s = 0.5 * FPS
        r = int(3 * s)
        k = np.exp(-0.5 * (np.arange(-r, r + 1) / s) ** 2)
        k /= k.sum()
        trend = np.convolve(np.pad(p[:, axis], r, mode='reflect'), k, mode='valid')
        return np.sqrt(((p[:, axis] - trend) ** 2).mean())
    print(f'steady: {len(m) + 1} frames, {w}x{h}, enlarged {zoom:.2f}x; room {room_x:.0f}px sideways, {room_y:.0f}px up-down; '
          f'quick up-down wobble of the path {wobble(path, 1):.1f}px -> {wobble(smooth, 1):.1f}px')

    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', args.src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                            '-vf', 'unsharp=5:5:0.35:5:5:0', '-c:v', 'libx264', '-preset', 'slow', '-crf', '13', '-pix_fmt', 'yuv420p', '-an', args.out],
                           stdin=subprocess.PIPE)
    size = w * h * 3
    i = 0
    while True:
        frame = dec.stdout.read(size)
        if len(frame) < size:
            break
        dx, dy = shift[min(i, len(shift) - 1)]
        # output pixel (u, v) -> original pixel: enlarged about the centre, then moved onto the smooth path
        coeffs = (1 / zoom, 0, w / 2 * (1 - 1 / zoom) + dx, 0, 1 / zoom, h / 2 * (1 - 1 / zoom) + dy)
        img = Image.frombytes('RGB', (w, h), frame).transform((w, h), Image.AFFINE, coeffs, resample=Image.BICUBIC)
        enc.stdin.write(img.tobytes())
        i += 1
    enc.stdin.close()
    if enc.wait() != 0 or dec.wait() != 0:
        sys.exit('steady: ffmpeg failed')
    print(f'steady: wrote {args.out} ({i} frames)')


if __name__ == '__main__':
    main()
