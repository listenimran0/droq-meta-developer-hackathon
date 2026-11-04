# DROQ — Google Play Console listing pack

## Identity (must match the AAB)

| Field | Value |
|--------|--------|
| **Package name / Application ID** | **`com.droq.app`** |
| App name | DROQ |
| Version name | `1.2.3` |
| Version code | `8` (must be higher than Play’s current; `appVersionSource: "local"` + `autoIncrement: false` — bump `android.versionCode` in `app.json` by hand) |
| Privacy policy URL | https://droq.app/privacy |
| **Account deletion URL** | **https://droq.app/delete-account** |
| Support email | developerimrankhan9@gmail.com |
| Expo / EAS project | `@sariyahtech.com/droq` (`6dcfff04-2ba8-4d36-8a89-5f04368b404f`) |

> Play Console “Create app” does **not** ask for package name first.  
> Package name comes from your **AAB** (`com.droq.app`). After first upload it is locked forever — do not change `android.package` in `app.json`.

---

## 1) Create app

| Field | Answer |
|--------|--------|
| App name | **DROQ** |
| Default language | **English (United States)** — optional: also add Bangla later |
| App or game | **App** |
| Free or paid | **Free** |
| Declarations | Accept Play policies / US export laws as shown |

---

## 2) Store listing

### App name (30 chars max)
```
DROQ
```

### Short description (80 chars max)
```
Leave secrets in the real world. Discover them by walking there.
```

Bangla option:
```
বাস্তব জায়গায় সিক্রেট রাখো। হাঁটতে হাঁটতে খুঁজে আনলক করো।
```

### Full description
```
DROQ turns the world around you into a treasure map.

Leave a Drop — a note, photo, voice, or puzzle — at a real place. Others only unlock it by physically getting close. No feed. No followers. No scrolling endless posts.

How it works
• Leave — plant a Drop where you stand
• Discover — sense what’s waiting nearby
• Unlock — get close enough and the content opens
• React — send an emoji + note to the creator
• Trail — follow linked Drops step by step
• Share hunt — invite friends without leaking coordinates
• Squad — race by distance while the pin stays hidden
• Streak — keep days outside going

Permissions
DROQ needs location to find nearby Drops. Camera, mic, and photos are only used when you choose to leave media. Notifications are optional for nearby alerts.

Language: English & বাংলা

Contact: developerimrankhan9@gmail.com
Privacy: https://droq.app/privacy
```

### App icon
- Upload `assets/icon.png` (need **512 × 512** PNG). If current icon isn’t 512, export one.

### Feature graphic
- Upload **`assets/feature-graphic.png`** (1024 × 500). JPG backup: `assets/feature-graphic.jpg`.

### Phone screenshots (minimum 2; recommend 4–8)
Suggested shots:
1. Home / hero
2. Discover proximity
3. Unlock / Drop content
4. Leave / create
5. Profile / streak
6. Settings (optional)

Specs: JPEG/PNG, 16:9 or 9:16, min short side 320px.

### Category
**Lifestyle** (or **Social** if Lifestyle unavailable)

### Tags / keywords (if asked)
```
location, discovery, walk, secret, outdoor, friends, hunt, local
```

### Contact details
| Field | Value |
|--------|--------|
| Email | developerimrankhan9@gmail.com |
| Website (optional) | https://droq.app |
| Privacy policy | https://droq.app/privacy |

---

## 3) App access (if restricted)

- **All functionality available without special access**  
- Closed testing: add tester emails under Closed testing → Testers (not “App access” unless you gate login with invite codes — you don’t)

---

## 4) Ads

| Question | Answer |
|----------|--------|
| Does your app contain ads? | **Yes** |
| Ad format | Banner (AdMob) |

---

## 5) Content rating (IARC questionnaire)

Answer honestly based on DROQ:

| Topic | Answer |
|--------|--------|
| Violence | No |
| Sexual content | No |
| Language (profanity) | Users *can* leave text — choose **Users can interact / UGC** carefully; typically **Mild** or **No** if you moderate |
| Controlled substances | No |
| Gambling | No |
| Horror | No |
| User-generated content | **Yes** (Drops, reactions, reports) |
| Shares location | **Yes** |
| Online interactions | **Yes** (friends, squad, unlocks) |
| Age | Target **13+** / mature enough for UGC + location |

Expected rating (approx): **PEGI 3 / Everyone** or **Teen** depending on UGC answers — follow questionnaire; don’t force lower rating.

---

## 6) Target audience & content

| Question | Answer |
|----------|--------|
| Target age | **13 and older** (or 18+ if you want stricter) |
| Appeal to children | **No** |
| Store presence | Not primarily for children |
| News app | No |
| COVID app | No |

---

## 7) News app

**No**

---

## 8) COVID-19 contact tracing / status

**No**

---

## 8b) Account deletion (App content)

| Question | Answer |
|----------|--------|
| Does your app allow users to request account deletion? | **Yes** |
| Are there web URL paths for account deletion? | **Yes** |
| Account deletion URL | **https://droq.app/delete-account** |
| Delete data associated with account? | **Yes** |
| Timeline | Within **30 days** (backups up to 90 days) |

---


### Overview answers
| Question | Answer |
|----------|--------|
| Collects / shares user data? | **Yes** — collects |
| Data encrypted in transit? | **Yes** (HTTPS / TLS) |
| Users can request deletion? | **Yes** (email support / account deletion request) |
| Committed to Play Families? | **No** |

### Data types to declare

**Personal info**
- Email address — Collected — App functionality — Required (account)
- Name / username — Collected — App functionality — Optional/Required as profile
- User IDs — Collected — App functionality

**Location**
- Approximate location — Collected — App functionality — Required for discovery
- Precise location — Collected — App functionality — Required; may be collected in background if nearby alerts ON

**Photos and videos**
- Photos — Collected — App functionality — Optional (when user leaves photo Drop / avatar)
- Videos — if disabled in product, say **No**; if enabled, Yes optional

**Audio**
- Voice/audio — Collected — App functionality — Optional (voice Drops)

**App activity / messages**
- Other user-generated content (Drop text, reactions) — Collected — App functionality
- In-app messages / friend interactions if any — as applicable

**App info & performance**
- Crash logs — if you use any crash tool; else skip or No
- Diagnostics / analytics (session_start) — Collected — Analytics / App functionality — Optional or Required for ops

**Device or other IDs**
- Device ID / push token — Collected — App functionality / Advertising (AdMob may use advertising ID)

**Advertising**
- AdMob may use Advertising ID — declare **Advertising or marketing** / Device IDs as shared with Google for ads

### Sharing
- Shared with: **Supabase** (service provider), **Google** (sign-in + AdMob)
- Purpose: App functionality, Advertising
- Not sold

### Ephemeral / processing
- Location used for nearby queries — processed to provide feature; stored as needed for Drops you create

---

## 10) Government apps

**No**

---

## 11) Financial features

**No** (no payments / banking)

---

## 12) Health

**No**

---

## 13) Permissions declaration (Play may ask)

Explain sensitive permissions:

**Location (fine + background)**  
“DROQ is a location-based discovery app. Precise location is required to show nearby Drops and unlock content when the user is physically close. Background location is only used if the user enables nearby alerts, so we can notify them when something is waiting nearby.”

**Camera**  
“Optional — only when the user leaves a photo Drop or updates a profile photo.”

**Microphone**  
“Optional — only when the user records a voice Drop.”

**Notifications**  
“Optional — nearby Drop alerts and social notifications (reactions, friends, squad).”

---

## 14) Closed testing release notes
```
First closed test build of DROQ.
Please test: sign up / email confirm / password reset / Google sign-in,
leave a Drop, discover & unlock with a second account, reactions, trail,
share hunt link, and squad invite. Use real outdoor GPS when possible.
```

---

## 14b) Deobfuscation warning + release optimization

Play may show:
> There is no deobfuscation file associated with this App Bundle…

**What it means:** Version code 1 was built **without R8 minify**, so there was no ProGuard `mapping.txt` to attach. It is a warning, not a reject.

**What we enabled (next production AAB):**
- R8 minify + resource shrink + PNG crunch (`expo-build-properties`)
- Phone ABIs only: `armeabi-v7a`, `arm64-v8a` (smaller Play delivery)
- EAS `autoIncrement` so the next build is **versionCode 2+**
- EAS artifact: `mapping.txt` (download from build page if Play does not auto-pick it)

**You do:**
1. Rebuild: `npx eas-cli build -p android --profile production`
2. Upload the new AAB (not version code 1 again)
3. With AAB + R8, Play usually reads the mapping from the bundle automatically. If the warning remains: App bundle explorer → that version → Downloads → upload `mapping.txt` from the EAS build artifacts.

---

## 15) Countries

Start with: **Bangladesh + available countries** or **All countries** for closed testing (testers only).

---

## Checklist before submit

- [ ] Privacy URL works in browser
- [ ] 512 icon + 1024×500 feature graphic
- [ ] ≥2 phone screenshots
- [ ] Ads = Yes
- [ ] Data safety filled
- [ ] Content rating questionnaire done
- [ ] Target age 13+
- [ ] **Optimized** production AAB uploaded (R8 / versionCode ≥ 2)
- [ ] Deobfuscation warning gone or `mapping.txt` uploaded
- [ ] Tester emails added + invite link sent
