# Bloom Together

Bella & Izzy's workout app. Both of you open the same room on a computer, iPad
or phone, and the workout videos play **at the same moment on both screens**.
Either of you can pause, play or skip, and it happens for both.

- **Library**: paste your YouTube playlist link once to bring in every video
  (it must be public or unlisted). Categories are guessed from the titles; tap
  to fix them. Add single videos by pasting a video link.
- **Home**: greeting, a one-line rundown of today's workout with a
  **Let's go** button, this week's flower and plan, and the garden.
- **Work Out**: today's lineup at the top (swap, reorder, remove, start,
  ♡ to save it as a favorite), then a builder with four tabs: **Surprise**
  (the warm-up + 2 random), **Mix** (pick parts and a length range for each),
  **Pick** (search the library and tap +), and **Favorites** (saved workouts
  with notes; "Use this workout"). While a workout is going, this tab is the player.
- **Playing**: videos play back to back. When one ends, the next waits for a
  tap, or starts on its own after 30s, 45s or 1 min (Settings). "Big screen"
  fills the screen, which works well for AirPlay screen mirroring to the TV.
- **Week & streak**: tap the days you plan to work out. Hitting your weekly
  goal (3 to start) in a Sunday–Saturday week (Eastern time) makes the flower
  bloom and keeps the shared streak going. A workout counts when you tap
  **We did it!** at the end.
- **Settings**: your name and look (colors fully customizable) are just for
  your device. Shared: the weekly goal (1–7; past weeks keep their old goal),
  the workout parts (add Glutes, Shoulders…, rename, reorder, remove), auto-start
  and solo workouts (off by default).

Plain HTML/CSS/JS + Firebase (anonymous sign-in + Firestore), hosted on GitHub
Pages. Until `firebase-config.js` is filled in, the app runs in **sample mode**
(saved in that browser only; open two tabs as the two sisters to try syncing).

## Setup

1. **Firebase project**: create one at console.firebase.google.com (the free
   Spark plan is plenty).
2. **Authentication** → Sign-in method → turn on **Anonymous**.
   Settings → Authorized domains → add `glaynebrown.github.io`.
3. **Firestore**: create the database, then publish `firestore.rules`
   (or `firebase deploy --only firestore:rules`).
4. **Web app**: Project settings → Your apps → add a Web app, and paste its
   config into `firebase-config.js`.
5. **GitHub**: new repo, upload the site files below, then Settings → Pages →
   deploy from the main branch.
6. Open the site, choose **Start with a new code**, and send Izzy the code
   (your shared login). She opens the same link and chooses **Sign in with our
   code**. **Log out** in Settings only signs that device out; nothing is deleted.
   **Settings → Our code → Change** moves everything to a new code.

## Site files (upload these to GitHub)

index.html, styles.css, app.js, sync.js, yt.js, store.js, demo.js, dates.js,
firebase-config.js, sw.js, manifest.json, icon-192.png, icon-512.png,
apple-touch-icon.png

(`firestore.rules` and `firebase.json` are for Firebase, not the site.)

## How the sync works

Pressing play doesn't send "play now". It saves a start time about 2.5 seconds
ahead, and each device starts its own video at that moment, using a clock
checked against Firebase's server. While playing, each device checks itself
twice a second and nudges back if it drifts more than a quarter second.

Browsers won't start a video with sound until you've tapped the page once, so
joining a workout shows a **Tap to join in** button the first time.
