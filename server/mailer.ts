/**
 * Email delivery.
 *
 * One provider adapter behind one interface, so switching providers is a change
 * to configuration and nothing else. Four are supported, and none of them is
 * meaningfully harder than the others once the sending domain is verified:
 *
 *   resend  — HTTP API, the default. Free tier 3,000/month.
 *   smtp    — any provider that offers SMTP: Brevo, Zoho/ZeptoMail, Mailgun,
 *             Amazon SES, or your own host. One adapter covers all of them,
 *             which is why it exists.
 *   zeptomail — Zoho's transactional service by HTTP API. Pay-as-you-go in
 *             rupees with a GST invoice, and the first credit (10,000 emails)
 *             is free, which suits an India-first launch.
 *   log     — prints instead of sending, for offline development.
 *
 * Every one of them requires a verified sending domain. That requirement is not
 * a vendor preference: since 2024 Gmail, Microsoft, and Yahoo require SPF and
 * DKIM authentication from bulk senders, and DNS records cannot be added to
 * somebody else's domain. So the domain is bought once and the provider can be
 * swapped freely afterwards — which is the reason this file keeps them behind
 * one interface rather than committing to the first one that worked.
 *
 * Two rules this file exists to hold:
 *
 *   1. A failed send is reported, never swallowed. The old flow could not tell
 *      the difference between "sent" and "nothing happened", which is exactly
 *      how a member ends up staring at a code entry box that will never be
 *      satisfied.
 *   2. Codes are never logged. Provider responses are logged on failure only,
 *      and with the code stripped, because the response body can contain it.
 */
import { maskEmail, normalizeEmail } from "../lib/email";

/** What a delivery attempt did. */
export type DeliveryOutcome =
  | { sent: true; provider: string; messageId?: string }
  | { sent: false; provider: string; reason: string };

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Whether a provider is configured well enough to attempt a send.
 *
 * Deliberately checks that both the key and a verified sender exist. A key with
 * no sender would fail at the provider anyway; catching it here means the app
 * can honestly say "email is not set up yet" instead of failing silently.
 */
export function emailConfigured(): boolean {
  if (!process.env.EMAIL_PROVIDER_KEY || !process.env.EMAIL_FROM) return false;
  /*
   * SMTP needs a host as well. Without this check, choosing the SMTP adapter and
   * setting only a key would report the channel ready and then refuse every
   * send — the precise failure mode this whole pass exists to remove.
   */
  if ((process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase() === "smtp") {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  }
  return true;
}

/**
 * Which adapter to use.
 *
 * An unrecognised name falls back to the default rather than failing, but a
 * name that is recognised and misconfigured still reports "none": the value of
 * this function is that it never claims a channel works when it does not.
 */
export function emailProvider(): EmailProvider {
  if (!emailConfigured()) return "none";
  const named = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (named === "log") return "log";
  if (named === "smtp" || named === "zeptomail") return named;
  return "resend";
}

export type EmailProvider = "resend" | "smtp" | "zeptomail" | "log" | "none";

/** The default SMTP port when none is named, and the one providers document. */
const DEFAULT_SMTP_PORT = 587;

/**
 * Remove anything resembling a code from a string before logging it.
 *
 * Provider error bodies can echo the message they refused to send, and that
 * message contains the code. Six consecutive digits is the shape to strip.
 */
export function redactCode(value: string): string {
  return value.replace(/\b\d{6}\b/g, "••••••");
}

/** A short, safe description of a failed response for the log. */
export function describeFailure(status: number, body: string): string {
  const trimmed = redactCode(body ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

async function sendWithResend(message: EmailMessage): Promise<DeliveryOutcome> {
  const key = process.env.EMAIL_PROVIDER_KEY as string;
  const from = process.env.EMAIL_FROM as string;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const reason = describeFailure(response.status, body);
      console.error(`[mailer] resend refused a send to ${maskEmail(message.to)} — ${reason}`);
      return { sent: false, provider: "resend", reason };
    }

    const parsed = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, provider: "resend", messageId: parsed?.id };
  } catch (error) {
    // Network-level failure: worth surfacing, because the member is waiting.
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[mailer] resend unreachable sending to ${maskEmail(message.to)} — ${redactCode(reason)}`);
    return { sent: false, provider: "resend", reason: redactCode(reason) };
  }
}

/**
 * Send over SMTP, which any provider can offer.
 *
 * This is the escape hatch that keeps the provider decision cheap. Brevo, Zoho,
 * Mailgun, Amazon SES, and a plain mail host all speak SMTP, so switching
 * between them is four environment variables rather than a new integration.
 *
 * `nodemailer` is imported dynamically so the module is only loaded when this
 * adapter is actually selected — the default HTTP path should not pay for a
 * dependency it does not use.
 */
async function sendWithSmtp(message: EmailMessage): Promise<DeliveryOutcome> {
  const from = process.env.EMAIL_FROM as string;
  const user = process.env.SMTP_USER as string;
  // Providers disagree on the name for this, so both are accepted.
  const pass = (process.env.SMTP_PASS ?? process.env.EMAIL_PROVIDER_KEY) as string;
  const port = Number(process.env.SMTP_PORT ?? DEFAULT_SMTP_PORT);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!process.env.SMTP_HOST || !user || !pass) {
    return {
      sent: false,
      provider: "smtp",
      reason: "SMTP_HOST, SMTP_USER and a password are all required",
    };
  }

  try {
    const { createTransport } = (await import("nodemailer")) as typeof import("nodemailer");
    const transport = createTransport({
      host: process.env.SMTP_HOST,
      port: Number.isFinite(port) ? port : DEFAULT_SMTP_PORT,
      secure,
      auth: { user, pass },
    });

    const info = await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });

    return { sent: true, provider: "smtp", messageId: info.messageId };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[mailer] smtp failed sending to ${maskEmail(message.to)} — ${redactCode(reason)}`);
    return { sent: false, provider: "smtp", reason: redactCode(reason) };
  }
}

/**
 * Send through Zoho ZeptoMail's HTTP API.
 *
 * Kept as its own adapter rather than "just use SMTP" because it is the
 * cheapest honest option for an India-first launch: rupee billing with a GST
 * invoice, pay-as-you-go, and the first 10,000 emails free.
 */
async function sendWithZeptomail(message: EmailMessage): Promise<DeliveryOutcome> {
  const key = process.env.EMAIL_PROVIDER_KEY as string;
  const from = process.env.EMAIL_FROM as string;
  // ZeptoMail's send-mail token already carries its own "Zoho-enczapikey "
  // prefix in the dashboard, so it is only added when absent.
  const authorization = key.toLowerCase().startsWith("zoho-enczapikey")
    ? key
    : `Zoho-enczapikey ${key}`;

  try {
    const response = await fetch("https://api.zeptomail.com/v1.1/email", {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { address: from },
        to: [{ email_address: { address: message.to } }],
        subject: message.subject,
        textbody: message.text,
        ...(message.html ? { htmlbody: message.html } : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const reason = describeFailure(response.status, body);
      console.error(`[mailer] zeptomail refused a send to ${maskEmail(message.to)} — ${reason}`);
      return { sent: false, provider: "zeptomail", reason };
    }

    const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    // ZeptoMail returns its id nested under `data`; read it defensively because
    // a provider changing this shape must not break a successful send.
    const data = (parsed?.data ?? {}) as Record<string, unknown>;
    const id = typeof data.message_id === "string" ? data.message_id : undefined;
    return { sent: true, provider: "zeptomail", messageId: id };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[mailer] zeptomail unreachable sending to ${maskEmail(message.to)} — ${redactCode(reason)}`);
    return { sent: false, provider: "zeptomail", reason: redactCode(reason) };
  }
}

/**
 * A local-only adapter that prints the message instead of sending it.
 *
 * Selected with `EMAIL_PROVIDER=log` so a developer can watch the real flow —
 * including the code — while running entirely offline. It never activates on
 * its own: with no key configured the provider is "none", not "log", so a
 * misconfigured production deployment cannot silently pretend to send.
 */
async function sendWithLog(message: EmailMessage): Promise<DeliveryOutcome> {
  console.log(`[mailer:log] would send to ${maskEmail(message.to)} — ${message.subject}`);
  return { sent: true, provider: "log" };
}

/** Send one message. Never throws: the caller decides what a failure means. */
export async function sendEmail(message: EmailMessage): Promise<DeliveryOutcome> {
  const provider = emailProvider();
  if (provider === "none") {
    return { sent: false, provider: "none", reason: "no email provider configured" };
  }
  if (!normalizeEmail(message.to)) {
    return { sent: false, provider, reason: "missing destination" };
  }
  if (provider === "log") return sendWithLog(message);
  if (provider === "smtp") return sendWithSmtp(message);
  if (provider === "zeptomail") return sendWithZeptomail(message);
  return sendWithResend(message);
}

/* ------------------------------------------------------------------ */
/* Message bodies                                                      */
/* ------------------------------------------------------------------ */

/**
 * The sign-in code email.
 *
 * The code appears in the subject line as well as the body because members read
 * it straight from the notification without opening the message, and a subject
 * that says only "your code" forces an unnecessary tap.
 *
 * Plain, short, and transactional: no marketing blocks, no tracking pixels.
 * Heavy templates are what push sign-in mail into spam folders.
 */
export function signinCodeEmail(code: string): { subject: string; text: string; html: string } {
  const subject = `Your Trufrenz code is ${code}`;
  const text = [
    `Your Trufrenz verification code is ${code}.`,
    "",
    "It expires in 10 minutes.",
    "",
    "If you did not ask for this, you can ignore this email — nobody can use the code without it.",
    "",
    "Trufrenz — friendships nearby, never dating.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#faf8f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#43423d;">
    <div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #ece7d8;">
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#83721f;font-weight:700;">Trufrenz</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.5;">Here is your verification code.</p>
      <p style="margin:0 0 18px;font-size:32px;font-weight:700;letter-spacing:0.18em;color:#4a4210;">${code}</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#6a6760;">It expires in 10 minutes.</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#99968e;">If you did not ask for this, you can ignore this email — nobody can use the code without it.</p>
    </div>
    <p style="max-width:420px;margin:16px auto 0;font-size:12px;color:#a7a6a1;text-align:center;">Trufrenz — friendships nearby, never dating.</p>
  </body>
</html>`;

  return { subject, text, html };
}

/** Sends a sign-in code, reporting honestly whether it left the building. */
export async function sendSigninCode(to: string, code: string): Promise<DeliveryOutcome> {
  const body = signinCodeEmail(code);
  return sendEmail({ to, subject: body.subject, text: body.text, html: body.html });
}

/* ------------------------------------------------------------------ */
/* Transport description for the health surface                        */
/* ------------------------------------------------------------------ */

/**
 * A description of the configured email transport, for readiness reporting.
 *
 * Reports presence only. It never returns the key, the sender beyond its
 * domain, or anything else that would be useful to an attacker reading an
 * admin panel.
 */
export function emailTransportSummary(): {
  configured: boolean;
  provider: string;
  sendDomain: string | null;
  smtpHost: string | null;
} {
  const provider = emailProvider();
  const from = process.env.EMAIL_FROM ?? "";
  // Reduce "Trufrenz <hello@trufrenz.net>" to just the domain.
  const at = from.lastIndexOf("@");
  const sendDomain = at > -1 ? from.slice(at + 1).replace(/[>\s]+$/, "").trim() : null;
  return {
    configured: provider !== "none",
    provider,
    sendDomain,
    smtpHost: provider === "smtp" ? (process.env.SMTP_HOST ?? null) : null,
  };
}