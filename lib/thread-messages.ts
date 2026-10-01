import type { MessageKind, Reaction } from "./chat-extras";
import type { BizzOffer } from "./bizz-offers";
import type { PlanCard, PlanPoll } from "./plan-cards";

/**
 * One message in a conversation.
 *
 * Why this lives here rather than in the screen that renders it: the sync layer
 * has to be able to turn a rendered message into a row that travels and back
 * again, and the screen is far too large a thing to import for a type. Keeping the
 * shape in one place also means the app and the sync agree on what a message is
 * instead of drifting apart by a field.
 */
export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  time: string;
  receipt?: "sending" | "sent" | "delivered" | "read";
  /** Text is the default; attachments and plan cards render differently. */
  kind?: MessageKind;
  /** Local uri for photos and voice notes. */
  mediaUri?: string;
  durationSeconds?: number;
  place?: string;
  /** Structured plan card carried by the message. */
  plan?: PlanCard;
  /**
   * A Bizz offer carried by the message.
   *
   * Like the plan card, this is local to the sending device: what travels is the
   * text line, which `offerSummary` writes to contain the whole offer. So a
   * recipient on another device reads what is on offer and what it costs, and
   * the card is the richer rendering available to the sender.
   */
  offer?: BizzOffer;
  /** Group poll carried by the message. */
  poll?: PlanPoll;
  reactions?: Reaction[];
};

/** A conversation keyed by chat id, which is how threads are stored and merged. */
export type Threads = Record<string, Message[]>;