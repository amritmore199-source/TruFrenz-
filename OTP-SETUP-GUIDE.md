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

### Settled: the domain is trufrenz.net

`trufrenz.net` is registered, and the app, the admin dashboard, and these docs
now use it: `hello@trufrenz.net` for sign-in codes, `support@trufrenz.net` and
`safety@trufrenz.net` everywhere else. The address shown on the welcome screen
was previously `support@trufrenz.app`, a domain nobody owned, so that line was
fiction until now.

`.net` was the right pick for three reasons: it is one of the original TLDs, so
its reputation among mail providers is long-established — which matters because
this domain carries the sign-in codes, the mail most likely to be filtered; it
is unrestricted; and it costs about the same as `.com` per year.

### The alternatives, as checked on 27 Sep 2026

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

### Which email provider, now that the domain exists

The domain was the only real obstacle. Once a sending domain is verified, the
providers are interchangeable, so the mailer supports four and switching is a
change to `EMAIL_PROVIDER` rather than a code change:

| `EMAIL_PROVIDER` | What it is | Cost | Notes |
| --- | --- | --- | --- |
| `resend` (default) | HTTP API | Free to 3,000/month, 100/day | Simplest setup; three DNS records |
| `smtp` | Any provider's SMTP | Depends on provider | One adapter covers Brevo, Zoho, Mailgun, Amazon SES, or your own host |
| `zeptomail` | Zoho's HTTP API | First 10,000 emails free, then pay-as-you-go | Rupee billing with a GST invoice; the closest fit for an India-first launch |
| `log` | Prints to the console | Free | Offline development only; never activates on its own |

The setup effort is the same for all of them, because the work is the DNS
records, not the API call. Resend and ZeptoMail both need three records (SPF,
DKIM, and a return-path or DMARC); SMTP needs the same three wherever the domain
lives. So the provider choice is about billing and comfort, not difficulty.

The SMTP option also removes the lock-in worry entirely: if a provider ever
disappoints, the credentials change and nothing else does.

### Recommended path for India

1. Verify `trufrenz.net` in whichever provider you prefer. Start with Resend's
   free tier if you want the fastest possible first send.
2. Add the three DNS records it gives you at your registrar. Propagation is
   usually minutes, never more than a few hours.
3. Set `EMAIL_PROVIDER_KEY`, `EMAIL_FROM=hello@trufrenz.net`, and
   `EMAIL_PROVIDER` (only needed if not using Resend).
4. Add SMS once the business registration for DLT is in place. Nothing about
   email blocks SMS or the reverse; they are independent channels, and the app
   lets a member pick either one.

## 3. Turning email on (the 15-minute path)

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. Add your domain, then add the DNS records it shows you (SPF, DKIM, and a
   DMARC record).
3. Set these in your environment:

   | Variable | Example | Notes |
   |---|---|---|
   | `EMAIL_PROVIDER_KEY` | `re_abc123…` | The API key |
   | `EMAIL_FROM` | `Trufrenz <hello@trufrenz.net>` | Must be on the verified domain |
   | `EMAIL_PROVIDER` | `resend` | Default. Use `log` to print instead of send |

That is the whole change. `server/mailer.ts` is one adapter behind one interface,
so switching provider is a single-file edit. Resend, ZeptoMail and generic SMTP are already written; SendGrid, Postmark or SES would each be a new adapter, not a setting.

### Testing without a provider

Set `EMAIL_PROVIDER=log` to print messages to the server console instead of
sending them — useful for watching the real flow offline. It never activates on
its own: with no key configured the provider is `none`, not `log`, so a
misconfigured deployment can never silently pretend to send.

---

### If you choose SMTP instead

Four variables, and any provider that offers SMTP works:

| Variable | Example | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `smtp` | Selects the adapter |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Readiness reports this channel unconfigured if it is missing |
| `SMTP_PORT` | `587` | Defaults to 587; port 465 switches on implicit TLS |
| `SMTP_USER` | your login | Required |
| `SMTP_PASS` | your password | Falls back to `EMAIL_PROVIDER_KEY` if unset |
| `SMTP_SECURE` | `true` | Only needed to force TLS on a non-465 port |

## 4. Turning on phone codes

Three transports can carry a phone code. They are adapters in one file
(`server/sms.ts`), because all three deliver to the same phone number that is
already in the data model — no extra column, no migration.

| Transport | `SMS_PROVIDER` | Registration needed | Notes |
|---|---|---|---|
| **WhatsApp** | `whatsapp` | Meta approves a template | No DLT. Cheapest. Recommended first |
| MSG91 | `msg91` | DLT: entity, header, template | The familiar Indian SMS route |
| Twilio | `twilio` | None for the international route | Arrives from a random short code |

### 4a. WhatsApp (recommended — no DLT registration)

This is the shortest path to real codes in India, and the cheapest. WhatsApp
needs no DLT paperwork at all: Meta approves an authentication template instead.

1. Create a Meta app at [developers.facebook.com](https://developers.facebook.com)
   with the **WhatsApp** product, and note the **phone number id** from the API
   setup panel.
2. Create an **authentication** template. Two details matter:
   - Category must be `authentication`. Any other category is rejected for OTPs.
   - Add a **copy code** button. Meta converts it to a URL button internally —
     that is expected, not a mistake.
   The body text is fixed by Meta and cannot be customised.
3. Wait for approval (usually minutes to a few hours).
4. Set:

   | Variable | Example |
   |---|---|---|
   | `SMS_PROVIDER` | `whatsapp` |
   | `SMS_PROVIDER_KEY` | your permanent access token |
   | `SMS_WHATSAPP_PHONE_NUMBER_ID` | `105954558954427` |
   | `SMS_WHATSAPP_TEMPLATE_NAME` | `trufrenz_code` |
   | `SMS_WHATSAPP_TEMPLATE_LANGUAGE` | `en_US` (optional) |

> ### Two things that will bite you
> **The template name is part of the readiness check on purpose.** Meta refuses
> to deliver a template it has not approved, so a token and phone number id
> without an approved template would report the channel ready and then fail
> every single send. Configured means all three values are present.
>
> **A 200 response means Meta accepted the send, not that the message arrived.**
> Real delivery is reported asynchronously through webhooks. The admin dashboard
> reports configuration, never "working" — check Meta's own message logs for
> delivery.

### 4b. SMS (MSG91, or Twilio for testing)

1. Choose a provider. For India: MSG91, Kaleyra, or Gupshup (all handle DLT).
   Twilio for the international route.
2. Complete DLT registration (entity → header → template).
3. Set:

   | Variable | Example |
   |---|---|---|
   | `SMS_PROVIDER` | `msg91` / `twilio` |
   | `SMS_PROVIDER_KEY` | your provider key |
   | `SMS_SENDER_ID` | `TRFRNZ` |
   | `SMS_DLT_TEMPLATE_ID` | your approved template id (MSG91) |

> **The SMS body must match your DLT template character for character** apart
> from the code slot. The body is built in one place
> (`signinCodeSms` in `server/sms.ts`) so the two cannot drift apart, but if you
> change the wording there you must change the template too, or the carrier
> rejects the message.

### 4c. Why WhatsApp instead of SMS

WhatsApp OTP is available in India and is not subject to DLT. Two practical
consequences:

- **Cost.** An authentication message to India is a fraction of an SMS at the
  time of writing. Verify current rates before budgeting.
- **Reach.** Roughly every smartphone in India has WhatsApp installed.

It is not a drop-in replacement. A member without WhatsApp — or whose number is
not registered to it — receives nothing. **Keep SMS configured as a fallback for
exactly those people**; the transport is selected by `SMS_PROVIDER`, so switching
is one environment variable.

### 4d. Testing without a provider

Leave the provider unset in development and the code is shown on screen, clearly
labelled as a prototype. There is no way to accidentally see a code in
production (`OTP_ALLOW_DEMO` defaults off outside development).

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

## 5a. A note on the admin console's demo account

Signing into the internal dashboard with the credentials printed on its own
login page used to fail. The demo account is created once, on the first boot
against an empty database, so when the domain moved from `trufrenz.app` to
`trufrenz.net` the login hint changed but the existing account did not. The page
advertised an address that no row answered to, and the error was the deliberately
generic "those credentials were not accepted" — so it read as a wrong password
rather than a stale address.

The seed now reconciles the demo account to the current address on every boot,
matching only the addresses this repository has itself seeded. An account a
person enrolled is never renamed, and if the current address is already taken the
reconciler leaves both alone and logs a warning rather than crashing on the
unique constraint. `tests/admin-demo-credentials.test.ts` keeps the login page
and the seed from drifting apart again.

---

## 6. Before you go live

These are the remaining gaps, in the order I would close them.

1. **Connect a provider for at least one channel.** Until then, codes are shown
   on screen rather than sent. WhatsApp is the shortest path (section 4a).
2. **Handle bounces and complaints.** The webhook sets `members.emailBouncedAt`
   (column added, wiring pending) and stops mailing a dead address.
3. **Add WhatsApp delivery webhooks** if you want delivery receipts rather than
   only Meta's own logs. The Cloud API reports delivery asynchronously.
4. **Consider Redis.** MySQL works and survives restarts, but Redis gives you
   native TTL expiry and cheaper writes under load. The store is one file
   (`server/challengeStore.ts`), so this is a contained change.
5. **Add email as a second factor** once the address is verified — the column is
   already there.

Sending limits are already in place: 3 codes per number per hour and 6 per day,
10 per device per hour, a 60-second cooldown between requests, and a 15-minute
lock after ten wrong codes. A refused request sends nothing and costs nothing, so
a provider outage cannot burn a member's allowance.

---

## 7. Files worth knowing

| File | Role |
|---|---|
| `lib/email.ts` | Address normalising, validation, masking — shared by server and app |
| `server/challengeStore.ts` | Issue, verify, consume, expire. Codes hashed, never stored raw |
| `server/mailer.ts` | Email adapters (Resend, ZeptoMail, SMTP, log), logging that never leaks a code |
| `server/sms.ts` | Phone transports: WhatsApp Cloud API, MSG91, Twilio, and the local log adapter |
| `lib/otp-limits.ts` | The sending rules, kept pure so they are testable without a database |
| `lib/resend-countdown.ts` | The "send a new code" countdown and how a rate limit is described |
| `server/accountRoutes.ts` | The four routes: request by phone, request by email, verify, complete |
| `tests/otp-signin.test.ts` | The challenge, email and verification rules |
| `tests/otp-limits.test.ts` | The rate-limit rules at their boundaries |
| `tests/resend-countdown.test.ts` | The countdown, its clock-skew handling, and the transport naming rule |
| `tests/sms-adapter.test.ts` | Every phone transport, including the WhatsApp payload shape |

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

- **All three phone transports are written and tested, but none is configured.**
  WhatsApp, MSG91 and Twilio each have an adapter with tests over their request
  shapes; readiness reports all three as `not configured`.
- **Nothing has been sent to a real inbox or handset.** No provider key is
  configured, so every test ran in demo mode against the real code path. The
  countdown, the rate limits and the resend flow were driven end to end in the
  browser, but the message itself has never left the sandbox.
- **WhatsApp needs a Meta-approved authentication template** before it will
  deliver. Until the template name is set, the transport reports not configured
  by design rather than failing on every send.
- **DLT registration has not been started** for SMS. That is 2–4 business days of
  your time plus the entity paperwork. WhatsApp avoids it entirely, which is why
  it is the recommended first channel.
- **Challenges live in MySQL, not Redis.** Correct and restart-safe, but not yet
  tuned for scale.