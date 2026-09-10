# Screen Recording Guide

The brief says:

> *Screen recording or self-recording while working on and demonstrating your solution is mandatory.*

That is two separate things, and most candidates only do the second one.

| | What it proves | Length |
|---|---|---|
| **A. Working footage** | The project is genuinely yours — you can navigate, run, and change it | 3 short clips, 2–4 min each |
| **B. Demo walkthrough** | The solution actually works end to end | One take, 10–12 min |

Both go in the same upload. Either stitch them into one video (working clips first, demo second)
or upload one folder containing both files and share the folder link.

---

## 1. Before you press record

**Understand what you are showing.** The reviewer's real question is whether you can explain
the decisions. Be ready to answer, in your own words:

- Why does `ChallanItem` copy the product name, SKU and price instead of just holding `productId`?
- Why does confirming a challan happen inside a database transaction?
- What stops stock from going negative when two people confirm challans at the same time?
- Why is money stored as `Decimal(12,2)` and not a float?
- What does the `authorize()` middleware do that `authenticate()` does not?

If any of those are fuzzy, ask before recording. Answering these well is worth more than
a polished UI.

**Clean your screen.**

- [ ] Close every unrelated tab, window and chat app
- [ ] Turn on Do Not Disturb — `Win + N` → Focus assist / notifications off
- [ ] Empty or hide the desktop if it will be visible
- [ ] Editor: zoom to ~120% so code is readable at 1080p (`Ctrl + =` in VS Code)
- [ ] Browser: zoom 100%, close bookmarks bar clutter
- [ ] Have the app already running (`npm run dev`) so you are not waiting on startup

**⚠️ Never open these on camera:**

| File | Why |
|---|---|
| `backend/.env` | Contains the live Neon database password |
| Neon dashboard connection panel | Same credential, in the browser |
| Render / Vercel environment variable screens | Same |

Show `backend/.env.example` instead — it has the same structure with placeholder values,
and it makes the *better* point: that real secrets are never committed.

---

## 2. Recording tool

### OBS Studio — use this for the main demo

Free, no watermark, no time limit, records screen + microphone + webcam together.

1. Download from <https://obsproject.com> → install → skip the auto-config wizard
2. **Sources** panel → `+` → **Display Capture** → OK → OK
3. `+` → **Audio Input Capture** → pick your microphone → OK
4. *(Optional but recommended)* `+` → **Video Capture Device** → your webcam → OK.
   Drag it to a bottom corner and resize it small. A face in the corner is strong
   proof-of-work evidence.
5. **Settings → Output** → Output Mode: `Simple` → Recording Quality:
   `High Quality, Medium File Size` → Recording Format: `MP4` → Encoder: hardware if offered
6. **Settings → Video** → Output Resolution `1920x1080` → FPS `30`
7. **Settings → Audio** → confirm your mic is the Mic/Auxiliary device
8. Speak and watch the audio meter move **before** you start. A silent 12-minute
   recording is the single most common failure.
9. `Start Recording` → do the demo → `Stop Recording`.
   File lands in `Videos\` by default.

### Xbox Game Bar — fine for the short working clips

Built into Windows, nothing to install.

- `Win + G` opens it → click the record button, or just press `Win + Alt + R`
- Make sure the microphone icon is **unmuted** (`Win + Alt + M` toggles it)
- Records the focused **app window** only — it cannot record File Explorer or the desktop
- Stop with `Win + Alt + R`. Files land in `Videos\Captures\`
- Default max length is 2 hours: Settings → Gaming → Captures → Record what happened

---

## 3. Part A — working footage (3 clips)

Short, unpolished, narrated. Do not edit these into perfection; rough is more credible.

**Clip 1 — the codebase (≈3 min)**
Open the project in your editor and walk the structure out loud.
`backend/src/` → point out `config/`, `middleware/`, `modules/`, `utils/`.
Open `prisma/schema.prisma` and talk through two or three models.
Say why the folders are split that way.

**Clip 2 — running it (≈2 min)**
Terminal → `npm run dev` → both servers start.
Open `http://localhost:4000/api/health` in the browser → point at `"database":"up"`.
Run `npm run db:verify` → all checks pass → explain one of the checks.

**Clip 3 — making a change (≈3 min)**
Make one small, real change on camera and show it take effect. For example: change a
validation message, save, re-run the request in Postman, show the new message.
This is the clip that most directly answers "did you build this".

---

## 4. Part B — demo walkthrough (one take, 10–12 min)

Have this list on a phone or second screen. Practise once without recording.

| Time | What you do | What you say |
|---|---|---|
| 0:00 | Face on camera, or just voice | Your name, the role, project name, the stack in one sentence |
| 0:30 | Editor: folder structure, `schema.prisma` | How the backend is layered and why |
| 2:00 | Open the challan confirm service | **The centrepiece.** Walk through the transaction line by line: re-check stock, reject if short, decrement, write the OUT movement, flip the status — all or nothing |
| 4:00 | Postman: `POST /auth/login` as admin | Show the token coming back; show a protected route returning 401 without it and 403 with the wrong role |
| 5:00 | App: log in as **Sales** | Create a customer, add a follow-up note |
| 6:30 | Log out, log in as **Warehouse** | Point out the sidebar has *different* links — that is RBAC working, not a cosmetic change. Adjust stock, show the movement log entry appear |
| 8:00 | Create a challan | Pick a customer, add two products, save as draft, then confirm it |
| 8:45 | Go straight to the product page | **Show the stock number has dropped by exactly the quantity dispatched.** Do not narrate over this — let the numbers do it |
| 9:30 | Try to confirm a challan for more stock than exists | Show the clean error naming the short item, then show the stock is unchanged. This is the part that separates a working system from a demo |
| 10:30 | Live deployed URLs | Frontend on Vercel, backend health on Render |
| 11:00 | Close | Known limitations, what you would add with more time |

**Delivery notes**

- Narrate continuously. Silence reads as uncertainty.
- Move slowly. What is obvious to you is new to the reviewer.
- If you fumble, say "let me redo that" and carry on. Do not restart the whole take.
- Never say "I'm not sure why this works". Say what you *do* know about it.

---

## 5. Upload and share

**YouTube (unlisted) — recommended**

1. <https://youtube.com> → Create → Upload video
2. Visibility: **Unlisted** (not Private — private means only you can open it)
3. Copy the link

Unlisted plays instantly in the browser with no download and no file size limit.

**Google Drive — alternative**

1. Upload the file to Drive
2. Right-click → Share → General access → **Anyone with the link** → Viewer
3. Copy the link

If you have two files (working clips + demo), put them in one folder and share the folder.

**Verify before submitting.** Open the link in an incognito window while signed out.
If it asks for permission, the sharing setting is wrong. This is the most common way a
submission gets marked incomplete.

---

## 6. Final checklist

- [ ] Microphone audible throughout — spot-check the middle and end, not just the start
- [ ] Text readable at 1080p
- [ ] `.env` never appeared on screen
- [ ] Stock actually visibly decreased after confirming a challan
- [ ] Insufficient-stock error was demonstrated
- [ ] All four role logins shown, or at least Sales and Warehouse side by side
- [ ] Link opens in an incognito window
- [ ] Link pasted into the Google Form's **RECORDING LINK** field
