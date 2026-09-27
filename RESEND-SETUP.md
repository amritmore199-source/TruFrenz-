# Resend setup, click by click

You have the account. There are **two things left**, and the second one is the
one that is easy to miss: verify the domain, then create an API key. Resend will
not let you send email until the domain is verified, which is why the dashboard
can feel like it is not letting you proceed — nothing is broken, the domain step
is simply unfinished.

Total time: about 15 minutes of your attention, then a wait for DNS.

---

## Before you start: which domain to enter

Resend asks for a domain, and it can be a subdomain. Two options:

| Enter this | Sender address becomes | When to use it |
| --- | --- | --- |
| `trufrenz.net` | `hello@trufrenz.net` | **Recommended now.** We only send sign-in codes, so the clean address is worth more than the segmentation. |
| `mail.trufrenz.net` | `hello@mail.trufrenz.net` | Worth switching to later if you start sending marketing email as well. Resend recommends a subdomain so a promotional send can never damage the reputation of your sign-in mail. |

Either way the app needs no code change — the sender comes from the
`EMAIL_FROM` setting.

---

## Step 1 — Add the domain

1. Go to **https://resend.com/domains**
2. Click **Add Domain**
3. In the domain field, type `trufrenz.net`
4. **Region:** choose the one closest to your members. For India, pick
   **Mumbai** if it is offered, otherwise **Singapore**. This only affects
   delivery speed, not whether it works.
5. **Return-Path:** leave it as the default. Resend fills in `send.` for you and
   it is not something to think about now.
6. Click **Add**.

You will land on the domain's page with a **Records** tab. That tab is the whole
point of this step — keep it open.

---

## Step 2 — Add the DNS records at your registrar

Resend now shows you a handful of records. You copy each one into the DNS
settings of whoever you bought `trufrenz.net` from — GoDaddy, Namecheap,
Cloudflare, Hostinger, BigRock, or similar.

Look for **DNS** or **DNS Management** or **Manage DNS Records** in that
provider's dashboard. You are adding records, not editing existing ones.

You will see a mix of these:

| Type | What it does |
| --- | --- |
| `TXT` (often `resend._domainkey`) | DKIM — proves the mail really came from you |
| `MX` (often `send`) | Return-Path — where bounces are reported |
| `TXT` (often `send`) | SPF — lists Resend as allowed to send for you |
| `CNAME` | Sometimes used instead of the `MX`/`TXT` pair above |

**Three rules that prevent almost every failure:**

1. **Copy and paste, never retype.** These values are long random strings. One
   wrong character and verification fails with no useful error.
2. **Do not shorten the host field.** If Resend shows the host as
   `resend._domainkey`, enter exactly that. Some dashboards append your domain
   automatically and some do not — if yours does, the field may only want
   `resend._domainkey`; if it does not, you may need
   `resend._domainkey.trufrenz.net`. Check the placeholder text in the field.
3. **If you use Cloudflare, set the proxy to DNS only (grey cloud).** The orange
   cloud proxies web traffic and will silently break email verification.

Some registrars also pre-fill a root `MX` record from when you bought the
domain. Leave it alone — it is for receiving mail and does not conflict here.

---

## Step 3 — Wait for verification

Back on the domain page in Resend, click **Verify DNS Records**. It often
completes within 15 minutes. DNS can take up to 72 hours worldwide, though for a
freshly bought domain it is normally minutes.

- Resend's own checker: **https://dns.email** — paste your domain and it shows
  which records are visible publicly and which are missing or wrong.
- If nothing has happened after a few hours, click **Restart verification**.

**You are done with this step when the domain shows as Verified** (usually a
green tick rather than an amber warning). Do not continue until it does — an
unverified domain makes every send fail, and the failure looks like a recipient
problem rather than a setup problem.

---

## Step 4 — Create the API key

This is the step you were probably looking for on the dashboard.

1. Go to **https://resend.com/api-keys**
2. Click **Create API Key**
3. **Name:** something you will recognise later, such as
   `Trufrenz sign-in codes`. Naming it by purpose means you can revoke it
   without wondering what else it was doing.
4. **Permission:** choose **Sending access**. This is least-privilege — the app
   only ever sends, so a key that cannot read or delete anything is strictly
   better if it ever leaks.
5. **Domain:** restrict it to `trufrenz.net`. This means that even if the key
   leaks, it cannot be used to send mail as any other domain.
6. Click **Add**.

**Copy the key immediately.** It is shown once and can never be viewed again —
Resend only stores a hash. If you lose it, delete that key and make a new one;
that is normal and harmless.

The key starts with `re_`.

---

## Step 5 — Give me the pieces, and I will wire them in

Send me:

| Setting | Value |
| --- | --- |
| Resend key | `re_...` |
| From address | `Trufrenz <hello@trufrenz.net>` |

I will set `EMAIL_PROVIDER_KEY` and `EMAIL_FROM`, then send a real code to a
test address and confirm it arrives. No code change is needed — the mailer
already supports Resend, and `hello@trufrenz.net` works automatically once the
domain is verified because Resend allows any address at a verified domain.

If you would rather do it yourself, those two values go in the project's `.env`
file:

```
EMAIL_PROVIDER=resend
EMAIL_PROVIDER_KEY=re_your_key_here
EMAIL_FROM=Trufrenz <hello@trufrenz.net>
```

---

## Step 6 — Add a DMARC record (after verification, worth doing)

Gmail, Microsoft, and Yahoo have required strong authentication from senders
since 2024. Once your domain is verified, Resend shows a suggested DMARC record
under the domain's settings. Adding it improves inbox placement and protects
your domain from being spoofed.

A safe starting policy:

| Type | Host | Value |
| --- | --- | --- |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@trufrenz.net` |

`p=none` means "monitor, do not reject yet", which is the right first step: it
collects reports so you can see whether anything legitimate is failing before
you tighten the policy to `quarantine` or `reject` weeks later.

---

## Two things worth knowing about the free tier

- **3,000 emails per month, 100 per day.** Sign-in codes are one email per
  sign-in attempt, so this comfortably covers thousands of members. A member
  needs one code per device sign-in, not one per day.
- **Before the domain is verified**, Resend only lets you send to the email
  address you signed up with. That is why testing to yourself seems to work and
  everything else seems broken — it is not a bug, it is the unverified-domain
  restriction.

---

## How to check it is working

Once the key is in place:

1. Ask for a code in the app with a real email address.
2. The code should arrive within seconds.
3. **https://resend.com/emails** shows every send with its status — delivered,
   bounced, or complained. This is the first place to look if a member says
   nothing arrived.

A bounce there means the address is bad. Nothing there at all means the app
never reached Resend, which points at the key or the environment rather than the
recipient.

---

## Common snags

| Symptom | Cause |
| --- | --- |
| Domain stuck on "Pending" | A record is missing, or a Cloudflare record is proxied (orange cloud) |
| 403 on every send | Domain not verified yet, or the key is wrong |
| `The trufrenz.net domain is not verified` | Step 3 has not completed |
| Sends work to you, fail for everyone else | Domain still unverified — this is the documented restriction |
| Code lands in spam | DMARC not added yet (Step 6), or the send is from an unverified domain |
| Key rejected after working | Key was deleted, or you pasted a partially copied value; the app reports the provider's own HTTP status in the server log |