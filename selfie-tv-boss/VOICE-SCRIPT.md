# Voice Script: what to record

Every line the phone system can say. Record each one in your own voice (or a
voice actor's), export it as **MP3**, and save it in `public/audio/` with
the **exact file name** shown. Any line you haven't recorded yet is read by
the computer voice, so you can record them one at a time. ✅ = recording
found, ⬜ = not recorded yet.

The recordings in `public/audio/` right now are in the **Ainsley** voice
(made with Higgsfield). To swap any line for your own voice, record it and
overwrite that file.

Want different wording or different questions? Edit `call-script.json`,
then **replace or delete that line's MP3** (otherwise the old recording keeps
playing), and run `npm run voice-script` to refresh this list.

## Recording tips

- Quiet room, phone or USB mic about a hand-width from your mouth.
- Smile while you talk: it comes through on the phone.
- Talk like you're chatting with one customer, not reading a script. Short
  pauses at the commas and full stops make it flow.
- Leave about half a second of silence at the start and end. No music under
  the menu or questions (it makes them hard to hear on phone speakers).
- Free tools: **Audacity** (computer) or your phone's voice recorder app.
  In Audacity: *Effect → Normalize* (-1 dB), then *File → Export → MP3*
  (mono, 64–128 kbps is plenty for phone calls).

## How a call flows

1. Thank-you greeting → options (press 1–6 for a service, 7 for the website link, 0 to reach you, * to repeat)
2. Pressed 7: they get a text with your website link → call ends
3. Pressed 1–6: short pitch for that service, and they get a text with a
   booking link for it → questions, each answered after a beep → thank you

## Main lines

| | File name | When it plays | Say this |
|---|---|---|---|
| ✅ | `01-greeting.mp3` | Start of every call | Hi there, and thank you for calling Selfie TV Boss Entertainment! We're so glad you reached out about booking Selfie TV Boss for your event. |
| ✅ | `02-menu.mp3` | The options menu | So, how can we help you today? For project management, press 1. To book Selfie TV Boss as your host, press 2. For a D J, press 3. For entertainment, press 4. For movie and on-camera work, press 5. For promotions, press 6. If you'd like our website link sent to you by text, press 7. And to speak with Selfie TV Boss himself, press 0. You can press star at any time to hear these options again. |
| ✅ | `03-no-input.mp3` | Nobody pressed a key | Sorry, I didn't catch that. Let me go over the options one more time. |
| ✅ | `04-invalid.mp3` | Wrong key pressed | Hmm, that's not one of the options. Let's try that again. |
| ✅ | `05-link-sent.mp3` | After the service pitch (their booking link was just texted) | We've also just sent you a text with a link to book online. |
| ✅ | `06-questions-intro.mp3` | After they pick a service, before the questions | Now, I just have a few quick questions, so Selfie TV Boss can get back to you with the right package. After each beep, go ahead and answer, then press the pound key when you're done. |
| ✅ | `07-thanks.mp3` | End of the call, after the questions | That's everything! Thank you so much. Selfie TV Boss will be in touch with you very soon. In the meantime, you can also book online at selfie T V boss dot com. Have a wonderful day! |
| ✅ | `08-connecting.mp3` | They pressed 0 | Sure thing! Please hold for just a moment while I connect you to Selfie TV Boss. |
| ✅ | `09-owner-unavailable.mp3` | You didn't pick up after they pressed 0 | It looks like Selfie TV Boss is tied up right now, but don't worry, he'll call you right back. |
| ✅ | `10-goodbye.mp3` | No choice after 3 tries | It seems now isn't a good time, and that's no problem at all. You can always visit selfie T V boss dot com to book. Take care! |
| ✅ | `11-voicemail.mp3` | Answering machine picked up | Hi, this is Selfie TV Boss Entertainment. We'd love to help with your next event, whether you need a host, a D J, an entertainer or promotions. Give us a call back at this number, or visit selfie T V boss dot com to book online. Talk soon! |

## Key lines (after the caller presses a number)

| | Key | Service | File name | Say this |
|---|---|---|---|---|
| ✅ | 1 | Project Managing | `20-option-project-managing.mp3` | Great choice! Selfie TV Boss can take care of your whole event for you, from planning and vendors right through to the run of the show. |
| ✅ | 2 | Hosting | `21-option-hosting.mp3` | Awesome! Selfie TV Boss would love to host your event. Whether it's a stage show, a party, a launch or an awards night, he'll bring the energy and keep the crowd going. |
| ✅ | 3 | DJ | `22-option-dj.mp3` | Let's turn it up! Selfie TV Boss will D J your event and keep the dance floor packed all night long. |
| ✅ | 4 | Entertainer | `23-option-entertainer.mp3` | Wonderful! Selfie TV Boss brings the comedy, the crowd games and the fun, so everybody feels like part of the show. |
| ✅ | 5 | Movie Actor | `24-option-movie-actor.mp3` | Lights, camera, action! Selfie TV Boss is available for film, T V, commercials and music videos. |
| ✅ | 6 | Promotions | `25-option-promotions.mp3` | Let's get your event seen! Selfie TV Boss can promote your show on camera, across social media, and live on the scene. |
| ✅ | 7 | Website link (texted) | `26-option-website.mp3` | Perfect! We've just sent you a text with a link to our website. You can see Selfie TV Boss in action, check out upcoming events, and book online any time. Thanks so much for calling, and have a great day! |

## Questions (asked in this order for every service except those with their own list below)

| | # | Dashboard label | Answer time | File name | Say this |
|---|---|---|---|---|---|
| ✅ | 1 | Name | 20s | `30-question-name.mp3` | First, could I get your name, and the name of your company or promotion? |
| ✅ | 2 | Event & date | 30s | `31-question-event-date.mp3` | Thanks! What's the name of your event, and what date is it happening? |
| ✅ | 3 | Venue | 30s | `32-question-venue.mp3` | And where will the event be held? |
| ✅ | 4 | Other details | 60s | `33-question-details.mp3` | Last question. Is there anything else we should know? Things like how many guests you're expecting, your budget, or the best time to call you back. |

## Hosting questions (asked instead of the ones above when they press 2)

| | # | Dashboard label | Answer time | File name | Say this |
|---|---|---|---|---|---|
| ✅ | 1 | Event & what it's about | 60s | `40-hosting-question-event.mp3` | What is the name of your event, and what is it about? When you're finished, press the pound key. |
| ✅ | 2 | Date | 20s | `41-hosting-question-date.mp3` | Thanks! And what date is the event happening? |
| ✅ | 3 | Venue | 30s | `32-question-venue.mp3` | And where will the event be held? |
| ✅ | 4 | Other details | 60s | `33-question-details.mp3` | Last question. Is there anything else we should know? Things like how many guests you're expecting, your budget, or the best time to call you back. |

> The computer voice spells "D J" and "T V" with spaces so it pronounces
> them as letters. When you record yourself, just say them normally.
