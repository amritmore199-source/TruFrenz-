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

## 2a. Do you need to buy a domain?

**For email, yes. For SMS, no — but SMS has a bigger requirement instead.**

### Email needs a domain you own

Resend's own documentation is explicit: *"Resend sends emails using a domain you
own (i.e., not a shared or public domain). You must add and verify at least one
domain to send emails with Resend."*

Until a domain is verified you can only send from `onboarding@resend.dev`, and
that address can **only deliver to the email address you signed up with**. There
is no way to put a real member's code through it, so email sign-in cannot launch
without a domain.

Sending "from Gmail" is not an alternative. Since 2024 Gmail, Microsoft, and
Yahoo require SPF and DKIM authentication for bulk senders, and you cannot add
DNS records to `gmail.com`. A code sent from a Gmail address lands in spam or is
refused outright.

### SMS needs a registered business, not a domain

DLT registration is mandatory under TRAI rules for any domestic SMS in India,
and it requires your business entity — GST or equivalent company registration.
A domain is not part of it. Landing on a website is not part of it either; the
registration is the blocker, and it takes a few business days.

### Domain names, as checked on 27 Sep 2026

Availability was checked from live DNS nameserver records and the registry
RDAP service. Confirm at a registrar before relying on any of it.

| Domain | Status |
| --- | --- |
| **trufrenz.com** | **Taken** — registered 2013, renewed to 2027, parked on a registrar page. Not ours. |
| trufrenz.net | Available |
| trufrenz.app | Available |
| trufrenz.in | Available |
| trufrenz.co.in, .org, .io, gettrufrenz.com, trufrenzapp.com | Available |

### Which one to pick

`.net` is a good choice and arguably the best of the available options:

- It is one of the original three TLDs (with `.com` and `.org`), so its
  reputation among mail providers is long-established. This matters precisely
  because the domain carries our sign-in codes — the mail most likely to be
  filtered. A brand-new extension such as `.xyz` or `.top` has no reputation at
  the major providers and is a small risk that costs nothing to avoid here.
- It is unrestricted. Anyone can register it, no local-presence rule.
- It is priced like `.com`, roughly Rs.1,000-1,600 per year, and it reads as a
  technology company to a user who notices.
- `trufrenz.net` is a truthful address. The app currently shows
  `hello@trufrenz.app` and `support@trufrenz.app` on screen, and neither domain
  is owned yet, so both are fiction until one is bought.

The one argument for `.app` over `.net` is a small privacy win: the whole
`.app` extension is on the browser HSTS preload list, so it can only ever be
served over HTTPS. That protects a marketing site, not an API, and it does not
change email deliverability either way.

`.in` is worth considering only if you specifically want the India signal; it
does not make DLT registration any easier, since that is tied to the business
entity rather than the domain.

**Recommendation:** buy `trufrenz.net`. It is the same annual cost as a couple
of coffees, it unblocks email sign-in immediately, and it makes the address
already shown in the app honest. Launch on email; add SMS once the business
registration for DLT is in place.

Whichever you choose, tell me the name and I will update the addresses shown in
the app and point the mailer at it. The mailer takes the sending address from
`EMAIL_FROM`, so it is a configuration change rather than a code change.

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

## 7a. Sending limits, and why they exist

An unlimited "send me a code" button is the SMS-pumping attack: point it at
numbers you control, trigger thousands of paid messages, and take a share of the
carrier fees. The app owner pays the bill. Aimed at one stranger instead, it
makes the product the harasser and gets the sender ID blocked by the carrier.

Both code endpoints are now limited, per number and per device:

| Rule | Limit | Window |
| --- | --- | --- |
| Same number | 3 codes | 1 hour |
| Same number | 6 codes | 24 hours |
| Same device | 10 codes | 1 hour |
| Same device | 30 codes | 24 hours |
| Cooldown between requests | 60 seconds | — |
| Wrong codes before a lock | 10 | 15 minutes |

A refused request sends nothing, so it costs nothing. Requests are counted only
once they actually produced something: a message the provider accepted, or a
code handed back in demo mode. A provider outage therefore does not burn a
member's allowance and lock them out of a code that never arrived.

Both rules were proven against the running server: three codes to one number
succeed, and the fourth is refused with a 3,600-second wait. Ten wrong codes
lock that device for fifteen minutes, counted per device so one guesser cannot
lock out anyone else.

The admin dashboard's Subscriptions view shows both channels'
configuration state and these limits, so "a member cannot get a code" can be
answered without reading server logs.

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