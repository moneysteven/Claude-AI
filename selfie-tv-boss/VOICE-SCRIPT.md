# Voice Script: what to record

Every line the phone system can say. Record each one in your own voice (or a
voice actor's), export it as **MP3**, and save it in `public/audio/` with
the **exact file name** shown. Any line you haven't recorded yet is read by
the computer voice, so you can record them one at a time. ✅ = recording
found, ⬜ = not recorded yet.

Want different wording or different questions? Edit `call-script.json`,
then run `npm run voice-script` to refresh this list.

## Recording tips

- Quiet room, phone or USB mic about a hand-width from your mouth.
- Smile while you talk: it comes through on the phone.
- Leave about half a second of silence at the start and end. No music under
  the menu or questions (it makes them hard to hear on phone speakers).
- Free tools: **Audacity** (computer) or your phone's voice recorder app.
  In Audacity: *Effect → Normalize* (-1 dB), then *File → Export → MP3*
  (mono, 64–128 kbps is plenty for phone calls).

## How a call flows

1. Greeting → menu (press 1–6 for a service, 7 for the website link, 0 to reach you, * to repeat)
2. Pressed 7: they get a text with your website link → call ends
3. Pressed 1–6: short pitch for that service, and they get a text with a
   booking link for it → questions, each answered after a beep → thank you

## Main lines

| | File name | When it plays | Say this |
|---|---|---|---|
| ⬜ | `01-greeting.mp3` | Start of every outgoing call | Hello, and thank you for taking our call. This is Selfie TV Boss Entertainment. We came across your post online about your upcoming event, and we'd love to help make it one to remember. |
| ⬜ | `02-inbound-greeting.mp3` | When someone calls YOUR Twilio number | Thank you for calling Selfie TV Boss Entertainment. |
| ⬜ | `03-menu.mp3` | The options menu | Please listen to the following options. Press 1 for project management. Press 2 for event hosting. Press 3 for D J services. Press 4 for entertainment. Press 5 for movie and on-camera acting. Press 6 for event promotions. Press 7 to receive our website link by text message. Press 0 to speak with Selfie TV Boss directly. To hear these options again, press star. |
| ⬜ | `04-no-input.mp3` | Nobody pressed a key | Sorry, we didn't get a choice. |
| ⬜ | `05-invalid.mp3` | Wrong key pressed | Sorry, that's not one of the options. |
| ⬜ | `06-link-sent.mp3` | After the service pitch (their booking link was just texted) | We've also sent you a text message with a link to book online, so you can check out everything Selfie TV Boss offers. |
| ⬜ | `07-questions-intro.mp3` | After they pick a service, before the questions | We just have a few quick questions so Selfie TV Boss can get back to you with the right package. Answer each one after the beep, then press the pound key. |
| ⬜ | `08-thanks.mp3` | End of the call, after the questions | Thank you! Selfie TV Boss will call you back very soon. You can also book online at selfie T V boss dot com. Have a great day! |
| ⬜ | `09-connecting.mp3` | They pressed 0 | Please hold while we connect you to Selfie TV Boss. |
| ⬜ | `10-owner-unavailable.mp3` | You didn't pick up after they pressed 0 | Selfie TV Boss can't take the call right now, but he'll call you right back. |
| ⬜ | `11-goodbye.mp3` | No choice after 3 tries | Thanks for your time. To book Selfie TV Boss, visit selfie T V boss dot com. Goodbye! |
| ⬜ | `12-voicemail.mp3` | Answering machine picked up | Hello, this is Selfie TV Boss Entertainment. We came across your post online about your upcoming event, and we'd love to help, whether you need a host, a D J, an entertainer, promotions or full event management. Please call us back at this number, or visit selfie T V boss dot com to book online. Thank you! |

## Key lines (after the caller presses a number)

| | Key | Service | File name | Say this |
|---|---|---|---|---|
| ⬜ | 1 | Project Managing | `20-option-project-managing.mp3` | Great choice! Selfie TV Boss can manage your whole event, from planning and vendors to timelines and the run of show. |
| ⬜ | 2 | Hosting | `21-option-hosting.mp3` | Excellent! Selfie TV Boss brings high energy hosting to shows, parties, launches, pageants and award nights. |
| ⬜ | 3 | DJ | `22-option-dj.mp3` | Let's turn it up! Selfie TV Boss can D J your event and keep the crowd moving all night. |
| ⬜ | 4 | Entertainer | `23-option-entertainer.mp3` | Wonderful! Selfie TV Boss brings comedy, crowd games and interactive entertainment that keeps everybody engaged. |
| ⬜ | 5 | Movie Actor | `24-option-movie-actor.mp3` | Lights, camera, action! Selfie TV Boss is available for films, T V, commercials and music videos. |
| ⬜ | 6 | Promotions | `25-option-promotions.mp3` | Let's get your event seen! Selfie TV Boss can promote your show on camera, on social media and live on the scene. |
| ⬜ | 7 | Website link (texted) | `26-option-website.mp3` | Perfect! We've just sent you a text message with a link to our website. Tap it to see Selfie TV Boss in action, check upcoming events, and book online any time. Thanks for your time, and have a great day! |

## Questions (asked in this order; answers show in your dashboard)

| | # | Dashboard label | Answer time | File name | Say this |
|---|---|---|---|---|---|
| ⬜ | 1 | Name | 20s | `30-question-name.mp3` | First, what's your name, and the name of your company or promotion? |
| ⬜ | 2 | Event & date | 30s | `31-question-event-date.mp3` | What's the name of your event, and what date is it? |
| ⬜ | 3 | Venue | 30s | `32-question-venue.mp3` | Where is the event happening? |
| ⬜ | 4 | Other details | 60s | `33-question-details.mp3` | Last one. Tell us anything else we should know, like the expected crowd size, your budget, or the best time to call you back. |

> The computer voice spells "D J" and "T V" with spaces so it pronounces
> them as letters. When you record yourself, just say them normally.
