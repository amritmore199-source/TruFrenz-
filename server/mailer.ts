/**
 * Email delivery.
 *
 * One provider adapter behind one interface, so switching providers is a change
 * to this file and nothing else. Resend is the configured default because its
 * free tier covers early traffic (3,000/month, 100/day) and it needs no
 * business registration — unlike SMS, which is why email is the channel that
 * can ship today.
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
  return Boolean(process.env.EMAIL_PROVIDER_KEY && process.env.EMAIL_FROM);
}

/** Which adapter to use. Only one is real today; the rest are named for clarity. */
export function emailProvider(): "resend" | "log" | "none" {
  if (!emailConfigured()) return "none";
  const named = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  return named === "log" ? "log" : "resend";
}

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
  return provider === "log" ? sendWithLog(message) : sendWithResend(message);
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
} {
  const provider = emailProvider();
  const from = process.env.EMAIL_FROM ?? "";
  // Reduce "Trufrenz <hello@trufrenz.app>" to just the domain.
  const at = from.lastIndexOf("@");
  const sendDomain = at > -1 ? from.slice(at + 1).replace(/[>\s]+$/, "").trim() : null;
  return { configured: provider !== "none", provider, sendDomain };
}