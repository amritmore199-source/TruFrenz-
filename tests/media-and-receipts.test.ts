import { describe, expect, it } from "vitest";
import { receiptIcon, receiptLabel } from "../lib/chat-status";
import { isIdentityVerified, stageAfterCameraPermission, stageAfterSelfieCapture } from "../lib/selfie-flow";

describe("selfie capture flow", () => {
  it("shows a retryable camera permission step and handles a permanently denied camera", () => {
    expect(stageAfterCameraPermission(true, true)).toBe("capture");
    expect(stageAfterCameraPermission(false, true)).toBe("permission");
    expect(stageAfterCameraPermission(false, false)).toBe("denied");
  });

  it("starts scanning only when a photo URI exists", () => {
    expect(stageAfterSelfieCapture(null)).toBe("capture");
    expect(stageAfterSelfieCapture("file://selfie.jpg")).toBe("scanning");
  });

  it("does not grant an identity badge for capture alone", () => {
    expect(isIdentityVerified(false)).toBe(false);
    expect(isIdentityVerified(true)).toBe(true);
  });
});

describe("message receipt cues", () => {
  it("maps sending/sent/delivered/read states to the expected concise icons", () => {
    expect(receiptIcon("sending")).toBe("schedule");
    expect(receiptIcon("sent")).toBe("done");
    expect(receiptIcon("delivered")).toBe("done-all");
    expect(receiptIcon("read")).toBe("done-all");
  });

  it("labels receipts accessibly", () => {
    expect(receiptLabel("sending")).toBe("Sending");
    expect(receiptLabel("sent")).toBe("Sent");
    expect(receiptLabel("delivered")).toBe("Delivered");
    expect(receiptLabel("read")).toBe("Read");
  });
});
