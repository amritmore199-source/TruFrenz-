import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeFailure,
  emailConfigured,
  emailProvider,
  emailTransportSummary,
  redactCode,
  sendEmail,
  signinCodeEmail,
} from "../server/mailer";

/**
 * The environment is a shared, mutable thing, so every test sets exactly the
 * variables it needs and everything is restored afterwards. Without this the
 * suite would pass or fail depending on the order tests happen to run in.
 */
const KEYS = [
  "EMAIL_PROVIDER",
  "EMAIL_PROVIDER_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
] as const;

const saved: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (!(key in saved)) saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

const FROM = "Trufrenz <hello@trufrenz.net>";

describe("choosing a provider", () => {
  it("is none without a key, whatever else is set", () => {
    setEnv({ EMAIL_FROM: FROM });
    expect(emailProvider()).toBe("none");
    expect(emailConfigured()).toBe(false);
  });

  it("is none without a sender, whatever else is set", () => {
    setEnv({ EMAIL_PROVIDER_KEY: "key" });
    expect(emailConfigured()).toBe(false);
  });

  it("defaults to resend", () => {
    setEnv({ EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM });
    expect(emailProvider()).toBe("resend");
  });

  it("recognises the named adapters", () => {
    setEnv({ EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM, EMAIL_PROVIDER: "zeptomail" });
    expect(emailProvider()).toBe("zeptomail");
    setEnv({ EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM, EMAIL_PROVIDER: "log" });
    expect(emailProvider()).toBe("log");
  });

  it("falls back to resend for a name it does not know", () => {
    // Better a working default than a channel that reports itself broken
    // because of a typo in an environment variable.
    setEnv({ EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM, EMAIL_PROVIDER: "sendgrid" });
    expect(emailProvider()).toBe("resend");
  });

  it("requires a host and a user when smtp is chosen", () => {
    /*
     * This is the half-configured case the readiness surface exists to catch. A
     * key with no host would otherwise report the channel ready and then refuse
     * every send, which is exactly the bug the member experiences as "the code
     * never arrived".
     */
    setEnv({ EMAIL_PROVIDER: "smtp", EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM });
    expect(emailConfigured()).toBe(false);

    setEnv({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_KEY: "key",
      EMAIL_FROM: FROM,
      SMTP_HOST: "smtp.example.com",
    });
    expect(emailConfigured()).toBe(false);

    setEnv({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_KEY: "key",
      EMAIL_FROM: FROM,
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "user",
    });
    expect(emailConfigured()).toBe(true);
    expect(emailProvider()).toBe("smtp");
  });
});

describe("sending over smtp", () => {
  it("sends the message and reports the provider id", async () => {
    setEnv({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_KEY: "key",
      EMAIL_FROM: FROM,
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "user",
    });

    const sendMail = vi.fn().mockResolvedValue({ messageId: "<abc@example.com>" });
    vi.doMock("nodemailer", () => ({ createTransport: () => ({ sendMail }) }));
    vi.resetModules();

    const { sendEmail: send } = await import("../server/mailer");
    const outcome = await send({ to: "member@example.com", subject: "Your code", text: "123456" });

    expect(outcome).toEqual({ sent: true, provider: "smtp", messageId: "<abc@example.com>" });
    expect(sendMail).toHaveBeenCalledOnce();
    const message = sendMail.mock.calls[0]?.[0] as { from: string; to: string };
    expect(message.from).toBe(FROM);
    expect(message.to).toBe("member@example.com");
  });

  it("reports a failure instead of throwing", async () => {
    setEnv({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_KEY: "key",
      EMAIL_FROM: FROM,
      SMTP_HOST: "smtp.example.com",
      SMTP_USER: "user",
    });

    vi.doMock("nodemailer", () => ({
      createTransport: () => ({
        sendMail: vi.fn().mockRejectedValue(new Error("553 relaying denied")),
      }),
    }));
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendEmail: send } = await import("../server/mailer");
    const outcome = await send({ to: "member@example.com", subject: "Your code", text: "123456" });

    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toContain("relaying denied");
  });

  it("refuses before dialling when the host is missing", async () => {
    /*
     * SMTP chosen but no host. The refusal happens at the configuration gate
     * rather than inside the adapter, which is the better place for it: no
     * connection is attempted, and the readiness screen already shows the
     * channel as unconfigured with the host field listed as missing.
     */
    setEnv({ EMAIL_PROVIDER: "smtp", EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM, SMTP_USER: "user" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(emailConfigured()).toBe(false);
    expect(emailTransportSummary().configured).toBe(false);

    const outcome = await sendEmail({ to: "member@example.com", subject: "s", text: "t" });
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    // Nothing was dialled, so nothing was attempted against a host that is not
    // set — the failure is honest rather than a timeout.
    expect(outcome.reason).toBe("no email provider configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sending over zeptomail", () => {
  it("sends with the token prefix and reads the nested id", async () => {
    setEnv({ EMAIL_PROVIDER: "zeptomail", EMAIL_PROVIDER_KEY: "tok", EMAIL_FROM: FROM });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { message_id: "zm-1" } }), { status: 201 }),
    );

    const outcome = await sendEmail({ to: "member@example.com", subject: "Your code", text: "123456" });
    expect(outcome).toEqual({ sent: true, provider: "zeptomail", messageId: "zm-1" });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.zeptomail.com/v1.1/email");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Zoho-enczapikey tok");
  });

  it("does not double the token prefix when the dashboard already includes it", async () => {
    // ZeptoMail's dashboard shows the token with its own prefix, and pasting it
    // verbatim is the obvious thing for an operator to do.
    setEnv({
      EMAIL_PROVIDER: "zeptomail",
      EMAIL_PROVIDER_KEY: "Zoho-enczapikey tok",
      EMAIL_FROM: FROM,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), { status: 201 }),
    );

    await sendEmail({ to: "member@example.com", subject: "s", text: "t" });
    const headers = (fetchSpy.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Zoho-enczapikey tok");
  });

  it("still reports success when the response has no id", async () => {
    setEnv({ EMAIL_PROVIDER: "zeptomail", EMAIL_PROVIDER_KEY: "tok", EMAIL_FROM: FROM });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));

    const outcome = await sendEmail({ to: "member@example.com", subject: "s", text: "t" });
    expect(outcome.sent).toBe(true);
    if (!outcome.sent) return;
    expect(outcome.messageId).toBeUndefined();
  });

  it("reports a refusal", async () => {
    setEnv({ EMAIL_PROVIDER: "zeptomail", EMAIL_PROVIDER_KEY: "tok", EMAIL_FROM: FROM });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sender not verified", { status: 401 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendEmail({ to: "member@example.com", subject: "s", text: "t" });
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toContain("401");
  });
});

describe("guard rails that apply to every adapter", () => {
  it("refuses an empty destination without calling a provider", async () => {
    setEnv({ EMAIL_PROVIDER_KEY: "key", EMAIL_FROM: FROM });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const outcome = await sendEmail({ to: "", subject: "s", text: "t" });
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toBe("missing destination");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses honestly when nothing is configured at all", async () => {
    setEnv({});
    const outcome = await sendEmail({ to: "member@example.com", subject: "s", text: "t" });
    expect(outcome).toEqual({
      sent: false,
      provider: "none",
      reason: "no email provider configured",
    });
  });

  it("never logs a code", () => {
    // Provider error bodies can echo the message they refused, and that message
    // contains the code. A code in a log is a code in a log forever.
    expect(redactCode("rejected message containing 123456")).toBe("rejected message containing ••••••");
    expect(describeFailure(400, '{"message":"refused 654321"}')).not.toContain("654321");
  });
});

describe("the readiness summary", () => {
  it("reports presence and never the key", () => {
    setEnv({ EMAIL_PROVIDER_KEY: "super-secret", EMAIL_FROM: FROM });
    const summary = emailTransportSummary();
    expect(summary.configured).toBe(true);
    expect(summary.sendDomain).toBe("trufrenz.net");
    expect(JSON.stringify(summary)).not.toContain("super-secret");
  });

  it("reads the domain out of a display-name sender", () => {
    setEnv({ EMAIL_PROVIDER_KEY: "k", EMAIL_FROM: "Trufrenz <hello@trufrenz.net>" });
    expect(emailTransportSummary().sendDomain).toBe("trufrenz.net");
  });

  it("names the smtp host so a missing one is visible", () => {
    setEnv({
      EMAIL_PROVIDER: "smtp",
      EMAIL_PROVIDER_KEY: "k",
      EMAIL_FROM: FROM,
      SMTP_HOST: "smtp-relay.brevo.com",
      SMTP_USER: "u",
    });
    expect(emailTransportSummary().smtpHost).toBe("smtp-relay.brevo.com");
  });
});

describe("the message itself", () => {
  it("puts the code in the subject", () => {
    // Members read the code from the notification without opening the message.
    expect(signinCodeEmail("123456").subject).toContain("123456");
  });

  it("says how long it lasts and what to do if it was not requested", () => {
    const body = signinCodeEmail("123456");
    expect(body.text).toContain("10 minutes");
    expect(body.text).toMatch(/did not ask for this/i);
  });

  it("carries no marketing or tracking", () => {
    // Heavy templates are what push sign-in mail into spam.
    const body = signinCodeEmail("123456");
    const combined = `${body.text}${body.html}`.toLowerCase();
    for (const banned of ["utm_", "unsubscribe", "pixel", "promotion"]) {
      expect(combined).not.toContain(banned);
    }
  });
});
