import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeSmsFailure,
  redactSmsCode,
  sendSigninSms,
  signinCodeSms,
  smsConfigured,
  smsProviderName,
  smsTransportSummary,
} from "../server/sms";

const KEYS = [
  "SMS_PROVIDER",
  "SMS_PROVIDER_KEY",
  "SMS_SENDER_ID",
  "SMS_DLT_TEMPLATE_ID",
  "SMS_TWILIO_ACCOUNT_SID",
  "SMS_TWILIO_MESSAGING_SERVICE_SID",
  "SMS_WHATSAPP_PHONE_NUMBER_ID",
  "SMS_WHATSAPP_TEMPLATE_NAME",
  "SMS_WHATSAPP_TEMPLATE_LANGUAGE",
  "SMS_WHATSAPP_API_VERSION",
] as const;

const saved: Record<string, string | undefined> = {};

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) {
    if (saved[key] === undefined) saved[key] = process.env[key];
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

describe("smsConfigured", () => {
  it("is false with nothing set", () => {
    setEnv({});
    expect(smsConfigured()).toBe(false);
  });

  it("requires a DLT template id for MSG91", () => {
    // This is the half-configured case that used to report itself ready: a key
    // with no template is rejected by the carrier on a domestic Indian route.
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_SENDER_ID: "TRFRNZ" });
    expect(smsConfigured()).toBe(false);

    setEnv({ SMS_PROVIDER_KEY: "key", SMS_SENDER_ID: "TRFRNZ", SMS_DLT_TEMPLATE_ID: "tpl" });
    expect(smsConfigured()).toBe(true);
  });

  it("requires an account SID and a sender for Twilio", () => {
    setEnv({ SMS_PROVIDER: "twilio", SMS_PROVIDER_KEY: "key" });
    expect(smsConfigured()).toBe(false);

    setEnv({ SMS_PROVIDER: "twilio", SMS_PROVIDER_KEY: "key", SMS_TWILIO_ACCOUNT_SID: "AC123" });
    expect(smsConfigured()).toBe(false);

    setEnv({
      SMS_PROVIDER: "twilio",
      SMS_PROVIDER_KEY: "key",
      SMS_TWILIO_ACCOUNT_SID: "AC123",
      SMS_SENDER_ID: "+15551234567",
    });
    expect(smsConfigured()).toBe(true);
  });

  it("accepts a messaging service in place of a sender id", () => {
    setEnv({
      SMS_PROVIDER: "twilio",
      SMS_PROVIDER_KEY: "key",
      SMS_TWILIO_ACCOUNT_SID: "AC123",
      SMS_TWILIO_MESSAGING_SERVICE_SID: "MG123",
    });
    expect(smsConfigured()).toBe(true);
  });
});

describe("smsProviderName", () => {
  it("defaults to msg91", () => {
    setEnv({});
    expect(smsProviderName()).toBe("msg91");
  });

  it("never reports log without a key", () => {
    // A production deployment that simply forgot its key must fail loudly, not
    // print codes to a log nobody reads.
    setEnv({ SMS_PROVIDER: "log" });
    expect(smsProviderName()).toBe("none");

    setEnv({ SMS_PROVIDER: "log", SMS_PROVIDER_KEY: "key" });
    expect(smsProviderName()).toBe("log");
  });

  it("ignores unknown names rather than guessing", () => {
    setEnv({ SMS_PROVIDER: "carrier-pigeon", SMS_PROVIDER_KEY: "key" });
    expect(smsProviderName()).toBe("msg91");
  });
});

describe("sendSigninSms", () => {
  it("refuses honestly when nothing is configured", async () => {
    setEnv({});
    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(false);
    expect(outcome.provider).toBe("none");
  });

  it("refuses a destination too short to be a phone number", async () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl" });
    const outcome = await sendSigninSms("+91", "123456");
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toBe("missing destination");
  });

  it("sends through MSG91 and reports the provider id", async () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl", SMS_SENDER_ID: "TRFRNZ" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "success", message: "msg-1" }), { status: 200 }),
    );

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome).toEqual({ sent: true, provider: "msg91", messageId: "msg-1" });

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as {
      recipients: { mobiles: string; VAR1: string }[];
    };
    // MSG91 expects the number without the leading plus.
    expect(body.recipients[0]?.mobiles).toBe("919812345678");
    expect(body.recipients[0]?.VAR1).toBe("123456");
  });

  it("treats a 200 that says error as a failed send", async () => {
    /*
     * This is the trap that makes an adapter worth writing carefully. MSG91
     * answers 200 with type "error" when it declines — a wrong template id, a
     * number off the DLT allowlist. Reading the status alone would report a
     * delivery that never happened, which is the exact bug this whole pass is
     * fixing.
     */
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "error", message: "template not approved" }), {
        status: 200,
      }),
    );

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(false);
    expect(outcome.provider).toBe("msg91");
  });

  it("reports a refusal rather than claiming success", async () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sender id not registered", { status: 401 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toContain("401");
  });

  it("survives an unreachable provider", async () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(false);
  });

  it("sends through Twilio with basic auth and the account SID in the path", async () => {
    setEnv({
      SMS_PROVIDER: "twilio",
      SMS_PROVIDER_KEY: "secret",
      SMS_TWILIO_ACCOUNT_SID: "AC123",
      SMS_SENDER_ID: "+15551234567",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
    );

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome).toEqual({ sent: true, provider: "twilio", messageId: "SM123" });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/Accounts/AC123/Messages.json");
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(String(init?.body)).toContain("To=%2B919812345678");
  });
});

describe("the message body", () => {
  it("carries the code and the sender name", () => {
    const body = signinCodeSms("123456");
    expect(body).toContain("123456");
    expect(body).toContain("TRFRNZ");
  });

  it("stays short enough to be one segment", () => {
    // A longer message is billed as two segments and split across two texts,
    // which is both more expensive and harder to read.
    expect(signinCodeSms("123456").length).toBeLessThan(160);
  });
});

describe("logging safety", () => {
  it("strips a code from anything about to be logged", () => {
    expect(redactSmsCode("failed to send 123456 to the handset")).toBe(
      "failed to send •••••• to the handset",
    );
  });

  it("leaves a short number alone", () => {
    expect(redactSmsCode("error 401")).toBe("error 401");
  });

  it("describes a failure without leaking the message body", () => {
    const described = describeSmsFailure(400, '{"message":"refused 654321"}');
    expect(described).toContain("HTTP 400");
    expect(described).not.toContain("654321");
  });
});

describe("smsTransportSummary", () => {
  it("reports presence and never the key", () => {
    setEnv({ SMS_PROVIDER_KEY: "super-secret-key", SMS_DLT_TEMPLATE_ID: "tpl", SMS_SENDER_ID: "TRFRNZ" });
    const summary = smsTransportSummary();
    expect(summary.configured).toBe(true);
    expect(summary.senderId).toBe("TRFRNZ");
    expect(summary.dltTemplate).toBe(true);
    expect(JSON.stringify(summary)).not.toContain("super-secret-key");
  });

  it("flags a missing DLT template", () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_SENDER_ID: "TRFRNZ" });
    expect(smsTransportSummary().dltTemplate).toBe(false);
  });
});

describe("whatsapp as a transport", () => {
  const WA = {
    SMS_PROVIDER: "whatsapp",
    SMS_PROVIDER_KEY: "token",
    SMS_WHATSAPP_PHONE_NUMBER_ID: "105954558954427",
    SMS_WHATSAPP_TEMPLATE_NAME: "trufrenz_code",
  };

  it("is selected by name", () => {
    setEnv({ ...WA });
    expect(smsProviderName()).toBe("whatsapp");
  });

  it("needs the template name, not just a token", () => {
    /*
     * WhatsApp refuses to deliver a template it has not approved, so a
     * deployment with a token and a phone number id but no approved template
     * would report the channel ready and then fail every single send. Treating
     * the name as required is what keeps readiness honest.
     */
    setEnv({ ...WA, SMS_WHATSAPP_TEMPLATE_NAME: undefined as unknown as string });
    delete process.env.SMS_WHATSAPP_TEMPLATE_NAME;
    expect(smsConfigured()).toBe(false);

    setEnv({ ...WA, SMS_WHATSAPP_PHONE_NUMBER_ID: undefined as unknown as string });
    delete process.env.SMS_WHATSAPP_PHONE_NUMBER_ID;
    expect(smsConfigured()).toBe(false);

    setEnv({ ...WA });
    expect(smsConfigured()).toBe(true);
  });

  it("sends the code in both places Meta requires", async () => {
    setEnv({ ...WA });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }),
    );

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome).toEqual({ sent: true, provider: "whatsapp", messageId: "wamid.ABC" });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://graph.facebook.com/v22.0/105954558954427/messages",
    );

    const payload = JSON.parse(String(init?.body)) as {
      to: string;
      template: { name: string; components: Array<{ parameters?: Array<{ text: string }> }> };
    };

    // Digits only: Meta rejects a leading plus.
    expect(payload.to).toBe("919812345678");
    expect(payload.template.name).toBe("trufrenz_code");

    // The code must appear in the body AND the button parameters. A message
    // with only the body delivers a copy button that copies nothing.
    expect(payload.template.components).toHaveLength(2);
    expect(payload.template.components[0]?.parameters?.[0]?.text).toBe("123456");
    expect(payload.template.components[1]?.parameters?.[0]?.text).toBe("123456");
  });

  it("uses the button sub-type Meta actually accepts", async () => {
    // WhatsApp converts an OTP button to a URL button at template creation, so
    // sending "button" here is rejected even though it reads more naturally.
    setEnv({ ...WA });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.ABC" }] }), { status: 200 }),
    );

    await sendSigninSms("+919812345678", "123456");
    const payload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body)) as {
      template: { components: Array<{ type: string; sub_type?: string; index?: string }> };
    };
    const button = payload.template.components[1];
    expect(button?.type).toBe("button");
    expect(button?.sub_type).toBe("url");
    expect(button?.index).toBe("0");
  });

  it("honours a pinned API version so upgrades are deliberate", async () => {
    setEnv({ ...WA, SMS_WHATSAPP_API_VERSION: "v26.0" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [] }), { status: 200 }),
    );

    await sendSigninSms("+919812345678", "123456");
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/v26.0/");
  });

  it("still reports success when the response has no id", async () => {
    // Meta accepted the send; the id is only useful for tracking.
    setEnv({ ...WA });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(true);
    if (!outcome.sent) return;
    expect(outcome.messageId).toBeUndefined();
  });

  it("reports a refusal instead of claiming delivery", async () => {
    setEnv({ ...WA });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"message":"Template not found"}}', { status: 400 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await sendSigninSms("+919812345678", "123456");
    expect(outcome.sent).toBe(false);
    if (outcome.sent) return;
    expect(outcome.reason).toContain("400");
  });

  it("never writes the code to a log", async () => {
    setEnv({ ...WA });
    // The error body echoes the message that was refused, and the message holds
    // the code. A code in a log is a code in a log permanently.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"error":{"message":"refused 123456"}}', { status: 400 }),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendSigninSms("+919812345678", "123456");
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).not.toContain("123456");
  });

  it("names the template in readiness so a missing one is visible", () => {
    setEnv({ ...WA });
    const summary = smsTransportSummary();
    expect(summary.provider).toBe("whatsapp");
    expect(summary.whatsappTemplate).toBe("trufrenz_code");
    // Presence only; the token must never appear.
    expect(JSON.stringify(summary)).not.toContain("token");
  });

  it("does not report a whatsapp template when another transport is in use", () => {
    setEnv({ SMS_PROVIDER_KEY: "key", SMS_DLT_TEMPLATE_ID: "tpl", SMS_WHATSAPP_TEMPLATE_NAME: "x" });
    expect(smsTransportSummary().whatsappTemplate).toBeNull();
  });
});

describe("the transport's own fallback rule", () => {
  it("still masks numbers in a whatsapp failure", () => {
    expect(redactSmsCode("failed for 123456")).toBe("failed for ••••••");
  });

  it("keeps the same DLT-matching SMS body untouched", () => {
    // The SMS body must stay in step with the DLT-approved template, so it is
    // asserted here to stop an unrelated edit from silently breaking SMS.
    expect(signinCodeSms("123456")).toContain("123456");
    expect(signinCodeSms("123456")).toContain("TRFRNZ");
  });
});
