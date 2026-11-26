// The only videos this site may use: the owner's own clips. Shared by the video step, the build and the audit.
//
// Put each original (straight off the phone, .mov or .mp4) in video/source with exactly these names (or the
// name given as "source"), then run "npm run video". The originals stay out of git (they are large); the web
// copies in video/opt are committed.
//
// source      the original's file name in video/source, when it is not the clip's own name
// fps         frames a second of the web copy (30 unless given)
// from / to   the part of the original that is used, in seconds (to: null = the end)
// speed       1 = real time, 0.5 = half speed (the phone films at 60 frames a second, so this stays smooth)
// loop        "forward" plays and starts again; "boomerang" plays forward then backward, so the loop has no seam
// look        "warm" = the same warm grade as the photos; "duo" = the crimson two-tone used behind the bar type;
//             "fill" = the warm grade, darkened, for a soft backdrop
// shapes      the frame(s) it is cut for: aspect ratio, width in pixels, and (for more than one) when each is used;
//             soften: [top, bottom] blurs and darkens a band right across the frame (fractions of its height);
//             blur: blurs the whole frame by this many pixels

export const CLIPS = [
  {
    // The owner's walk up to the front door, with nobody in it, made into one smooth gimbal-style glide (see "The
    // opening video" in the README): the door opens on its own and the camera floats instead of bobbing. It is the
    // first thing a visitor sees, full screen, and then loops at the top of the page (its last moment fades back
    // into its first, so the loop has no jump).
    name: 'intro-walk',
    what: 'the walk up the path to the front door and in, with nobody in it, as one smooth glide (the opening video)',
    source: 'intro-walk-smooth', fps: 24,
    from: 0, to: null, speed: 1, loop: 'forward', look: 'warm',
    shapes: [{ key: 'tall', aspect: [9, 16], width: 702, focus: 0.5 }],      // the edit's own frame: no resizing
  },
  {
    // The same walk, wide, blurred and darkened: it fills the sides of a wide screen behind the tall video.
    name: 'intro-fill',
    what: 'the walk again, blurred and darkened, filling the sides of a wide screen behind it',
    source: 'intro-walk-smooth', fps: 24,
    from: 0, to: null, speed: 1, loop: 'forward', look: 'fill',
    shapes: [{ key: 'wide', aspect: [16, 9], width: 480, focus: 0.5, blur: 9 }],
  },
  {
    name: 'bar-pan',
    what: 'the back-bar shelves (behind the big type in the bar section); cut before the bartender steps in',
    from: 0, to: 2.3, speed: 1, loop: 'boomerang', look: 'duo',
    shapes: [
      { key: 'wide', aspect: [16, 9], width: 1280, focus: 0.2, media: '(min-aspect-ratio: 1/1)' },      // the top shelves: above the mirror, which reflects guests
      { key: 'tall', aspect: [9, 16], width: 720, focus: 0.5, soften: [0.43, 0.63] },      // the mirror shelf, softened and darkened so no reflected face can be made out
    ],
  },
  {
    name: 'sign-out-front',
    what: 'the Money Muss sign on the front wall (in the Visit section)',
    from: 0, to: 1.2, speed: 0.5, loop: 'boomerang', look: 'warm',
    shapes: [{ key: 'square', aspect: [1, 1], width: 600, focus: 0.46 }],
  },
];

export const CLIP_NAMES = CLIPS.map((c) => c.name);
export const SOURCE_EXTENSIONS = ['mov', 'mp4', 'm4v'];
