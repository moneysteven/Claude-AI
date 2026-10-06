# Interview video maker

Puts the interviewer and the interviewee side by side in one 1920x1080 video,
with a **"Visit StevenScaleSolution.com"** banner across the top. Now and then
it cuts to whoever is talking, zooms in slowly, and shows the other person in a
small picture-in-picture. Each person gets a name tag.

It works out who is talking from how loud each recording is, so it works best
when each person was recorded separately (for example, each person's own
camera or Zoom's "separate audio file per participant" option).

## Run it

Needs `ffmpeg`, Python 3, `numpy` and `Pillow`.

```bash
python3 make_interview.py \
  --interviewer input/interviewer.mp4 \
  --interviewee input/interviewee.mp4 \
  --interviewer-name "Steven" --interviewee-name "Guest Name" \
  --out interview.mp4
```

Useful options:

- `--trim-interviewer 2.5` / `--trim-interviewee 1.2`: skip seconds at the
  start of a recording so the two line up.
- `--focus "B:12-20,A:41.5-50"`: choose the zoom shots yourself (A is the
  interviewer, B is the interviewee; times are in seconds).
- `--url`: change the banner text.
- `--interviewer-x 0.7` / `--interviewee-x 0.75`: where the person sits across
  their own shot, from 0 (left edge) to 1 (right edge), so crops and close-ups
  stay on them.

Leave out `--interviewer` to show a branded "Steven" name card in the
interviewer's spot until you have interviewer footage. Vertical phone videos
are supported: they're framed from the top, and the close-up shots sit over
a blurred copy of the video.
