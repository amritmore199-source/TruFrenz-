export type WelcomeSlide = {
  id: string;
  title: string;
  body: string;
  /** MaterialIcons name for the slide's simple illustration. */
  icon: string;
  tint: "sky" | "blush" | "sage";
};

/** Three-swipe intro shown above the welcome actions. */
export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  {
    id: "verified",
    title: "Find genuine, verified people nearby",
    body: "Every profile shows how it was verified — phone, ID, or a live selfie match.",
    icon: "verified-user",
    tint: "sky",
  },
  {
    id: "your-way",
    title: "Chat, hangout, meetup — your way",
    body: "Start with a gentle friend request. Chats open after a mutual yes, never before.",
    icon: "forum",
    tint: "blush",
  },
  {
    id: "privacy",
    title: "Your privacy, your control",
    body: "Share a broad area instead of a live pin, and choose exactly what friends can see.",
    icon: "lock-outline",
    tint: "sage",
  },
];

export const WELCOME_SLIDE_COUNT = WELCOME_SLIDES.length;

/** Keep a carousel index inside the slide range, tolerating bad scroll offsets. */
export function clampSlideIndex(index: number, total: number = WELCOME_SLIDE_COUNT): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  const rounded = Math.round(index);
  if (rounded < 0) return 0;
  if (rounded > total - 1) return total - 1;
  return rounded;
}

export function nextSlideIndex(index: number, total: number = WELCOME_SLIDE_COUNT): number {
  return clampSlideIndex(index + 1, total);
}

export function previousSlideIndex(index: number, total: number = WELCOME_SLIDE_COUNT): number {
  return clampSlideIndex(index - 1, total);
}

/** Bump when the terms copy changes so stored acceptance can be re-requested. */
export const TERMS_VERSION = "1.0";

export const COMPANY_DETAILS = {
  name: "Trufrenz",
  legalName: "Trufrenz Technologies",
  location: "San Francisco, California",
  supportEmail: "support@trufrenz.app",
} as const;

/** Sign up and log in stay disabled until the visitor accepts the terms. */
export function canStartAuth(termsAccepted: boolean): boolean {
  return termsAccepted === true;
}

/** Guest mode is a browse-only preview; joining and chatting always need an account. */
export const GUEST_MODE_NOTICE =
  "Guest preview: you can browse friends and meetups, but chatting, friend requests, and meetups need a free account.";
