export type ReceiptState = "sending" | "sent" | "delivered" | "read";
export type ReceiptIcon = "schedule" | "done" | "done-all";

export function receiptIcon(state: ReceiptState): ReceiptIcon {
  if (state === "sending") return "schedule";
  if (state === "sent") return "done";
  return "done-all";
}

export function receiptLabel(state: ReceiptState): string {
  switch (state) {
    case "sending": return "Sending";
    case "sent": return "Sent";
    case "delivered": return "Delivered";
    case "read": return "Read";
  }
}
