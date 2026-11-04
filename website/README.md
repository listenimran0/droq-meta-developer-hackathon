# DROQ website (droq.app)

Static site for Vercel: landing, privacy, refunds, account deletion, and AdMob `ads.txt`.

## Local preview

```bash
npx serve website
```

## Deploy to Vercel

```bash
cd website
npx vercel login
npx vercel --prod
```

Or: Import the repo in Vercel → **Root Directory** = `website` → Framework = **Other**.

4. Add domain `droq.app` in Project → Domains.

### Hunt / partner QR URLs (after deploy)

| Use | URL |
|-----|-----|
| Share hunt | `https://droq.app/hunt/{dropId}` |
| Partner QR sticker | `https://droq.app/q/{dropId}` |

## URLs to use in Play Console

| Field | URL |
|--------|-----|
| Website | https://droq.app |
| Privacy policy | https://droq.app/privacy |
| Account deletion | https://droq.app/delete-account |
| Refund policy | https://droq.app/refund |
| ads.txt | https://droq.app/ads.txt |

`ads.txt` uses publisher `pub-5822607086908086` (from your Android AdMob app id).
