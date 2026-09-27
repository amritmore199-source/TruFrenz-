/**
 * SMS delivery.
 *
 * Mirrors `mailer.ts` on purpose: one adapter behind one interface, a failed
 * send reported rather than swallowed, and codes never written to a log.
 *
 * Written with plain `fetch` instead of a provider SDK. Both APIs below are a
 * single POST with a JSON or form body, so a dependency would add supply-chain
 * surface and an install step for no capability.
 *
 * ## WhatsApp is a transport here, not a destination
 *
 * WhatsApp codes go to a phone number, the same number SMS would use. So it is
 * a third adapter in this file rather than a third channel in the data model:
 * no extra column, no second unique index, and the challenge machinery is
 * untouched. Adding it as its own channel would have been more code and a
 * migration for no extra capability.
 *
 * ## India, and the part that is not code
 *
 * TRAI requires DLT registration before any transactional SMS on a domestic
 * route: entity, then a six-character sender ID (the name recipients see), then
 * the exact message template. Until the template is approved, a domestic send
 * is rejected by the carrier no matter how correct this file is.
 *
 * WhatsApp needs no DLT registration at all, which is why it is worth having
 * configured as an option: Meta approves an authentication template instead,
 * it reaches roughly every smartphone in India, and at the time of writing an
 * authentication message to India costs a fraction of an SMS. It is not a drop
 * in replacement for SMS, though — a member without WhatsApp, or without the
 * number registered to WhatsApp, receives nothing. SMS remains the fallback for
 * exactly those people.
 *
 * Two consequences worth knowing before choosing a provider:
 *
 *   - **The body must match the approved template.** A DLT-approved template
 *     contains fixed wording plus a variable slot for the code. Changing the
 *     wording here without changing the template gets the message rejected, so
 *     the body is built from one place and must stay in step with the template.
 *   - **Twilio's international route needs no DLT.** That is the way to test
 *     today, at the cost of arriving from a random short code rather than your
 *     brand name — which reads as spam, a poor fit for a safety-first app.
 */
import { maskPhone } from "./accountService";
import type { DeliveryOutcome } from "./mailer";

export type SmsProvider = "msg91" | "twilio" | "whatsapp" | "log" | "none";

/**
 * Whether SMS is configured well enough to attempt a send.
 *
 * Twilio needs three values, not one. Checking the key alone would repeat the
 * old trap where a half-configured channel reported success and delivered
 * nothing.
 */
export function smsConfigured(): boolean {
  const provider = smsProviderName();
  if (provider === "msg91") {
    return Boolean(process.env.SMS_PROVIDER_KEY && process.env.SMS_DLT_TEMPLATE_ID);
  }
  if (provider === "twilio") {
    return Boolean(
      process.env.SMS_PROVIDER_KEY &&
        process.env.SMS_TWILIO_ACCOUNT_SID &&
        (process.env.SMS_SENDER_ID || process.env.SMS_TWILIO_MESSAGING_SERVICE_SID),
    );
  }
  if (provider === "whatsapp") {
    /*
     * Three values, and the template name is one of them on purpose: WhatsApp
     * will not deliver an unapproved template, so a deployment that has a token
     * and a phone number id but never got its template approved would otherwise
     * report the channel ready and fail on every send.
     */
    return Boolean(
      process.env.SMS_PROVIDER_KEY &&
        process.env.SMS_WHATSAPP_PHONE_NUMBER_ID &&
        process.env.SMS_WHATSAPP_TEMPLATE_NAME,
    );
  }
  return false;
}

/**
 * Which adapter to use.
 *
 * With no key configured this is "none", never "log" — so a production
 * deployment that is missing its key fails loudly instead of printing codes to
 * a log nobody reads.
 */
export function smsProviderName(): SmsProvider {
  const named = (process.env.SMS_PROVIDER ?? "msg91").trim().toLowerCase();
  if (named === "log") return process.env.SMS_PROVIDER_KEY ? "log" : "none";
  if (named === "twilio") return "twilio";
  if (named === "whatsapp") return "whatsapp";
  return "msg91";
}

/**
 * The message body.
 *
 * Deliberately short and fixed, because it has to match the DLT-approved
 * template character for character apart from the code slot. The sender name
 * appears at the end the way Indian transactional templates usually place it.
 */
export function signinCodeSms(code: string): string {
  return `${code} is your Trufrenz verification code. It expires in 10 minutes. Do not share it with anyone. - TRFRNZ`;
}

/**
 * MSG91's flow API.
 *
 * `VAR1` carries the code into the approved template. The template id is
 * required: sending without one is not permitted on a domestic route.
 */
async function sendWithMsg91(phoneE164: string, code: string): Promise<DeliveryOutcome> {
  const key = process.env.SMS_PROVIDER_KEY as string;
  const templateId = process.env.SMS_DLT_TEMPLATE_ID as string;
  const senderId = process.env.SMS_SENDER_ID;
  try {
    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: key, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        ...(senderId ? { sender: senderId } : {}),
        // MSG91 expects the number without the leading "+".
        recipients: [{ mobiles: phoneE164.replace(/^\+/, ""), VAR1: code }],
      }),
    });

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      const reason = describeSmsFailure(response.status, body);
      console.error(`[sms] msg91 refused a send to ${maskPhone(phoneE164)} — ${reason}`);
      return { sent: false, provider: "msg91", reason };
    }

    /**
     * MSG91 answers 200 with a JSON body whose `type` is "error" when it
     * declines the send — a wrong template id, a number not on the DLT
     * allowlist. Treating 200 alone as success would report a delivery that
     * never happened, which is the exact failure this adapter exists to avoid.
     */
    const parsed = safeJson(body);
    if (parsed && String(parsed.type ?? "").toLowerCase() === "error") {
      const reason = describeSmsFailure(response.status, body);
      console.error(`[sms] msg91 reported an error for ${maskPhone(phoneE164)} — ${reason}`);
      return { sent: false, provider: "msg91", reason };
    }

    return { sent: true, provider: "msg91", messageId: asId(parsed?.message) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[sms] msg91 unreachable sending to ${maskPhone(phoneE164)} — ${redactSmsCode(reason)}`);
    return { sent: false, provider: "msg91", reason: redactSmsCode(reason) };
  }
}

/** Twilio's Messages API, authenticated with the account SID and key. */
async function sendWithTwilio(phoneE164: string, code: string): Promise<DeliveryOutcome> {
  const key = process.env.SMS_PROVIDER_KEY as string;
  const sid = process.env.SMS_TWILIO_ACCOUNT_SID as string;
  const from = process.env.SMS_SENDER_ID;
  const messagingService = process.env.SMS_TWILIO_MESSAGING_SERVICE_SID;
  try {
    const form = new URLSearchParams({ To: phoneE164, Body: signinCodeSms(code) });
    // A messaging service is preferred when present: it handles sender pooling.
    if (messagingService) form.set("MessagingServiceSid", messagingService);
    else if (from) form.set("From", from);

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${key}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      const reason = describeSmsFailure(response.status, body);
      console.error(`[sms] twilio refused a send to ${maskPhone(phoneE164)} — ${reason}`);
      return { sent: false, provider: "twilio", reason };
    }

    const parsed = safeJson(body);
    return { sent: true, provider: "twilio", messageId: asId(parsed?.sid) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(`[sms] twilio unreachable sending to ${maskPhone(phoneE164)} — ${redactSmsCode(reason)}`);
    return { sent: false, provider: "twilio", reason: redactSmsCode(reason) };
  }
}

/**
 * Which Graph API version to call.
 *
 * Meta ships breaking changes between versions, so this is pinned rather than
 * floated: an unannounced upgrade should never be the reason sign-in breaks.
 *
 * Read inside the call rather than at import, so it is part of the same
 * configuration surface as the rest of this adapter instead of a value frozen
 * the moment the module loaded.
 */
function whatsappApiVersion(): string {
  return process.env.SMS_WHATSAPP_API_VERSION ?? "v22.0";
}

/**
 * WhatsApp's Cloud API, sending an approved authentication template.
 *
 * Three details are load-bearing and each one caused a real failure for
 * somebody:
 *
 *   1. **The code appears twice in the payload** — once in the body, once in
 *      the button parameters. Meta documents this explicitly. Omitting the
 *      button copy delivers a message with a copy button that copies nothing.
 *   2. **A 200 does not mean delivered.** Meta accepts a send and reports the
 *      problem asynchronously through webhooks. So success here means "Meta
 *      accepted it", which is the same standard the email adapter holds, and
 *      the admin readiness surface is where real delivery is checked.
 *   3. **The number goes without a leading plus.** Meta expects digits only;
 *      a "+" is rejected.
 */
async function sendWithWhatsApp(phoneE164: string, code: string): Promise<DeliveryOutcome> {
  const token = process.env.SMS_PROVIDER_KEY as string;
  const phoneNumberId = process.env.SMS_WHATSAPP_PHONE_NUMBER_ID as string;
  const templateName = process.env.SMS_WHATSAPP_TEMPLATE_NAME as string;
  const language = process.env.SMS_WHATSAPP_TEMPLATE_LANGUAGE ?? "en_US";

  try {
    const response = await fetch(
      `https://graph.facebook.com/${whatsappApiVersion()}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          // Digits only. Meta rejects a leading plus.
          to: phoneE164.replace(/^\+/, ""),
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: code }],
              },
              {
                /*
                 * Sub-type "url", not "button": WhatsApp converts an OTP button
                 * to a URL button at template creation, which Meta's own docs
                 * note is surprising but expected.
                 */
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: code }],
              },
            ],
          },
        }),
      },
    );

    const body = await response.text().catch(() => "");
    if (!response.ok) {
      const reason = describeSmsFailure(response.status, body);
      console.error(`[sms] whatsapp refused a send to ${maskPhone(phoneE164)} — ${reason}`);
      return { sent: false, provider: "whatsapp", reason };
    }

    const parsed = safeJson(body);
    const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
    const first = messages[0] as Record<string, unknown> | undefined;
    return { sent: true, provider: "whatsapp", messageId: asId(first?.id) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "send failed";
    console.error(
      `[sms] whatsapp unreachable sending to ${maskPhone(phoneE164)} — ${redactSmsCode(reason)}`,
    );
    return { sent: false, provider: "whatsapp", reason: redactSmsCode(reason) };
  }
}

/**
 * A local-only adapter that prints instead of sending.
 *
 * Selected with `SMS_PROVIDER=log`. It prints the number masked and the message
 * with the code intact, because the point is watching the real flow offline —
 * and it only activates when a key is also present, so it can never be reached
 * by accident in a deployment that simply forgot to configure SMS.
 */
async function sendWithLog(phoneE164: string, code: string): Promise<DeliveryOutcome> {
  console.log(`[sms:log] would send to ${maskPhone(phoneE164)} — ${signinCodeSms(code)}`);
  return { sent: true, provider: "log" };
}

/** Send one sign-in code. Never throws: the caller decides what a failure means. */
export async function sendSigninSms(phoneE164: string, code: string): Promise<DeliveryOutcome> {
  const provider = smsProviderName();
  if (!smsConfigured()) {
    return { sent: false, provider: "none", reason: "no sms provider configured" };
  }
  if (!phoneE164 || phoneE164.replace(/\D/g, "").length < 10) {
    return { sent: false, provider, reason: "missing destination" };
  }
  if (provider === "log") return sendWithLog(phoneE164, code);
  if (provider === "twilio") return sendWithTwilio(phoneE164, code);
  if (provider === "whatsapp") return sendWithWhatsApp(phoneE164, code);
  return sendWithMsg91(phoneE164, code);
}

/* ------------------------------------------------------------------ */
/* Failure description                                                 */
/* ------------------------------------------------------------------ */

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Provider ids arrive as unknown JSON, and are only ever echoed back as text. */
function asId(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/**
 * Strip anything resembling a code before it reaches a log.
 *
 * Provider error bodies can echo the message they refused, and the message
 * contains the code. Six consecutive digits is the shape to remove.
 */
export function redactSmsCode(value: string): string {
  return value.replace(/\b\d{6}\b/g, "••••••");
}

/** A short, safe description of a failed response for the log. */
export function describeSmsFailure(status: number, body: string): string {
  const trimmed = redactSmsCode(body ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

/**
 * A description of the configured SMS transport, for readiness reporting.
 *
 * Presence only. The key is never returned, and the sender is reported as its
 * six-character ID because that value is public — it is the name members see.
 */
export function smsTransportSummary(): {
  configured: boolean;
  /** Null when nothing is configured; never the send path's fallback default. */
  provider: SmsProvider | null;
  senderId: string | null;
  /** Whether a DLT template id is present, which a domestic route requires. */
  dltTemplate: boolean;
  /** The approved WhatsApp template name, or null when not on that transport. */
  whatsappTemplate: string | null;
} {
  const configured = smsConfigured();
  const provider = smsProviderName();
  return {
    configured,
    /**
     * The provider that would carry a code, or null when none is set up.
     *
     * `smsProviderName` falls back to a default so the send path always has
     * something to call. Reporting that default as the configured provider put
     * "msg91" on an unconfigured dashboard card and on the code response, which
     * reads as "SMS is working" to whoever is looking. Null is the truth.
     */
    provider: configured ? provider : null,
    senderId: process.env.SMS_SENDER_ID ? process.env.SMS_SENDER_ID.trim() : null,
    dltTemplate: Boolean(process.env.SMS_DLT_TEMPLATE_ID),
    whatsappTemplate:
      provider === "whatsapp" ? (process.env.SMS_WHATSAPP_TEMPLATE_NAME ?? null) : null,
  };
}
