# Owner dashboard – motion brief

The prompt I wrote for myself from the "20 Principles of UX & Animation" video, applied to the
Glow by Launthia owner dashboard.

**The rule:** nothing about the dashboard changes – same layout, words, colours, fonts, buttons, order
and behaviour. Only how things move. Everything must still work the same with a keyboard, a screen
reader, offline, and with "reduce motion" on (then: simple fades only). Colours come only from the
site's palette (ivory, cream, sand, nude, taupe, mocha, espresso, champagne). No new libraries, no SVG
files, no layout shifts, no animation that blocks a tap.

**Timing:** taps and hovers answer within 150 ms; most moves 250–450 ms; entrances never longer than
about 600 ms in total. Ease in and out (`--ease`) for moves, the spring curve for things that land.

## Principle → where it goes

| # | Principle (from the video) | On the dashboard |
|---|---|---|
| 1 | Squash & stretch | Buttons squash a little when pressed and spring back. The alerts switch knob stretches as it slides. Status badges land with a small squash when they change. |
| 2 | Anticipation wind-up | Refresh: the arrow winds back, then spins while it loads. The eye blinks shut before it changes. |
| 3 | Staging the focus | On a laptop, the card under the pointer lifts slightly. The cancel prompt dims and blurs the page behind it, then the card springs in. |
| 4 | Pose to pose | Numbers in the stat cards count up from 0 to their value (start and end are the key poses). |
| 5 | Follow through | Sign-in card lands first, then its contents settle in one after another. Each booking card lands, then its initial avatar pops. |
| 6 | Slow in & slow out | Every move eases; nothing moves at a constant speed. |
| 7 | Arcs | The champagne dot in the phone tab bar hops in a small arc to the new tab. |
| 8 | Secondary action | Big wins get a champagne sparkle: Confirm + email sent, Mark paid, Mark done, settings Saved, test email sent, password saved. |
| 9 | Snappy timing | Tooltips/press states under 150 ms; tab changes ~300 ms. |
| 10 | Exaggerated feedback | Wrong password, a bad email or a missing field: the card gives a short shake and the message slides in. |
| 11 | Solid drawing / depth | Lifted cards get a deeper soft shadow; the cancel card scales up from slightly behind the page. |
| 12 | Overall appeal | The eye icon is redrawn as a living eye: it blinks, the pupil looks; it is crossed out while the password is hidden and opens (the line wipes away) when the password is shown. Busy buttons get a soft moving sheen. Birthdays strip gets one slow champagne sheen. |
| 13–14 | Fitts's law, bigger hit areas | Keep every target at least 44 px (already true); the eye's tap ring shows on hover/press. |
| 15–19 | Hick, Miller, Doherty, Postel, Jakob | Already followed (few choices, chunked phone numbers, instant feedback, forgiving inputs, familiar tabs). Nothing to change. |
| 20 | Frequency of use | Things she does all the time animate least: typing in search redraws the list instantly (no entrance), note saves get a small tick, not a sparkle. Entrances run when a list first loads or she switches tab or filter. |

## Tab movement
- Laptop pill tabs: one espresso pill slides (and stretches slightly) to the chosen tab; the panel slides in from the side you moved toward.
- Phone bottom bar: the champagne dot hops to the chosen tab and the icon gives a small bounce.
- Upcoming / Past switch: the dark thumb slides between the two.

## Checks before publishing
- All the existing dashboard tests still pass (sign-in, buttons, cancel prompt, Glow Club, settings, offline, sign out).
- No sideways scroll at 320–1920 px; accessibility scan clean; no console errors.
- Reduced motion: only fades. Phones: nothing heavy (no blur animation, transforms and opacity only).
