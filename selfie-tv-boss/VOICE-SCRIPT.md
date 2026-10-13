# Voice Script — what to record

These are every line the phone system can say, in order. Record each one in
your own voice (or a voice actor's), export as **MP3**, and save it in
`public/audio/` with the **exact file name** shown. Any line you haven't
recorded yet is read by the computer voice, so you can do them one at a time.

Want different wording? Change the `text` in `call-script.json` first, then
record your new version.

## Recording tips

- Quiet room, phone or USB mic about a hand-width from your mouth.
- Smile while you talk: it comes through on the phone.
- Leave about half a second of silence at the start and end; no music bed
  under the menu (it makes the options hard to hear on phone speakers).
- Free tools: **Audacity** (computer) or your phone's voice recorder app.
  In Audacity: *Effect → Normalize* (-1 dB), then *File → Export → MP3*
  (mono, 64–128 kbps is plenty for phone calls).

## Main lines

| # | File name | When it plays | Say this |
|---|---|---|---|
| 1 | `01-greeting.mp3` | Start of every outgoing call | Hello! This is a call from Selfie TV Boss Entertainment. We see you're promoting an upcoming show or event, and we'd love to help make it a big success. Selfie TV Boss is a professional event host, D J, entertainer, movie actor, project manager and promoter. |
| 2 | `02-inbound-greeting.mp3` | When someone calls YOUR Twilio number | Thank you for calling Selfie TV Boss Entertainment, the host that makes your event go live! |
| 3 | `03-menu.mp3` | The options menu | For project managing, press 1. For hosting your show or event, press 2. For D J services, press 3. For entertainment, press 4. For movie acting and on-camera work, press 5. For promotions, press 6. To speak with Selfie TV Boss now, press 0. To hear these options again, press star. If you would rather not get calls from us, press 9. |
| 4 | `04-no-input.mp3` | Nobody pressed a key | Sorry, we didn't get a choice. |
| 5 | `05-invalid.mp3` | Wrong key pressed | Sorry, that's not one of the options. |
| 6 | `06-record-prompt.mp3` | Before the caller leaves event details | After the beep, please say your name, the name of your event, the date, and where it's happening. Press the pound key when you're done. |
| 7 | `07-thanks.mp3` | After they leave a message | Thank you! Selfie TV Boss will call you back very soon. You can also book online at selfie T V boss dot com. Have a great day! |
| 8 | `08-no-recording.mp3` | They didn't say anything at the beep | No problem. We've noted your interest and Selfie TV Boss will call you back. Goodbye! |
| 9 | `09-connecting.mp3` | They pressed 0 | Please hold while we connect you to Selfie TV Boss. |
| 10 | `10-owner-unavailable.mp3` | You didn't pick up after they pressed 0 | Selfie TV Boss can't take the call right now, but he'll call you right back. |
| 11 | `11-opt-out.mp3` | They pressed 9 (removed from list) | You have been removed from our call list and won't receive any more calls from us. Sorry to bother you, and have a great day. |
| 12 | `12-goodbye.mp3` | No choice after 3 tries | Thanks for your time. To book Selfie TV Boss, visit selfie T V boss dot com. Goodbye! |
| 13 | `13-voicemail.mp3` | Answering machine picked up | Hi, this is Selfie TV Boss Entertainment. We'd love to help with your upcoming show or event, whether you need a host, a D J, an entertainer, promotions or full project management. Call us back at this number, or book online at selfie T V boss dot com. Thanks! |

## Service lines (play after the caller presses a number)

| Key | Service | File name | Say this |
|---|---|---|---|
| 1 | Project Managing | `20-option-project-managing.mp3` | Great choice! Selfie TV Boss can manage your whole event, from planning and vendors to timelines and the run of show. |
| 2 | Hosting | `21-option-hosting.mp3` | Excellent! Selfie TV Boss brings high energy hosting to shows, parties, launches, pageants and award nights. |
| 3 | DJ | `22-option-dj.mp3` | Let's turn it up! Selfie TV Boss can D J your event and keep the crowd moving all night. |
| 4 | Entertainer | `23-option-entertainer.mp3` | Wonderful! Selfie TV Boss brings comedy, crowd games and interactive entertainment that keeps everybody engaged. |
| 5 | Movie Actor | `24-option-movie-actor.mp3` | Lights, camera, action! Selfie TV Boss is available for films, T V, commercials and music videos. |
| 6 | Promotions | `25-option-promotions.mp3` | Let's get your event seen! Selfie TV Boss can promote your show on camera, on social media and live on the scene. |

> The computer voice spells "D J" and "T V" with spaces so it pronounces
> them as letters. When you record yourself, just say them normally.
