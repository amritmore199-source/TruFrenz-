# Trufrenz — OTP Login & Verification Setup Guide

What is now built, what it costs to turn on, and the exact steps to connect real
phone and email delivery.

**Status: email OTP is implemented and working. SMS OTP is implemented but needs
a provider key and, for India, DLT registration.**

---

## 1. What changed in this pass

Three separate problems were fixed. Two were bugs you had hit; the third was the
gap you asked about.

### 1a. The sign-up bug: the code was accepted but no account was created

The old `POST /api/account/verify-otp` deleted the challenge **the moment the
code matched**. But the app verifies at step 2 of 4 and only finishes the account
at the end, after a name, birth date, and photo. By the time the final call ran,
the cookie pointed at nothing, the server returned an error, and `continueAuth`
walked the member *backwards* to the profile step — which reads exactly like
"the code was rejected".

Worse, `finishSignup` only ever wrote to local storage. The account was **never
created on the server**, so every server-gated action (messaging, requests,
meetups) stayed blocked.

Two changes fix this:

| Now | Why |
|---|---|
| `POST /api/account/verify-code` proves the code **without spending it** | The challenge survives the whole onboarding flow |
| `POST /api/account/complete-signin` creates the account at the end, and is idempotent | A double tap or dropped connection returns the *same* account, never a duplicate |

Proven end to end in the browser: a fresh sign-up walked steps 1→4, "Join the
circle" created member **180001** with a verified email, and the session matched
the database row.

### 1b. Challenges were in memory, so they vanished

They lived in a `Map` in `server/accountRoutes.ts`. That meant a restart dropped
every in-flight sign-in, and a second server instance could not see a challenge
the first one issued. They now live in the `signin_challenges` table, and the
code is stored as a **SHA-256 hash salted with the challenge id** — a database
leak does not hand over working codes.

### 1c. Email is now a real, verified identity

`members.emailVerifiedAt` now exists. Until this pass the address was a contact
hint only, which meant **a member who lost their phone number had no way back
into their account at all**. That is the strongest argument for email OTP: it is
not a convenience, it is account recovery.

---

## 2. What each channel needs

### Email — no registration, works today

Nothing to register. Create an API key, verify a sending domain, done. Resend's
free tier covers early traffic (3,000/month, 100/day).

### SMS — needs DLT registration in India

TRAI requires registration **before** any transactional SMS on a domestic route.
The order is strict, and each step gates the next:

1. **Entity registration** — your business, on any DLT portal (Jio, Airtel, Vi, BSNL)
2. **Header / Sender ID** — the 6-character name recipients see, e.g. `TRFRNZ`.
   Header **and** template must be on the *same* portal as the entity.
3. **Content template** — the exact wording, with the code as a variable.
   Approval typically takes **2–4 business days**.

> ### The shortcut that lets you start today
> Twilio's India guidelines confirm the **international gateway requires no DLT
> registration**. You can ship and test immediately. The trade-off is real
> though: the message arrives from a *random short code* rather than your brand
> name, which reads as spam — a poor fit for a safety-first app. Use it to get
> moving, then switch to the domestic route.

---

## 3. Turning email on (the 15-minute path)

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. Add your domain, then add the DNS records it shows you (SPF, DKIM, and a
   DMARC record).
3. Set these in your environment:

   | Variable | Example | Notes |
   |---|---|---|
   | `EMAIL_PROVIDER_KEY` | `re_abc123…` | The API key |
   | `EMAIL_FROM` | `Trufrenz <hello@trufrenz.app>` | Must be on the verified domain |
   | `EMAIL_PROVIDER` | `resend` | Default. Use `log` to print instead of send |

That is the whole change. `server/mailer.ts` is one adapter behind one interface,
so switching to SendGrid, Postmark, or SES is a single-file edit.

### Testing without a provider

Set `EMAIL_PROVIDER=log` to print messages to the server console instead of
sending them — useful for watching the real flow offline. It never activates on
its own: with no key configured the provider is `none`, not `log`, so a
misconfigured deployment can never silently pretend to send.

---

## 4. Turning SMS on

1. Choose a provider. For India: MSG91, Kaleyra, or Gupshup (all handle DLT).
   Twilio for the international route.
2. Complete DLT registration (entity → header → template).
3. Set:

   | Variable | Example |
   |---|---|---|
   | `SMS_PROVIDER_KEY` | your provider key |
   | `SMS_SENDER_ID` | `TRFRNZ` |
   | `SMS_PROVIDER` | `msg91` / `twilio` |

> ### Read this before setting `SMS_PROVIDER_KEY`
> In the code you are running today that variable only decides whether
> `demoCode` is returned. Setting it **without** adding sending code stops the
> code being returned *and* sends nothing — the flow breaks completely instead
> of staying incomplete. The SMS adapter is not yet written; email is. Set the
> key only when that adapter lands.

---

## 5. How the app behaves right now

The server reports an honest `delivery` field, and the app reflects it:

| Situation | What the member sees |
|---|---|
| Provider configured, send succeeded | "We emailed a code to d•••@example.com." |
| No provider, demo mode on | The code itself, clearly labelled as a prototype |
| No provider, demo mode off | "Code delivery is not connected yet." — no dead input box |

Demo mode is **on in development and off in production**. Override with
`OTP_ALLOW_DEMO=true` for a deliberate public demo. A live deployment never
leaks a code by default.

---

## 6. Before you go live

These are the remaining gaps, in the order I would close them.

1. **Rate-limit `request-email-otp` and `request-otp`.** Currently unlimited.
   Unlimited sends let an attacker run up your SMS bill (SMS pumping) or use you
   to harass a third party. This is the most important remaining item.
2. **Cap resends per destination** — e.g. 3 per hour, plus a cooldown. Add a
   per-IP limit too.
3. **Handle bounces and complaints.** The webhook sets `members.emailBouncedAt`
   (column added, wiring pending) and stops mailing a dead address.
4. **Consider Redis.** MySQL works and survives restarts, but Redis gives you
   native TTL expiry and cheaper writes under load. The store is one file
   (`server/challengeStore.ts`), so this is a contained change.
5. **Add email as a second factor** once the address is verified — the column is
   already there.

---

## 7. Files worth knowing

| File | Role |
|---|---|
| `lib/email.ts` | Address normalising, validation, masking — shared by server and app |
| `server/challengeStore.ts` | Issue, verify, consume, expire. Codes hashed, never stored raw |
| `server/mailer.ts` | Provider adapter, message bodies, logging that never leaks a code |
| `server/accountRoutes.ts` | The four routes: request by phone, request by email, verify, complete |
| `tests/otp-signin.test.ts` | 23 tests over the rules above |

---

## 8. What is still not real

Stated plainly so nothing here is overclaimed:

- **No SMS adapter exists.** The email adapter is written and tested; SMS needs
  the same treatment once you pick a provider.
- **Nothing has been sent to a real inbox or handset.** No provider key is
  configured, so every test above ran in demo mode against the real code path.
- **DLT registration has not been started.** That is 2–4 business days of your
  time plus the entity paperwork.
- **Rate limiting is not implemented** (see §6).
- **Challenges live in MySQL, not Redis.** Correct and restart-safe, but not yet
  tuned for scale.