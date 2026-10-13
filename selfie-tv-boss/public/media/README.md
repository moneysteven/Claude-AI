# Photos & videos

Drop your files in this folder, then list them in `gallery.json`.

| File name | Where it shows |
|---|---|
| `hero.mp4` | Full-screen background video at the top of the home page (keep it short, 10–30s, under ~15 MB, no sound needed) |
| `hero.jpg` | Shown while the hero video loads, or instead of it |
| `boss.jpg` | Portrait of Selfie TV Boss in the "About" section (tall/portrait photo works best) |
| `og-image.jpg` | Preview picture when the site link is shared on WhatsApp/Instagram/Facebook (1200×630) |

Gallery entries in `gallery.json`:

```json
[
  { "type": "image", "src": "event-1.jpg", "caption": "Hosting the Summer Splash" },
  { "type": "video", "src": "reel.mp4", "poster": "reel.jpg", "caption": "Highlight reel" },
  { "type": "youtube", "id": "YOUTUBE_VIDEO_ID", "caption": "TV interview" }
]
```

Tips: resize photos to ~1600px wide before uploading (phone photos are huge
and slow the site down). Until real files are added, the site shows tidy
placeholders — nothing looks broken.
