# ChillPops website tour video

Made with the Video Playbook v3 (`/VIDEO_PLAYBOOK.md`) and its kit (`/video-kit/`): a silent tour with a guided
cursor, no voice and no captions. These are the files specific to this site:

| File | Job |
|---|---|
| `shots.json` | the 25 shots, in tour order |
| `record_tour.js` | the desktop tour, each action timed to its word in the shot list |
| `record_phone.js` | the phone part (`.nav__burger`, the drawer's close button, `.fab`) |
| `end_card_cp.js` | the end card: the site's wordmark and a text credit, because there is no `logo.svg` and `done-by-sss.jpg` was not supplied |

To re-take: copy `video-kit/` into a scratch folder, drop these files over it, and run the playbook from step 3.
The rendered MP4 is not committed (it is about 45 MB).
