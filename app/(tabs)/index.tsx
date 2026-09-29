import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  PanResponder,
  ScrollView,
  StatusBar,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import { getLocales } from "expo-localization";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as SMS from "expo-sms";
import { isValidCredential, isValidDemoCode } from "@/lib/onboarding";
import {
  noticeIsCancelledRenewal,
  noticeOffersStoreLink,
  storeManageActionLabel,
  storeManageLink,
} from "@/lib/store-links";
import { canOpenChat, canRequestFriendship } from "@/lib/social-access";
import { receiptIcon, receiptLabel } from "@/lib/chat-status";
import {
  autoRestoreKey,
  autoRestoreOutcome,
  decideAutoRestore,
  shouldAttemptAutoRestore,
} from "@/lib/auto-restore";
import {
  STORE_PRICE_CACHE_KEY,
  isCatalogueFresh,
  parseStoredCatalogue,
  priceMismatch,
  type StorePriceCatalogue,
} from "@/lib/store-prices";
import { isInboxMeetupTransition } from "@/lib/ui-transitions";
import { SelfieVerificationModal } from "@/components/selfie-verification-modal";
import { SafetyOnboardingCarousel } from "@/components/safety-onboarding-carousel";
import { CreateMeetupInviteModal } from "@/components/create-meetup-invite-modal";
import { FriendProfileModal } from "@/components/friend-profile-modal";
import { SwipeableChatRow } from "@/components/swipeable-chat-row";
import { ChatOverflowMenu } from "@/components/chat-overflow-menu";
import { AttachmentSheet } from "@/components/attachment-sheet";
import { AttachmentPreviewStrip } from "@/components/attachment-preview-strip";
import { PlanComposerModal } from "@/components/plan-composer-modal";
import { PlanCardView } from "@/components/plan-card-view";
import { PlanPollCard } from "@/components/plan-poll-card";
import { GroupInfoModal } from "@/components/group-info-modal";
import { CallScreen } from "@/components/call-screen";
import { EditProfileModal } from "@/components/edit-profile-modal";
import { QuickRepliesModal } from "@/components/quick-replies-modal";
import { IncomingNotificationBanner } from "@/components/incoming-notification-banner";
import { findCommonInterests } from "@/lib/discovery-interests";
import {
  DEFAULT_FRIENDSHIPS,
  FRIENDSHIP_STORAGE_KEY,
  acceptFriendship,
  isNewIntroduction,
  parseFriendships,
  relationshipFor,
  requestFriendship,
  serializeFriendships,
  unfriend,
  withdrawRequest,
  type FriendshipGraph,
} from "@/lib/friendship-store";
import {
  CONNECTION_SYNC_STORAGE_KEY,
  EMPTY_CONNECTION_SYNC,
  acknowledge,
  clearConnection,
  connectionStateFor,
  graphFromRows,
  overlayPending,
  parseConnectionSync,
  pendingRows,
  queueChange,
  queueRemoval,
  reconcileOnLaunch,
  serializeConnectionSync,
  setConnectionState,
  type ConnectionState,
  type ConnectionSync,
} from "@/lib/connection-sync";
import {
  CHAT_PREFERENCES_STORAGE_KEY,
  compactChatPreferences,
  parseChatPreferences,
  serializeChatPreferences,
} from "@/lib/chat-preferences";
import {
  EMPTY_THREAD_STATE,
  THREAD_STATE_STORAGE_KEY,
  clearThreadUnread,
  firstUnreadIndex,
  isMarkedUnread,
  markThreadRead,
  markThreadUnread,
  parseThreadState,
  readMarkerLabel,
  serializeThreadState,
  unreadForRow,
  type ThreadState,
} from "@/lib/thread-state";
import { decideThreadDrag, type ThreadDragDecision } from "@/lib/thread-gesture";
import { formatMeetupInvite, type MeetupInviteDraft } from "@/lib/meetup-invite";
import { mergeMeetupRefresh } from "@/lib/meetup-feed";
import { resolveChatProfile } from "@/lib/chat-profile";
import { addQuickReply, DEFAULT_QUICK_REPLIES, parseQuickReplies, removeQuickReply, type QuickReply } from "@/lib/quick-replies";
import { createIncomingMeetupInviteNotification, createIncomingMessageNotification, type IncomingNotification } from "@/lib/incoming-notifications";
import {
  chatRowRevealWidth,
  composerKeyboardLift,
  shouldShowBottomBar,
} from "@/lib/chat-layout";
import { PremiumPaywall } from "@/components/premium-paywall";
import { ManageSubscriptionModal, type ReceiptSummary } from "@/components/manage-subscription-modal";
import { UpgradeNudgeCard } from "@/components/upgrade-nudge";
import {
  BANNER_AD_COPY,
  DEFAULT_SUBSCRIPTION,
  DEFAULT_PLAN_ID,
  FEATURE_COMPARISON,
  FREE_HANGOUT_PROPOSALS,
  PLANS,
  SUBSCRIPTION_STORAGE_KEY,
  adFreeGate,
  callingGate,
  entitlementsFor,
  hangoutProposalGate,
  liveMapGate,
  parseSubscription,
  applyEntitlement,
  startSubscription,
  tierLabel,
  type PlanId,
  type Subscription,
} from "@/lib/subscription";
import {
  EMPTY_USAGE,
  type UsageCounters,
  IDLE_PURCHASE,
  IDLE_RESTORE,
  NOTHING_TO_RESTORE,
  activePlanLine,
  beginPurchase,
  beginRestore,
  beginVerification,
  chargeForPlan,
  completePurchase,
  failPurchase,
  groupCapacityNudge,
  parseUsage,
  productIdForPlan,
  proposalNudge,
  purchaseInFlight,
  restoreFailed,
  restoredState,
  type PurchaseState,
  type RestoreState,
  type StoreChannel,
  type UpgradeNudge,
} from "@/lib/subscription-store";
import {
  demoReceipt,
  finishVerifiedPurchase,
  purchasePlanThroughStore,
  storeChannelForPlatform,
  currentStoreChannel,
  fetchStorePrices,
  storePurchaseHistory,
  storeSdkAvailable,
  type PurchaseOrigin,
} from "@/lib/store-client";
import {
  fetchBillingProducts,
  fetchEntitlement,
  fetchMessages,
  pushMessages,
  fetchConnections,
  pushConnections,
  fetchContactMatches,
  setContactDiscoveryEnabled as saveContactDiscoveryEnabled,
  accountStateFrom,
  completeSignin,
  fetchNotices,
  fetchSession,
  markNoticesRead,
  reportEvents,
  requestEmailOtp,
  requestOtp,
  runGuardedAction,
  signOutRemote,
  verifyCode,
  reportStoreCancellation,
  restorePurchases,
  subscriptionFromEntitlement,
  verifyPurchase,
  type MemberNotice,
  type RemoteAccount,
  type SigninChannel,
  type StoreReceiptPayload,
} from "@/lib/account-client";
import { contactInviteMessage, normalizeDeviceContacts, type ContactMatch, type NormalizedDeviceContact } from "@/lib/contact-discovery";
import { resolveMobileBackAction } from "@/lib/mobile-navigation";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { GLASS_OPACITY_STEPS, GLASS_TINT_OPTIONS, glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { GLASS_PRESETS, GLASS_SHADOW, glassBlur, glassEdge, glassSwatch, glassSwatchEdge, glassTint, glassVeil, matchGlassPreset, tabBarTint, type GlassSurface, type GlassTint, type TabAccent } from "@/lib/glass";
import { useAppAppearance } from "@/lib/appearance-context";
import { WelcomeScreen } from "@/components/welcome-screen";
import { createGuestSession, createMemberSession, isGuestSession, parseSession, serializeSession, SESSION_STORAGE_KEY, shouldShowWelcome, type StoredSession } from "@/lib/session";
import {
  cooldownSecondsFrom,
  countdownIsActive,
  describeResendFailure,
  resendLabel,
  resendStateAt,
} from "@/lib/resend-countdown";
import { isValidEmail } from "@/lib/email";
import { blockedActionMessage, canAccount, describeRestriction, requiresAccountNotice } from "@/lib/account-access";
import { addProfilePhoto, createInitialProfile, statusLabel, visibleStatus, type EditableProfile, type RequestAudience, type ViewerRelationship } from "@/lib/profile-details";

import { guestUpsellMessage } from "@/lib/guest-mode";
import {
  DEFAULT_CHAT_PRIVACY,
  DEFAULT_CHAT_ROW_STATE,
  REACTION_CHOICES,
  availabilityView,
  applyReaction,
  archiveOnUnfriend,
  callGate,
  canSendTo,
  clampVoiceSeconds,
  displayUnread,
  emptyChatsCopy,
  messagePreview,
  outgoingReceipt,
  rowStateFor,
  summariseReactions,
  shouldShowReceipt,
  splitByArchive,
  toggleArchived,
  toggleMuted,
  type AttachmentDraft,
  type ChatRowState,
  type MessageKind,
  type Reaction,
} from "@/lib/chat-extras";
import {
  EMPTY_MESSAGE_SYNC,
  MESSAGE_SYNC_STORAGE_KEY,
  acknowledgeMessages,
  mergeThreads,
  parseMessageSync,
  queueMessage,
  rowFromMessage,
  serializeMessageSync,
  type MessageSync,
} from "@/lib/message-sync";
import {
  attachmentPreviewLabel,
  createPendingAttachment,
  pendingToDraft,
  type PendingAttachment,
} from "@/lib/attachment-preview";
import type { Message as ThreadMessage } from "@/lib/thread-messages";
import {
  DEFAULT_QUIET_HOURS,
  QUIET_HOURS_STORAGE_KEY,
  describeQuietHours,
  hourLabel,
  parseQuietHours,
  serializeQuietHours,
  shouldHoldNotification,
  shiftHour,
  type QuietHours,
} from "@/lib/quiet-hours";
import {
  PLAN_KIND_LABEL,
  castVote,
  createPlanCard,
  createPoll,
  checkInSafetyNote,
  checkInToPlan,
  canCheckIn,
  planPreview,
  planTiming,
  pollResults,
  respondToPlan,
  winningProposal,
  type PlanCard,
  type PlanKind,
  type PlanPoll,
  type PlanProposal,
  type PlanResponse,
} from "@/lib/plan-cards";
import {
  createCallSession,
  createGroup,
  endCall,
  markMissed,
  answerCall,
  declineCall,
  groupVoterIds,
  type CallSession,
  type Group,
  type GroupMember,
} from "@/lib/group-management";
import { INTEREST_SUGGESTIONS, LOCALITY_SUGGESTIONS, ageFromDateOfBirth, firstProfileError, formatDateOfBirth, hasProfileErrors, parseDateOfBirth, toggleInterest as toggleProfileInterest, validateProfileDraft, type ProfileDraftErrors } from "@/lib/onboarding-profile";
import * as ImagePicker from "expo-image-picker";

/** Narrow an arbitrary plan id string to one of the published plans. */
const planIdFrom = (value: string): PlanId => PLANS.find((plan) => plan.id === value)?.id ?? DEFAULT_PLAN_ID;

const REQUEST_AUDIENCE_LABEL: Record<RequestAudience, string> = {
  everyone: "Anyone can request",
  "friends-of-friends": "Friends of friends",
  "verified-only": "Verified only",
};

type Tab = "Chats" | "Friends" | "Meetups" | "You";
type AuthStep = "welcome" | "phone" | "code" | "profile" | "photo" | "about";
type AuthIntent = "signup" | "login";
/*
 * The message shape lives in `lib/thread-messages.ts`.
 *
 * It moved there so the sync layer can name it without importing this screen,
 * which is far too large a thing to pull in for a type. The re-export keeps every
 * existing use in this file working unchanged.
 */
type Message = ThreadMessage;
type Person = {
  id: string;
  name: string;
  age: number;
  locality: string;
  interests: string[];
  image: any;
  verification: "ID + selfie verified" | "Phone verified";
  about: string;
  /** Extra gallery photos for the profile carousel; optional. */
  gallery?: string[];
  languages?: string[];
  lookingFor?: string[];
  /** Distance in km; only rendered for paid viewers. */
  distanceKm?: number | null;
  /** Short mood/status line shown beside the name. */
  status?: { text: string; emoji?: string; updatedAt: string } | null;
  /** Reachability dot on chat rows; defaults to available. */
  available?: boolean;
};
type Conversation = {
  id: string;
  name: string;
  image: any;
  kind: "friend" | "group";
  lastMessage: string;
  time: string;
  unread: number;
  online?: boolean;
  verified?: boolean;
};
type Meetup = { id: string; day: string; title: string; place: string; people: string; image: any; tag: string };
const QUICK_REPLIES_STORAGE_KEY = "kindred.quick-replies.v1";

/**
 * What the member has used on the free plan.
 *
 * The proposal count decides when the upgrade hint appears, so it has to survive
 * a reload — otherwise a member could dismiss the limit by closing the app.
 */
const USAGE_STORAGE_KEY = "trufrenz.usage.v1";

const friends: Person[] = [
  { id: "maya", name: "Maya Chen", age: 28, locality: "Pacific Heights", interests: ["Coffee walks", "Ceramics"], image: require("../../assets/images/people/maya.jpg"), verification: "ID + selfie verified", about: "Recently discovered the little flower shop on Fillmore." },
  { id: "sam", name: "Sam Rivera", age: 31, locality: "Lower Pacific Heights", interests: ["Bouldering", "Coffee"], image: require("../../assets/images/people/sam.jpg"), verification: "Phone verified", about: "New to the neighborhood. Looking for a walking buddy." },
  { id: "noah", name: "Noah Kim", age: 27, locality: "Japantown", interests: ["Books", "Cooking"], image: require("../../assets/images/people/noah.jpg"), verification: "ID + selfie verified", about: "Has a book recommendation for every kind of day." },
];

const suggestionSeeds: Person[] = [
  friends[0],
  friends[1],
  friends[2],
  { id: "aria", name: "Aria Patel", age: 29, locality: "Western Addition", interests: ["Hiking", "Art books"], image: require("../../assets/images/people/aria.jpg"), verification: "ID + selfie verified", about: "Slow hikes, gallery afternoons, and good chai.", gallery: [require("../../assets/images/people/aria.jpg"), require("../../assets/images/people/dani.jpg")], languages: ["English", "Hindi"], lookingFor: ["Hangout buddy", "Activity partner"], distanceKm: 2.4, status: { text: "free this weekend", emoji: "🌿", updatedAt: new Date().toISOString() } },
  { id: "jules", name: "Jules Morgan", age: 30, locality: "Cow Hollow", interests: ["Gardening", "Coffee"], image: require("../../assets/images/people/jules.jpg"), verification: "ID + selfie verified", about: "Plant person, amateur baker, excellent listener.", gallery: [require("../../assets/images/people/jules.jpg")], languages: ["English", "Spanish"], lookingFor: ["Friendship", "Coffee company"], distanceKm: 1.1, status: { text: "looking for a gym buddy", emoji: "🏋️", updatedAt: new Date().toISOString() } },
  { id: "eli", name: "Eli Brooks", age: 34, locality: "Marina District", interests: ["Music", "Bookshops"], image: require("../../assets/images/people/eli.jpg"), verification: "Phone verified", about: "New to the city and always curious about a new café.", languages: ["English", "French"], lookingFor: ["Study partner", "Coffee company"], distanceKm: 6.8, status: { text: "new to the neighborhood", emoji: "🎧", updatedAt: new Date().toISOString() } },
  { id: "dani", name: "Dani Flores", age: 27, locality: "Lower Pac Heights", interests: ["Art walks", "Hiking"], image: require("../../assets/images/people/dani.jpg"), verification: "ID + selfie verified", about: "Down for a relaxed gallery or park afternoon.", gallery: [require("../../assets/images/people/dani.jpg"), require("../../assets/images/people/friends.jpg")], languages: ["English", "Tagalog"], lookingFor: ["Hangout buddy", "Travel buddy"], distanceKm: 3.2, status: { text: "walking most evenings", emoji: "🚶", updatedAt: new Date().toISOString() } },
];

const seedConversations: Conversation[] = [
  { id: "maya", name: "Maya Chen", image: friends[0].image, kind: "friend", lastMessage: "That little garden café was lovely 🌷", time: "9:42", unread: 2, online: true, verified: true },
  { id: "sam", name: "Sam Rivera", image: friends[1].image, kind: "friend", lastMessage: "Are you still up for a walk Saturday?", time: "8:16", unread: 0, online: true },
  { id: "sunday", name: "Sunday Walk Club", image: require("../../assets/images/people/friends.jpg"), kind: "group", lastMessage: "Maya: 10:30 works for me!", time: "Yesterday", unread: 3 },
  { id: "noah", name: "Noah Kim", image: friends[2].image, kind: "friend", lastMessage: "Sent you the recipe I promised", time: "Tue", unread: 0, verified: true },
];

const initialMessages: Record<string, Message[]> = {
  maya: [
    { id: "m1", from: "them", text: "That little garden café was lovely 🌷", time: "9:42" },
    { id: "m2", from: "me", text: "I could stay there all afternoon. Thanks for finding it!", time: "9:45", receipt: "read" },
    { id: "m3", from: "them", text: "Next time we should bring a book and claim the sunny table ☀️", time: "9:47" },
  ],
  sam: [
    { id: "s1", from: "them", text: "Are you still up for a walk Saturday?", time: "8:16" },
  ],
  sunday: [
    { id: "g1", from: "them", text: "Maya: 10:30 works for me!", time: "Yesterday" },
  ],
  noah: [
    { id: "n1", from: "them", text: "Sent you the recipe I promised", time: "Tue" },
  ],
};

const meetupSeeds: Meetup[] = [
  { id: "coffee", day: "TODAY · 10:30 AM", title: "Coffee and a slow start", place: "Juniper Café · Pacific Heights", people: "3 neighbors going", image: require("../../assets/images/people/friends.jpg"), tag: "4 places left" },
  { id: "park", day: "SATURDAY · 4:00 PM", title: "A little walk in the park", place: "Alta Plaza Park · Pacific Heights", people: "Maya, Sam + 2 more", image: require("../../assets/images/people/maya.jpg"), tag: "Small group" },
  { id: "books", day: "SUNDAY · 11:00 AM", title: "Bookshop & tea afternoon", place: "Green Apple Books · 1.2 mi", people: "Hosted by Noah", image: require("../../assets/images/people/noah.jpg"), tag: "3 places left" },
];

const Icon = ({ name, color = "#65614c", size = 20 }: { name: keyof typeof MaterialIcons.glyphMap; color?: string; size?: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

/**
 * Projection helpers for nested surfaces.
 *
 * A sheet or modal is its own component, so it cannot read the member's glass
 * tint from the screen that renders it. Rather than have every component
 * subscribe to the appearance context, the owning screen resolves the recipe
 * once and hands the value down.
 */
function projectGlassTint(tint: GlassTint) {
  return (surface: GlassSurface) => glassTint(surface, 80, tint);
}

function Frosted({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { glassOpacity, glassTint: glassTintChoice } = useAppAppearance();
  /*
   * Four layers make the glass, in order:
   *
   *   1. a heavy blur, so the wallpaper diffuses instead of showing hard edges
   *   2. a pale blue-white tint, thin enough that the wallpaper still reads
   *   3. a sheen across the top half, which is what looks like lit glass
   *   4. a bright rim, so the card has a physical edge
   *
   * The tint is deliberately thin. An opaque fill is what made the cards look
   * like plain white panels before: no blur can show through a solid colour.
   */
  const flattened = StyleSheet.flatten(style);
  const radius = flattened?.borderRadius ?? styles.frosted.borderRadius;
  return (
    <View
      style={[
        styles.frosted,
        style,
        {
          backgroundColor: glassTint("card", glassOpacity, glassTintChoice),
          borderColor: glassEdge("card", glassTintChoice),
          shadowColor: GLASS_SHADOW,
        },
      ]}
    >
      <BlurView
        intensity={glassBlur("card")}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={[StyleSheet.absoluteFillObject, styles.noninteractive, { borderRadius: radius }]}
      />
      <View
        pointerEvents="none"
        style={[styles.glassSheen, { borderRadius: radius, backgroundColor: glassVeil("card", glassOpacity, glassTintChoice) }]}
      />
      {children}
    </View>
  );
}

function ActionButton({ children, onPress, style, secondary = false, disabled = false }: { children: React.ReactNode; onPress: () => void; style?: object; secondary?: boolean; disabled?: boolean }) {
  // A disabled button still reports its state, so a screen reader explains why
  // the action is unavailable rather than silently ignoring the tap.
  return <Pressable onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityState={{ disabled }} style={({ pressed }) => [styles.actionButton, secondary && styles.actionButtonSecondary, style, disabled && styles.actionButtonDisabled, pressed && !disabled && styles.pressed]}>{children}</Pressable>;
}

export default function TrufrenzApp() {
  const modalLayout = useResponsiveModalLayout();
  const { glassOpacity, glassTint: glassTintChoice, wallpaperVisible, setGlassOpacity, setGlassTint, setWallpaperVisible } = useAppAppearance();
  /*
   * The root SafeAreaView already reserves the bottom inset, so a keyboard lift
   * measured from the screen edge has to have that inset cancelled first.
   * Otherwise the two are counted twice and the composer floats above the keys
   * with a band of wallpaper showing between them.
   */
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("Chats");
  const previousTab = useRef<Tab>("Chats");
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const loaderPulse = useRef(new Animated.Value(0.55)).current;
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  /*
    Keyboard tracking for the chat composer.

    Android runs edge-to-edge here, so the window is not resized when the
    keyboard opens and the composer would sit underneath it. Measuring the
    keyboard lets the thread lift the composer by exactly that amount, and lets
    the bottom tab bar step out of the way while the member is typing.
  */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Drives the drag threshold. react-native's Dimensions is not reactive, so the
  // hook is used: a rotation or a split-screen resize has to move the threshold.
  const { height: windowHeight } = useWindowDimensions();
  const [showSignup, setShowSignup] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authIntent, setAuthIntent] = useState<AuthIntent>("signup");
  const [authStep, setAuthStep] = useState<AuthStep>("welcome");
  const [phone, setPhone] = useState("");
  /** True while a sign-in request is in flight, so the button can show progress. */
  const [authBusy, setAuthBusy] = useState(false);
  /** One-time code echoed by the server when no provider can deliver it. */
  const [demoCode, setDemoCode] = useState<string | null>(null);
  /**
   * Which sign-in the code belongs to.
   *
   * Held in memory only, for the length of one sign-in, and never persisted: it
   * is a bearer value for a challenge that expires in ten minutes, so keeping it
   * on disk would leave a stale key behind for no benefit. The server also sets
   * an httpOnly cookie, which is what a browser uses; this is the path that works
   * on a phone, where fetch keeps no cookie jar at all.
   */
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  /** Which channel the member chose: a phone number or an email address. */
  const [authChannel, setAuthChannel] = useState<SigninChannel>("phone");
  /**
   * The address the code went to, partly hidden.
   *
   * The server decides this, so the code step can say "d•••@example.com"
   * without the app ever holding the full address it should not display.
   */
  const [otpDestination, setOtpDestination] = useState("");
  /** Which transport carried the code, so the copy can name it. */
  const [sentTransport, setSentTransport] = useState<string | null>(null);
  /**
   * When the next code may be requested, as an absolute time.
   *
   * A deadline rather than a countdown value, because a decrementing counter
   * drifts: timers pause when the app is backgrounded, and the member returns
   * to a button claiming 30 seconds remain when the real wait is long over.
   */
  const [resendDeadline, setResendDeadline] = useState<number | null>(null);
  /** Ticks once a second while a countdown is running, and then stops. */
  const [resendTick, setResendTick] = useState(0);
  /** The signed-in account as the server reports it, including its status. */
  const [remoteAccount, setRemoteAccount] = useState<RemoteAccount | null>(null);
  /** Notices the safety team sent to this account (warnings, outcomes). */
  const [memberNotices, setMemberNotices] = useState<MemberNotice[]>([]);
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [locality, setLocality] = useState("");
  const [profileInterests, setProfileInterests] = useState<string[]>(["Coffee walks"]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [profileErrors, setProfileErrors] = useState<ProfileDraftErrors>({});
  const [joined, setJoined] = useState(false);
  const [verificationPrompt, setVerificationPrompt] = useState(false);
  const [selfieModalVisible, setSelfieModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteTargetChat, setInviteTargetChat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"All" | "Unread" | "Groups">("All");
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [incomingNotification, setIncomingNotification] = useState<IncomingNotification | null>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationSequence = useRef(0);
  const notificationDemoCycle = useRef(0);
  /**
   * Lets the settings preview through a quiet window.
   *
   * The preview exists so the member can see what a notification looks like. If
   * quiet hours silently swallowed it, the button would appear broken at exactly
   * the hour they are most likely to be setting it up — and they would have no way
   * to tell a working setting from a dead button.
   */
  const [toast, setToast] = useState("");
  /*
   * Connections live in one persisted graph. They used to be three plain arrays
   * seeded with constants and written nowhere, so accepting a request granted
   * chat only until the next reload — and a request that arrived from the other
   * side kept coming back, which is what made the app ask a member to "ask for
   * friendship" from someone who had already asked them.
   */
  const [friendships, setFriendships] = useState<FriendshipGraph>(DEFAULT_FRIENDSHIPS);
  const [friendshipsLoaded, setFriendshipsLoaded] = useState(false);
  /*
   * What the member has already seen. Kept in one persisted record beside the
   * connection graph, for the same reason: anything the member has done has to
   * outlive the session, or the app asks them to do it again.
   */
  const [threadState, setThreadState] = useState<ThreadState>(EMPTY_THREAD_STATE);
  const [threadStateLoaded, setThreadStateLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<Person[]>(suggestionSeeds);
  const incomingRequests = friendships.incoming;
  const requestSent = friendships.requested;
  const acceptedFriends = friendships.accepted;
  const remoteAccountId = remoteAccount?.id;
  const remoteContactDiscoveryEnabled = remoteAccount?.contactDiscoveryEnabled ?? false;
  useEffect(() => {
    if (remoteAccountId != null) setContactDiscoveryEnabled(remoteContactDiscoveryEnabled);
  }, [remoteAccountId, remoteContactDiscoveryEnabled]);
  /** The people behind `requestSent`, so the waiting list can name them. */
  const outgoingRequests = suggestions.filter((person) => requestSent.includes(person.id));
  const [interestFilter, setInterestFilter] = useState<string[]>([]);
  const [joinedMeetups, setJoinedMeetups] = useState<string[]>([]);
  const [meetups, setMeetups] = useState<Meetup[]>(meetupSeeds);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profilePerson, setProfilePerson] = useState<Person | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [myProfile, setMyProfile] = useState<EditableProfile>(() => createInitialProfile({ name: "", age: 18, locality: "" }));
  /** The member's plan. Persisted locally; the store is the source of truth. */
  const [subscription, setSubscription] = useState<Subscription>(DEFAULT_SUBSCRIPTION);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);
  const [paywallPlan, setPaywallPlan] = useState<PlanId | undefined>(undefined);
  /** The management screen: plan, renewal, restore, and store cancellation. */
  const [manageOpen, setManageOpen] = useState(false);
  /** Where the current purchase is in the store -> verify -> unlock sequence. */
  const [purchase, setPurchase] = useState<PurchaseState>(IDLE_PURCHASE);
  const [restore, setRestore] = useState<RestoreState>(IDLE_RESTORE);
  const [restoring, setRestoring] = useState(false);
  /** Verified purchases on file, straight from the server. */
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  /** "store" once the server verifies with the real store API, "sandbox" until then. */
  const [verification, setVerification] = useState<"store" | "sandbox">("sandbox");
  /**
   * Prices the store quoted for this account, or null while the rupee catalogue
   * is the only source. Cached in AsyncStorage so the paywall is instant on the
   * next open instead of waiting on the store.
   */
  const [storePrices, setStorePrices] = useState<StorePriceCatalogue | null>(null);
  /** Limits the member has already been nudged about, so nothing repeats. */
  const [dismissedNudges, setDismissedNudges] = useState<string[]>([]);
  /** The store this build sells through. */
  const storeChannel: StoreChannel = storeChannelForPlatform(Platform.OS);
  /** How many hangout or meetup proposals this member has sent. */
  const [usage, setUsage] = useState<UsageCounters>(EMPTY_USAGE);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const proposalsSent = usage.proposalsSent;
  /** Free members see one small banner; dismissing it hides it for the session. */
  const [adDismissed, setAdDismissed] = useState(false);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(DEFAULT_QUICK_REPLIES);
  const [quickRepliesLoaded, setQuickRepliesLoaded] = useState(false);
  const [available, setAvailable] = useState(true);
  const [discoverable, setDiscoverable] = useState(true);
  const [contactDiscoveryEnabled, setContactDiscoveryEnabled] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<NormalizedDeviceContact[]>([]);
  const [contactMatches, setContactMatches] = useState<Record<string, ContactMatch>>({});
  const [selectedContactPhones, setSelectedContactPhones] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactInviteLoading, setContactInviteLoading] = useState(false);
  const [contactPreferenceBusy, setContactPreferenceBusy] = useState(false);
  const [inviteCursor, setInviteCursor] = useState(0);
  const [contactScanWasLimited, setContactScanWasLimited] = useState(false);
  const selectedDeviceContacts = deviceContacts.filter((contact) => selectedContactPhones.includes(contact.phoneE164));
  const [blurDistance, setBlurDistance] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [typingChat, setTypingChat] = useState<string | null>(null);
  const [chatRowStates, setChatRowStates] = useState<Record<string, ChatRowState>>({});
  const [chatPreferencesLoaded, setChatPreferencesLoaded] = useState(false);
  /**
   * The nightly window when nothing is allowed to interrupt.
   *
   * Separate from mute on purpose: mute silences one conversation forever, this
   * silences everything for a few hours and then lets go by itself. Both are
   * honoured when a notification is about to appear.
   */
  const [quietHours, setQuietHours] = useState<QuietHours>(DEFAULT_QUIET_HOURS);
  const [quietHoursLoaded, setQuietHoursLoaded] = useState(false);
  /**
   * What this device still owes the server about the member's circle.
   *
   * Held in state rather than a ref so the persist effect below can see it
   * change; the write itself is fire-and-forget, because a failed sync is not
   * something the member can act on and the queue survives to the next launch.
   */
  const [connectionSync, setConnectionSync] = useState<ConnectionSync>(EMPTY_CONNECTION_SYNC);
  /**
   * Messages this device owes the server.
   *
   * Deliberately separate from `chatMessages`, which is what the screen renders.
   * The queue is a debt, not a history: it holds only what has not been accepted
   * yet, so a conversation that has been delivered everywhere leaves nothing
   * behind.
   */
  const [messageSync, setMessageSync] = useState<MessageSync>(EMPTY_MESSAGE_SYNC);
  const [messageSyncLoaded, setMessageSyncLoaded] = useState(false);
  const connectionSyncRef = useRef<ConnectionSync>(EMPTY_CONNECTION_SYNC);
  /**
   * The queue as it is right now, readable without a re-render.
   *
   * The push's reply has to know which ids it covered, and the launch merge has to
   * see anything still owed — both of which happen outside the render that holds
   * the state.
   */
  const messageSyncRef = useRef<MessageSync>(EMPTY_MESSAGE_SYNC);
  const [chatPrivacy, setChatPrivacy] = useState(DEFAULT_CHAT_PRIVACY);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
  /** An attachment that has been picked but not yet sent. */
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  /** Bytes of the picked photo, when the platform reports it. */
  const [pendingPhotoBytes, setPendingPhotoBytes] = useState<number | undefined>(undefined);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [planComposerKind, setPlanComposerKind] = useState<PlanKind | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [group, setGroup] = useState<Group>(() =>
    createGroup({
      id: "group-sunday-walk",
      name: "Sunday Walk Club",
      creator: { id: "me", name: "You", role: "admin", paidTier: true },
      members: [
        { id: "maya", name: "Maya Chen", role: "member", paidTier: true },
        { id: "sam", name: "Sam Rivera", role: "member", paidTier: false },
      ],
    }),
  );
  const tier = subscription.tier;
  const entitlements = entitlementsFor(tier);
  const paidTier = tier === "premium";
  /*
   * Soft upgrade nudges.
   *
   * Each one stays hidden until the member is genuinely close to a limit, and a
   * dismissal is remembered so the same hint never appears twice.
   */
  const proposalUpgradeNudge = useMemo(() => {
    const nudge = proposalNudge(tier, proposalsSent);
    return dismissedNudges.includes("proposals") ? { ...nudge, level: "hidden" as const } : nudge;
  }, [dismissedNudges, proposalsSent, tier]);
  const groupUpgradeNudge = useMemo(() => {
    const nudge = groupCapacityNudge(tier, group.members.length);
    return dismissedNudges.includes("group") ? { ...nudge, level: "hidden" as const } : nudge;
  }, [dismissedNudges, group.members.length, tier]);
  /** Remember a dismissal for the session so the hint does not repeat. */
  const dismissNudge = useCallback((key: "proposals" | "group") => {
    setDismissedNudges((current) => (current.includes(key) ? current : [...current, key]));
  }, []);
  /** Opens the paywall, optionally explaining which limit was reached. */
  const openPaywall = useCallback((reason?: string, planId?: PlanId) => {
    setPaywallReason(reason);
    setPaywallPlan(planId);
    setPaywallOpen(true);
  }, []);

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [createdGroups, setCreatedGroups] = useState<string[]>([]);

  useEffect(() => {
    const from = previousTab.current;
    previousTab.current = tab;
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    const isHandoff = isInboxMeetupTransition(from, tab);
    setTransitionBusy(isHandoff);
    contentOpacity.setValue(isHandoff ? 0.82 : 0.93);
    contentTranslateY.setValue(isHandoff ? (tab === "Meetups" ? 8 : -8) : 3);
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: isHandoff ? 310 : 190, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(contentTranslateY, { toValue: 0, duration: isHandoff ? 340 : 210, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished && isHandoff) handoffTimer.current = setTimeout(() => setTransitionBusy(false), 180);
      else if (!isHandoff) setTransitionBusy(false);
    });
    return () => {
      animation.stop();
      if (handoffTimer.current) clearTimeout(handoffTimer.current);
    };
  }, [tab, contentOpacity, contentTranslateY]);

  useEffect(() => {
    if (!transitionBusy) return;
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(loaderPulse, { toValue: 1, duration: 470, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(loaderPulse, { toValue: 0.52, duration: 470, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [transitionBusy, loaderPulse]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(USAGE_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        if (serialized) {
          try {
            setUsage(parseUsage(JSON.parse(serialized)));
          } catch {
            // Unreadable counters are treated as fresh rather than trusted.
          }
        }
        setUsageLoaded(true);
      })
      .catch(() => {
        if (active) setUsageLoaded(true);
      });
    AsyncStorage.getItem(QUICK_REPLIES_STORAGE_KEY).then((serialized) => {
      if (!active) return;
      setQuickReplies(parseQuickReplies(serialized));
      setQuickRepliesLoaded(true);
    }).catch(() => {
      if (active) setQuickRepliesLoaded(true);
    });
    return () => { active = false; };
  }, []);

  /*
   * Connections are restored on launch, and only written once they have loaded.
   *
   * The guard matters: without it the defaults would be written over the stored
   * graph on the first render, before the read resolves, which would quietly
   * discard every friendship the member had built.
   */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(FRIENDSHIP_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        setFriendships(parseFriendships(serialized));
        setFriendshipsLoaded(true);
      })
      .catch(() => {
        if (active) setFriendshipsLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!friendshipsLoaded) return;
    AsyncStorage.setItem(FRIENDSHIP_STORAGE_KEY, serializeFriendships(friendships)).catch(() => undefined);
  }, [friendships, friendshipsLoaded]);

  /*
   * The circle also lives on the account, so it survives a new device.
   *
   * The queue is read first, then the server's version is laid under it: a tap
   * made while offline is not thrown away by the next successful fetch, and an
   * empty server is only trusted once this device has pushed something.
   */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CONNECTION_SYNC_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        const stored = parseConnectionSync(serialized);
        connectionSyncRef.current = stored;
        setConnectionSync(stored);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  /**
   * Read the unsent messages, and keep the mirror current.
   *
   * The guard matters more here than anywhere else in this screen: without it the
   * first render would write an empty queue over a stored one, and every message
   * a member sent offline would be forgotten on the next launch. That is the
   * failure this whole module exists to prevent, so it is not allowed to happen
   * inside the module itself.
   */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(MESSAGE_SYNC_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        const stored = parseMessageSync(serialized);
        messageSyncRef.current = stored;
        setMessageSync(stored);
        setMessageSyncLoaded(true);
      })
      .catch(() => { if (active) setMessageSyncLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!messageSyncLoaded) return;
    AsyncStorage.setItem(MESSAGE_SYNC_STORAGE_KEY, serializeMessageSync(messageSync)).catch(() => undefined);
    messageSyncRef.current = messageSync;
  }, [messageSync, messageSyncLoaded]);

  useEffect(() => {
    AsyncStorage.setItem(CONNECTION_SYNC_STORAGE_KEY, serializeConnectionSync(connectionSync)).catch(() => undefined);
    /*
     * The ref mirrors the queue for the two places that need to read it without
     * re-rendering: the launch merge and the push's reply. Updating it here, next
     * to the write, keeps the two from drifting apart.
     */
    connectionSyncRef.current = connectionSync;
  }, [connectionSync]);

  /*
   * Push whatever the circle still owes the server.
   *
   * Only the changed rows travel, so a device that has been offline cannot
   * overwrite connections it never knew about. The queue is written down before
   * the request leaves, so a change made and then lost to a crash is still sent
   * on the next launch rather than silently forgotten.
   */
  useEffect(() => {
    if (!session || session.mode !== "member") return;
    const rows = pendingRows(connectionSync);
    const removals = connectionSync.removed;
    if (rows.length === 0 && removals.length === 0) return;
    let active = true;
    void (async () => {
      const result = await pushConnections(rows, removals);
      if (!active) return;
      if (!result.ok) return;
      /*
       * The server's reply is the authoritative circle, and the acknowledgement
       * only clears the rows whose state still matches what was sent — a change
       * the member made while the request was in flight stays queued.
       */
      setConnectionSync((current) => acknowledge(current, rows, removals));
      setFriendships((current) =>
        overlayPending(graphFromRows(result.data.connections), connectionSyncRef.current.pending),
      );
    })();
    return () => { active = false; };
  }, [connectionSync, session]);

  /*
   * Push whatever the member has said and the account has not accepted yet.
   *
   * Re-sending is safe because the id the app gave the message is unique per
   * member on the server: a retry after a lost reply lands as a no-op rather than
   * a duplicate. That is what lets this run without any guesswork about which
   * sends actually made it.
   *
   * The reply is merged rather than assigned. The server's history and anything
   * still queued are both laid over the threads the app already renders, so a
   * message typed while this request was in flight is not thrown away by the
   * answer that did not include it.
   */
  useEffect(() => {
    if (!session || session.mode !== "member") return;
    const queued = messageSync.queued;
    if (queued.length === 0) return;
    let active = true;
    void (async () => {
      const result = await pushMessages(queued);
      if (!active) return;
      if (!result.ok) return;
      const sentIds = queued.map((row) => row.clientId);
      setMessageSync((current) => acknowledgeMessages(current, sentIds, Date.now()));
      const stillOwed = messageSyncRef.current.queued.filter((row) => !sentIds.includes(row.clientId));
      setChatMessages((current) =>
        mergeThreads({ seeds: current, server: result.data.messages, queued: stillOwed }),
      );
    })();
    return () => { active = false; };
  }, [messageSync, session]);

  /*
   * Mute, archive, and frozen threads are written down.
   *
   * The guard is the same as everywhere else here: without it the first render
   * would write the defaults over the stored record before the read resolves,
   * which would unmute every conversation the member had muted.
   */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CHAT_PREFERENCES_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        setChatRowStates(parseChatPreferences(serialized));
        setChatPreferencesLoaded(true);
      })
      .catch(() => { if (active) setChatPreferencesLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!chatPreferencesLoaded) return;
    AsyncStorage.setItem(CHAT_PREFERENCES_STORAGE_KEY, serializeChatPreferences(compactChatPreferences(chatRowStates))).catch(() => undefined);
  }, [chatRowStates, chatPreferencesLoaded]);

  /*
   * Quiet hours are stored the same guarded way as every other preference. A
   * write before the read would disable a window the member had deliberately set
   * for the night they are trying to sleep through.
   */
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(QUIET_HOURS_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        setQuietHours(parseQuietHours(serialized));
        setQuietHoursLoaded(true);
      })
      .catch(() => { if (active) setQuietHoursLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!quietHoursLoaded) return;
    AsyncStorage.setItem(QUIET_HOURS_STORAGE_KEY, serializeQuietHours(quietHours)).catch(() => undefined);
  }, [quietHours, quietHoursLoaded]);

  /*
   * One write path for the whole circle.
   *
   * Every change goes through here: the graph is updated locally so the screen
   * answers the tap immediately, the change is queued, and the queue is pushed.
   * The server's reply replaces the graph, minus anything still owed.
   */
  const applyConnectionChange = useCallback((peerId: string, state: ConnectionState) => {
    setFriendships((current) => setConnectionState(current, peerId, state));
    setConnectionSync((current) => queueChange(current, peerId, state));
  }, []);

  /**
   * Removes a person from the circle entirely, which is what unfriending and
   * blocking do.
   *
   * Deliberately not a decline. Turning a request down is a decision about an
   * incoming request and is remembered as one, so the same person is never asked
   * twice. Unfriending is the end of a relationship the member already had, and a
   * later request from them is a fresh introduction rather than a decision
   * already made. Filing it as a decline would silently change that behaviour.
   */
  const dropConnection = useCallback((peerId: string) => {
    setFriendships((current) => clearConnection(current, peerId));
    setConnectionSync((current) => queueRemoval(current, peerId));
  }, []);

  /**
   * Takes back a request this member sent, before the other side has answered.
   *
   * This is not a decline, and the difference is the whole point. Declining is a
   * decision about a request that arrived, and it is kept so the same person is
   * never asked twice. Someone whose request is simply withdrawn was never turned
   * down — they never knew about it — so the row is removed rather than rewritten
   * as declined. Recording a decline here would quietly bar them from the
   * member's suggestions forever, and would tell a later visitor to the account
   * that a decision had been made when none had.
   *
   * Queued as a removal rather than a state change so the server forgets it too,
   * which keeps the two copies of the circle from disagreeing on the next launch.
   */
  const withdrawSentRequest = useCallback((peerId: string) => {
    setFriendships((current) => withdrawRequest(current, peerId));
    setConnectionSync((current) => queueRemoval(current, peerId));
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THREAD_STATE_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        setThreadState(parseThreadState(serialized));
        setThreadStateLoaded(true);
      })
      .catch(() => {
        if (active) setThreadStateLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!threadStateLoaded) return;
    AsyncStorage.setItem(THREAD_STATE_STORAGE_KEY, serializeThreadState(threadState)).catch(() => undefined);
  }, [threadState, threadStateLoaded]);

  useEffect(() => {
    if (!quickRepliesLoaded) return;
    AsyncStorage.setItem(QUICK_REPLIES_STORAGE_KEY, JSON.stringify(quickReplies)).catch(() => undefined);
  }, [quickReplies, quickRepliesLoaded]);
  useEffect(() => {
    if (!usageLoaded) return;
    AsyncStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(usage)).catch(() => undefined);
  }, [usage, usageLoaded]);

  // The plan is restored on launch. A malformed record falls back to free, so
  // a corrupted value can never hand out Premium by accident.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SUBSCRIPTION_STORAGE_KEY).then((serialized) => {
      if (!active || !serialized) return;
      try {
        setSubscription(parseSubscription(JSON.parse(serialized)));
      } catch {
        setSubscription(DEFAULT_SUBSCRIPTION);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  // Only a purchase or cancellation writes, so a restored value is not echoed
  // back over itself before the store has been consulted.
  useEffect(() => {
    AsyncStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify(subscription)).catch(() => undefined);
  }, [subscription]);
  useEffect(() => () => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
  }, []);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SESSION_STORAGE_KEY)
      .then((serialized) => {
        if (!active) return;
        const restored = parseSession(serialized);
        setSession(restored);
        if (restored?.mode === "member") {
          setJoined(true);
          setFullName(restored.name);
          setLocality(restored.locality);
          if (restored.dateOfBirth) setDateOfBirth(restored.dateOfBirth);
          setMyProfile((current) => ({
            ...current,
            name: current.name || restored.name,
            locality: current.locality || restored.locality,
            age: current.age > 18 ? current.age : (restored.age ?? current.age),
            status: current.status ?? restored.status ?? null,
            verification: restored.verification,
          }));

          // Ask the server for this account's true status and any notices the
          // safety team has sent. A restriction set in the dashboard therefore
          // shows up the next time the member opens the app.
          void (async () => {
            const [sessionResult, noticesResult] = await Promise.all([
              fetchSession(),
              fetchNotices(),
            ]);
            if (!active) return;
            if (sessionResult.ok) {
              setRemoteAccount(sessionResult.data.account);
              const account = sessionResult.data.account;
              setMyProfile((current) => ({
                ...current,
                verification: account.verificationTier === "id_selfie" ? "id-selfie" : "phone-only",
              }));
            }
            if (noticesResult.ok) setMemberNotices(noticesResult.data.notices);
            /*
             * The circle comes from the account, so a friendship made on another
             * device is already here. The order matters: read first, then lay any
             * unsent change on top, so a tap made offline is not undone by this
             * fetch. An empty server is only trusted once this device has pushed.
             */
            const connectionsResult = await fetchConnections();
            if (!active) return;
            if (connectionsResult.ok) {
              const queued = connectionSyncRef.current;
              setFriendships((current) =>
                reconcileOnLaunch({
                  local: current,
                  server: graphFromRows(connectionsResult.data.connections),
                  pending: queued.pending,
                  hasPushed: queued.pushed,
                }),
              );
            }
            /*
             * Then the words. The history is layered over the threads the app
             * already has rather than replacing them, so the seeded conversation
             * stays readable and anything the member sent while offline is still
             * on screen waiting to go out.
             */
            const messagesResult = await fetchMessages();
            if (!active) return;
            if (messagesResult.ok) {
              const queued = messageSyncRef.current.queued;
              setChatMessages((current) =>
                mergeThreads({
                  seeds: current,
                  server: messagesResult.data.messages,
                  queued,
                }),
              );
            }
          })();
        }
        setSessionLoaded(true);
      })
      .catch(() => { if (active) setSessionLoaded(true); });
    return () => { active = false; };
  }, []);

  const feedback = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };
  const tap = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };

  /**
   * Open the member's store subscription screen.
   *
   * A renewal notice that says "turn auto-renew back on in your store account"
   * is only useful if they can get there, and two taps through Settings is where
   * good intentions die. Candidate links are tried in order because an
   * installed-app scheme can fail on a device that lacks the store app; if all
   * of them fail the member still has the written steps beside the button, so the
   * tap is never a dead end.
   */
  const openStoreManagement = async () => {
    const link = storeManageLink(Platform.OS, {
      androidPackage: Constants.expoConfig?.android?.package ?? null,
      iosBundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? null,
    });
    if (!link.supported) {
      feedback("Manage this subscription from your store account on your phone.");
      return;
    }
    for (const url of link.urls) {
      try {
        await Linking.openURL(url);
        tap();
        return;
      } catch {
        // Fall through to the next candidate. Reporting the failure here would
        // be noise the member cannot act on; the steps below are the fallback.
      }
    }
    feedback("Open your store account to change this subscription.");
  };

  /* ------------------------------- billing -------------------------------- */
  /*
   * The store is the source of truth for the paid tier.
   *
   * `refreshEntitlement` reads the server's view, which is derived from verified
   * receipts only. A purchase runs store → verify → unlock, and every failure is
   * shown rather than swallowed, because a member who paid deserves to know why
   * Premium did not turn on.
   */
  const applyRemoteEntitlement = useCallback(
    (entitlement: Parameters<typeof subscriptionFromEntitlement>[0]) => {
      setSubscription(applyEntitlement(entitlement));
    },
    [],
  );

  const refreshEntitlement = useCallback(async () => {
    const result = await fetchEntitlement();
    if (!result.ok) return false;
    setVerification(result.data.verification);
    setReceipts(
      result.data.receipts.map((receipt) => ({
        id: receipt.id,
        channel: receipt.channel,
        productId: receipt.productId,
        status: receipt.status,
        expiresAt: receipt.expiresAt,
        autoRenewing: receipt.autoRenewing,
        cancelledAt: receipt.cancelledAt,
        verifiedBy: receipt.verifiedBy,
      })),
    );
    applyRemoteEntitlement(result.data.entitlement);
    return result.data.entitlement.tier === "premium";
  }, [applyRemoteEntitlement]);

  /**
   * Ask the store to charge, then let the server decide.
   *
   * A native build hands this the real purchase token from Google Play Billing
   * or StoreKit. Without a bundled store SDK the client cannot mint a real
   * token, so it derives a per-account demo token and the server records the
   * receipt as `sandbox` — the verification, entitlement, and restore paths are
   * the same code a store-connected build would exercise.
   */
  const completeStorePurchase = useCallback(
    async (planId: PlanId) => {
      setPurchase(beginPurchase(planId));

      /*
       * Store first, server second.
       *
       * A native build opens the real Google Play / App Store sheet. The browser
       * preview and Expo Go have no store, so they mint a demo receipt instead —
       * which the server records as `sandbox`, never as real revenue. Either way
       * the tier only moves once the server has verified the receipt.
       */
      let receipt: StoreReceiptPayload;
      let origin: PurchaseOrigin = "demo";

      if (storeSdkAvailable()) {
        const outcome = await purchasePlanThroughStore(planId);
        if (!outcome.ok) {
          setPurchase(failPurchase(planId, outcome.error));
          // A dismissed sheet is not an error worth shouting about.
          if (!outcome.cancelled) feedback(outcome.error);
          return;
        }
        receipt = outcome.receipt;
        origin = outcome.origin;
      } else {
        receipt = demoReceipt(planId, phone || "guest");
      }

      setPurchase(beginVerification(planId, receipt.purchaseToken));
      const result = await verifyPurchase(receipt);

      if (!result.ok) {
        setPurchase(failPurchase(planId, result.error));
        feedback(result.error);
        return;
      }

      // The store is told only after the server has accepted the receipt, so a
      // rejected purchase is never acknowledged (Play refunds unacknowledged
      // subscriptions, which would leave the member charged and unpaid for).
      void finishVerifiedPurchase(receipt);

      setPurchase(completePurchase(planId, result.data.transactionId));
      setVerification(result.data.entitlement.verifiedBy ?? "sandbox");
      applyRemoteEntitlement(result.data.entitlement);
      setPaywallOpen(false);
      void refreshEntitlement();
      const period = planId === "annual" ? "A full year" : planId === "quarterly" ? "Three months" : "One month";
      feedback(
        origin === "store"
          ? `Welcome to Trufrenz Premium. ${period} unlocked.`
          : `Welcome to Trufrenz Premium. ${period} unlocked in preview mode — no store is connected in the browser.`,
      );
      void reportEvents([
        { eventType: "subscription_started", metadata: { planId, channel: storeChannel, origin } },
      ]);
    },
    [applyRemoteEntitlement, feedback, phone, refreshEntitlement, storeChannel],
  );

  /** Replay the store's own purchase history for this account. */
  const restoreStorePurchases = useCallback(async () => {
    setRestoring(true);
    setRestore(beginRestore());
    try {
      // Ask the store for its own purchase history. On web this is empty, so the
      // server's existing receipts decide the answer.
      const history: StoreReceiptPayload[] = await storePurchaseHistory();
      const result = await restorePurchases(history);
      if (!result.ok) {
        setRestore(restoreFailed(result.error));
        return;
      }
      if (result.data.restored) {
        applyRemoteEntitlement(result.data.entitlement);
        setRestore(restoredState(planIdFrom(result.data.entitlement.planId)));
        void refreshEntitlement();
        return;
      }
      // Nothing in the store: fall back to whatever the server already has.
      const hadReceipt = await refreshEntitlement();
      setRestore(hadReceipt ? restoredState(subscription.planId) : NOTHING_TO_RESTORE);
    } finally {
      setRestoring(false);
    }
  }, [applyRemoteEntitlement, refreshEntitlement, subscription.planId]);

  /** Record a cancellation the member confirmed in their store account. */
  const reportCancellation = useCallback(async () => {
    const result = await reportStoreCancellation();
    if (!result.ok) {
      feedback(result.error);
      return;
    }
    applyRemoteEntitlement(result.data.entitlement);
    void refreshEntitlement();
    feedback("Auto-renew is off. Premium stays on until the end of your paid period.");
  }, [applyRemoteEntitlement, feedback, refreshEntitlement]);

  /**
   * Reconcile the cached plan with the server on launch.
   *
   * The revalidation job can expire a receipt while the app is closed — a lapsed
   * renewal, a refund, or a cancelled subscription — and the cached record would
   * otherwise keep showing Premium. The server is the source of truth here: if it
   * says free, the app follows, so a stale cache can never keep a paid feature
   * unlocked. A failed request leaves the cache alone, because being offline
   * should not silently drop a member's plan.
   */
  useEffect(() => {
    if (!sessionLoaded || isGuestSession(session)) return;
    let active = true;

    const reconcile = async () => {
      const remote = await fetchEntitlement();
      if (!active || !remote.ok) return;
      applyRemoteEntitlement(remote.data.entitlement);
      /*
       * The reconciliation reads the endpoint directly rather than going through
       * `refreshEntitlement`, so it has to record the receipts itself. Without
       * this the list stays empty until some later purchase or restore, and every
       * screen that reasons about *which* receipt grants access — the management
       * sheet deciding between store copy and granted copy — is left guessing.
       */
      setVerification(remote.data.verification);
      setReceipts(remote.data.receipts);

      /*
       * A subscription outlives the app install, so after a reinstall the store
       * still knows about a purchase the server may never have seen. Without
       * this check that member would sit on the free plan while paying for
       * Premium, with no idea why and no reason to suspect the app.
       *
       * The server is asked first and the store second, because the server's
       * answer is what decides whether a store round-trip is worth making.
       */
      const storeAvailable = storeSdkAvailable();
      /*
       * Keyed to this session, not to the install: signing into a different
       * account on the same device is exactly the case where the server may be
       * missing a receipt, so that must be checked again.
       */
      const key = autoRestoreKey(session?.enteredAt);
      const alreadyAttempted = storeAvailable ? await AsyncStorage.getItem(key) : "any";

      let storePurchaseCount = 0;
      let history: StoreReceiptPayload[] = [];
      if (storeAvailable && alreadyAttempted === null) {
        history = await storePurchaseHistory();
        storePurchaseCount = history.length;
      }

      const decision = decideAutoRestore({
        storePurchaseCount,
        serverReceiptCount: remote.data.receipts.length,
        serverTier: remote.data.entitlement.tier,
        storeAvailable,
      });
      if (!active || !shouldAttemptAutoRestore(decision, alreadyAttempted)) return;

      // Record the attempt before acting, so a crash mid-restore cannot produce
      // a second one on the next launch.
      AsyncStorage.setItem(key, String(Date.now())).catch(() => undefined);

      const result = await restorePurchases(history);
      if (!active) return;

      const outcome = autoRestoreOutcome(decision, {
        ok: result.ok,
        restored: result.ok ? result.data.restored : false,
        planId: result.ok ? result.data.entitlement.planId : null,
      });
      if (outcome.kind === "nothing") return;

      if (outcome.kind === "restored" && result.ok) {
        applyRemoteEntitlement(result.data.entitlement);
        setRestore(restoredState(planIdFrom(result.data.entitlement.planId)));
        /*
         * Said out loud, through the app's ordinary toast. The member did not
         * ask for this check, so it is reported as something the app noticed
         * rather than dressed up as a welcome-back screen or a prompt to buy
         * anything.
         */
        feedback(outcome.body);
        return;
      }

      // A failed check is only worth mentioning to a member the store says is
      // paying, which is exactly who reaches this branch.
      feedback(outcome.title);
    };

    void reconcile().catch(() => undefined);
    return () => {
      active = false;
    };
    // Only the session matters: a purchase updates the cache through the
    // purchase path, and this effect must not fight it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoaded, session?.enteredAt]);

  /** Load the product catalogue so the app never hard-codes product ids. */
  useEffect(() => {
    fetchBillingProducts().then((result) => {
      if (result.ok) setVerification(result.data.verification);
    }).catch(() => undefined);
  }, []);

  /**
   * Learn the store's own prices for this member's market.
   *
   * The catalogue prices the plans in rupees, but only the store knows what this
   * account will actually be charged — both platforms localise the price by
   * country. So the cached quotes are rendered first (or the rupee catalogue on
   * a first launch), and the store is asked in the background.
   *
   * The ordering matters: the cache read must finish before deciding whether to
   * call the store, because a fresh cache is the reason *not* to. Reading the
   * cache in a promise chain and then calling the store on the next line would
   * do both every time, since the chain has not resolved yet.
   *
   * Every failure path is silent by design. No store, no network, an unreadable
   * cache, or an unreadable response all leave the catalogue price in place,
   * which is exactly the behaviour before this existed.
   */
  useEffect(() => {
    let active = true;

    const load = async () => {
      let cached: StorePriceCatalogue | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORE_PRICE_CACHE_KEY);
        if (raw) {
          const parsed = parseStoredCatalogue(JSON.parse(raw));
          // A cache written on the other platform must not be shown here: the
          // two stores price independently.
          if (parsed && parsed.channel === currentStoreChannel()) {
            cached = parsed;
            if (active) setStorePrices(parsed);
          }
        }
      } catch {
        // A corrupt cache is the same as no cache.
      }

      if (!active || !storeSdkAvailable()) return;
      // `fetchProducts` opens a connection and round-trips to the store, which
      // is not free, and a console price only changes when operations change it.
      if (isCatalogueFresh(cached, Date.now())) return;

      const quotes = await fetchStorePrices();
      if (!active || !quotes) return;

      const catalogue: StorePriceCatalogue = {
        channel: currentStoreChannel(),
        fetchedAt: Date.now(),
        quotes,
      };
      setStorePrices(catalogue);
      AsyncStorage.setItem(STORE_PRICE_CACHE_KEY, JSON.stringify(catalogue)).catch(() => undefined);

      /*
       * A mismatch between the console price and the price the paywall's own
       * maths assumes is a configuration error, not a member-facing one: the
       * member is always shown the store's figure. Most often it means the
       * launch discount was never entered in the console, which would make the
       * catalogue's own saving claim untrue, so it is worth saying out loud in
       * the developer log rather than leaving for a support ticket.
       */
      for (const plan of PLANS) {
        const drift = priceMismatch(plan, catalogue, chargeForPlan(plan.id));
        if (drift) {
          console.warn(
            `[billing] ${plan.id}: the store charges ${drift.storeAmount}, the catalogue expects ` +
              `${drift.expectedInr}. The store price is shown; check the console matches the published offer.`,
          );
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [sessionLoaded, session?.enteredAt]);

  /**
   * The single entry point behind every profile control.
   *
   * Signed out it opens the welcome sheet so the member can log in or sign up;
   * signed in it goes straight to the You tab, which already holds the profile
   * card, Edit profile, verification, appearance, and settings. The header icon
   * and the bottom Profile tab therefore land in exactly the same place.
   */
  const openAccountFromHeader = () => {
    tap();
    // Both signed-in members and guests land on the You tab. For a member it is
    // the whole profile section; for a guest it is the join card, which offers
    // sign up and log in side by side.
    setSelectedChat(null);
    setTab("You");
  };
  const openSignup = () => { setAuthIntent("signup"); setAuthStep("phone"); setProfileErrors({}); setDemoCode(null); setChallengeToken(null); setPasscode(""); setShowSignup(true); tap(); };

  const discoverDeviceContacts = async () => {
    if (Platform.OS === "web") {
      feedback("Device contacts are available in the Trufrenz mobile app.");
      return;
    }
    if (!joined || !remoteAccount) {
      feedback("Log in first to find contacts already on Trufrenz.");
      setTab("You");
      setAuthIntent("login");
      setAuthStep("phone");
      setShowSignup(true);
      return;
    }
    setContactsLoading(true);
    try {
      if (!(await Contacts.isAvailableAsync())) {
        feedback("Contact access is not available on this device.");
        return;
      }
      const currentPermission = await Contacts.getPermissionsAsync();
      const permission = currentPermission.granted ? currentPermission : await Contacts.requestPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) {
          Alert.alert(
            "Contacts permission is off",
            "You can still use Trufrenz without it. To check contacts, allow access in your device settings.",
            [
              { text: "Not now", style: "cancel" },
              { text: "Open settings", onPress: () => { void Linking.openSettings().catch(() => undefined); } },
            ],
          );
        } else {
          feedback("Contact permission was not granted. You can still use Trufrenz without it.");
        }
        return;
      }

      const localEntries: { name: string; number: string; countryCode?: string | null }[] = [];
      let pageOffset = 0;
      let hasMore = true;
      while (hasMore && pageOffset < 1000) {
        const page = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
          pageSize: 500,
          pageOffset,
          sort: Contacts.SortTypes.FirstName,
        });
        for (const contact of page.data) {
          for (const phoneEntry of contact.phoneNumbers ?? []) {
            if (!phoneEntry.number) continue;
            localEntries.push({
              name: contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Contact",
              number: phoneEntry.number,
              countryCode: phoneEntry.countryCode,
            });
          }
        }
        pageOffset += page.data.length;
        hasMore = page.hasNextPage && page.data.length > 0;
      }
      const region = getLocales()[0]?.regionCode ?? null;
      const normalized = normalizeDeviceContacts(localEntries, region, 500);
      setDeviceContacts(normalized);
      setSelectedContactPhones([]);
      setInviteCursor(0);
      setContactScanWasLimited(hasMore || normalized.length >= 500);
      if (normalized.length === 0) {
        setContactMatches({});
        feedback("No usable phone numbers found. You can still invite friends another way.");
        return;
      }

      // Hash locally. Neither phone numbers nor contact names go in the request.
      const hashes = await Promise.all(
        normalized.map((contact) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, contact.phoneE164)),
      );
      const result = await fetchContactMatches(hashes);
      if (!result.ok) {
        setDeviceContacts([]);
        feedback(result.error || "Contact matching is temporarily unavailable.");
        return;
      }
      const matchesByHash = Object.fromEntries(result.data.matches.map((match) => [match.phoneHash, match]));
      const matchedContacts: Record<string, ContactMatch> = {};
      normalized.forEach((contact, index) => {
        const match = matchesByHash[hashes[index]!];
        if (match) matchedContacts[contact.phoneE164] = match;
      });
      setContactMatches(matchedContacts);
      const count = Object.keys(matchedContacts).length;
      feedback(count ? `${count} opted-in Trufrenz ${count === 1 ? "member" : "members"} found.` : "No opted-in Trufrenz members found in these contacts.");
      tap();
    } catch {
      // Do not log device contact contents, normalized numbers, or hashes.
      feedback("We couldn't check contacts just now. Please try again.");
    } finally {
      setContactsLoading(false);
    }
  };

  const inviteNextSelectedContact = async () => {
    const selected = deviceContacts.filter((contact) => selectedContactPhones.includes(contact.phoneE164));
    if (!selected.length) {
      feedback("Select at least one contact first.");
      return;
    }
    if (!(await SMS.isAvailableAsync())) {
      feedback("Text messaging isn't available on this device.");
      return;
    }
    if (inviteCursor >= selected.length) {
      feedback("You have opened an invite draft for each selected contact.");
      return;
    }
    const nextIndex = inviteCursor;
    const contact = selected[nextIndex]!;
    const baseUrl = process.env.EXPO_PUBLIC_INVITE_URL?.trim() || "https://trufrenz.net";
    const inviteText = contactInviteMessage(baseUrl, myProfile.name || fullName || undefined);
    setContactInviteLoading(true);
    try {
      const result = await SMS.sendSMSAsync(contact.phoneE164, inviteText);
      if (result.result === "cancelled") {
        feedback("Invite draft cancelled. No message was sent.");
        return;
      }
      setInviteCursor((current) => current + 1);
      feedback(Platform.OS === "android"
        ? "SMS composer closed. Android can't confirm sending; open the next invite only if you want."
        : "SMS composer closed. You choose whether to send; no message is sent by Trufrenz.");
    } catch {
      feedback("Couldn't open the text composer. You can still copy the invite link.");
    } finally {
      setContactInviteLoading(false);
    }
  };

  const toggleContactSelection = (phoneE164: string) => {
    setSelectedContactPhones((current) => current.includes(phoneE164)
      ? current.filter((value) => value !== phoneE164)
      : [...current, phoneE164]);
    setInviteCursor(0);
  };
  const updateContactDiscoveryPreference = async (enabled: boolean) => {
    if (!remoteAccount || !joined) {
      feedback("Log in first to change your contact-discovery setting.");
      return;
    }
    const previousValue = contactDiscoveryEnabled;
    setContactDiscoveryEnabled(enabled);
    setContactPreferenceBusy(true);
    const result = await saveContactDiscoveryEnabled(enabled);
    setContactPreferenceBusy(false);
    if (!result.ok) {
      setContactDiscoveryEnabled(previousValue);
      feedback(result.error || "Your privacy setting could not be saved.");
      return;
    }
    setRemoteAccount((current) => current ? { ...current, contactDiscoveryEnabled: enabled } : current);
    if (!enabled) feedback("People can no longer find you through their contact matches.");
    else feedback("You can now appear to members who choose to check their contacts.");
    tap();
  };
  const closeSignup = () => setShowSignup(false);
  const persistSession = (next: StoredSession) => {
    setSession(next);
    AsyncStorage.setItem(SESSION_STORAGE_KEY, serializeSession(next)).catch(() => undefined);
  };
  const clearPendingAttachment = useCallback(() => {
    setPendingAttachment(null);
    setPendingPhotoBytes(undefined);
  }, []);
  const signOut = () => {
    if (joined) void signOutRemote();
    setSession(null);
    setJoined(false);
    setRemoteAccount(null);
    setContactDiscoveryEnabled(false);
    setDeviceContacts([]);
    setContactMatches({});
    setSelectedContactPhones([]);
    setContactSearch("");
    setInviteCursor(0);
    clearPendingAttachment();
    setSelectedChat(null);
    setTab("Chats");
    AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => undefined);
    feedback("Signed out. You can sign back in any time.");
  };
  const backAuth = () => {
    if (authStep === "about") setAuthStep("profile");
    else if (authStep === "photo") setAuthStep("profile");
    else if (authStep === "profile") setAuthStep("code");
    else if (authStep === "code") setAuthStep("phone");
    else setShowSignup(false);
  };

  const pickProfilePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { feedback("Allow photo access to choose a profile picture, or skip for now."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      setProfilePhoto(result.assets[0].uri);
      feedback("Photo added. You can change it later.");
    } catch {
      feedback("Photo picker is unavailable here. You can skip and add a picture later.");
    }
  };

  /** The capabilities the server reports for this account, if known. */
  const accountState = useMemo(
    () => accountStateFrom(remoteAccount),
    [remoteAccount],
  );

  /** The blocking notice for a restricted account, shown above the app. */
  const restriction = useMemo(
    () => (accountState ? describeRestriction(accountState) : null),
    [accountState],
  );

  /** Unread notices the member has not acknowledged yet. */
  const unreadNotices = useMemo(
    () => memberNotices.filter((notice) => !notice.readAt),
    [memberNotices],
  );

  /**
   * Run a capability-guarded action.
   *
   * Returns true when the action may proceed. A restriction is explained in the
   * same words the server used, so the member is never left guessing.
   */
  const allowAction = (capability: Parameters<typeof canAccount>[1]): boolean => {
    if (!accountState) return true; // Guest or offline: local rules still apply.
    if (canAccount(accountState, capability)) return true;
    feedback(blockedActionMessage(accountState, capability) ?? "That action is unavailable right now.");
    return false;
  };

  /**
   * Finish the sign-up by creating the account on the server.
   *
   * This is the fix for the bug where a code was accepted but no account
   * appeared. The code is proven earlier; this call is what actually creates
   * the member. It is deliberately async now — the old version only wrote to
   * local storage and returned, so the server never learned the account existed
   * and every server-side action stayed blocked.
   *
   * Safe to retry: the endpoint is idempotent, so a double tap or a dropped
   * connection returns the same account rather than making a second one.
   */
  const finishSignup = () => {
    if (email.trim() && !isValidEmail(email)) { feedback("Check the recovery email address, or leave it blank"); return; }
    const parsedDob = dateOfBirth ? parseDateOfBirth(dateOfBirth) : null;
    const name = fullName.trim();
    void (async () => {
      setAuthBusy(true);
      const result = await completeSignin({
        name,
        dateOfBirth: parsedDob ? formatDateOfBirth(parsedDob) : undefined,
        age: parsedDob ? ageFromDateOfBirth(parsedDob) : undefined,
        homeArea: locality.trim() || undefined,
        email: email.trim() || undefined,
      });
      setAuthBusy(false);

      if (!result.ok) {
        // The one recoverable failure: the code window lapsed mid-onboarding.
        if (result.code === "challenge_missing" || result.code === "challenge_expired") {
          setAuthStep("phone");
          setDemoCode(null);
          feedback("That sign-in timed out. Enter your details again to get a fresh code.");
          return;
        }
        feedback(result.error);
        return;
      }

      const remote = result.data.account;
      setRemoteAccount(remote);
      setFullName(remote.name);
      setLocality(remote.homeArea ?? locality.trim() ?? "Nearby");
      if (remote.dateOfBirth) setDateOfBirth(remote.dateOfBirth);
      persistSession(createMemberSession({
        name: remote.name,
        locality: remote.homeArea ?? "Nearby",
        verification: remote.verificationTier === "id_selfie" ? "id-selfie" : "phone-only",
        dateOfBirth: remote.dateOfBirth ?? undefined,
        age: remote.age ?? undefined,
      }));
      setJoined(true);
      setShowSignup(false);
      setTab("Chats");
      feedback(`Welcome, ${remote.name.split(" ")[0] || "friend"}. Your circle is ready.`);
    })();
  };

  /**
   * Request a sign-in code for the channel the member chose.
   *
   * Shared by the first request and the "send a new code" button, so the two
   * cannot drift: a fix to one is a fix to both, and the rate-limit reply is
   * turned into a countdown in exactly one place.
   */
  /**
   * The countdown clock.
   *
   * Runs only while a wait is actually in progress, so an idle sign-in screen is
   * not waking up once a second for nothing. The tick is a re-render trigger,
   * not the source of truth: the display is derived from the deadline, so a
   * paused or throttled timer can never make the number wrong.
   */
  useEffect(() => {
    if (resendDeadline === null) return;
    if (!countdownIsActive(resendStateAt(resendDeadline, Date.now()))) return;
    const timer = setInterval(() => {
      setResendTick((current) => current + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendDeadline, resendTick]);

  /** Live countdown state, recomputed on every tick. */
  const resendState = resendStateAt(resendDeadline, Date.now());

  const requestNewCode = () => {
    if (!resendState.canResend || authBusy) return;
    tap();
    void sendSigninCode({ isResend: true });
  };

  const sendSigninCode = async (options?: { isResend?: boolean }) => {
    setAuthBusy(true);
    // Each channel has its own route, because they have their own provider.
    const result =
      authChannel === "email"
        ? await requestEmailOtp(email, authIntent)
        : await requestOtp(phone, authIntent);
    setAuthBusy(false);

    if (!result.ok) {
      /*
       * A rate limit is not a failure, it is a wait — and the server already
       * tells us exactly how long. Showing that as a refusal was the single
       * most common dead end in the sign-in flow, so it becomes a countdown.
       */
      const described = describeResendFailure({
        code: result.code,
        error: result.error,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      if (described.cooldownSeconds > 0) {
        setResendDeadline(Date.now() + described.cooldownSeconds * 1000);
      }
      feedback(
        result.code === "account_not_found"
          ? `No account uses that ${authChannel === "email" ? "email" : "number"} yet. Switch to Sign up to create one.`
          : described.message,
      );
      return;
    }

    setOtpDestination(result.data.destination);
    setSentTransport(result.data.transport ?? null);
    setDemoCode(result.data.demoCode ?? null);
    setChallengeToken(result.data.challengeToken ?? null);
    if (!options?.isResend) setAuthStep("code");

    /*
     * Arm the countdown from the server's own number. A client that invented its
     * own window would drift from the rule it is trying to respect.
     */
    setResendDeadline(Date.now() + cooldownSecondsFrom(result.data.retryAfterSeconds) * 1000);

    // Say exactly what happened. The old flow always claimed a code had been
    // sent, even when no provider existed — which is how a member ended up
    // typing a code that nothing would ever accept.
    const channelWord = authChannel === "email" ? "email" : "SMS";
    if (result.data.demoCode) {
      feedback(`No ${channelWord} provider is connected yet, so here is your code: ${result.data.demoCode}`);
    } else if (result.data.deliveryUnavailable) {
      feedback(`Code delivery is not connected yet. Add a provider to receive codes by ${channelWord}.`);
    } else if (options?.isResend) {
      feedback(`Sent a new code. Only the newest one works.`);
    } else {
      /*
       * Name the transport, because the member has to know where to look. A
       * code sitting in WhatsApp while somebody refreshes their SMS inbox is
       * indistinguishable from a code that never arrived.
       */
      const where =
        authChannel === "email"
          ? "emailed"
          : result.data.transport === "whatsapp"
            ? "sent on WhatsApp"
            : "texted";
      feedback(`We ${where} a code to ${result.data.destination}. It expires in 10 minutes.`);
    }
  };

  const continueAuth = () => {
    if (authStep === "phone") {
      // Validate whichever channel the member chose, and say so in the words of
      // that channel rather than always talking about phone numbers.
      if (authChannel === "phone" && !isValidCredential("Phone", phone)) {
        feedback("Enter a valid phone number to continue");
        return;
      }
      if (authChannel === "email" && !isValidEmail(email)) {
        feedback("Enter a valid email address, like name@example.com");
        return;
      }
      void sendSigninCode();
      return;
    }
    if (authStep === "code") {
      if (!isValidDemoCode(passcode)) { feedback("Enter the 6-digit code to continue"); return; }
      void (async () => {
        setAuthBusy(true);
        // Step one: prove the code. This no longer spends the sign-in, so a
        // member who still has a name and photo to give keeps their progress.
        const verified = await verifyCode(passcode, challengeToken);
        if (!verified.ok) {
          setAuthBusy(false);
          feedback(verified.error);
          return;
        }

        /**
         * Signing in finishes here; signing up continues into onboarding.
         *
         * The account is created by completeSignin at the end of onboarding, so
         * a member is never created with a half-filled profile.
         */
        if (authIntent === "signup") {
          setAuthBusy(false);
          setAuthStep("profile");
          return;
        }

        const result = await completeSignin({ challengeToken });
        setAuthBusy(false);

        if (!result.ok) {
          if (result.code === "profile_incomplete") {
            // An older account with no name yet: finish it through onboarding.
            setAuthStep("profile");
            feedback("Add your name to finish creating your account.");
            return;
          }
          feedback(result.error);
          return;
        }

        const account = result.data.account;
        setRemoteAccount(account);
        // Reflect the account's own details so the greeting and profile are the
        // member's, not the placeholder the device had before.
        setFullName(account.name);
        setLocality(account.homeArea ?? "Nearby");
        if (account.dateOfBirth) setDateOfBirth(account.dateOfBirth);
        setMyProfile((current) => ({
          ...current,
          name: account.name,
          locality: account.homeArea ?? current.locality,
          age: account.age ?? current.age,
          verification: account.verificationTier === "id_selfie" ? "id-selfie" : "phone-only",
        }));
        persistSession(
          createMemberSession({
            name: account.name,
            locality: account.homeArea ?? "Nearby",
            verification: account.verificationTier === "id_selfie" ? "id-selfie" : "phone-only",
            dateOfBirth: account.dateOfBirth ?? undefined,
            age: account.age ?? undefined,
          }),
        );
        setJoined(true);
        setShowSignup(false);
        setTab("Chats");
        feedback("Welcome back. Your conversations are waiting.");
      })();
      return;
    }
    if (authStep === "profile") {
      const errors = validateProfileDraft({ name: fullName, dateOfBirth, locality, interests: profileInterests, photoUri: profilePhoto });
      setProfileErrors(errors);
      if (hasProfileErrors(errors)) { feedback(firstProfileError(errors) ?? "Check your profile details"); return; }
      setAuthStep("photo");
      return;
    }
    if (authStep === "photo") { setAuthStep("about"); return; }
    finishSignup();
  };

  const enterAsGuest = () => {
    persistSession(createGuestSession());
    setJoined(false);
    setTab("Friends");
    feedback("Guest preview: browse freely. Join any time to chat and meet up.");
  };

  const requireAccount = (action: Parameters<typeof guestUpsellMessage>[0]) => {
    if (!isGuestSession(session)) return false;
    feedback(guestUpsellMessage(action));
    return true;
  };

  const visibleChats = useMemo(() => {
    const staticAccepted = seedConversations.filter((chat) => chat.kind === "group" || acceptedFriends.includes(chat.id));
    const newlyAccepted = suggestions.filter((person) => acceptedFriends.includes(person.id) && !seedConversations.some((chat) => chat.id === person.id)).map((person): Conversation => {
      const lastMessage = chatMessages[person.id]?.at(-1);
      return { id: person.id, name: person.name, image: person.image, kind: "friend" as const, lastMessage: lastMessage?.text ?? "You are now friends. Say hello!", time: lastMessage?.time ?? "now", unread: lastMessage?.from === "them" ? 1 : 0, verified: person.verification === "ID + selfie verified" };
    });
    const accepted = [...staticAccepted, ...newlyAccepted];
    const q = search.trim().toLowerCase();
    return accepted.filter((chat) => {
      const state = rowStateFor(chatRowStates, chat.id);
      if (state.archived !== showArchived) return false;
      const queryMatch = !q || `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(q);
      /*
       * The badge reads the read marker, not just the seeded count, so opening a
       * conversation clears its number instead of lighting it forever.
       */
      const unread = unreadForRow({ seedUnread: chat.unread, messages: chatMessages[chat.id] ?? [], state: threadState, chatId: chat.id });
      const filterMatch = chatFilter === "All" || (chatFilter === "Unread" ? unread > 0 : chat.kind === "group");
      return queryMatch && filterMatch;
    });
  }, [search, chatFilter, acceptedFriends, chatMessages, suggestions, chatRowStates, threadState, showArchived]);

  /** Archived threads are counted separately so the inbox stays calm. */
  const archivedCount = useMemo(
    () => Object.values(chatRowStates).filter((state) => state.archived).length,
    [chatRowStates],
  );

  const chatEmptyCopy = useMemo(
    () => emptyChatsCopy({ hasAcceptedFriends: acceptedFriends.length > 0, filter: chatFilter, search, archivedCount }),
    [acceptedFriends.length, chatFilter, search, archivedCount],
  );

  /** Every plan card shared in a chat, surfaced for follow-up from Meetups. */
  const sharedPlans = useMemo(() => {
    const collected: { chatId: string; chatName: string; card: PlanCard }[] = [];
    for (const [chatId, messages] of Object.entries(chatMessages)) {
      for (const message of messages) {
        if (message.plan) {
          const chat = seedConversations.find((item) => item.id === chatId);
          const person = suggestions.find((item) => item.id === chatId);
          collected.push({ chatId, chatName: chat?.name ?? person?.name ?? "Friend", card: message.plan });
        }
      }
    }
    return collected.sort((a, b) => a.card.proposal.date.localeCompare(b.card.proposal.date));
  }, [chatMessages, suggestions]);

  const inviteTargets = useMemo(() => {
    const seeded = seedConversations.filter((chat) => chat.kind === "friend" && acceptedFriends.includes(chat.id)).map(({ id, name }) => ({ id, name }));
    const newlyAccepted = suggestions.filter((person) => acceptedFriends.includes(person.id) && !seedConversations.some((chat) => chat.id === person.id)).map(({ id, name }) => ({ id, name }));
    return [...seeded, ...newlyAccepted];
  }, [acceptedFriends, suggestions]);

  const filteredSuggestions = useMemo(() => suggestions.filter((person) => {
    const q = search.trim().toLowerCase();
    const searchMatch = !q || `${person.name} ${person.locality} ${person.interests.join(" ")}`.toLowerCase().includes(q);
    const interestMatch = interestFilter.length === 0 || interestFilter.some((tag) => tag === "Verified" ? person.verification === "ID + selfie verified" : tag === "Nearby" ? person.locality.includes("Pacific Heights") : person.interests.some((value) => value.toLowerCase().includes(tag.toLowerCase())));
    /*
     * Only genuine introductions appear here. Someone already connected, already
     * asked, waiting to be answered, or previously declined is not a new person
     * to introduce — and the declined case is what kept re-offering a request
     * that had arrived from the other side as "Ask for Friendship".
     */
    return discoverable && searchMatch && interestMatch && isNewIntroduction(friendships, person.id);
  }), [search, interestFilter, acceptedFriends, incomingRequests, discoverable, suggestions, friendships]);

  const threadAvailabilityLabel = (() => {
    if (!selectedChat) return null;
    const person = suggestions.find((item) => item.id === selectedChat);
    if (!person) return "Private friend group";
    return availabilityView(person.available === false ? "unavailable" : "available").label;
  })();

  const threadFriendStatus = (() => {
    if (!selectedChat) return null;
    const person = suggestions.find((item) => item.id === selectedChat);
    const status = visibleStatus(person?.status ?? null);
    return status ? statusLabel(status) : null;
  })();

  const currentThread = selectedChat ? (seedConversations.find((chat) => chat.id === selectedChat) ?? (() => {
    const person = suggestions.find((item) => item.id === selectedChat);
    return person ? { id: person.id, name: person.name, image: person.image, kind: "friend" as const, lastMessage: "You are now friends", time: "now", unread: 0, verified: person.verification === "ID + selfie verified" } : null;
  })()) : null;

  const openChatProfile = () => {
    if (!selectedChat || !currentThread) return;
    const person = resolveChatProfile(selectedChat, currentThread.kind, suggestions);
    if (!person) { feedback("Member details are not available for this group conversation."); return; }
    setProfilePerson(person);
  };

  /*
   * One authority for "what is this person to me?".
   *
   * This used to be re-derived from whichever array the caller had to hand, so
   * the profile and the discovery list could disagree about the same person —
   * one showing Chat, the other offering to ask for friendship.
   */
  const profileRelationship = (person: Person | null): ViewerRelationship =>
    person ? relationshipFor(friendships, person.id) : "stranger";

  const openProfileEditor = () => {
    if (isGuestSession(session)) { setAuthIntent("signup"); setAuthStep("phone"); setShowSignup(true); return; }
    const age = dateOfBirth && parseDateOfBirth(dateOfBirth) ? ageFromDateOfBirth(parseDateOfBirth(dateOfBirth)!) : 18;
    setMyProfile((current) => {
      const seeded = current.name || current.locality ? current : createInitialProfile({ name: fullName, age, locality });
      return { ...seeded, name: seeded.name || fullName, locality: seeded.locality || locality, age: seeded.age || age, interests: seeded.interests.length ? seeded.interests : profileInterests };
    });
    setProfileEditorOpen(true);
  };

  const addMyProfilePhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { feedback("Allow photo access to add more pictures."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const id = `photo-${Date.now()}`;
      setMyProfile((current) => {
        const next = addProfilePhoto(current, { id, uri: asset.uri, alt: `Photo ${current.photos.length + 1}` });
        return next === current ? current : next;
      });
      setProfilePhoto((current) => current ?? asset.uri);
      feedback("Photo added to your profile.");
    } catch {
      feedback("Photo picker is unavailable here. Try again on your phone.");
    }
  };

  const startProfileVerification = () => {
    setProfileEditorOpen(false);
    setSelfieModalVisible(true);
  };

  const handleProfileAction = (action: "chat" | "hangout" | "meetup" | "call" | "ask-friendship" | "accept-request" | "report" | "block") => {
    const person = profilePerson;
    setProfilePerson(null);
    if (!person) return;
    if (action === "ask-friendship") { sendFriendRequest(person); return; }
    if (action === "accept-request") {
      applyConnectionChange(person.id, "accepted");
      feedback(`You and ${person.name.split(" ")[0]} are now friends. Say hello.`);
      return;
    }
    if (action === "chat") { setSelectedChat(person.id); setTab("Chats"); return; }
    if (action === "hangout") { feedback(`Suggested hangout with ${person.name.split(" ")[0]}: a café or park afternoon.`); return; }
    if (action === "meetup") { setInviteTargetChat(inviteTargets.some((contact) => contact.id === person.id) ? person.id : inviteTargets[0]?.id ?? null); setInviteModalVisible(true); return; }
    if (action === "call") {
      const callPermission = callingGate(tier);
      if (!callPermission.allowed) { openPaywall(callPermission.message); return; }
      const name = profilePerson?.name ?? currentThread?.name ?? "your friend";
      setProfilePerson(null);
      setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: name, peerVerified: true, video: false, direction: "outgoing" }));
      return;
    }
    if (action === "report") { feedback("Report sent to the safety team. They follow up within a day."); return; }
    dropConnection(person.id);
    setMyProfile((current) => ({ ...current, privacy: { ...current.privacy, blockedIds: [...current.privacy.blockedIds, person.id] } }));
    feedback(`${person.name.split(" ")[0]} is blocked. They can no longer reach you.`);
  };

  const refreshNearbyFeed = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    tap();
    await new Promise<void>((resolve) => setTimeout(resolve, 850));
    setMeetups((current) => mergeMeetupRefresh(current, meetupSeeds));
    setSuggestions([...suggestionSeeds]);
    setIsRefreshing(false);
    feedback("Nearby plans refreshed. Live community updates will appear once connected.");
  };

  const addCustomQuickReply = (text: string) => {
    const next = addQuickReply(quickReplies, text);
    if (next.length === quickReplies.length) {
      feedback(quickReplies.length >= 12 ? "Your quick-reply list is full." : "That phrase is empty, too long, or already saved.");
      return;
    }
    setQuickReplies(next);
    feedback("Quick reply saved on this device.");
  };

  const selectQuickReply = (text: string) => {
    setMessageDraft((current) => {
      const trimmed = current.trimEnd();
      return trimmed ? `${trimmed} ${text}` : text;
    });
    setQuickRepliesOpen(false);
    tap();
  };

  const sendMessage = () => {
    const text = messageDraft.trim();
    if (!selectedChat || !text) return;
    // A suspended account keeps read access but cannot post new messages.
    if (!allowAction("send-messages")) return;
    const message: Message = { id: `${Date.now()}`, from: "me", text, time: "now", receipt: "sent" };
    pushMessage(message);
    void runGuardedAction("message", {
      thread: selectedChat,
      groupId: selectedChat.startsWith("group") ? selectedChat : null,
    });
    setMessageDraft("");
    setTypingChat(selectedChat);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingChat(null), 2200);
    tap();
  };

  /**
   * Shows a message and queues it for the account.
   *
   * Every outgoing message goes through here, so this is the one place that has
   * to remember the server. The message appears immediately — the member should
   * never wait on a network round trip to see their own words — and the queue is
   * written down before the request leaves, so a send interrupted by a crash is
   * still delivered on the next launch rather than silently lost.
   *
   * Only what the member wrote travels. Attachments carry a local uri that means
   * nothing on another device, so the description travels instead of the file.
   */
  const pushMessage = (message: Message) => {
    if (!selectedChat) return;
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
    const row = rowFromMessage(selectedChat, message);
    if (row) setMessageSync((current) => queueMessage(current, row));
  };

  const activeRowState = selectedChat ? rowStateFor(chatRowStates, selectedChat) : DEFAULT_CHAT_ROW_STATE;

  /** Send a photo, voice note, or manual place pin into the current chat. */
  const sendAttachment = (draft: AttachmentDraft) => {
    if (!selectedChat) return;
    if (!canSendTo(activeRowState)) { feedback("This conversation is archived. Restore it before sending anything new."); return; }
    const preview = messagePreview(draft.kind, { durationSeconds: draft.durationSeconds, place: draft.place });
    pushMessage({
      id: `${Date.now()}`,
      from: "me",
      text: preview,
      time: "now",
      receipt: "sent",
      kind: draft.kind,
      mediaUri: draft.uri,
      durationSeconds: draft.durationSeconds,
      place: draft.place,
    });
    tap();
  };

  const sendPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { feedback("Allow photo access to send a picture."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      // Nothing is sent yet: the pick waits in the preview strip above the
      // input bar so the member can check it before it goes out.
      setPendingAttachment(createPendingAttachment({ kind: "photo", uri: asset.uri }, () => `att-${Date.now()}`));
      setPendingPhotoBytes(typeof asset.fileSize === "number" ? asset.fileSize : undefined);
    } catch {
      feedback("The photo picker is unavailable here. Try again on your phone.");
    }
  };
  /** Hold a recorded voice note in the preview strip until it is sent. */
  const reviewVoiceNote = (draft: AttachmentDraft) => {
    setPendingAttachment(createPendingAttachment(draft, () => `att-${Date.now()}`));
    setPendingPhotoBytes(undefined);
  };
  /**
   * The composer's send action. A pending attachment goes out with the typed
   * caption as its accompanying text; otherwise the plain message is sent.
   */
  const sendComposerContent = () => {
    const draft = pendingToDraft(pendingAttachment);
    if (!draft) {
      sendMessage();
      return;
    }
    if (!selectedChat) return;
    if (!canSendTo(activeRowState)) { feedback("This conversation is archived. Restore it before sending anything new."); return; }
    // A suspended account keeps read access but cannot post new messages.
    if (!allowAction("send-messages")) return;
    const caption = messageDraft.trim();
    const preview = attachmentPreviewLabel(pendingAttachment!, { sizeBytes: pendingPhotoBytes });
    pushMessage({
      id: `${Date.now()}`,
      from: "me",
      text: caption ? `${preview} — ${caption}` : preview,
      time: "now",
      receipt: "sent",
      kind: draft.kind,
      mediaUri: draft.uri,
      durationSeconds: draft.durationSeconds,
      place: draft.place,
    });
    void runGuardedAction("message", {
      thread: selectedChat,
      groupId: selectedChat.startsWith("group") ? selectedChat : null,
      attachment: draft.kind,
    });
    setMessageDraft("");
    clearPendingAttachment();
    tap();
  };


  /** Share a structured plan card instead of a plain message. */
  const sharePlan = (kind: PlanKind, proposal: PlanProposal, note: string) => {
    if (!selectedChat) return;
    if (!canSendTo(activeRowState)) { feedback("This conversation is archived. Restore it before suggesting a plan."); return; }
    // Free members get the first ten proposals; after that it is a Premium feature.
    const planPermission = hangoutProposalGate(tier, proposalsSent);
    if (!planPermission.allowed) { setPlanComposerKind(null); openPaywall(planPermission.message, "monthly"); return; }
    const id = `plan-${Date.now()}`;
    const card = createPlanCard({ id, kind, title: note.trim() || undefined, proposal, proposedBy: "me" });
    pushMessage({ id, from: "me", text: planPreview(card), time: "now", receipt: "sent", kind: "plan", plan: card });
    setPlanComposerKind(null);
    setUsage((current) => ({ ...current, proposalsSent: current.proposalsSent + 1 }));
    feedback(`${PLAN_KIND_LABEL[kind]} card sent. ${currentThread?.name.split(" ")[0] ?? "They"} can accept, decline, or suggest another time.`);
    tap();
  };

  /** Respond to a plan that the friend proposed. */
  const respondToPlanCard = (messageId: string, response: PlanResponse) => {
    if (!selectedChat) return;
    setChatMessages((current) => {
      const list = current[selectedChat] ?? [];
      return {
        ...current,
        [selectedChat]: list.map((message) => {
          if (message.id !== messageId || !message.plan) return message;
          const proposal = response === "propose-new-time"
            ? { ...message.plan.proposal, time: message.plan.proposal.time === "6:30 PM" ? "4:30 PM" : "6:30 PM" }
            : undefined;
          const next = respondToPlan(message.plan, response, { proposal });
          return { ...message, plan: next, text: planPreview(next) };
        }),
      };
    });
    const copy = response === "accept" ? "Accepted. A reminder will arrive on the day." : response === "decline" ? "Declined quietly — no reply is expected." : "New time suggested. They can confirm or offer another.";
    feedback(copy);
    tap();
  };

  /** The day-of arrival check-in from the safety flow. */
  const checkInToPlanCard = (messageId: string) => {
    if (!selectedChat) return;
    setChatMessages((current) => {
      const list = current[selectedChat] ?? [];
      return {
        ...current,
        [selectedChat]: list.map((message) => {
          if (message.id !== messageId || !message.plan) return message;
          return { ...message, plan: checkInToPlan(message.plan) };
        }),
      };
    });
    feedback(checkInSafetyNote(currentThread?.name ?? "Your friend"));
  };

  /** Tap-to-react on any bubble; tapping the same emoji removes it. */
  const reactToMessage = (messageId: string, emoji: string) => {
    if (!selectedChat) return;
    setChatMessages((current) => {
      const list = current[selectedChat] ?? [];
      return { ...current, [selectedChat]: list.map((message) => (message.id === messageId ? { ...message, reactions: applyReaction(message.reactions ?? [], emoji) } : message)) };
    });
    tap();
  };

  /** Start a group poll for deciding a plan together. */
  const startPlanPoll = () => {
    if (!selectedChat) return;
    const today = new Date();
    const label = (days: number, time: string) => {
      const date = new Date(today);
      date.setDate(date.getDate() + days);
      return `${date.toISOString().slice(0, 10)} ${time}`;
    };
    const poll = createPoll({
      id: `poll-${Date.now()}`,
      question: "When works for everyone?",
      options: [label(2, "11:00 AM"), label(4, "6:30 PM"), label(7, "4:30 PM")],
      voterIds: groupVoterIds(group),
    });
    pushMessage({ id: poll.id, from: "me", text: "🗳️ Group poll · When works for everyone?", time: "now", receipt: "sent", kind: "plan", poll });
    setPollComposerOpen(false);
    feedback("Poll shared. Everyone in this group can vote, and change their vote.");
    tap();
  };

  const voteInPoll = (messageId: string, optionId: string) => {
    if (!selectedChat) return;
    setChatMessages((current) => {
      const list = current[selectedChat] ?? [];
      return {
        ...current,
        [selectedChat]: list.map((message) => {
          if (message.id !== messageId || !message.poll) return message;
          const next = castVote(message.poll, optionId, "me");
          const preview = `🗳️ Group poll · ${next.options.reduce((sum, option) => sum + option.votes.length, 0)} votes`;
          return { ...message, poll: next, text: preview };
        }),
      };
    });
  };

  const applyWinningPollOption = (messageId: string) => {
    if (!selectedChat) return;
    const list = chatMessages[selectedChat] ?? [];
    const message = list.find((item) => item.id === messageId);
    const proposal = message?.poll ? winningProposal(message.poll) : null;
    if (!proposal) { feedback("No single leading option yet. Break the tie first."); return; }
    const id = `plan-${Date.now()}`;
    const card = createPlanCard({ id, kind: "hangout", title: "Decided together in the group", proposal, proposedBy: "me" });
    pushMessage({ id, from: "me", text: planPreview(card), time: "now", receipt: "sent", kind: "plan", plan: card });
    feedback("Plan card created from the winning option.");
  };

  const toggleChatMute = () => {
    if (!selectedChat) return;
    setChatRowStates((current) => toggleMuted(current, selectedChat));
    const muted = !rowStateFor(chatRowStates, selectedChat).muted;
    feedback(muted ? "Muted. Messages still arrive, just without the badge." : "Unmuted. Notifications are back on.");
  };

  /** Clear any waiting attachment when the member leaves the conversation. */
  const closeThread = useCallback(() => {
    clearPendingAttachment();
    // Releasing the frozen marker here means the next visit shows nothing new,
    // which is correct: the member has just read the thread.
    setFrozenUnreadStart(null);
    setSelectedChat(null);
  }, [clearPendingAttachment]);

  /*
   * The conversation the member is looking at counts as read.
   *
   * Marked on the last message while the thread is open, which is what lets the
   * row's unread badge clear: the badge reads the same marker, so a number can
   * never survive a visit to the thread that produced it.
   */
  useEffect(() => {
    if (!selectedChat) return;
    /*
     * Opening the thread also releases the member's own unread reminder. Reading
     * it is the natural way to clear one, and leaving the flag behind would keep
     * the row lit permanently, which is the very problem the read marker solved.
     */
    setThreadState((current) => clearThreadUnread(current, selectedChat));
    const messages = chatMessages[selectedChat];
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    setThreadState((current) => markThreadRead(current, selectedChat, last.id));
  }, [selectedChat, chatMessages]);

  /*
   * Leaving a conversation by dragging it down.
   *
   * The Back button sits in the header corner, which a thumb cannot reach on a
   * phone held in one hand. PanResponder is used here for the same reason the
   * chat rows use it: the decision stays in a tested pure function, and the
   * gesture needs no worklet bridging.
   */
  /*
   * The marker is frozen while a thread is open.
   *
   * Marking a conversation read happens the moment it opens, so the divider would
   * disappear at the instant the member arrived to read it — and a short thread
   * would never show one at all. Holding the opening position keeps the divider
   * where it belongs for the visit, while the stored marker still advances so the
   * row's badge clears.
   */
  const [frozenUnreadStart, setFrozenUnreadStart] = useState<number | null>(null);
  const threadScrollRef = useRef<ScrollView>(null);
  const threadScrollOffsetRef = useRef(0);
  const [threadDrag, setThreadDrag] = useState<ThreadDragDecision>({ close: false, offset: 0, progress: 0 });
  const threadGestureRef = useRef({ keyboardOpen: false, viewportHeight: 800 });

  const threadDragResponder = useMemo(
    () =>
      PanResponder.create({
        /*
         * Only claim the drag once it is clearly a downward pull from the top of
         * the thread, so scrolling and horizontal swipes are never stolen.
         */
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4 && threadScrollOffsetRef.current <= 4 && !threadGestureRef.current.keyboardOpen,
        onPanResponderMove: (_event, gesture) => {
          const decision = decideThreadDrag({
            dx: gesture.dx,
            dy: gesture.dy,
            scrollOffset: threadScrollOffsetRef.current,
            viewportHeight: threadGestureRef.current.viewportHeight,
            keyboardOpen: threadGestureRef.current.keyboardOpen,
          });
          setThreadDrag(decision);
        },
        onPanResponderRelease: (_event, gesture) => {
          const decision = decideThreadDrag({
            dx: gesture.dx,
            dy: gesture.dy,
            scrollOffset: threadScrollOffsetRef.current,
            viewportHeight: threadGestureRef.current.viewportHeight,
            keyboardOpen: threadGestureRef.current.keyboardOpen,
          });
          setThreadDrag({ close: false, offset: 0, progress: 0 });
          // A pull that does not commit springs back: the screen returns to rest
          // and nothing is dismissed by accident.
          if (decision.close) closeThread();
        },
        onPanResponderTerminate: () => setThreadDrag({ close: false, offset: 0, progress: 0 }),
      }),
    [closeThread],
  );
  const toggleChatArchive = () => {
    if (!selectedChat) return;
    setChatRowStates((current) => toggleArchived(current, selectedChat));
    feedback(rowStateFor(chatRowStates, selectedChat).archived ? "Moved back to your inbox." : "Archived. Find it again under Archived.");
  };

  const unfriendCurrent = () => {
    if (!selectedChat) return;
    const name = currentThread?.name ?? "them";
    setChatRowStates((current) => archiveOnUnfriend(current, selectedChat));
    dropConnection(selectedChat);
    feedback(`You unfriended ${name.split(" ")[0]}. The conversation is archived and read-only, and your messages stay on your device.`);
    tap();
  };

  const blockCurrent = () => {
    if (!selectedChat) return;
    const name = currentThread?.name ?? "them";
    setChatRowStates((current) => archiveOnUnfriend(current, selectedChat));
    dropConnection(selectedChat);
    setMyProfile((current) => ({ ...current, privacy: { ...current.privacy, blockedIds: [...current.privacy.blockedIds, selectedChat] } }));
    feedback(`${name.split(" ")[0]} is blocked and can no longer reach you anywhere in Trufrenz.`);
  };

  const deleteCurrentThread = () => {
    if (!selectedChat) return;
    setChatMessages((current) => ({ ...current, [selectedChat]: [] }));
    feedback("Messages deleted from this device.");
  };

  const startCall = (video = false) => {
    const name = currentThread?.name ?? "your friend";
    // A restricted account cannot place calls, whatever their tier.
    if (!allowAction("start-calls")) return;
    const gate = callGate({ viewerPaid: paidTier, recipientPaid: paidTier });
    if (!gate.allowed) { feedback(gate.message); return; }
    void runGuardedAction("call", { kind: video ? "video" : "voice" });
    setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: name, peerVerified: Boolean(currentThread?.verified), video, direction: "outgoing" }));
  };

  /*
   * Shows the banner, unless the conversation it came from is muted.
   *
   * Muting has to mean something. A muted chat that still throws a banner over
   * whatever the member is doing is not muted, it just has a quieter label — and
   * the setting would then be a lie the member has no way to correct. The message
   * itself still arrives and the unread count still updates; only the interruption
   * is suppressed.
   */
  const showIncomingNotification = (
    next: IncomingNotification,
    options: { preview?: boolean } = {},
  ) => {
    const source = "chatId" in next && typeof next.chatId === "string" ? next.chatId : null;
    if (source && rowStateFor(chatRowStates, source).muted) return;
    /*
     * Quiet hours hold the interruption, not the message. The conversation still
     * updates and the unread count still moves — the member just is not pulled out
     * of whatever they were doing, which is the whole point of the window.
     *
     * The exemption is passed in rather than kept in a ref that the preview sets.
     * A ref has to be cleared by the same call that consumes it, so any early
     * return above — a muted chat, for instance — would leave it set and hand the
     * next genuine notification a free pass through the window. The setting would
     * appear to stop working for one message, with nothing on screen to explain
     * why.
     */
    if (!options.preview && shouldHoldNotification({ quiet: quietHours, at: new Date(), chatMuted: false })) {
      return;
    }
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setIncomingNotification(next);
    notificationTimer.current = setTimeout(() => setIncomingNotification(null), 5200);
  };

  const dismissIncomingNotification = () => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    notificationTimer.current = null;
    setIncomingNotification(null);
  };
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event: { endCoordinates?: { height?: number } }) =>
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardHeight(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const openIncomingNotification = (notification: IncomingNotification) => {
    dismissIncomingNotification();
    setTab("Chats");
    setSelectedChat(notification.chatId);
  };

  const previewIncomingNotification = () => {
    notificationSequence.current += 1;
    const id = `incoming-${Date.now()}-${notificationSequence.current}`;
    const showInvite = notificationDemoCycle.current % 2 === 1;
    notificationDemoCycle.current += 1;
    if (showInvite) {
      const chatId = "sam";
      const meetupTitle = "Coffee and a slow start";
      const venue = "Juniper Café";
      const time = "Today · 10:30 AM";
      const preview = `${meetupTitle} · ${venue} · ${time}`;
      setChatMessages((current) => ({ ...current, [chatId]: [...(current[chatId] ?? []), { id, from: "them", text: preview, time: "now" }] }));
      showIncomingNotification(createIncomingMeetupInviteNotification({ id, senderName: "Sam Rivera", chatId, meetupTitle, venue, time }), { preview: true });
      return;
    }
    const chatId = "maya";
    const messagePreview = "Want to grab coffee this Saturday?";
    setChatMessages((current) => ({ ...current, [chatId]: [...(current[chatId] ?? []), { id, from: "them", text: messagePreview, time: "now" }] }));
    showIncomingNotification(createIncomingMessageNotification({ id, senderName: "Maya Chen", chatId, messagePreview }), { preview: true });
  };

  const shareApproximateArea = () => {
    if (requireAccount("share-location")) return;
    if (!selectedChat || !currentThread) return;
    const message: Message = { id: `area-${Date.now()}`, from: "me", text: "I’m around Pacific Heights — just an approximate area. Want to pick a public meetup spot?", time: "now", receipt: "sent" };
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
    setActionMenuOpen(false);
    feedback("Approximate area shared in the chat. No live pin was sent.");
  };

  const prepareMeetupInvite = () => {
    if (requireAccount("create-meetup")) return;
    const target = selectedChat && inviteTargets.some((contact) => contact.id === selectedChat) ? selectedChat : inviteTargets[0]?.id;
    setActionMenuOpen(false);
    if (!target) { feedback("Accept a friend request before sharing a meetup invite."); return; }
    setInviteTargetChat(target);
    setInviteModalVisible(true);
  };

  const shareMeetupInvite = (draft: MeetupInviteDraft, contactId: string) => {
    const text = formatMeetupInvite(draft);
    const message: Message = { id: `meetup-${Date.now()}`, from: "me", text, time: "now", receipt: "sent" };
    setChatMessages((current) => ({ ...current, [contactId]: [...(current[contactId] ?? []), message] }));
    setInviteModalVisible(false);
    setInviteTargetChat(contactId);
    setSelectedChat(contactId);
    setTab("Chats");
    const recipient = inviteTargets.find((contact) => contact.id === contactId)?.name ?? "your friend";
    feedback(`Meetup invite shared in ${recipient}'s chat.`);
  };

  const toggleInterest = (tag: string) => {
    setInterestFilter((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    tap();
  };

  const acceptRequest = (id: string) => {
    applyConnectionChange(id, "accepted");
    const person = suggestions.find((item) => item.id === id);
    if (person) {
      setChatMessages((current) => current[person.id] ? current : { ...current, [person.id]: [{ id: `hello-${Date.now()}`, from: "them", text: "Thanks for accepting my friend request. Nice to meet you!", time: "now" }] });
    }
    /*
     * Accepting opens the conversation.
     *
     * The member asked for chat to turn on the moment a request they received is
     * accepted. Saying "you can chat now" and leaving them to find the row makes
     * them do the work twice, so acceptance takes them straight there.
     */
    setSelectedChat(id);
    setTab("Chats");
    feedback(`You and ${person?.name.split(" ")[0] ?? "they"} are now friends. Say hello.`);
  };

  const sendFriendRequest = (person: Person) => {
    if (requireAccount("send-friend-request")) return;
    if (!joined) { feedback("Create your phone-verified profile before sending a request."); openSignup(); return; }
    /*
     * The gate reads the member's own verification, not a fixed value.
     *
     * This was pinned to "phone-only", which meant every member was told to
     * verify a second time even after a selfie or ID check had been approved —
     * the prompt could never be satisfied and requests could never be sent. The
     * value is the one the session already carries, so an approved member is
     * let through here and an unverified one still sees the prompt.
     */
    if (!canRequestFriendship(myProfile.verification)) {
      setVerificationPrompt(true);
      return;
    }
    if (!allowAction("send-friend-requests")) return;
    applyConnectionChange(person.id, "requested");
    void runGuardedAction("friend-request", { targetName: person.name });
    feedback("Request sent quietly. Chat opens after they accept.");
    tap();
  };

  const newHangout = () => {
    if (!currentThread) return;
    prepareMeetupInvite();
  };

  const startThread = (id: string) => {
    if (requireAccount("open-chat")) return;
    const isGroup = seedConversations.some((chat) => chat.id === id && chat.kind === "group");
    if (!canOpenChat(acceptedFriends.includes(id), isGroup)) { feedback("Accept a friend request before starting a chat."); return; }
    // Freeze the divider at the position the member is arriving with.
    setFrozenUnreadStart(firstUnreadIndex(chatMessages[id] ?? [], threadState, id));
    setSelectedChat(id);
    setTab("Chats");
    setTypingChat(id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingChat(null), 2400);
  };

  const toggleGroup = () => {
    if (requireAccount("create-meetup")) return;
    if (!newGroupName.trim()) { feedback("Give your private group a name first."); return; }
    setCreatedGroups((current) => [...current, newGroupName.trim()]);
    setNewGroupName("");
    setComposerOpen(false);
    feedback("Private group created. Invite accepted friends from the group chat.");
  };

  const navigateFromMenu = (destination: Tab) => {
    setNavigationMenuOpen(false);
    clearPendingAttachment();
    setSelectedChat(null);
    setTab(destination);
    tap();
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const action = resolveMobileBackAction({
        navigationMenuOpen,
        actionMenuOpen,
        quickRepliesOpen,
        profileOpen: !!profilePerson,
        meetupInviteOpen: inviteModalVisible,
        selfieVerificationOpen: selfieModalVisible,
        verificationPromptOpen: verificationPrompt,
        composerOpen,
        signupOpen: showSignup,
        signupCanGoBack: authStep !== "welcome",
        notificationOpen: !!incomingNotification,
        threadOpen: !!selectedChat,
        activeTab: tab,
      });
      if (action === "exit-app") return false;
      if (action === "close-navigation-menu") setNavigationMenuOpen(false);
      else if (action === "close-action-menu") setActionMenuOpen(false);
      else if (action === "close-quick-replies") setQuickRepliesOpen(false);
      else if (action === "close-profile") setProfilePerson(null);
      else if (action === "close-meetup-invite") setInviteModalVisible(false);
      else if (action === "close-selfie-verification") setSelfieModalVisible(false);
      else if (action === "close-verification-prompt") setVerificationPrompt(false);
      else if (action === "close-composer") setComposerOpen(false);
      else if (action === "step-back-signup") setAuthStep((current) => current === "profile" ? "code" : current === "code" ? "phone" : "welcome");
      else if (action === "close-signup") setShowSignup(false);
      else if (action === "dismiss-notification") setIncomingNotification(null);
      else if (action === "close-thread") closeThread();
      else if (action === "go-to-chats") { closeThread(); setTab("Chats"); }
      tap();
      return true;
    });
    return () => subscription.remove();
  }, [actionMenuOpen, authStep, closeThread, composerOpen, incomingNotification, inviteModalVisible, navigationMenuOpen, profilePerson, quickRepliesOpen, selectedChat, selfieModalVisible, showSignup, tab, verificationPrompt]);

  const topBar = (thread = false) => (
    <View style={styles.topBar}>
      <View style={styles.brandMark}>
        {thread ? (
          <Pressable onPress={closeThread} accessibilityRole="button" accessibilityLabel="Back to conversations" style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Icon name="arrow-back" size={18} color="#6b664c" />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : <View style={styles.brandIcon}><Icon name="spa" size={17} color="#4A4210" /></View>}
        {thread ? <View style={styles.threadHeading}><Pressable onPress={() => (currentThread?.kind === "group" ? setGroupInfoOpen(true) : openChatProfile())} style={({ pressed }) => [styles.threadAvatarButton, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`View ${currentThread?.name ?? "friend"} profile`}><Image source={currentThread?.image} style={styles.threadAvatar} /></Pressable><View style={styles.threadHeadingCopy}><Pressable onPress={() => currentThread?.kind === "group" && setGroupInfoOpen(true)} accessibilityRole={currentThread?.kind === "group" ? "button" : undefined} accessibilityLabel={currentThread?.kind === "group" ? `Open ${currentThread.name} group info` : undefined}><Text style={styles.threadTitle} numberOfLines={1}>{currentThread?.name ?? "Conversation"}</Text></Pressable><Text style={styles.topBarSub} numberOfLines={1}>{currentThread?.kind === "group" ? `${group.members.length} members · invite-only` : currentThread?.verified ? "ID + selfie verified" : "Accepted friend"}</Text><View style={styles.threadStatusRow}>{currentThread?.verified ? <Icon name="verified" size={11} color="#588B79" /> : null}<Text style={styles.threadStatus} numberOfLines={1}>{[threadAvailabilityLabel, threadFriendStatus].filter(Boolean).join(" · ")}</Text></View></View></View> : <Text style={styles.brandWord}>Trufrenz</Text>}
      </View>
      {thread ? <View style={[styles.topActions, styles.topActionsThread]}>{currentThread?.kind === "friend" ? <><Pressable onPress={() => startCall(false)} accessibilityRole="button" accessibilityLabel={`Call ${currentThread?.name ?? "friend"}`} style={styles.roundAction}><Icon name="call" size={18} color="#757056" /></Pressable><Pressable onPress={() => startCall(true)} accessibilityRole="button" accessibilityLabel={`Video call ${currentThread?.name ?? "friend"}`} style={styles.roundAction}><Icon name="videocam" size={19} color="#757056" /></Pressable></> : null}<Pressable onPress={() => setChatMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open conversation options" style={styles.roundAction}><Icon name="more-vert" size={21} color="#757056" /></Pressable></View> : <View style={styles.topActions}><Pressable onPress={previewIncomingNotification} onLongPress={() => setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: "Maya Chen", peerVerified: true, video: false, direction: "incoming" }))} accessibilityRole="button" accessibilityLabel="Show sample incoming notification, long press for a sample incoming call" style={styles.roundAction}><Icon name="notifications-none" size={20} color="#757056" /><View style={styles.notificationDot} /></Pressable><Pressable onPress={openAccountFromHeader} accessibilityRole="button" accessibilityLabel={joined ? "Open your profile, edit, and settings" : "Log in or sign up"} style={styles.userAvatar}>{joined ? <Text style={styles.userInitial}>{fullName.charAt(0).toUpperCase()}</Text> : <Icon name="person-outline" size={18} color="#77725a" />}</Pressable></View>}
    </View>
  );

  const verificationBadge = (person: Person, compact = false) => {
    const strong = person.verification === "ID + selfie verified";
    return <View style={[styles.verificationPill, strong ? styles.verifiedPill : styles.phonePill, compact && styles.compactBadge]}><Icon name={strong ? "verified" : "phone-iphone"} size={compact ? 11 : 12} color={strong ? "#588B79" : "#92939E"} /><Text style={[styles.verificationText, !strong && styles.phoneVerifiedText]}>{compact ? (strong ? "Verified" : "Phone") : person.verification}</Text></View>;
  };

  const renderChats = () => {
    if (selectedChat && currentThread) {
      const conversationMessages = chatMessages[selectedChat] ?? [];
      // Lift by the full keyboard height so the composer sits flush on the keys.
      const composerLift = composerKeyboardLift(keyboardHeight);
      /*
       * Keyboard open: the list shrinks and pins its newest messages to the
       * bottom, then a small gap holds the composer clear of the last bubble.
       * Keyboard closed: the list keeps its natural flow and the empty space
       * that used to sit under the messages is given back, so the composer
       * rides up under the conversation instead of floating at the screen edge
       * with a dead band between them.
       */
      const keyboardOpen = composerLift > 0;
      /*
       * Closed: the composer rests on the safe-area edge, clear of the home
       * indicator. Open: the container cancels that edge and lifts by the whole
       * keyboard height, so the field lands directly on the keys.
       */
      /*
       * Where the member stopped last time, and how much has arrived since.
       *
       * Both come from the persisted read marker rather than the seeded badge,
       * so a conversation that has been read stops claiming to be unread.
       */
      // The frozen position wins while the thread is open, so the divider does not
      // vanish the moment the visit marks the thread read.
      const unreadStart = frozenUnreadStart ?? firstUnreadIndex(conversationMessages, threadState, selectedChat);
      const unreadCount = unreadStart !== null && unreadStart >= 0
        ? conversationMessages.slice(unreadStart).filter((message) => message.from === "them").length
        : unreadForRow({ seedUnread: currentThread.unread ?? 0, messages: conversationMessages, state: threadState, chatId: selectedChat });
      threadGestureRef.current.keyboardOpen = keyboardOpen;
      threadGestureRef.current.viewportHeight = windowHeight;

      return <View
        style={[styles.threadScreen, { paddingBottom: composerLift, marginBottom: keyboardOpen ? -insets.bottom : 0 }, threadDrag.offset ? { transform: [{ translateY: threadDrag.offset }] } : null]}
        {...threadDragResponder.panHandlers}
      >
        {topBar(true)}
        {/*
          The one-line safety reminder that used to sit here has been removed.
          It cost a row of height at the top of every conversation, directly
          above the date, and the member read the same sentence every time they
          opened a chat. The promise it made — that only friends can see the
          messages and no exact location is shared — is still stated where it
          matters: on the profile sheet before a meetup, in the safety centre,
          and in the welcome carousel. Repeating it above the messages added
          height without adding trust.
        */}
        <ScrollView
          ref={threadScrollRef}
          style={styles.threadBody}
          contentContainerStyle={[styles.threadContent, keyboardOpen ? styles.threadContentKeyboard : styles.threadContentCompact]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={(event) => { threadScrollOffsetRef.current = event.nativeEvent.contentOffset.y; }}
          scrollEventThrottle={16}
        >
          <View style={styles.dayDivider}><View style={styles.dividerLine} /><Text style={styles.dayLabel}>TODAY</Text><View style={styles.dividerLine} /></View>
          <View style={styles.sharedInterest}><Icon name="auto-awesome" size={15} color="#83721f" /><Text style={styles.sharedInterestText}>You both like slow weekend mornings</Text></View>
          {conversationMessages.map((message, messageIndex) => {
            const receipt = outgoingReceipt(message.receipt ?? (message.from === "me" ? "sent" : undefined), chatPrivacy.shareReadReceipts);
            const showReceipt = shouldShowReceipt({ from: message.from, receipt: message.receipt ?? (message.from === "me" ? "sent" : undefined) }, chatPrivacy.shareReadReceipts) && receipt;
            const mine = message.from === "me";
            const visibleReactions = summariseReactions(message.reactions ?? []);
            // Placed once, before the first message the member has not seen, so a
            // long conversation resumes exactly where they stopped.
            /*
             * Only drawn when something is genuinely new. A marker on a thread
             * the member is already caught up on would be noise: it says "you
             * stopped here", which is only worth showing when there is more.
             */
            const marksBoundary = unreadStart !== null && unreadCount > 0 && messageIndex === unreadStart;
            return (
              <React.Fragment key={message.id}>
              {marksBoundary ? <View style={styles.readMarker}><View style={styles.readMarkerLine} /><Text style={styles.readMarkerLabel}>{readMarkerLabel(unreadCount)}</Text><View style={styles.readMarkerLine} /></View> : null}
              <View style={[styles.messageRow, mine && styles.myMessageRow]}>
                <View style={styles.messageColumn}>
                  {currentThread.kind === "group" && !mine && message.kind !== "plan" ? <Text style={styles.senderLabel}>{currentThread.name.split(" ")[0]} · {message.from === "them" ? "Member" : "You"}</Text> : null}
                  {message.plan ? (
                    <PlanCardView
                      card={message.plan}
                      viewer={mine ? "them" : "me"}
                      friendName={currentThread.name}
                      onRespond={(response) => respondToPlanCard(message.id, response)}
                      onCheckIn={() => checkInToPlanCard(message.id)}
                      onCopyLink={() => feedback("Plan link copied. It opens this card from the Meetups tab.")}
                    />
                  ) : message.poll ? (
                    <PlanPollCard
                      poll={message.poll}
                      viewerId="me"
                      onVote={(optionId) => voteInPoll(message.id, optionId)}
                      onUseWinning={() => applyWinningPollOption(message.id)}
                    />
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${mine ? "You" : currentThread.name.split(" ")[0]} said ${message.text}. Long press to react.`}
                      onLongPress={() => setReactionTarget(message.id)}
                      delayLongPress={280}
                      style={[styles.messageBubble, mine ? styles.myBubble : styles.theirBubble, { backgroundColor: glassSurfaceColor(mine ? "rgba(233, 227, 193, 0.94)" : glassNestedFill("rgba(255, 255, 255, 0.91)"), glassOpacity, glassTintChoice, "row") }]}
                    >
                      {message.kind === "voice" ? (
                        <View style={styles.voiceRow}>
                          <View style={styles.voicePlay}><Icon name="play-arrow" size={16} color="#83721f" /></View>
                          <View style={styles.voiceWave}>{[7, 13, 18, 10, 16, 21, 12, 9, 15, 19, 11, 14].map((height, index) => <View key={index} style={[styles.voiceBar, { height }]} />)}</View>
                          <Text style={styles.voiceTime}>{clampVoiceSeconds(message.durationSeconds ?? 1)}s</Text>
                        </View>
                      ) : message.kind === "location" ? (
                        <View style={styles.locationRow}>
                          <Icon name="place" size={15} color="#6E9C86" />
                          <View style={styles.locationCopy}>
                            <Text style={[styles.messageText, mine && styles.myMessageText]} numberOfLines={2}>{message.place ?? message.text}</Text>
                            <Text style={styles.locationNote}>Manual share · never live</Text>
                          </View>
                        </View>
                      ) : message.kind === "photo" && message.mediaUri ? (
                        <Image source={{ uri: message.mediaUri }} style={styles.photoBubble} />
                      ) : (
                        <Text style={[styles.messageText, mine && styles.myMessageText]}>{message.text}</Text>
                      )}
                      <View style={styles.messageMeta}>
                        <Text style={[styles.messageTime, mine && styles.myMessageTime]}>{message.time}</Text>
                        {showReceipt && receipt ? <View accessibilityLabel={receiptLabel(receipt)} style={styles.receiptWrap}><Icon name={receiptIcon(receipt)} size={12} color={receipt === "read" ? "#62A4A0" : "#83721f"} /><Text style={[styles.receiptText, receipt === "read" && styles.receiptReadText]}>{receiptLabel(receipt)}</Text></View> : null}
                      </View>
                    </Pressable>
                  )}
                  {visibleReactions.length ? (
                    <View style={[styles.reactionRow, mine && styles.myReactionRow]}>
                      {visibleReactions.map((reaction) => (
                        <Pressable key={reaction.emoji} accessibilityRole="button" accessibilityLabel={`${reaction.emoji} ${reaction.count}, ${reaction.mine ? "yours" : "tap to react"}`} onPress={() => reactToMessage(message.id, reaction.emoji)} style={[styles.reactionChip, reaction.mine && styles.reactionChipMine]}>
                          <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                          <Text style={styles.reactionCount}>{reaction.count}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {reactionTarget === message.id ? (
                    <View style={[styles.reactionPicker, mine && styles.myReactionPicker]}>
                      {REACTION_CHOICES.map((emoji) => (
                        <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={`React with ${emoji}`} onPress={() => { reactToMessage(message.id, emoji); setReactionTarget(null); }} style={styles.reactionChoice}>
                          <Text style={styles.reactionChoiceEmoji}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
              </React.Fragment>
            );
          })}
          {typingChat === selectedChat ? <View style={styles.typingRow}><View style={[styles.typingBubble, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.86)"), glassOpacity, glassTintChoice, "chip") }]}><View style={styles.typingDots}><View style={styles.typingDot} /><View style={[styles.typingDot, styles.typingDotMiddle]} /><View style={[styles.typingDot, styles.typingDotLast]} /></View><Text style={styles.typingText}>{currentThread.name.split(" ")[0]} is typing</Text></View></View> : null}
        </ScrollView>
        <View style={styles.hangoutStrip}><Icon name="event-available" size={16} color="#83721f" /><Text style={styles.hangoutStripText}>Want to meet? Send a gentle hangout invite.</Text><Pressable onPress={() => setPlanComposerKind("hangout")}><Text style={styles.inviteLink}>Hangout</Text></Pressable><Pressable onPress={() => setPlanComposerKind("meetup")}><Text style={styles.inviteLink}>Meetup</Text></Pressable>{currentThread?.kind === "group" ? <Pressable onPress={startPlanPoll}><Text style={styles.inviteLink}>Poll</Text></Pressable> : null}</View>
        {activeRowState.readOnly ? <View style={styles.readOnlyBar}><Icon name="lock-outline" size={14} color="#83721f" /><Text style={styles.readOnlyBarText}>This conversation is read-only. Unarchive it to send new messages.</Text></View> : null}
        {pendingAttachment ? <AttachmentPreviewStrip pending={pendingAttachment} sizeBytes={pendingPhotoBytes} onRemove={clearPendingAttachment} /> : null}
        <View style={[styles.composerRow, keyboardOpen && styles.composerRowRaised]}><Pressable onPress={() => setAttachmentSheetOpen(true)} accessibilityLabel="Open attachments" style={styles.composerIcon}><Icon name="add-circle-outline" size={24} color="#8a877e" /></Pressable><Pressable onPress={() => setQuickRepliesOpen(true)} accessibilityLabel="Open quick replies" style={styles.quickReplyButton}><Icon name="quickreply" size={18} color="#83721f" /></Pressable><TextInput value={messageDraft} onChangeText={setMessageDraft} placeholder={pendingAttachment ? "Add a caption…" : "Write a message…"} placeholderTextColor="#9a9891" style={styles.composerInput} onSubmitEditing={sendComposerContent} returnKeyType="send" /><Pressable onPress={sendComposerContent} accessibilityLabel={pendingAttachment ? "Send with this attachment" : "Send message"} style={({ pressed }) => [styles.sendButton, (messageDraft.trim() || pendingAttachment) && styles.sendButtonActive, pressed && styles.pressed]}><Icon name="arrow-upward" size={19} color={messageDraft.trim() || pendingAttachment ? "#FFFFFF" : "#95938c"} /></Pressable></View>
        <AttachmentSheet visible={attachmentSheetOpen} onClose={() => setAttachmentSheetOpen(false)} onPickPhoto={sendPhoto} onSend={sendAttachment} onReviewVoice={reviewVoiceNote} onSuggestPlan={(kind) => setPlanComposerKind(kind)} />
        <ChatOverflowMenu
          visible={chatMenuOpen}
          chatName={currentThread.name}
          isGroup={currentThread.kind === "group"}
          state={activeRowState}
          shareReadReceipts={chatPrivacy.shareReadReceipts}
          onClose={() => setChatMenuOpen(false)}
          onViewProfile={openChatProfile}
          onToggleMute={toggleChatMute}
          onToggleArchive={toggleChatArchive}
          onToggleReadReceipts={(value) => { setChatPrivacy((current) => ({ ...current, shareReadReceipts: value })); feedback(value ? "Read receipts on. Friends will see when you have read their messages." : "Read receipts off. Friends see Delivered only."); }}
          onUnfriend={unfriendCurrent}
          onDeleteThread={deleteCurrentThread}
          onReport={() => feedback("Reported to the safety team. Declined requests and reports never notify the other person.")}
          onBlock={blockCurrent}
          onLeaveGroup={() => { closeThread(); feedback("You left the group. Your copy of the history stays on your device."); }}
        />
        <PlanComposerModal
          visible={planComposerKind !== null}
          initialKind={planComposerKind ?? "hangout"}
          friendName={currentThread.name}
          onClose={() => setPlanComposerKind(null)}
          onShare={sharePlan}
          nudge={
            <UpgradeNudgeCard
              nudge={proposalUpgradeNudge}
              onUpgrade={() => { setPlanComposerKind(null); openPaywall(proposalUpgradeNudge.title, proposalUpgradeNudge.planId); }}
              onDismiss={() => dismissNudge("proposals")}
            />
          }
        />
        <GroupInfoModal
          visible={groupInfoOpen}
          group={group}
          viewerId="me"
          friendDirectory={suggestions.filter((person) => acceptedFriends.includes(person.id)).map((person) => ({ id: person.id, name: person.name, paidTier: paidTier }))}
          onClose={() => setGroupInfoOpen(false)}
          tier={tier}
          onUpgrade={(reason) => openPaywall(reason, "quarterly")}
          onUpdate={setGroup}
          onFeedback={feedback}
          onStartGroupCall={() => setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: group.settings.name, peerVerified: true, video: true, direction: "outgoing" }))}
          onLeave={closeThread}
          nudge={
            <UpgradeNudgeCard
              nudge={groupUpgradeNudge}
              onUpgrade={() => { setGroupInfoOpen(false); openPaywall(groupUpgradeNudge.title, groupUpgradeNudge.planId); }}
              onDismiss={() => dismissNudge("group")}
            />
          }
        />
      </View>;
    }
    const filters: typeof chatFilter[] = ["All", "Unread", "Groups"];
    const friendCircles = seedConversations.filter((chat) => chat.kind === "friend" && acceptedFriends.includes(chat.id));
    return <>
      {topBar()}
      <View style={styles.chatHeading}><View><Text style={styles.greeting}>{joined ? `Hello, ${fullName.split(" ")[0] || "friend"}` : "A little closer."}</Text><Text style={styles.chatTitle}>Your conversations</Text></View><Pressable onPress={() => setComposerOpen(true)} style={({ pressed }) => [styles.composeButton, pressed && styles.pressed]}><Icon name="edit-square" size={19} color="#4A4210" /></Pressable></View>
      <View style={styles.searchBar}><Icon name="search" size={18} color="#929089" /><TextInput value={search} onChangeText={setSearch} placeholder="Search conversations & friends" placeholderTextColor="#a4a39f" style={styles.searchInput} returnKeyType="search" /><Pressable onPress={() => feedback("Search chats, people, and groups from here.")}><Icon name="tune" size={17} color="#83721f" /></Pressable></View>
      <View style={styles.filterRow}>{filters.map((filter) => <Pressable key={filter} onPress={() => setChatFilter(filter)} style={[styles.filterChip, chatFilter === filter && styles.filterChipActive]}><Text style={[styles.filterChipText, chatFilter === filter && styles.filterChipTextActive]}>{filter}{filter === "Unread" ? "  2" : ""}</Text></Pressable>)}</View>
      {chatFilter === "All" && !search ? <View style={styles.circlesSection}><View style={styles.sectionHeaderLine}><Text style={styles.sectionEyebrow}>YOUR PEOPLE</Text><Pressable onPress={() => setTab("Friends")}><Text style={styles.sectionLink}>See all <Icon name="chevron-right" size={12} color="#83721f" /></Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circlesRow}>
        {joined ? <Pressable onPress={() => setTab("You")} style={styles.circleItem}><View style={styles.myCircle}><Text style={styles.myCircleInitial}>{fullName.charAt(0).toUpperCase()}</Text><View style={styles.addSmall}><Icon name="add" size={11} color="#4A4210" /></View></View><Text style={styles.circleName}>Your note</Text></Pressable> : <Pressable onPress={openSignup} style={styles.circleItem}><View style={styles.addCircle}><Icon name="add" size={22} color="#83721f" /></View><Text style={styles.circleName}>Set up</Text></Pressable>}
        {friendCircles.map((chat) => <Pressable key={chat.id} onPress={() => startThread(chat.id)} style={styles.circleItem}><View style={styles.circleImageWrap}><Image source={chat.image} style={styles.circleImage} /><View style={[styles.circleStatus, chat.online && styles.circleStatusOnline]} /></View><Text style={styles.circleName} numberOfLines={1}>{chat.name.split(" ")[0]}</Text></Pressable>)}
        <Pressable onPress={() => setTab("Friends")} style={styles.circleItem}><View style={styles.addCircle}><Icon name="group-add" size={18} color="#83721f" /></View><Text style={styles.circleName}>Add friend</Text></Pressable>
      </ScrollView></View> : null}
      <View style={styles.listHeading}><Text style={styles.sectionEyebrow}>{chatFilter === "Groups" ? "YOUR PRIVATE CIRCLES" : chatFilter === "Unread" ? "UNREAD MESSAGES" : "RECENT CHATS"}</Text><Pressable onPress={() => feedback("Conversations stay private to your accepted friends.")}><Icon name="more-horiz" size={20} color="#999690" /></Pressable></View>
      <ScrollView style={styles.chatListScroll} contentContainerStyle={styles.chatList} showsVerticalScrollIndicator={false}>
        {visibleChats.map((chat) => {
          const person = suggestions.find((item) => item.id === chat.id);
          const status = visibleStatus(person?.status ?? null);
          return (
            <SwipeableChatRow
              key={chat.id}
              chat={{ ...chat, verified: Boolean(chat.verified), availability: chat.kind === "group" ? undefined : (person?.available === false ? "unavailable" : "available") }}
              state={rowStateFor(chatRowStates, chat.id)}
              statusLine={status ? statusLabel(status) : null}
              unreadCount={unreadForRow({ seedUnread: chat.unread, messages: chatMessages[chat.id] ?? [], state: threadState, chatId: chat.id })}
              onOpen={() => startThread(chat.id)}
              markedUnread={isMarkedUnread(threadState, chat.id)}
              onMarkUnread={() => {
                /*
                 * The member sets their own reminder. Opening the thread is what
                 * clears it, so a row can never stay lit after being read.
                 */
                setThreadState((current) => markThreadUnread(current, chat.id));
                feedback(`${chat.name.split(" ")[0]} marked unread. Open it when you are ready.`);
                tap();
              }}
              onToggleMute={() => { setChatRowStates((current) => toggleMuted(current, chat.id)); feedback(rowStateFor(chatRowStates, chat.id).muted ? "Unmuted." : "Muted. Messages still arrive, just without the badge."); }}
              onToggleArchive={() => { setChatRowStates((current) => toggleArchived(current, chat.id)); feedback(rowStateFor(chatRowStates, chat.id).archived ? "Moved back to your inbox." : "Archived. Find it again under Archived."); }}
            />
          );
        })}
        {createdGroups.map((name) => <Pressable key={name} onPress={() => feedback("Invite an accepted friend to start the group conversation.")} style={styles.chatRow}><View style={[styles.chatAvatarWrap, styles.addCircle]}><Icon name="groups" size={22} color="#83721f" /></View><View style={styles.chatInfo}><Text style={styles.chatName}>{name}</Text><Text style={styles.chatPreview}>Private group · Invite friends to begin</Text></View><Icon name="chevron-right" size={18} color="#a6a49f" /></Pressable>)}
        {visibleChats.length === 0 ? <View style={styles.emptyChats}><View style={styles.emptyIcon}><Icon name="forum" size={22} color="#83721f" /></View><Text style={styles.emptyTitle}>{chatEmptyCopy.title}</Text><Text style={styles.emptyCopy}>{chatEmptyCopy.body}</Text>{!joined ? <ActionButton onPress={() => { setAuthIntent("signup"); setAuthStep("phone"); setShowSignup(true); }} style={styles.emptyAction}><Text style={styles.actionText}>Create your account</Text><Icon name="arrow-forward" color="#FFFFFF" size={15} /></ActionButton> : acceptedFriends.length === 0 ? <ActionButton onPress={() => setTab("Friends")} style={styles.emptyAction}><Text style={styles.actionText}>Meet neighbors</Text><Icon name="arrow-forward" color="#FFFFFF" size={15} /></ActionButton> : null}</View> : null}
        <View style={styles.safeNote}><Icon name="lock-outline" size={13} color="#8e8c84" /><Text style={styles.safeNoteText}>Messages open after you both accept a friend request.</Text></View>
      </ScrollView>
    </>;
  };

  const renderFriends = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>A SMALLER INTERNET, A CLOSER CIRCLE</Text><Text style={styles.pageTitle}>Friends, not profiles.</Text><Text style={styles.pageSub}>Meet kind people nearby, then connect only when you both say yes.</Text></View>
    <View style={styles.friendsTools}><View style={styles.searchBar}><Icon name="search" size={17} color="#929089" /><TextInput value={search} onChangeText={setSearch} placeholder="Search by name or interest" placeholderTextColor="#a4a39f" style={styles.searchInput} /><Icon name="tune" size={17} color="#83721f" /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.interestFilterRow}>{["Nearby", "Verified", "Coffee", "Books", "Hiking"].map((tag) => <Pressable key={tag} onPress={() => toggleInterest(tag)} style={[styles.filterChip, interestFilter.includes(tag) && styles.filterChipActive]}><Text style={[styles.filterChipText, interestFilter.includes(tag) && styles.filterChipTextActive]}>{tag}</Text></Pressable>)}</ScrollView></View>
      <View style={[styles.friendsScroll, styles.friendsContent]}>
      <View style={styles.contactPanel}>
        <View style={styles.contactHeader}>
          <View style={styles.contactIcon}><Icon name="contacts" size={18} color="#7393A9" /></View>
          <View style={styles.contactHeaderCopy}>
            <Text style={styles.contactTitle}>People you know</Text>
            <Text style={styles.contactSub}>Check locally hashed numbers against members who opted in. Names and raw numbers stay on this device.</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void discoverDeviceContacts()} disabled={contactsLoading} style={({ pressed }) => [styles.contactScanButton, pressed && styles.pressed, contactsLoading && styles.contactBusy]}>
          {contactsLoading ? <ActivityIndicator size="small" color="#527084" /> : <Icon name="manage-search" size={16} color="#527084" />}
          <Text style={styles.contactScanText}>{contactsLoading ? "Checking contacts…" : deviceContacts.length ? "Refresh contact matches" : "Check my contacts"}</Text>
          {!contactsLoading ? <Icon name="arrow-forward" size={14} color="#527084" /> : null}
        </Pressable>
        {deviceContacts.length > 0 ? <>
          <View style={styles.contactListHeading}>
            <View style={styles.contactHeaderCopy}>
              <Text style={styles.contactListTitle}>{Object.keys(contactMatches).length} opted-in Trufrenz {Object.keys(contactMatches).length === 1 ? "member" : "members"} found</Text>
              <Text style={styles.contactListSub}>{selectedDeviceContacts.length} selected for individual invite drafts</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => { setSelectedContactPhones(selectedContactPhones.length === deviceContacts.length ? [] : deviceContacts.map((contact) => contact.phoneE164)); setInviteCursor(0); }} style={styles.contactSelectAll}>
              <Text style={styles.contactSelectAllText}>{selectedContactPhones.length === deviceContacts.length ? "Clear" : "Select all"}</Text>
            </Pressable>
          </View>
          <View style={styles.contactSearch}>
            <Icon name="search" size={15} color="#8b9396" />
            <TextInput value={contactSearch} onChangeText={setContactSearch} placeholder="Find a contact on this device" placeholderTextColor="#979da0" style={styles.contactSearchInput} />
          </View>
          {contactScanWasLimited ? <Text style={styles.contactLimitNote}>Showing the first 500 usable numbers. Refresh later to check after editing your contacts.</Text> : null}
          {deviceContacts.filter((contact) => contact.name.toLowerCase().includes(contactSearch.trim().toLowerCase())).slice(0, 30).map((contact) => {
            const match = contactMatches[contact.phoneE164];
            const selected = selectedContactPhones.includes(contact.phoneE164);
            return <Pressable key={contact.phoneE164} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${contact.name}${match ? ` is on Trufrenz as ${match.name}` : ""}`} onPress={() => toggleContactSelection(contact.phoneE164)} style={({ pressed }) => [styles.contactRow, selected && styles.contactRowSelected, pressed && styles.pressed]}>
              <View style={[styles.contactSelectMark, selected && styles.contactSelectMarkOn]}><Icon name={selected ? "check" : "person-outline"} size={14} color={selected ? "#4A4210" : "#7890A0"} /></View>
              <View style={styles.contactHeaderCopy}>
                <Text style={styles.contactName} numberOfLines={1}>{contact.name}</Text>
                <Text style={styles.contactMatchLabel} numberOfLines={1}>{match ? `On Trufrenz as ${match.name} · ${match.verificationTier === "id_selfie" ? "ID + selfie verified" : match.verificationTier === "phone" ? "Phone verified" : "Account found"}` : "Not found among members who opted in"}</Text>
              </View>
              {match ? <Icon name="verified-user" size={15} color="#62A087" /> : null}
            </Pressable>;
          })}
          <Pressable accessibilityRole="button" onPress={() => void inviteNextSelectedContact()} disabled={!selectedDeviceContacts.length || contactInviteLoading || inviteCursor >= selectedDeviceContacts.length} style={({ pressed }) => [styles.contactInviteButton, pressed && styles.pressed, (!selectedDeviceContacts.length || contactInviteLoading || inviteCursor >= selectedDeviceContacts.length) && styles.contactInviteDisabled]}>
            {contactInviteLoading ? <ActivityIndicator size="small" color="#4A4210" /> : <Icon name="sms" size={16} color="#4A4210" />}
            <Text style={styles.contactInviteText}>{contactInviteLoading ? "Opening text…" : inviteCursor >= selectedDeviceContacts.length && selectedDeviceContacts.length ? "Invite drafts opened for selection" : `Prepare next text invite${selectedDeviceContacts.length ? ` · ${Math.min(inviteCursor + 1, selectedDeviceContacts.length)} of ${selectedDeviceContacts.length}` : ""}`}</Text>
            {!contactInviteLoading ? <Icon name="arrow-forward" size={14} color="#4A4210" /> : null}
          </Pressable>
          <Text style={styles.contactInviteNote}>Each draft is addressed to one person to protect everyone&apos;s number. Trufrenz never sends texts automatically; review and send in your messaging app. Invite link: {process.env.EXPO_PUBLIC_INVITE_URL?.trim() || "https://trufrenz.net"}</Text>
        </> : null}
      </View>
      {incomingRequests.length > 0 ? <View style={styles.requestPanel}><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>WAITING FOR YOU</Text><Text style={styles.requestHeading}>Friend requests <View style={styles.requestCount}><Text style={styles.requestCountText}>{incomingRequests.length}</Text></View></Text></View><Icon name="people-alt" size={20} color="#83721f" /></View>{incomingRequests.map((id) => { const person = suggestions.find((item) => item.id === id)!; return <View key={id} style={styles.requestRow}><Image source={person.image} style={styles.requestAvatar} /><View style={styles.requestDetails}><Text style={styles.requestName}>{person.name}</Text><Text style={styles.requestMutual}>You both enjoy {person.interests[0].toLowerCase()}</Text>{verificationBadge(person, true)}</View><View style={styles.requestButtons}><Pressable accessibilityRole="button" accessibilityLabel={`Accept ${person.name}'s friend request`} onPress={() => acceptRequest(id)} style={styles.acceptButton}><Icon name="check" size={17} color="#FFFFFF" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Decline ${person.name}'s friend request`} onPress={() => { applyConnectionChange(id, "declined"); feedback("Request quietly dismissed. They will not be shown again."); }} style={styles.declineButton}><Icon name="close" size={16} color="#8d8b86" /></Pressable></View></View>; })}</View> : null}
      {outgoingRequests.length > 0 ? <View style={styles.outgoingRequestPanel}><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>WAITING ON THEM</Text><Text style={styles.outgoingRequestHeading}>Requests you sent <View style={styles.outgoingRequestCount}><Text style={styles.outgoingRequestCountText}>{outgoingRequests.length}</Text></View></Text></View><Icon name="schedule" size={19} color="#7393A9" /></View><Text style={styles.outgoingRequestCopy}>They can answer in their own time. Nothing is lost if you change your mind — you can take a request back.</Text>{outgoingRequests.map((person) => <View key={person.id} style={styles.requestRow}><Image source={person.image} style={styles.requestAvatar} /><View style={styles.requestDetails}><Text style={styles.requestName}>{person.name}</Text><Text style={styles.requestMutual}>Request sent · waiting quietly</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Withdraw friend request to ${person.name}`} onPress={() => { withdrawSentRequest(person.id); feedback(`${person.name} will not be notified. Request withdrawn.`); }} style={styles.withdrawRequestButton}><Text style={styles.withdrawRequestText}>Withdraw</Text></Pressable></View>)}</View> : null}
      <View style={styles.suggestHeading}><View><Text style={styles.sectionEyebrow}>GENTLY INTRODUCED · NO SWIPES</Text><Text style={styles.sectionTitle}>A few neighbors nearby</Text></View><View style={styles.sortChip}><Icon name="auto-awesome" size={13} color="#83721f" /><Text style={styles.sortChipText}>Shared interests</Text></View></View>
      {!discoverable ? <Frosted style={styles.discoveryPaused}><Icon name="visibility-off" size={17} color="#7895A5" /><View style={{ flex: 1 }}><Text style={styles.discoveryPausedTitle}>You&apos;re out of suggestions for now.</Text><Text style={styles.noPressureText}>Turn discovery back on from You → Appear in suggestions.</Text></View></Frosted> : null}
      <View style={styles.friendConnectionList}>{filteredSuggestions.map((person) => { const personRelationship = relationshipFor(friendships, person.id); const sent = personRelationship !== "stranger"; const sharedInterests = findCommonInterests(joined && profileInterests.length ? profileInterests : ["Coffee walks", "Bookshops", "Park hangs"], person.interests); return <Frosted key={person.id} style={styles.neighborRow}><Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} profile`} onPress={() => { setProfilePerson(person); tap(); }} style={({ pressed }) => [styles.neighborTapArea, pressed && styles.pressed]}><Image source={person.image} style={styles.neighborAvatar} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.name} details`} onPress={() => { setProfilePerson(person); tap(); }} style={({ pressed }) => [styles.neighborInfo, pressed && styles.pressed]}><View style={styles.neighborNameRow}><Text style={styles.neighborName} numberOfLines={1}>{person.name}</Text><Text style={styles.suggestAge}>{person.age}</Text>{person.verification === "ID + selfie verified" ? <Icon name="verified" size={13} color="#63A087" /> : null}</View><Text style={styles.neighborAbout} numberOfLines={1}>{person.about}</Text>{visibleStatus(person.status) ? <Text style={styles.neighborStatus} numberOfLines={1}>{statusLabel(visibleStatus(person.status))}</Text> : null}<View style={styles.neighborMeta}><Icon name="place" size={11} color="#8e8b85" /><Text style={styles.neighborMetaText}>{person.locality}</Text>{person.verification === "Phone verified" ? <Text style={styles.phoneOnlyLabel}>Phone</Text> : null}</View><View style={styles.commonInterestTags}>{sharedInterests.slice(0, 2).map((tag) => <View key={tag} style={styles.commonInterestTag}><Icon name="auto-awesome" size={9} color="#83721f" /><Text style={styles.commonInterestTagText}>{tag}</Text></View>)}</View></Pressable>{personRelationship === "request-received" ? <Pressable accessibilityLabel={`Accept ${person.name}'s friend request`} onPress={() => acceptRequest(person.id)} style={styles.compactRequestButton}><Icon name="check" size={13} color="#5C8A76" /><Text style={[styles.compactRequestText, styles.requestSentText]}>Accept</Text></Pressable> : <Pressable accessibilityLabel={sent ? "Friend request sent" : `Ask ${person.name} for friendship`} onPress={() => sendFriendRequest(person)} style={[styles.compactRequestButton, sent && styles.requestSentButton]}><Icon name={sent ? "check" : "person-add-alt-1"} size={13} color={sent ? "#5C8A76" : "#83721f"} /><Text style={[styles.compactRequestText, sent && styles.requestSentText]}>{sent ? "Sent" : "Request"}</Text></Pressable>}</Frosted>; })}
      {discoverable && filteredSuggestions.length === 0 ? <View style={styles.noMatches}><Icon name="search-off" size={17} color="#83721f" /><Text style={styles.noMatchesText}>No neighbors match those filters yet.</Text></View> : null}</View>
      <Frosted style={styles.noPressureCard}><View style={styles.noPressureIcon}><Icon name="favorite-border" size={16} color="#83721f" /></View><View style={{ flex: 1 }}><Text style={styles.noPressureTitle}>No open DMs, no awkwardness.</Text><Text style={styles.noPressureText}>Chat starts only after you both accept. Declining is quiet.</Text></View></Frosted>
      </View>
  </>;

  const renderMeetups = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>EASY COMPANY, NEARBY</Text><Text style={styles.pageTitle}>A plan makes it easy.</Text><Text style={styles.pageSub}>Small, friendly gatherings you can join at your own pace.</Text></View>
    <Frosted style={styles.meetupIntroCard}><View style={styles.meetupIntroArt}><View style={styles.artBubblePink} /><View style={styles.artBubbleBlue} /><View style={styles.artCenter}><Icon name="diversity-3" size={22} color="#83721f" /></View></View><View style={{ flex: 1 }}><Text style={styles.meetupIntroTitle}>Better in good company.</Text><Text style={styles.meetupIntroCopy}>Meet in public, bring a friend, leave whenever you like.</Text></View><Icon name="verified-user" size={18} color="#6F9C88" /></Frosted>
    <View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>COMING UP</Text><Text style={styles.sectionTitle}>Plans near you</Text></View><Pressable onPress={() => feedback("Meetups are shown by your saved home locality.")} style={styles.locationChip}><Icon name="place" size={13} color="#83721f" /><Text style={styles.locationChipText}>Pacific Heights</Text></Pressable></View>
    {sharedPlans.length ? <><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>YOUR PLANS</Text><Text style={styles.sectionTitle}>Follow-ups from chats</Text></View></View>
      <View style={styles.planFollowList}>{sharedPlans.map(({ chatId, chatName, card }) => { const timing = planTiming(card); return <Frosted key={card.id} style={styles.planFollowCard}><View style={styles.planFollowTop}><View style={styles.planFollowPill}><Text style={styles.planFollowPillText}>{PLAN_KIND_LABEL[card.kind].toUpperCase()}</Text></View><Text style={[styles.planFollowTiming, timing.emphasis === "today" && styles.planFollowTimingToday]}>{timing.label}</Text></View><Text style={styles.planFollowTitle} numberOfLines={1}>{card.title}</Text><View style={styles.meetupPlace}><Icon name="place" size={13} color="#95928c" /><Text style={styles.meetupPlaceText} numberOfLines={1}>{card.proposal.place}</Text></View><View style={styles.meetupPlace}><Icon name="schedule" size={13} color="#95928c" /><Text style={styles.meetupPlaceText}>{card.proposal.date} · {card.proposal.time}</Text></View><View style={styles.planFollowActions}><Pressable onPress={() => startThread(chatId)} style={styles.planFollowButton}><Text style={styles.planFollowButtonText}>Open chat</Text></Pressable><Pressable onPress={() => feedback(`Plan link copied: ${card.link}`)} style={styles.planFollowGhost}><Icon name="link" size={14} color="#8c887f" /></Pressable>{canCheckIn(card) ? <Pressable onPress={() => feedback(checkInSafetyNote(chatName))} style={styles.planFollowCheckIn}><Text style={styles.planFollowCheckInText}>Check in</Text></Pressable> : null}</View><Text style={styles.planFollowWho} numberOfLines={1}>with {chatName.split(" ")[0]} · {card.status}</Text></Frosted>; })}</View></> : null}
    <View style={styles.meetupList}>{meetups.map((meetup) => { const going = joinedMeetups.includes(meetup.id); return <Frosted key={meetup.id} style={styles.meetupCard}><Image source={meetup.image} style={styles.meetupPhoto} resizeMode="cover" /><View style={styles.meetupCopy}><Text style={styles.meetupDay}>{meetup.day}</Text><Text style={styles.meetupTitle}>{meetup.title}</Text><View style={styles.meetupPlace}><Icon name="place" size={13} color="#95928c" /><Text style={styles.meetupPlaceText}>{meetup.place}</Text></View><View style={styles.meetupMeta}><Icon name="groups" size={13} color="#83721f" /><Text style={styles.meetupMetaText}>{meetup.people}</Text><View style={styles.metaDivider} /><Text style={styles.meetupTag}>{going ? "You're on the list" : meetup.tag}</Text></View></View><Pressable onPress={() => { if (!going && !allowAction("join-meetups")) return; setJoinedMeetups((current) => going ? current.filter((id) => id !== meetup.id) : [...current, meetup.id]); if (!going) void runGuardedAction("meetup-join", { meetup: meetup.title }); feedback(going ? "RSVP removed quietly." : "You are on the list. Keep it easy."); }} style={[styles.rsvpButton, going && styles.rsvpJoined]}><Text style={[styles.rsvpText, going && styles.rsvpTextJoined]}>{going ? "Going" : "Join"}</Text></Pressable></Frosted>; })}
      <Pressable onPress={prepareMeetupInvite} style={styles.createPlanLink}><Icon name="add-circle-outline" size={18} color="#83721f" /><Text style={styles.createPlanText}>Create a meetup invite</Text><Icon name="arrow-forward" size={15} color="#83721f" /></Pressable>
    </View>
  </>;

  const renderYou = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>YOUR PLACE IN THE CIRCLE</Text><Text style={styles.pageTitle}>{joined ? `A little more you, ${fullName.split(" ")[0]}.` : "Settle in, when you're ready."}</Text><Text style={styles.pageSub}>You decide when you&apos;re around, and what you share.</Text></View>
    {joined ? <Frosted style={styles.profileCard}><View style={styles.profileAvatarFrame}>{myProfile.photos.length ? <Image source={{ uri: myProfile.photos.find((photo) => photo.id === myProfile.primaryPhotoId)?.uri ?? myProfile.photos[0].uri }} style={styles.profileAvatarPhoto} /> : <View style={styles.profileAvatar}><Text style={styles.profileInitial}>{(myProfile.name || fullName).charAt(0).toUpperCase()}</Text></View>}{myProfile.verification === "id-selfie" ? <View style={styles.profileVerifiedDot}><Icon name="check" size={11} color="#4A4210" /></View> : null}</View><Text style={styles.profileName}>{myProfile.name || fullName}{myProfile.age ? `, ${myProfile.age}` : ""}</Text>{visibleStatus(myProfile.status) ? <View style={styles.profileStatusChip}><View style={styles.profileStatusDot} /><Text style={styles.profileStatusText} numberOfLines={1}>{statusLabel(visibleStatus(myProfile.status))}</Text></View> : null}<View style={styles.profilePhoneBadge}><Icon name={myProfile.verification === "id-selfie" ? "verified-user" : "phone-iphone"} size={12} color={myProfile.verification === "id-selfie" ? "#5E947B" : "#788B9B"} /><Text style={styles.profilePhoneText}>{myProfile.verification === "id-selfie" ? "ID + selfie verified" : "Phone verified"}</Text></View><Text style={styles.profileLocality}><Icon name="place" size={14} color="#83721f" />  {myProfile.locality.trim() || locality.trim() || "Nearby"} · {myProfile.privacy.hideExactLocality ? "distance kept soft" : "exact locality shared"}</Text>{myProfile.bio ? <Text style={styles.profileBio}>{myProfile.bio}</Text> : null}<View style={styles.profileInterests}>{(myProfile.interests.length ? myProfile.interests : profileInterests).slice(0, 4).map((item) => <View key={item} style={styles.profileInterest}><Text style={styles.profileInterestText}>{item}</Text></View>)}</View><View style={styles.profileMetaRow}><View style={styles.profileMetaPill}><Icon name={myProfile.available ? "check-circle" : "pause-circle-outline"} size={12} color={myProfile.available ? "#5E947B" : "#8c887f"} /><Text style={styles.profileMetaText}>{myProfile.available ? "Available for a hello" : "Not available"}</Text></View><View style={styles.profileMetaPill}><Icon name="photo-library" size={12} color="#8c887f" /><Text style={styles.profileMetaText}>{myProfile.photos.length}/6 photos</Text></View><View style={styles.profileMetaPill}><Icon name="group-add" size={12} color="#8c887f" /><Text style={styles.profileMetaText}>{REQUEST_AUDIENCE_LABEL[myProfile.privacy.requestAudience]}</Text></View></View>{myProfile.verification !== "id-selfie" ? <Pressable onPress={startProfileVerification} style={styles.getVerifiedButton}><Icon name="badge" size={14} color="#4A4210" /><Text style={styles.getVerifiedText}>Get Verified</Text></Pressable> : null}<Pressable onPress={openProfileEditor} style={styles.editProfileButton}><Text style={styles.editProfileText}>Edit profile</Text><Icon name="arrow-forward" size={15} color="#83721f" /></Pressable></Frosted> : <Frosted style={styles.signupCard}><View style={styles.signupIcon}><Icon name="mark-chat-unread" size={23} color="#83721f" /></View><Text style={styles.signupTitle}>A circle that feels like yours.</Text><Text style={styles.signupCopy}>Create a standalone account with phone verification. New conversations begin only after a mutual yes.</Text><ActionButton onPress={openSignup} style={styles.signupCta}><Text style={styles.actionText}>Sign up</Text><Icon name="arrow-forward" size={15} color="#4A4210" /></ActionButton><Pressable onPress={() => { setAuthIntent("login"); setAuthStep("phone"); setShowSignup(true); tap(); }} accessibilityRole="button" accessibilityLabel="Log in with your phone number" style={({ pressed }) => [styles.guestLoginButton, pressed && styles.pressed]}><Text style={styles.guestLoginText}>Log in</Text></Pressable><View style={styles.phoneRequired}><Icon name="lock-outline" size={14} color="#8091A0" /><Text style={styles.phoneRequiredText}>Phone verification is required; your number stays private.</Text></View></Frosted>}
    {joined ? <Pressable onPress={() => setSelfieModalVisible(true)} style={({ pressed }) => [styles.selfieEntry, pressed && styles.pressed]}><View style={styles.selfieEntryIcon}><Icon name="face-retouching-natural" size={17} color="#83721f" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Optional selfie identity check</Text><Text style={styles.settingSub}>Capture locally · verified badge only after provider review.</Text></View><Icon name="chevron-right" size={18} color="#a4a19b" /></Pressable> : null}
    <Text style={styles.settingsLabel}>HOW YOU SHOW UP</Text>
    <Frosted style={styles.settingsPanel}>
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="circle" size={16} color="#75A98F" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Available for a hello</Text><Text style={styles.settingSub}>Let accepted friends know you&apos;re around.</Text></View><View style={styles.toggleFrame}><Switch value={available} onValueChange={(value) => { setAvailable(value); tap(); feedback(value ? "You're showing as available." : "Available status paused."); }} trackColor={{ false: "#dddace", true: "#B8D9CA" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="visibility-off" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Appear in suggestions</Text><Text style={styles.settingSub}>You can pause discovery any time.</Text></View><View style={styles.toggleFrame}><Switch value={discoverable} onValueChange={(value) => { setDiscoverable(value); tap(); feedback(value ? "You&apos;re back in suggestions." : "You&apos;ve been hidden from suggestions."); }} trackColor={{ false: "#dddace", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      {/* Exact distance is a Premium feature, so turning the softening off offers the upgrade. */}
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="my-location" size={17} color="#83721f" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Soften my distance</Text><Text style={styles.settingSub}>Show a broad area, never an exact pin.</Text></View><View style={styles.toggleFrame}><Switch value={blurDistance} onValueChange={(value) => { if (!value) { const mapPermission = liveMapGate(tier); if (!mapPermission.allowed) { openPaywall(mapPermission.message, "quarterly"); return; } } setBlurDistance(value); tap(); feedback(value ? "Approximate distance is on." : "Exact distance is visible now."); }} trackColor={{ false: "#dddace", true: "#e3d075" }} thumbColor="#FFFFFF" /></View></View>
    </Frosted>
    <Text style={styles.settingsLabel}>PRIVACY & LITTLE EXTRAS</Text>
    <Frosted style={styles.settingsPanel}>
      <Pressable onPress={() => feedback("Safety center · report, block, and meetup reminders.")} style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="shield" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Safety center</Text><Text style={styles.settingSub}>Report, block, and meetup comfort.</Text></View><Icon name="chevron-right" size={18} color="#a4a19b" /></Pressable>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="contacts" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Let people find me by phone</Text><Text style={styles.settingSub}>{joined ? "Only members who choose to check contacts can find you. Off until you opt in." : "Log in to choose whether contacts can find you."}</Text></View><View style={styles.toggleFrame}><Switch accessibilityLabel="Allow other Trufrenz members to find me by phone contact" value={joined ? contactDiscoveryEnabled : false} disabled={!joined || contactPreferenceBusy} onValueChange={(value) => void updateContactDiscoveryPreference(value)} trackColor={{ false: "#dddace", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      {/*
        Quiet hours, above the subscription row because it applies to everyone
        rather than to a paid tier. The switch is the whole feature; the two
        hours underneath only appear once it is on, so the row stays one line for
        the members who never want it.
      */}
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="bedtime" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Quiet hours</Text><Text style={styles.settingSub}>{describeQuietHours(quietHours)}</Text>{quietHours.enabled ? <View style={styles.quietHoursControls}><Pressable accessibilityRole="button" accessibilityLabel={`Set quiet hours to start at ${hourLabel(quietHours.startHour)}`} onPress={() => { setQuietHours((current) => ({ ...current, startHour: shiftHour(current.startHour, -1) })); tap(); }} style={styles.quietHourButton}><Icon name="remove" size={13} color="#527084" /></Pressable><Text style={styles.quietHourValue}>Starts {hourLabel(quietHours.startHour)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Set quiet hours to start at ${hourLabel(shiftHour(quietHours.startHour, 1))}`} onPress={() => { setQuietHours((current) => ({ ...current, startHour: shiftHour(current.startHour, 1) })); tap(); }} style={styles.quietHourButton}><Icon name="add" size={13} color="#527084" /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Set quiet hours to end at ${hourLabel(quietHours.endHour)}`} onPress={() => { setQuietHours((current) => ({ ...current, endHour: shiftHour(current.endHour, -1) })); tap(); }} style={styles.quietHourButton}><Icon name="remove" size={13} color="#527084" /></Pressable><Text style={styles.quietHourValue}>Ends {hourLabel(quietHours.endHour)}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Set quiet hours to end at ${hourLabel(shiftHour(quietHours.endHour, 1))}`} onPress={() => { setQuietHours((current) => ({ ...current, endHour: shiftHour(current.endHour, 1) })); tap(); }} style={styles.quietHourButton}><Icon name="add" size={13} color="#527084" /></Pressable></View> : null}</View><View style={styles.toggleFrame}><Switch value={quietHours.enabled} onValueChange={(value) => { setQuietHours((current) => ({ ...current, enabled: value })); tap(); feedback(value ? `Quiet from ${hourLabel(quietHours.startHour)} to ${hourLabel(quietHours.endHour)}.` : "Quiet hours off. Notifications can reach you again."); }} trackColor={{ false: "#dddace", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      <Pressable onPress={() => { tap(); if (paidTier) { setManageOpen(true); } else { openPaywall(undefined, subscription.planId); } }} accessibilityRole="button" accessibilityLabel={paidTier ? `Manage Trufrenz Premium, ${tierLabel(tier)}` : "Upgrade to Trufrenz Premium"} style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="workspace-premium" size={17} color="#83721f" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{paidTier ? "Trufrenz Premium" : "A little more Trufrenz"}</Text><Text style={styles.settingSub}>{paidTier ? `${activePlanLine(subscription)} · manage` : "Calls, live map, and read receipts · from ₹49"}</Text></View><View style={[styles.tierPill, paidTier && styles.tierPillActive]}><Text style={[styles.tierPillText, paidTier && styles.tierPillTextActive]}>{tierLabel(tier)}</Text></View></Pressable><Pressable onPress={() => { setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: "Maya Chen", peerVerified: true, video: false, direction: "incoming" })); tap(); }} accessibilityRole="button" accessibilityLabel="Preview an incoming call screen" style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="call" size={17} color="#7393A8" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Preview an incoming call</Text><Text style={styles.settingSub}>Caller photo, verified badge, Accept or Decline</Text></View><Icon name="chevron-right" size={17} color="#a5a49e" /></Pressable>
    </Frosted>
    <Text style={styles.settingsLabel}>APPEARANCE</Text>
    {/*
      Account notices.
      Warnings, verification outcomes, and announcements from the safety team
      are delivered to the account, along with billing reminders before a
      subscription period ends. They are listed here where the member can read
      them at their own pace and mark them as read.
    */}
    {memberNotices.length > 0 ? (
      <Frosted style={styles.appearancePanel}>
        <View style={styles.appearanceHeadingRow}>
          <View style={styles.settingIconPink}><Icon name="campaign" size={17} color="#83721f" /></View>
          <View style={styles.settingContent}>
            <Text style={styles.settingTitle}>Notices for you</Text>
            <Text style={styles.settingSub}>
              {unreadNotices.length > 0
                ? `${unreadNotices.length} unread · safety and billing`
                : "Everything here has been read."}
            </Text>
          </View>
          {unreadNotices.length > 0 ? (
            <Pressable
              accessibilityLabel="Mark all notices as read"
              onPress={() => {
                const ids = unreadNotices.map((notice) => notice.id);
                void markNoticesRead(ids);
                setMemberNotices((current) =>
                  current.map((notice) => ({ ...notice, readAt: notice.readAt ?? new Date().toISOString() })),
                );
                feedback("Notices marked as read.");
                tap();
              }}
              style={({ pressed }) => [styles.noticeMarkButton, pressed && styles.pressed]}
            >
              <Text style={styles.noticeMarkText}>Mark read</Text>
            </Pressable>
          ) : null}
        </View>
        {memberNotices.slice(0, 4).map((notice) => (
          <View key={notice.id} style={styles.noticeRow}>
            <View style={[styles.noticeDot, notice.readAt ? styles.noticeDotRead : null]} />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeBody} numberOfLines={3}>{notice.body}</Text>
              <Text style={styles.noticeMeta}>
                {new Date(notice.createdAt).toLocaleDateString()} · {notice.kind.replace(/_/g, " ")}
              </Text>
              {/*
                Only the notices with something to *do* in the store offer a
                button. A courtesy "renews in 3 days — nothing you need to do"
                notice must not carry one: sending a member to a cancel screen
                they did not ask for is how a helpful tip becomes a cancellation.
              */}
              {noticeOffersStoreLink(notice.kind, notice.body) &&
              (notice.kind === "subscription_expired" || noticeIsCancelledRenewal(notice.body)) ? (
                <Pressable
                  onPress={() => void openStoreManagement()}
                  accessibilityRole="button"
                  accessibilityLabel={storeManageActionLabel(Platform.OS)}
                  style={({ pressed }) => [styles.noticeStoreAction, pressed && styles.pressed]}
                >
                  <MaterialIcons name="open-in-new" size={13} color="#83721f" />
                  <Text style={styles.noticeStoreActionText}>{storeManageActionLabel(Platform.OS)}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Frosted>
    ) : null}

    <Frosted style={styles.appearancePanel}>
      <View style={styles.appearanceHeadingRow}><View style={styles.settingIconPink}><Icon name="blur-on" size={17} color="#83721f" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Frosted glass opacity</Text><Text style={styles.settingSub}>Choose how much of the wallpaper shows through.</Text></View><Text style={styles.opacityReadout}>{glassOpacity}%</Text></View>
      <View accessibilityLabel="Glass presets" style={styles.presetRow}>
        {GLASS_PRESETS.map((preset) => {
          const selected = matchGlassPreset(glassOpacity, glassTintChoice) === preset.id;
          return (
            <Pressable
              key={preset.id}
              onPress={() => { setGlassOpacity(preset.glassOpacity); setGlassTint(preset.glassTint); tap(); feedback(`${preset.label} glass applied`); }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Use the ${preset.label} glass preset`}
              style={({ pressed }) => [styles.presetButton, selected && styles.presetButtonActive, pressed && styles.pressed]}
            >
              <Text style={[styles.presetLabel, selected && styles.presetLabelActive]}>{preset.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View accessibilityLabel="Frosted glass opacity presets" style={styles.opacityOptions}>
        {GLASS_OPACITY_STEPS.map((value) => {
          const selected = value === glassOpacity;
          return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Set frosted glass opacity to ${value} percent`} onPress={() => { setGlassOpacity(value); tap(); feedback(`Frosted glass opacity set to ${value}%.`); }} style={({ pressed }) => [styles.opacityOption, selected && styles.opacityOptionActive, pressed && styles.pressed]}><Text style={[styles.opacityOptionText, selected && styles.opacityOptionTextActive]}>{value}%</Text></Pressable>;
        })}
      </View>
      <View style={styles.opacityScaleCaption}><Text style={styles.opacityScaleText}>More wallpaper</Text><Text style={styles.opacityScaleText}>More opaque</Text></View>
      <View style={styles.settingDivider} />
      {/*
        The glass cast. Sky is the cool blue-white of the reference sheet; lemon
        keeps the app's warm accent family. Each chip shows the colour it sets,
        so the choice reads at a glance rather than needing a preview.
      */}
      <View style={styles.tintRow}>
        <View style={styles.settingContent}><Text style={styles.settingTitle}>Glass colour</Text><Text style={styles.settingSub}>The cast your frosted surfaces take from the wallpaper.</Text></View>
        <View accessibilityLabel="Frosted glass colour" style={styles.tintOptions}>
          {GLASS_TINT_OPTIONS.map((option) => {
            const selected = option === glassTintChoice;
            const swatch = glassSwatch(option);
            return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Set frosted glass colour to ${option}`} onPress={() => { setGlassTint(option); tap(); feedback(`Glass colour set to ${option}.`); }} style={({ pressed }) => [styles.tintOption, selected && styles.tintOptionActive, pressed && styles.pressed]}><View style={[styles.tintSwatch, { backgroundColor: swatch, borderColor: glassSwatchEdge(option) }]} /><Text style={[styles.tintOptionText, selected && styles.tintOptionTextActive]}>{option === "sky" ? "Sky" : "Lemon"}</Text></Pressable>;
          })}
        </View>
      </View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="wallpaper" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Show wallpaper</Text><Text style={styles.settingSub}>Use the soft photo backdrop across the app.</Text></View><View style={styles.toggleFrame}><Switch accessibilityLabel="Show wallpaper" value={wallpaperVisible} onValueChange={(value) => { setWallpaperVisible(value); tap(); feedback(value ? "Wallpaper is visible." : "Wallpaper is hidden."); }} trackColor={{ false: "#dddace", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
    </Frosted>
    <Text style={styles.settingsLabel}>ACCOUNT</Text>
    <Frosted style={styles.settingsPanel}>
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="person-outline" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{isGuestSession(session) ? "Guest preview" : "Signed in"}</Text><Text style={styles.settingSub}>{isGuestSession(session) ? "Browse-only mode · join any time to chat and meet up." : `Phone verified${fullName.trim() ? ` · ${fullName.trim()}` : ""}`}</Text></View><View style={styles.verificationPill}><Icon name={isGuestSession(session) ? "visibility" : "verified"} size={12} color="#588B79" /><Text style={styles.verificationText}>{isGuestSession(session) ? "Guest" : "Member"}</Text></View></View>
      <View style={styles.settingDivider} />
      <Pressable onPress={() => { if (isGuestSession(session)) { setAuthIntent("signup"); setAuthStep("phone"); setShowSignup(true); } else { signOut(); } }} accessibilityRole="button" accessibilityLabel={isGuestSession(session) ? "Create an account" : "Sign out"} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}><View style={styles.settingIconPink}><Icon name={isGuestSession(session) ? "person-add" : "logout"} size={17} color="#83721f" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{isGuestSession(session) ? "Create your account" : "Sign out"}</Text><Text style={styles.settingSub}>{isGuestSession(session) ? "Sign up to chat, request friends, and join meetups." : "Return to the welcome screen on this device."}</Text></View><Icon name="chevron-right" size={18} color="#a4a19b" /></Pressable>
    </Frosted>
    <Text style={styles.footerNote}>Your space. Your pace. Always friends first.</Text>
  </>;

  /* The tab bar's weight follows whichever tab is showing. */
  const tabAccent: TabAccent | null =
    selectedChat !== null
      ? null
      : tab === "Chats"
        ? "chats"
        : tab === "Friends"
          ? "friends"
          : tab === "Meetups"
            ? "meetups"
            : "you";

  const renderContent = () => {
    if (tab === "Chats") return renderChats();
    if (tab === "Friends") return renderFriends();
    if (tab === "Meetups") return renderMeetups();
    return renderYou();
  };

  const showWelcome = sessionLoaded && shouldShowWelcome(session);
  /*
   * The tab bar and the ad banner share one decision. They sit in the same band
   * at the bottom of the screen, so deriving them separately is how they drifted
   * apart and left a reserved strip under the composer in a conversation.
   */
  const bottomBarVisible = shouldShowBottomBar({ hasOpenChat: Boolean(selectedChat), keyboardHeight });

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F7" />
      {showWelcome ? (
        <WelcomeScreen
          onSignUp={openSignup}
          onLogIn={() => { setAuthIntent("login"); setAuthStep("phone"); setShowSignup(true); }}
          onContinueAsGuest={enterAsGuest}
        />
      ) : null}
      {showWelcome ? null : <View style={[styles.backgroundImageWrap, styles.noninteractive]}><Image source={require("../../assets/images/kindred-background.jpg")} style={[styles.backgroundImage, { opacity: wallpaperVisible ? 0.62 : 0 }]} resizeMode="cover" /></View>}
      {showWelcome ? null : <>
      <View style={[styles.backgroundWash, styles.noninteractive]} />
      <View style={[styles.headingScrim, styles.noninteractive]} />
      <View style={[styles.ambient, styles.noninteractive]}><View style={styles.ambientPink} /><View style={styles.ambientBlue} /><View style={styles.ambientLilac} /></View> </>}
      <CallScreen
        session={callSession}
        groupLabel={callSession && selectedChat && currentThread?.kind === "group" ? currentThread.name : null}
        onAccept={() => setCallSession((current) => (current ? answerCall(current) : null))}
        onDecline={() => { setCallSession((current) => (current ? declineCall(current) : null)); feedback("Call declined quietly. They are not told twice."); setTimeout(() => setCallSession(null), 900); }}
        onEnd={() => { setCallSession((current) => (current ? endCall(current) : null)); setTimeout(() => setCallSession(null), 500); }}
      />
      {showWelcome ? null : <IncomingNotificationBanner notification={incomingNotification} onOpen={openIncomingNotification} onDismiss={dismissIncomingNotification} />}
      <PremiumPaywall
        visible={paywallOpen}
        subscription={subscription}
        initialPlanId={paywallPlan}
        reason={paywallReason}
        onClose={() => setPaywallOpen(false)}
        onPurchase={(planId) => {
          // Store first, server second: the tier only moves once the receipt is
          // verified, so a failed charge never unlocks Premium.
          void completeStorePurchase(planId);
        }}
        purchase={purchase}
        storePrices={storePrices}
      />
      {/*
        Manage Subscription.
        Premium members land here from the same row that sells the plan, so the
        place they upgraded from is the place they manage it.
      */}
      <ManageSubscriptionModal
        visible={manageOpen}
        subscription={subscription}
        receipts={receipts}
        channel={storeChannel}
        verification={verification}
        restore={restore}
        restoring={restoring}
        onClose={() => setManageOpen(false)}
        onChangePlan={(planId) => {
          setManageOpen(false);
          openPaywall(undefined, planId);
        }}
        onRestore={() => void restoreStorePurchases()}
        onReportCancelled={reportCancellation}
      />
      {showWelcome ? null : <Animated.View style={[styles.screenContent, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>{tab === "Chats" && selectedChat ? renderContent() : <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={tab === "Friends" || tab === "Meetups" ? <RefreshControl refreshing={isRefreshing} onRefresh={refreshNearbyFeed} tintColor="#83721f" colors={["#83721f", "#87AEBF"]} progressBackgroundColor="#fcfaf2" /> : undefined}>{renderContent()}</ScrollView>}</Animated.View>}
      {isRefreshing ? <View style={styles.refreshGlass} pointerEvents="none"><BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} /><View style={styles.refreshGlassContent}><ActivityIndicator size="small" color="#83721f" /><Text style={styles.refreshGlassText}>Refreshing your nearby circle</Text></View></View> : null}
      {transitionBusy ? <View style={styles.handoffOverlay} pointerEvents="none"><BlurView intensity={25} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.handoffBlur}><View style={styles.handoffCard}><View style={styles.handoffHeadline}><ActivityIndicator size="small" color="#83721f" /><Text style={styles.handoffTitle}>{tab === "Meetups" ? "Finding a plan nearby" : "Back to your conversations"}</Text></View><Animated.View style={[styles.handoffSkeleton, { opacity: loaderPulse }]}><View style={styles.skeletonAvatar} /><View style={styles.skeletonTextGroup}><View style={styles.skeletonLineLong} /><View style={styles.skeletonLineShort} /></View></Animated.View><Text style={styles.handoffCaption}>A little closer, one moment.</Text></View></BlurView></View> : null}
      {toast ? <View style={styles.toast}><Icon name="check-circle" size={16} color="#4A4210" /><Text style={styles.toastText}>{toast}</Text></View> : null}
      {/*
        Account status notice.

        A suspension or ban is a decision the member is entitled to see, so it
        is shown here in the words the safety team used rather than being
        buried in a settings screen. Warnings stay quieter: they are visible in
        the profile tab but do not interrupt the member's use of the app.
      */}
      {restriction && requiresAccountNotice(accountState!) ? (
        <View style={styles.accountNotice} accessibilityRole="alert" accessibilityLabel={`Account status: ${restriction.title}`}>
          <View style={styles.accountNoticeHeader}>
            <View style={styles.accountNoticeIcon}>
              <Icon name="shield-moon" size={18} color="#83721f" />
            </View>
            <Text style={styles.accountNoticeTitle}>{restriction.title}</Text>
          </View>
          <Text style={styles.accountNoticeBody}>{restriction.body}</Text>
          {accountState?.statusReason ? (
            <Text style={styles.accountNoticeReason}>Reason: {accountState.statusReason}</Text>
          ) : null}
          <Text style={styles.accountNoticeAllowed}>{restriction.stillAllowed}</Text>
          <Pressable
            onPress={() => {
              setTab("You");
              if (unreadNotices.length > 0) void markNoticesRead(unreadNotices.map((notice) => notice.id));
              setMemberNotices((current) =>
                current.map((notice) => ({ ...notice, readAt: notice.readAt ?? new Date().toISOString() })),
              );
              tap();
            }}
            accessibilityLabel="Open my account notices"
            style={({ pressed }) => [styles.accountNoticeAction, pressed && styles.pressed]}
          >
            <Text style={styles.accountNoticeActionText}>
              {unreadNotices.length > 0 ? `Read ${unreadNotices.length} notice${unreadNotices.length > 1 ? "s" : ""}` : "Review my account"}
            </Text>
            <Icon name="chevron-right" size={16} color="#83721f" />
          </Pressable>
        </View>
      ) : null}
      {showWelcome || adDismissed || !entitlements.ads || !bottomBarVisible ? null : (
        <View style={styles.adBanner}>
          <Icon name="workspace-premium" size={15} color="#83721f" />
          <Text style={styles.adBannerText} numberOfLines={2}>{BANNER_AD_COPY}</Text>
          <Pressable onPress={() => { tap(); openPaywall(undefined, "quarterly"); }} accessibilityRole="button" accessibilityLabel="See Trufrenz Premium plans" style={({ pressed }) => [styles.adBannerCta, pressed && styles.pressed]}>
            <Text style={styles.adBannerCtaText}>See plans</Text>
          </Pressable>
          <Pressable onPress={() => { setAdDismissed(true); tap(); }} accessibilityRole="button" accessibilityLabel="Dismiss advertisement" hitSlop={8} style={({ pressed }) => [styles.adBannerClose, pressed && styles.pressed]}>
            <Icon name="close" size={14} color="#83721f" />
          </Pressable>
        </View>
      )}
      {/* The bar carries a slightly different weight per tab, because the content
          behind it ranges from dense chat rows to open wallpaper. */}
      {showWelcome || !bottomBarVisible ? null : <View style={[styles.bottomBar, { backgroundColor: tabBarTint(tabAccent, glassOpacity, glassTintChoice), borderTopColor: glassEdge("tab", glassTintChoice) }]}><BlurView intensity={glassBlur("tab")} tint="light" experimentalBlurMethod="dimezisBlurView" style={[StyleSheet.absoluteFillObject, styles.noninteractive]} /><View pointerEvents="none" style={[styles.glassSheen, { backgroundColor: glassVeil("tab", glassOpacity, glassTintChoice) }]} />{(["Chats", "Friends", "Meetups", "You"] as Tab[]).map((item) => { const active = tab === item && !selectedChat; const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Chats: "forum", Friends: "diversity-3", Meetups: "event-available", You: "person-outline" }; return <Pressable key={item} onPress={() => { setTab(item); if (item !== "Chats") setSelectedChat(null); tap(); }} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Icon name={iconName[item]} color={active ? "#83721f" : "#999892"} size={19} /></View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item}</Text></Pressable>; })}</View>}
      <Modal visible={navigationMenuOpen} transparent animationType="fade" onRequestClose={() => setNavigationMenuOpen(false)}>
        <Pressable style={[styles.navigationMenuShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={() => setNavigationMenuOpen(false)}>
          <BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.navigationMenuBlur, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.92)"), glassOpacity) }]}>
            <Pressable onPress={(event) => event.stopPropagation()} style={[styles.navigationMenuCard, { maxHeight: modalLayout.maxHeight - 2, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.87)"), glassOpacity) }]}>
              <ScrollView style={styles.navigationMenuScroll} contentContainerStyle={styles.navigationMenuContent} showsVerticalScrollIndicator={false}>
              <View style={styles.actionMenuHandle} />
              <View style={styles.navigationMenuHeader}><View><Text style={styles.actionMenuEyebrow}>MOVE AROUND</Text><Text style={styles.navigationMenuTitle}>Where would you like to go?</Text></View><Pressable onPress={() => setNavigationMenuOpen(false)} accessibilityLabel="Close navigation options" style={styles.roundAction}><Icon name="close" size={18} color="#726e59" /></Pressable></View>
              <View style={styles.navigationMenuGrid}>{(["Chats", "Friends", "Meetups", "You"] as Tab[]).map((item) => { const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Chats: "forum", Friends: "diversity-3", Meetups: "event-available", You: "person-outline" }; const active = tab === item && !selectedChat; return <Pressable key={item} onPress={() => navigateFromMenu(item)} accessibilityRole="button" accessibilityLabel={`Go to ${item}`} style={({ pressed }) => [styles.navigationMenuItem, { width: modalLayout.compact ? "100%" : "48%", minHeight: modalLayout.compact ? 50 : 58 }, active && styles.navigationMenuItemActive, pressed && styles.pressed]}><View style={[styles.navigationMenuIcon, active && styles.navigationMenuIconActive]}><Icon name={iconName[item]} size={20} color={active ? "#FFFFFF" : "#83721f"} /></View><Text style={[styles.navigationMenuItemText, active && styles.navigationMenuItemTextActive]}>{item === "Chats" ? "Conversations" : item === "You" ? "Profile" : item}</Text></Pressable>; })}</View>
              <Text style={styles.navigationMenuHint}>Your phone’s Back button also closes sheets, returns from a chat, and takes you back to Conversations.</Text>
              </ScrollView>
            </Pressable>
          </BlurView>
        </Pressable>
      </Modal>
      <Modal visible={showSignup} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSignup}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}><View style={styles.brandMark}><View style={styles.brandIcon}><Icon name="spa" size={16} color="#4A4210" /></View><Text style={styles.brandWord}>Trufrenz</Text></View><Pressable onPress={closeSignup} accessibilityLabel="Close signup" style={styles.roundAction}><Icon name="close" size={19} color="#726e59" /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.pageEyebrow}>{authStep === "phone" ? (authIntent === "login" ? "WELCOME BACK" : `STEP 1 OF 4 · ${authChannel === "email" ? "EMAIL" : "PHONE"}`) : authStep === "code" ? "ONE SMALL SAFETY STEP" : authStep === "profile" ? "STEP 2 OF 4 · ABOUT YOU" : authStep === "photo" ? "STEP 3 OF 4 · YOUR PHOTO" : "STEP 4 OF 4 · ALL SET"}</Text>
              <Text style={styles.modalTitle}>{authStep === "phone" ? (authIntent === "login" ? "Log in with\nyour number." : "Your number.\nYour own account.") : authStep === "code" ? "Check your\nphone." : authStep === "profile" ? "What should friends\ncall you?" : authStep === "photo" ? "Show your\nfriendly face." : "You're ready\nto belong."}</Text>
              <Text style={styles.modalSubtitle}>{authStep === "phone" ? authChannel === "email" ? "Email verification is required. Your address is used for account recovery, never shown on your profile." : "Phone OTP verification is required. Your number is used for safety, never shown on your profile." : authStep === "code" ? (demoCode ? `No ${authChannel === "email" ? "email" : "SMS"} provider is connected yet, so your code is ${demoCode}. A live build sends this by ${authChannel === "email" ? "email" : "SMS"}.`  : authChannel === "email" ? `We emailed a 6-digit code to ${otpDestination || email || "your address"}. It expires in 10 minutes.` : `We sent a 6-digit code to ${otpDestination || phone || "your phone"}${sentTransport === "whatsapp" ? " on WhatsApp" : ""}. It expires in 10 minutes.`) : authStep === "profile" ? "Your name, date of birth, and neighborhood help nearby friends find you. Nothing here is public beyond your circle." : authStep === "photo" ? "A real photo helps people recognize you at a meetup. You can add or change it later." : "Here's what your neighbors will see. You can update everything from your profile."}</Text>
              {authStep === "phone" ? <><View style={styles.channelRow}>
                <Pressable onPress={() => { setAuthChannel("phone"); setDemoCode(null); }} style={[styles.channelButton, authChannel === "phone" && styles.channelButtonActive]}>
                  <Icon name="smartphone" size={15} color={authChannel === "phone" ? "#4A4210" : "#7A8FA0"} />
                  <Text style={[styles.channelButtonText, authChannel === "phone" && styles.channelButtonTextActive]}>Phone</Text>
                </Pressable>
                <Pressable onPress={() => { setAuthChannel("email"); setDemoCode(null); }} style={[styles.channelButton, authChannel === "email" && styles.channelButtonActive]}>
                  <Icon name="mail-outline" size={15} color={authChannel === "email" ? "#4A4210" : "#7A8FA0"} />
                  <Text style={[styles.channelButtonText, authChannel === "email" && styles.channelButtonTextActive]}>Email</Text>
                </Pressable>
              </View>
              {authChannel === "email" ? <View style={styles.formField}><Text style={styles.fieldLabel}>EMAIL ADDRESS · REQUIRED</Text><TextInput value={email} onChangeText={setEmail} placeholder="name@example.com" placeholderTextColor="#a7a6a1" keyboardType="email-address" autoCapitalize="none" style={styles.fieldInput} returnKeyType="done" /></View> : <View style={styles.formField}><Text style={styles.fieldLabel}>PHONE NUMBER · REQUIRED</Text><TextInput value={phone} onChangeText={setPhone} placeholder="+1 (415) 555-0142" placeholderTextColor="#a7a6a1" keyboardType="phone-pad" autoCapitalize="none" style={styles.fieldInput} returnKeyType="done" /></View>}<Frosted style={styles.authPromise}><View style={styles.authPromiseIcon}><Icon name="lock-outline" size={18} color="#7690A1" /></View><View style={{ flex: 1 }}><Text style={styles.authPromiseTitle}>The chat comes after the yes.</Text><Text style={styles.authPromiseCopy}>Verified members · quiet friend requests · no open DMs</Text></View></Frosted></> : null}
              {authStep === "code" ? <>
                <View style={styles.formField}><Text style={styles.fieldLabel}>6-DIGIT OTP</Text><TextInput value={passcode} onChangeText={(value) => setPasscode(value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••••" placeholderTextColor="#a7a6a1" keyboardType="number-pad" style={[styles.fieldInput, styles.codeInput]} /></View>
                {/*
                  The way out of a missing code.

                  Without this the only recourse was to go back and re-enter the
                  address, which spends the challenge and makes a member feel
                  they have broken something. Twenty seconds is a normal wait on
                  a slow SMS; a screen with no way forward is what causes people
                  to give up.
                */}
                <View style={styles.resendRow}>
                  <Text style={styles.resendPrompt}>{resendState.canResend ? "Didn't get it?" : "New code ready in"}</Text>
                  <Pressable onPress={requestNewCode} disabled={!resendState.canResend || authBusy} accessibilityRole="button" accessibilityLabel={resendLabel(resendState)} accessibilityState={{ disabled: !resendState.canResend }} style={({ pressed }) => [styles.resendButton, !resendState.canResend && styles.resendButtonDisabled, pressed && resendState.canResend && styles.pressed]}>
                    <Icon name={resendState.canResend ? "refresh" : "schedule"} size={13} color={resendState.canResend ? "#83721f" : "#8D9AA5"} />
                    <Text style={[styles.resendButtonText, !resendState.canResend && styles.resendButtonTextDisabled]}>{resendLabel(resendState)}</Text>
                  </Pressable>
                </View>
                <Text style={styles.resendHint}>Only the newest code works. Codes expire 10 minutes after they are sent.</Text>
              </> : null}
              {authStep === "profile" ? <>
                <View style={styles.formField}><Text style={styles.fieldLabel}>NAME OR NICKNAME</Text><TextInput value={fullName} onChangeText={(value) => { setFullName(value); setProfileErrors((current) => ({ ...current, name: undefined })); }} placeholder="What do people call you?" placeholderTextColor="#a7a6a1" style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.name ? <Text style={styles.fieldError}>{profileErrors.name}</Text> : null}
                <View style={styles.formField}><Text style={styles.fieldLabel}>DATE OF BIRTH · ADULTS ONLY</Text><TextInput value={dateOfBirth} onChangeText={(value) => { setDateOfBirth(value); setProfileErrors((current) => ({ ...current, dateOfBirth: undefined })); }} placeholder="1996-04-18 or 04/18/1996" placeholderTextColor="#a7a6a1" keyboardType={Platform.OS === "web" ? "default" : "numbers-and-punctuation"} style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.dateOfBirth ? <Text style={styles.fieldError}>{profileErrors.dateOfBirth}</Text> : <Text style={styles.fieldHint}>{dateOfBirth && parseDateOfBirth(dateOfBirth) ? `Age ${ageFromDateOfBirth(parseDateOfBirth(dateOfBirth)!)} · shown as an age, never your birth date.` : "We show your age, never your exact birth date."}</Text>}
                <View style={styles.formField}><Text style={styles.fieldLabel}>LOCALITY</Text><TextInput value={locality} onChangeText={(value) => { setLocality(value); setProfileErrors((current) => ({ ...current, locality: undefined })); }} placeholder="Your neighborhood" placeholderTextColor="#a7a6a1" style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.locality ? <Text style={styles.fieldError}>{profileErrors.locality}</Text> : null}
                <View style={styles.suggestionRow}>{LOCALITY_SUGGESTIONS.slice(0, 4).map((item) => <Pressable key={item} onPress={() => { setLocality(item); setProfileErrors((current) => ({ ...current, locality: undefined })); tap(); }} style={[styles.suggestionChip, locality === item && styles.suggestionChipActive]}><Text style={[styles.suggestionChipText, locality === item && styles.suggestionChipTextActive]}>{item}</Text></Pressable>)}</View>
                <View style={styles.formField}><Text style={styles.fieldLabel}>EMAIL FOR RECOVERY · OPTIONAL</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#a7a6a1" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.fieldInput} /></View>
                <Text style={styles.fieldLabel}>THINGS YOU ENJOY · PICK UP TO 4</Text>
                <View style={styles.interestOptions}>{INTEREST_SUGGESTIONS.map((item) => { const selected = profileInterests.includes(item); return <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Interest ${item}`} onPress={() => { setProfileInterests((current) => toggleProfileInterest(current, item)); setProfileErrors((current) => ({ ...current, interests: undefined })); tap(); }} style={[styles.interestOption, selected && styles.interestOptionActive]}><Text style={[styles.interestOptionText, selected && styles.interestOptionTextActive]}>{item}</Text></Pressable>; })}</View>
                {profileErrors.interests ? <Text style={styles.fieldError}>{profileErrors.interests}</Text> : null}
                <View style={styles.verifiedNote}><Icon name="phone-iphone" size={15} color="#7A8FA0" /><Text style={styles.verifiedNoteText}>Phone verified. Add a selfie or ID later for a stronger badge.</Text></View>
              </> : null}
              {authStep === "photo" ? <>
                <Pressable onPress={pickProfilePhoto} accessibilityRole="button" accessibilityLabel="Choose a profile photo" style={({ pressed }) => [styles.photoPicker, pressed && styles.pressed]}>
                  {profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Icon name="add-a-photo" size={26} color="#83721f" /></View>}
                  <Text style={styles.photoPickerText}>{profilePhoto ? "Change photo" : "Choose from your library"}</Text>
                  <Text style={styles.photoPickerHint}>Square photos look best. Nothing is shared until you accept a friend.</Text>
                </Pressable>
                <View style={styles.photoSafety}><Icon name="visibility" size={15} color="#7A8FA0" /><Text style={styles.photoSafetyText}>Only accepted friends see your photo. You can hide it from suggestions any time.</Text></View>
              </> : null}
              {authStep === "about" ? <>
                <Frosted style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    {profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.summaryAvatar} /> : <View style={styles.summaryAvatarFallback}><Text style={styles.summaryAvatarText}>{(fullName.trim().charAt(0) || "T").toUpperCase()}</Text></View>}
                    <View style={{ flex: 1 }}><Text style={styles.summaryName}>{fullName.trim() || "Your name"}</Text><Text style={styles.summaryMeta}>{locality.trim() || "Your neighborhood"} · {dateOfBirth && parseDateOfBirth(dateOfBirth) ? `${ageFromDateOfBirth(parseDateOfBirth(dateOfBirth)!)} yrs` : "Age hidden"}</Text></View>
                    <View style={styles.verificationPill}><Icon name="phone-iphone" size={12} color="#588B79" /><Text style={styles.verificationText}>Phone verified</Text></View>
                  </View>
                  <View style={styles.summaryTags}>{profileInterests.map((item) => <View key={item} style={styles.summaryTag}><Text style={styles.summaryTagText}>{item}</Text></View>)}</View>
                </Frosted>
                <View style={styles.summaryRow}><Icon name="lock-outline" size={15} color="#7A8FA0" /><Text style={styles.summaryRowText}>Your number and birth date stay private. Friends see your age and broad area only.</Text></View>
                <View style={styles.summaryRow}><Icon name="groups" size={15} color="#83721f" /><Text style={styles.summaryRowText}>Chats open after a mutual yes. Meetups are always in public places.</Text></View>
                <Text style={styles.fieldLabel}>BEFORE YOU JOIN · HOW TRUFRENZ STAYS KIND</Text>
                <SafetyOnboardingCarousel onComplete={finishSignup} />
              </> : null}
              <ActionButton onPress={continueAuth} disabled={authBusy} style={styles.authContinue}><Text style={styles.actionText}>{authBusy ? "Please wait…" : authStep === "phone" ? (authIntent === "login" ? `Send my login code by ${authChannel === "email" ? "email" : "SMS"}` : `Send my code by ${authChannel === "email" ? "email" : "SMS"}`) : authStep === "code" ? (authIntent === "login" ? "Log in" : "Verify & continue") : authStep === "profile" ? "Continue" : authStep === "photo" ? (profilePhoto ? "Use this photo" : "Skip for now") : "Join the circle"}</Text><Icon name="arrow-forward" size={16} color="#FFFFFF" /></ActionButton>
              <Pressable onPress={backAuth} style={styles.backLink}><Icon name="arrow-back" size={14} color="#83721f" /><Text style={styles.backLinkText}>{authStep === "phone" ? "Back to welcome" : "Back"}</Text></Pressable>
              <View style={styles.modalPrivacy}><Icon name="lock-outline" size={13} color="#8496A3" /><Text style={styles.modalPrivacyText}>Your number stays private and never appears on your profile.</Text></View>
              <Text style={styles.prototypeNote}>Prototype only: phone codes and identity checks are not connected to a live verification service.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={composerOpen} animationType="fade" transparent onRequestClose={() => setComposerOpen(false)}>
        <View style={[styles.composerModalShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}><Frosted style={[styles.groupModal, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight }]}><View style={styles.modalTopLine}><View style={styles.groupModalIcon}><Icon name="groups" size={19} color="#83721f" /></View><Pressable onPress={() => setComposerOpen(false)} style={styles.roundAction}><Icon name="close" size={18} color="#726e59" /></Pressable></View><Text style={styles.groupModalTitle}>A little private circle</Text><Text style={styles.groupModalCopy}>Groups are invite-only, for friends you&apos;ve already accepted.</Text><TextInput value={newGroupName} onChangeText={setNewGroupName} placeholder="Give your group a name" placeholderTextColor="#a4a29d" style={styles.fieldInput} /><ActionButton onPress={toggleGroup} style={styles.groupCreateButton}><Text style={styles.actionText}>Create private group</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setComposerOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Not now</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={verificationPrompt} animationType="fade" transparent onRequestClose={() => setVerificationPrompt(false)}>
        <View style={[styles.composerModalShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}><Frosted style={[styles.groupModal, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight }]}><View style={styles.modalTopLine}><View style={styles.verificationModalIcon}><Icon name="verified-user" size={19} color="#65947E" /></View><Pressable onPress={() => setVerificationPrompt(false)} style={styles.roundAction}><Icon name="close" size={18} color="#726e59" /></Pressable></View><Text style={styles.groupModalTitle}>A little extra trust, first.</Text><Text style={styles.groupModalCopy}>Your phone is verified. To send friend requests, add a live-selfie match or ID check for the stronger badge. You can keep browsing until then.</Text><View style={styles.verificationStep}><Icon name="phone-iphone" size={16} color="#7C94A5" /><Text style={styles.verificationStepText}>Phone verification · complete</Text><Icon name="check-circle" size={15} color="#72A58B" /></View><View style={styles.verificationStep}><Icon name="face" size={16} color="#83721f" /><Text style={styles.verificationStepText}>Selfie match or ID check · optional</Text><Icon name="lock-outline" size={14} color="#a5a39e" /></View><ActionButton onPress={() => { setVerificationPrompt(false); setSelfieModalVisible(true); }} style={styles.groupCreateButton}><Text style={styles.actionText}>Start selfie check</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setVerificationPrompt(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Maybe later</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={actionMenuOpen} transparent animationType="fade" onRequestClose={() => setActionMenuOpen(false)}>
        <Pressable style={[styles.actionMenuShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={() => setActionMenuOpen(false)}><BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.actionMenuBlur, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.92)"), glassOpacity) }]}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.actionMenuCard, { maxHeight: modalLayout.maxHeight - 2, backgroundColor: glassSurfaceColor(glassNestedFill("rgba(251, 249, 238, 0.88)"), glassOpacity) }]}><ScrollView style={styles.navigationMenuScroll} contentContainerStyle={styles.navigationMenuContent} showsVerticalScrollIndicator={false}><View style={styles.actionMenuHandle} /><Text style={styles.actionMenuEyebrow}>KEEP IT EASY</Text><Text style={styles.actionMenuTitle}>Share something small.</Text><Text style={styles.actionMenuSub}>Only this accepted friend can see what you send.</Text><Pressable onPress={shareApproximateArea} style={styles.actionMenuRow}><View style={styles.actionMenuIconBlue}><Icon name="near-me" size={18} color="#7393A8" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Share my approximate area</Text><Text style={styles.actionMenuItemSub}>Broad neighborhood only · no live pin</Text></View><Icon name="chevron-right" size={17} color="#a5a49e" /></Pressable><View style={styles.actionMenuDivider} /><Pressable onPress={prepareMeetupInvite} style={styles.actionMenuRow}><View style={styles.actionMenuIconPink}><Icon name="event-available" size={18} color="#83721f" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Invite them to a meetup</Text><Text style={styles.actionMenuItemSub}>Adds a friendly invite to your editable draft</Text></View><Icon name="chevron-right" size={17} color="#a5a49e" /></Pressable><View style={styles.actionMenuPrivacy}><Icon name="lock-outline" size={13} color="#8092A0" /><Text style={styles.actionMenuPrivacyText}>Trufrenz never shares your exact location automatically.</Text></View><Pressable onPress={() => setActionMenuOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Cancel</Text></Pressable></ScrollView></Pressable></BlurView></Pressable>
      </Modal>
      <SelfieVerificationModal visible={selfieModalVisible} onClose={() => setSelfieModalVisible(false)} onCaptured={() => feedback("Selfie captured on this device. A verification provider must review it before your badge changes.")} />
      <CreateMeetupInviteModal visible={inviteModalVisible} contacts={inviteTargets} initialContactId={inviteTargetChat} onClose={() => setInviteModalVisible(false)} onShare={shareMeetupInvite} />
      <FriendProfileModal
        visible={!!profilePerson}
        profile={profilePerson ? {
          id: profilePerson.id,
          name: profilePerson.name,
          age: profilePerson.age,
          locality: profilePerson.locality,
          interests: profilePerson.interests,
          image: profilePerson.image,
          gallery: (profilePerson.gallery ?? []).map((uri, index) => ({ id: `${profilePerson.id}-g${index}`, uri })),
          verification: profilePerson.verification,
          about: profilePerson.about,
          languages: profilePerson.languages,
          lookingFor: profilePerson.lookingFor,
          distanceKm: profilePerson.distanceKm,
          hidesExactLocality: true,
          status: profilePerson.status ?? null,
        } : null}
        relationship={profileRelationship(profilePerson)}
        viewerTier={paidTier ? "paid" : "free"}
        viewerCanRequestFriendship={myProfile.verification === "id-selfie" || acceptedFriends.length > 0}
        myInterests={myProfile.interests.length ? myProfile.interests : profileInterests}
        actions={{
          onChat: () => handleProfileAction("chat"),
          onHangout: () => handleProfileAction("hangout"),
          onMeetup: () => handleProfileAction("meetup"),
          onCall: () => handleProfileAction("call"),
          onAskFriendship: () => handleProfileAction("ask-friendship"),
          onAcceptRequest: () => handleProfileAction("accept-request"),
          onReport: () => handleProfileAction("report"),
          onBlock: () => handleProfileAction("block"),
        }}
        onClose={() => setProfilePerson(null)}
      />
      <EditProfileModal
        visible={profileEditorOpen}
        profile={myProfile}
        onChange={setMyProfile}
        onClose={() => setProfileEditorOpen(false)}
        onAddPhoto={addMyProfilePhoto}
        onStartVerification={startProfileVerification}
        onNotify={feedback}
        onSaved={() => { setProfileEditorOpen(false); setFullName(myProfile.name); setLocality(myProfile.locality); setProfileInterests(myProfile.interests); persistSession(createMemberSession({ name: myProfile.name || "Friend", locality: myProfile.locality || "Nearby", dateOfBirth: session?.dateOfBirth, age: myProfile.age, status: myProfile.status })); feedback(myProfile.status ? `Profile saved. Your status reads "${statusLabel(myProfile.status)}".` : "Profile saved. Your glass card is up to date."); }}
      />
      <QuickRepliesModal visible={quickRepliesOpen} replies={quickReplies} onClose={() => setQuickRepliesOpen(false)} onSelect={selectQuickReply} onAdd={addCustomQuickReply} onRemove={(id) => setQuickReplies((current) => removeQuickReply(current, id))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF8F7", overflow: "hidden" },
  noninteractive: { pointerEvents: "none" },
  backgroundImageWrap: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  backgroundImage: { width: "100%", height: "100%", opacity: 0.62 },
  backgroundWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(250, 248, 247, 0.1)" },
  headingScrim: { position: "absolute", left: 0, right: 0, top: 0, height: 132, backgroundColor: glassNestedFill("rgba(252, 250, 246, 0.62)") },
  screenContent: { flex: 1 },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientPink: { position: "absolute", top: 120, right: -140, height: 330, width: 330, borderRadius: 170, backgroundColor: "rgba(239, 229, 176, 0.18)" },
  ambientBlue: { position: "absolute", top: 390, left: -180, height: 320, width: 320, borderRadius: 170, backgroundColor: "rgba(208, 231, 246, 0.17)" },
  ambientLilac: { position: "absolute", top: 640, right: -180, height: 270, width: 270, borderRadius: 140, backgroundColor: "rgba(237, 225, 168, 0.12)" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 19, paddingTop: 8, paddingBottom: 18, flexGrow: 1 },
  topBar: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  /*
   * `flex: 1, minWidth: 0` is load-bearing. Without it the block claims its
   * content width, the header row overflows, and the right-hand controls are
   * pushed off screen — the call and video buttons simply vanish on a phone.
   * With it, the name truncates and the buttons keep their place.
   */
  brandMark: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: { width: 31, height: 31, borderRadius: 12, backgroundColor: "#F1DE55", alignItems: "center", justifyContent: "center" },
  brandWord: { fontSize: 18, fontWeight: "700", letterSpacing: -0.45, color: "#4e4a3b" },
  topBarSub: { marginTop: 2, color: "#8d8b86", fontSize: 9 },
  backButton: { height: 35, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, borderRadius: 13, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  backButtonText: { color: "#6b664c", fontSize: 9, fontWeight: "700" },
  threadHeading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  threadHeadingCopy: { flex: 1, minWidth: 0 },
  threadTitle: { color: "#4e4a3b", fontSize: 14, fontWeight: "700" },
  threadStatusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  threadStatus: { flexShrink: 1, color: "#83721f", fontSize: 9, fontWeight: "600" },
  neighborStatus: { color: "#83721f", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
  threadAvatarButton: { width: 37, height: 37, borderRadius: 14, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.95)"), padding: 1, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)") },
  threadAvatar: { width: "100%", height: "100%", borderRadius: 12 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  /* Three controls in a conversation header: tighter gaps so none is pushed off. */
  topActionsThread: { gap: 6 },
  roundAction: { position: "relative", height: 32, width: 32, borderRadius: 13, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), alignItems: "center", justifyContent: "center", shadowColor: "#737068", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 1 },
  notificationDot: { position: "absolute", right: 7, top: 7, height: 6, width: 6, borderRadius: 3, backgroundColor: "#E9D177", borderWidth: 1, borderColor: "#FFFFFF" },
  userAvatar: { height: 35, width: 35, borderRadius: 14, backgroundColor: "#eee9cc", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF" },
  userInitial: { color: "#7c7349", fontSize: 15, fontWeight: "700" },
  greeting: { color: "#94928a", fontSize: 11, fontWeight: "500", letterSpacing: 0.2 },
  chatHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11, marginBottom: 15 },
  chatTitle: { color: "#3e3b2d", fontSize: 24, fontWeight: "700", letterSpacing: -0.75, marginTop: 3 },
  composeButton: { width: 39, height: 39, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), shadowColor: "#83721f", shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  frosted: { backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), borderRadius: 19, shadowColor: "#89877e", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.075, shadowRadius: 15, elevation: 3 },
  glassSheen: { position: "absolute", left: 0, right: 0, top: 0, height: "52%" },
  searchBar: { height: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), borderRadius: 14, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.73)") },
  searchInput: { flex: 1, color: "#4f4d47", fontSize: 11, paddingVertical: 0, outlineStyle: "none" as any },
  filterRow: { flexDirection: "row", gap: 7, marginTop: 10, marginBottom: 10 },
  filterChip: { minHeight: 27, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), shadowColor: "#737068", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  filterChipActive: { backgroundColor: "#f0e8c1", borderColor: "#e4d89d" },
  filterChipText: { fontSize: 10, color: "#8f8d86", fontWeight: "500" },
  filterChipTextActive: { color: "#797353", fontWeight: "700" },
  circlesSection: { marginTop: 3, marginBottom: 12 },
  sectionHeaderLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: "#97948e", fontSize: 8, fontWeight: "700", letterSpacing: 1.1 },
  sectionLink: { color: "#83721f", fontSize: 9, fontWeight: "600" },
  circlesRow: { alignItems: "flex-start", gap: 17, paddingTop: 10, paddingBottom: 3 },
  circleItem: { width: 51, alignItems: "center", gap: 4 },
  circleImageWrap: { width: 48, height: 48, borderRadius: 18, borderWidth: 1.5, borderColor: "#e6d684", padding: 2, position: "relative" },
  circleImage: { width: "100%", height: "100%", borderRadius: 15 },
  circleStatus: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: "#c6c5c3", borderWidth: 2, borderColor: "#FAF8F7" },
  circleStatusOnline: { backgroundColor: "#70AD91" },
  circleName: { color: "#76736d", fontSize: 8, textAlign: "center" },
  addCircle: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242, 234, 191, 0.80)", borderWidth: 1, borderColor: "#FFFFFF" },
  myCircle: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#E2EDF4" },
  myCircleInitial: { fontSize: 17, color: "#6F8B9D", fontWeight: "700" },
  addSmall: { position: "absolute", bottom: -1, right: -1, backgroundColor: "#F1DE55", width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#FAF8F7", alignItems: "center", justifyContent: "center" },
  listHeading: { height: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2, borderBottomWidth: 1, borderBottomColor: "rgba(209, 206, 195, 0.42)" },
  chatListScroll: { flex: 1 },
  chatList: { paddingBottom: 13 },
  chatRow: { minHeight: 69, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), borderRadius: 16, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), paddingHorizontal: 8, paddingVertical: 8, marginBottom: 6, shadowColor: "#7e7b73", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.055, shadowRadius: 9, elevation: 1 },
  rowPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  chatAvatarWrap: { position: "relative", width: 48, height: 48 },
  chatAvatar: { width: 48, height: 48, borderRadius: 18, backgroundColor: "#eeead5" },
  groupMini: { position: "absolute", width: 19, height: 19, bottom: -3, right: -3, borderRadius: 8, backgroundColor: "#F1DE55", borderWidth: 2, borderColor: "#FAF8F7", alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", width: 11, height: 11, bottom: 0, right: 0, borderRadius: 6, backgroundColor: "#70AD91", borderWidth: 2, borderColor: "#FAF8F7" },
  chatInfo: { flex: 1, minWidth: 0 },
  chatTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatNameCluster: { flexDirection: "row", alignItems: "center", gap: 4 },
  chatName: { color: "#464336", fontSize: 12, fontWeight: "650" as any },
  chatTime: { color: "#9e9d98", fontSize: 8 },
  chatTimeUnread: { color: "#83721f", fontWeight: "700" },
  chatLastRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 },
  chatPreview: { color: "#8c8a85", fontSize: 10, flex: 1, paddingRight: 7 },
  unreadBadge: { minWidth: 17, height: 17, borderRadius: 8.5, paddingHorizontal: 4, backgroundColor: "#E9D177", alignItems: "center", justifyContent: "center" },
  unreadCount: { color: "#FFFFFF", fontSize: 8, fontWeight: "700" },
  safeNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, paddingVertical: 8 },
  safeNoteText: { color: "#98958f", fontSize: 8 },
  emptyChats: { alignItems: "center", paddingVertical: 35, paddingHorizontal: 24 },
  emptyIcon: { width: 53, height: 53, borderRadius: 20, backgroundColor: "#efe9cd", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#514e3e", fontSize: 15, fontWeight: "700", marginTop: 10 },
  emptyCopy: { color: "#8e8b85", fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 5 },
  actionButton: { height: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.54)"), paddingHorizontal: 14, shadowColor: "#6b643d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 9, elevation: 2 },
  actionButtonSecondary: { backgroundColor: "#efe9cd" },
  actionText: { color: "#4A4210", fontSize: 11, fontWeight: "700" },
  emptyAction: { marginTop: 13 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  /*
   * `paddingBottom: 0` is deliberate. The tab bar is hidden whenever a
   * conversation is open, so any bottom padding here becomes a dead band of
   * empty space between the composer and the bottom of the screen.
   */
  threadScreen: { flex: 1, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 0 },
  threadBody: { flex: 1 },
  threadContent: { paddingTop: 8, gap: 9 },
  /*
   * Keyboard closed: the conversation starts directly under the safety line, so
   * the date and the first messages ride up instead of being pushed to the
   * bottom of a tall screen. Bottom-anchoring here was wrong twice over — it
   * left the blank expanse above the messages that was reported, and it moved
   * the date *down* rather than up.
   */
  threadContentCompact: { paddingBottom: 6, flexGrow: 1 },
  /*
   * Keyboard open: the newest message must stay visible, so the list is
   * bottom-anchored and the composer takes the space above the keys.
   */
  threadContentKeyboard: { paddingBottom: 10, flexGrow: 1, justifyContent: "flex-end" },
  dayDivider: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(212, 206, 179, 0.58)" },
  dayLabel: { color: "#979590", fontSize: 8, letterSpacing: 1 },
  /*
   * The read marker. Deliberately quiet: a hairline and a small label, so it
   * reads as a bookmark between messages rather than as a message of its own.
   */
  readMarker: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginVertical: 7, paddingHorizontal: 4 },
  readMarkerLine: { flex: 1, height: 1, backgroundColor: "rgba(131, 114, 31, 0.30)" },
  readMarkerLabel: { color: "#83721f", fontSize: 8.5, letterSpacing: 0.6, fontWeight: "600" },
  sharedInterest: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 11, backgroundColor: "rgba(246, 239, 209, 0.80)", paddingHorizontal: 10, paddingVertical: 6, marginBottom: 5 },
  sharedInterestText: { color: "#83721f", fontSize: 8 },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  myMessageRow: { justifyContent: "flex-end" },
  readOnlyBar: { flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 12, marginBottom: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(247, 241, 214, 0.88)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)") },
  readOnlyBarText: { flex: 1, color: "#716f67", fontSize: 9, fontWeight: "600" },
  senderLabel: { color: "#8c887f", fontSize: 8.5, fontWeight: "700", marginBottom: 2 },
  messageColumn: { maxWidth: "86%", gap: 4 },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 130 },
  voicePlay: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)") },
  voiceWave: { flexDirection: "row", alignItems: "center", gap: 2, flex: 1, height: 22 },
  voiceBar: { flex: 1, borderRadius: 2, backgroundColor: "rgba(131, 114, 31, 0.55)" },
  voiceTime: { color: "#83721f", fontSize: 9, fontWeight: "700" },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, minWidth: 150 },
  locationCopy: { flex: 1, minWidth: 0 },
  locationNote: { color: "#83721f", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
  photoBubble: { width: 190, height: 140, borderRadius: 13, backgroundColor: "rgba(232, 229, 209, 0.9)" },
  reactionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: -2 },
  myReactionRow: { justifyContent: "flex-end" },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.40)"), paddingHorizontal: 6, paddingVertical: 3, shadowColor: "#75726a", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  reactionChipMine: { borderColor: "rgba(233, 209, 119, 0.65)", backgroundColor: "rgba(247, 241, 214, 0.94)" },
  reactionEmoji: { fontSize: 11 },
  reactionCount: { color: "#83721f", fontSize: 9, fontWeight: "700" },
  reactionPicker: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 2, borderRadius: 14, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), paddingHorizontal: 6, paddingVertical: 5, shadowColor: "#75726a", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  myReactionPicker: { alignSelf: "flex-end" },
  reactionChoice: { paddingHorizontal: 4, paddingVertical: 2 },
  reactionChoiceEmoji: { fontSize: 17 },
  messageBubble: { maxWidth: "83%", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 16 },
  theirBubble: { backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.91)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), borderBottomLeftRadius: 6, shadowColor: "#737168", shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  myBubble: { backgroundColor: "rgba(233, 227, 193, 0.94)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.82)"), borderBottomRightRadius: 6, shadowColor: "#737168", shadowOpacity: 0.055, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  messageText: { color: "#4f4d48", fontSize: 12, lineHeight: 18 },
  myMessageText: { color: "#5e5835" },
  messageTime: { textAlign: "right", color: "#a6a59f", fontSize: 7, marginTop: 4 },
  myMessageTime: { color: "#83721f" },
  hangoutStrip: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderTopWidth: 1, borderTopColor: "rgba(221, 216, 193, 0.47)" },
  hangoutStripText: { flex: 1, color: "#8e8c85", fontSize: 8 },
  inviteLink: { color: "#83721f", fontSize: 9, fontWeight: "700" },
  composerRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 5, paddingBottom: 4 },
  /*
   * While the keyboard is up the composer sits flush on it, so it needs its own
   * seam — otherwise the last message appears to run into the input field.
   */
  composerRowRaised: { borderTopWidth: 1, borderTopColor: "rgba(221, 216, 193, 0.55)", paddingTop: 7, marginTop: 2 },
  composerIcon: { width: 30, alignItems: "center" },
  quickReplyButton: { width: 29, height: 34, borderRadius: 11, backgroundColor: "rgba(245, 240, 210, 0.86)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), alignItems: "center", justifyContent: "center" },
  composerInput: { minHeight: 39, flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.40)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), color: "#53514c", fontSize: 11, outlineStyle: "none" as any },
  sendButton: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#e7e5de", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#737068", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 1 },
  sendButtonActive: { backgroundColor: "#F1DE55" },
  pageIntro: { marginTop: 17, marginBottom: 17 },
  pageEyebrow: { color: "#83721f", fontSize: 8, fontWeight: "700", letterSpacing: 1.1, marginBottom: 7 },
  pageTitle: { color: "#43423d", fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.65 },
  pageSub: { color: "#88857f", fontSize: 10, lineHeight: 16, marginTop: 5 },
  friendsTools: { gap: 8 },
  interestFilterRow: { gap: 6, paddingVertical: 1 },
  friendsScroll: { marginTop: 14 },
  friendsContent: { paddingBottom: 20 },
  contactPanel: { padding: 11, borderRadius: 17, backgroundColor: glassNestedFill("rgba(233, 241, 250, 0.46)"), borderWidth: 1, borderColor: glassNestedFill("rgba(213, 228, 240, 0.8)"), marginBottom: 14, gap: 9 },
  contactHeader: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  contactIcon: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(220, 235, 246, 0.62)") },
  contactHeaderCopy: { flex: 1, minWidth: 0 },
  contactTitle: { color: "#4e4c47", fontSize: 12, fontWeight: "800" },
  contactSub: { color: "#737d82", fontSize: 9, lineHeight: 13, marginTop: 3 },
  contactScanButton: { minHeight: 37, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: glassNestedFill("rgba(225, 237, 246, 0.58)"), borderWidth: 1, borderColor: glassNestedFill("rgba(210, 227, 239, 0.76)") },
  contactScanText: { color: "#527084", fontSize: 10, fontWeight: "800" },
  contactBusy: { opacity: 0.72 },
  contactListHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  contactListTitle: { color: "#526d7d", fontSize: 10, fontWeight: "800" },
  contactListSub: { color: "#838b8d", fontSize: 8, marginTop: 2 },
  contactSelectAll: { minHeight: 28, paddingHorizontal: 8, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(224, 236, 246, 0.46)"), borderWidth: 1, borderColor: glassNestedFill("rgba(211, 226, 239, 0.75)") },
  contactSelectAllText: { color: "#587487", fontSize: 9, fontWeight: "700" },
  contactSearch: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderRadius: 11, backgroundColor: glassNestedFill("rgba(235, 243, 249, 0.48)"), borderWidth: 1, borderColor: glassNestedFill("rgba(214, 229, 239, 0.7)") },
  contactSearchInput: { flex: 1, minWidth: 0, height: 32, color: "#4f4d48", fontSize: 10, outlineStyle: "none" as any },
  contactLimitNote: { color: "#827351", fontSize: 8, lineHeight: 12 },
  contactRow: { minHeight: 46, paddingHorizontal: 7, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 11, borderWidth: 1, borderColor: glassNestedFill("rgba(210, 227, 239, 0.54)"), backgroundColor: glassNestedFill("rgba(231, 240, 247, 0.43)") },
  contactRowSelected: { borderColor: "rgba(209, 190, 77, 0.46)", backgroundColor: glassNestedFill("rgba(246, 238, 201, 0.55)") },
  contactSelectMark: { width: 25, height: 25, borderRadius: 9, borderWidth: 1, borderColor: glassNestedFill("rgba(190, 212, 227, 0.85)"), alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(222, 235, 244, 0.48)") },
  contactSelectMarkOn: { backgroundColor: "#F1DE55", borderColor: "rgba(184, 160, 33, 0.55)" },
  contactName: { color: "#4f4d48", fontSize: 10.5, fontWeight: "700" },
  contactMatchLabel: { color: "#7d898e", fontSize: 8, marginTop: 2 },
  contactInviteButton: { minHeight: 37, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: "rgba(183, 161, 43, 0.48)" },
  contactInviteText: { color: "#4A4210", fontSize: 9.5, fontWeight: "800", textAlign: "center", flexShrink: 1 },
  contactInviteDisabled: { opacity: 0.55 },
  contactInviteNote: { color: "#7b8282", fontSize: 7.5, lineHeight: 11 },
  requestPanel: { padding: 12, borderRadius: 18, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), marginBottom: 17 },
  requestHeading: { color: "#504d3f", fontSize: 14, fontWeight: "700", marginTop: 4 },
  requestCount: { paddingHorizontal: 6, minWidth: 19, height: 18, borderRadius: 8, backgroundColor: "#f2e9be", alignItems: "center", justifyContent: "center" },
  requestCountText: { color: "#83721f", fontSize: 9, fontWeight: "700" },
  /*
   * The waiting list is tinted cooler than the received list on purpose. One
   * asks the member to decide something now; the other is a state they are only
   * watching, and the two should not read as the same kind of demand.
   */
  outgoingRequestPanel: { padding: 12, borderRadius: 18, backgroundColor: glassNestedFill("rgba(233, 241, 250, 0.5)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.82)"), marginBottom: 17 },
  outgoingRequestHeading: { color: "#4e4c47", fontSize: 14, fontWeight: "800", marginTop: 4 },
  outgoingRequestCount: { paddingHorizontal: 6, minWidth: 19, height: 18, borderRadius: 8, backgroundColor: "rgba(205, 225, 240, 0.92)", alignItems: "center", justifyContent: "center" },
  outgoingRequestCountText: { color: "#4e6575", fontSize: 9, fontWeight: "800" },
  outgoingRequestCopy: { color: "#6c777c", fontSize: 11, lineHeight: 15, marginTop: 4 },
  withdrawRequestButton: { minHeight: 29, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(115, 147, 169, 0.45)", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), alignItems: "center", justifyContent: "center" },
  withdrawRequestText: { color: "#527084", fontSize: 10.5, fontWeight: "800" },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  requestAvatar: { width: 42, height: 42, borderRadius: 15 },
  requestDetails: { flex: 1, gap: 3 },
  requestName: { color: "#4e4c47", fontSize: 11, fontWeight: "700" },
  requestMutual: { color: "#94938d", fontSize: 8 },
  requestButtons: { flexDirection: "row", gap: 5 },
  acceptButton: { width: 29, height: 29, borderRadius: 11, backgroundColor: "#8FB5A2", alignItems: "center", justifyContent: "center" },
  declineButton: { width: 29, height: 29, borderRadius: 11, backgroundColor: glassNestedFill("#f1f0ec"), alignItems: "center", justifyContent: "center" },
  suggestHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: "#4a4842", fontSize: 17, fontWeight: "700", letterSpacing: -0.3, marginTop: 4 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: "#f3edd2" },
  sortChipText: { fontSize: 7, color: "#83721f", fontWeight: "600" },
  friendConnectionList: { gap: 7 },
  neighborRow: { minHeight: 68, borderRadius: 15, paddingVertical: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  neighborTapArea: { borderRadius: 13 },
  neighborAvatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#eeebd9" },
  neighborInfo: { flex: 1, minWidth: 0, gap: 3 },
  neighborNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  neighborName: { color: "#4a483a", fontSize: 10, fontWeight: "700", maxWidth: 130 },
  neighborAbout: { color: "#8b8984", fontSize: 8 },
  neighborMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  neighborMetaText: { color: "#92918b", fontSize: 7 },
  commonInterestTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 1 },
  commonInterestTag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: "rgba(249, 244, 224, 0.82)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)") },
  commonInterestTagText: { color: "#83721f", fontSize: 7, fontWeight: "600" },
  phoneOnlyLabel: { color: "#8f8e89", fontSize: 7, backgroundColor: glassNestedFill("#f1f0eb"), paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, overflow: "hidden", marginLeft: 2 },
  compactRequestButton: { minWidth: 60, height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, borderWidth: 1, borderColor: "#e3dab1", backgroundColor: "rgba(247, 242, 215, 0.78)", paddingHorizontal: 6 },
  compactRequestText: { color: "#83721f", fontSize: 8, fontWeight: "700" },
  discoveryPaused: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginBottom: 9, borderRadius: 14 },
  discoveryPausedTitle: { color: "#696760", fontSize: 9, fontWeight: "700" },
  noMatches: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  noMatchesText: { color: "#8e8b85", fontSize: 9 },
  suggestCard: { width: "48.5%", borderRadius: 17, overflow: "hidden", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#89877e", shadowOpacity: 0.065, shadowRadius: 12, elevation: 3 },
  suggestPhotoWrap: { height: 106, position: "relative", backgroundColor: "#efedde" },
  suggestPhoto: { width: "100%", height: "100%" },
  localityTag: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.43)"), borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  localityText: { color: "#727069", fontSize: 7 },
  tierBadge: { position: "absolute", top: 6, right: 6, width: 23, height: 23, borderRadius: 9, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.46)"), alignItems: "center", justifyContent: "center" },
  suggestBody: { padding: 8 },
  suggestNameRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  suggestName: { color: "#4a483a", fontSize: 10, fontWeight: "700", flexShrink: 1 },
  suggestAge: { color: "#97948e", fontSize: 8 },
  verificationPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 3 },
  verifiedPill: { backgroundColor: "#EAF4EF" },
  phonePill: { backgroundColor: glassNestedFill("#f1f0ec") },
  compactBadge: { marginTop: 4 },
  verificationText: { color: "#568C77", fontSize: 7, fontWeight: "600" },
  phoneVerifiedText: { color: "#898783" },
  suggestAbout: { color: "#8b8984", fontSize: 8, lineHeight: 12, minHeight: 24, marginTop: 5 },
  suggestTags: { flexDirection: "row", gap: 4, marginTop: 5, marginBottom: 7 },
  suggestTag: { borderRadius: 6, backgroundColor: "#f5f1dc", paddingHorizontal: 5, paddingVertical: 3, color: "#83721f", fontSize: 7 },
  requestFriendButton: { minHeight: 30, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), paddingHorizontal: 4, shadowColor: "#6b643d", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  requestFriendText: { color: "#4A4210", fontSize: 7, fontWeight: "700" },
  requestSentButton: { backgroundColor: "#EAF2ED", borderWidth: 1, borderColor: "#DFECE3" },
  requestSentText: { color: "#608771" },
  noPressureCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, marginTop: 13 },
  noPressureIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#f4ecc8", alignItems: "center", justifyContent: "center" },
  noPressureTitle: { color: "#605d57", fontSize: 9, fontWeight: "700" },
  noPressureText: { color: "#93908a", fontSize: 8, marginTop: 3 },
  meetupIntroCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 17, marginBottom: 18 },
  meetupIntroArt: { width: 44, height: 44, position: "relative", alignItems: "center", justifyContent: "center" },
  artBubblePink: { position: "absolute", top: 2, left: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: "#ece1a5" },
  artBubbleBlue: { position: "absolute", bottom: 1, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: "#DDECF5" },
  artCenter: { width: 32, height: 32, borderRadius: 13, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), alignItems: "center", justifyContent: "center" },
  meetupIntroTitle: { color: "#56533f", fontSize: 10, fontWeight: "700" },
  meetupIntroCopy: { color: "#908d86", fontSize: 8, lineHeight: 12, marginTop: 3 },
  locationChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5 },
  locationChipText: { color: "#7f7d76", fontSize: 7 },
  meetupScroll: { flex: 1, marginTop: 11 },
  meetupList: { gap: 9, paddingBottom: 20, marginTop: 11 },
  planFollowList: { gap: 8, marginBottom: 14 },
  planFollowCard: { padding: 11, borderRadius: 16, gap: 5 },
  planFollowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planFollowPill: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(246, 240, 209, 0.94)" },
  planFollowPillText: { color: "#83721f", fontSize: 7.5, fontWeight: "700", letterSpacing: 0.5 },
  planFollowTiming: { color: "#8c887f", fontSize: 9, fontWeight: "700" },
  planFollowTimingToday: { color: "#806f1c" },
  planFollowTitle: { color: "#4e4a3b", fontSize: 11.5, fontWeight: "700" },
  planFollowActions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  planFollowButton: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)") },
  planFollowButtonText: { color: "#4A4210", fontSize: 9.5, fontWeight: "700" },
  planFollowGhost: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.68)") },
  planFollowCheckIn: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#6E9C86", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)") },
  planFollowCheckInText: { color: "#4A4210", fontSize: 9.5, fontWeight: "700" },
  planFollowWho: { color: "#918f87", fontSize: 8.5, marginTop: 2 },
  meetupCard: { minHeight: 99, padding: 9, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 16 },
  meetupPhoto: { width: 60, height: 72, borderRadius: 12, backgroundColor: "#efead1" },
  meetupCopy: { flex: 1, minWidth: 0 },
  meetupDay: { color: "#83721f", fontSize: 7, fontWeight: "700", letterSpacing: 0.6 },
  meetupTitle: { color: "#4f4d48", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 4 },
  meetupPlace: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3 },
  meetupPlaceText: { color: "#908d87", fontSize: 7, flex: 1 },
  meetupMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  meetupMetaText: { color: "#8a8780", fontSize: 7 },
  metaDivider: { height: 8, width: 1, backgroundColor: "#d7d5c9" },
  meetupTag: { color: "#789080", fontSize: 7 },
  rsvpButton: { alignSelf: "flex-end", borderRadius: 9, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), paddingHorizontal: 9, paddingVertical: 6, marginBottom: 1, shadowColor: "#6b643d", shadowOpacity: 0.10, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  rsvpText: { color: "#4A4210", fontSize: 8, fontWeight: "700" },
  rsvpJoined: { backgroundColor: "#E7F0EA" },
  rsvpTextJoined: { color: "#5B8A73" },
  createPlanLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36 },
  createPlanText: { color: "#83721f", fontSize: 9, fontWeight: "600" },
  profileCard: { alignItems: "center", padding: 16, borderRadius: 20 },
  profileAvatarFrame: { width: 84, height: 84, borderRadius: 30, padding: 3, borderWidth: 1.5, borderColor: "#e8dfae", position: "relative" },
  profileAvatarPhoto: { width: "100%", height: "100%", borderRadius: 26, backgroundColor: "#efead1" },
  profileVerifiedDot: { position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: 9, borderWidth: 2, borderColor: "#fcfaf2", backgroundColor: "#E9D177", alignItems: "center", justifyContent: "center" },
  profileBio: { color: "#6b6962", fontSize: 10.5, lineHeight: 16, textAlign: "center", marginTop: 8, paddingHorizontal: 6 },
  profileMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 11 },
  profileMetaPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  profileMetaText: { color: "#85827c", fontSize: 8, fontWeight: "600" },
  getVerifiedButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, borderRadius: 13, paddingHorizontal: 16, marginTop: 12, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.64)"), shadowColor: "#5c5634", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  getVerifiedText: { color: "#4A4210", fontSize: 10, fontWeight: "700" },
  profileAvatar: { position: "relative", width: 59, height: 59, borderRadius: 21, backgroundColor: "#efe4af", alignItems: "center", justifyContent: "center" },
  profileInitial: { color: "#83721f", fontSize: 25, fontWeight: "700" },
  profileCheck: { position: "absolute", right: -2, bottom: -2, width: 19, height: 19, borderRadius: 8, backgroundColor: "#72A58B", borderColor: "#FFFFFF", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  profileName: { color: "#504d3e", fontSize: 15, fontWeight: "700", marginTop: 7 },
  profileStatusChip: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7, maxWidth: 230, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(247, 242, 218, 0.76)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#68613d", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  profileStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#E9D177" },
  profileStatusText: { flexShrink: 1, color: "#6d6955", fontSize: 9.5, fontWeight: "650" as any },
  profilePhoneBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 7, backgroundColor: glassNestedFill("#EDF1F4"), paddingHorizontal: 7, paddingVertical: 4, marginTop: 6 },
  profilePhoneText: { color: "#798A97", fontSize: 8 },
  profileLocality: { flexDirection: "row", alignItems: "center", color: "#8f8d86", fontSize: 8, marginTop: 8 },
  profileInterests: { flexDirection: "row", gap: 5, marginTop: 11 },
  profileInterest: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#f3edd2" },
  profileInterestText: { color: "#83721f", fontSize: 8 },
  editProfileButton: { width: "100%", borderTopWidth: 1, borderTopColor: "rgba(212, 208, 183, 0.47)", marginTop: 12, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  editProfileText: { color: "#83721f", fontSize: 9, fontWeight: "700" },
  signupCard: { alignItems: "center", padding: 17 },
  signupIcon: { width: 47, height: 47, borderRadius: 17, backgroundColor: "#efe9c7", alignItems: "center", justifyContent: "center" },
  signupTitle: { color: "#545141", fontSize: 15, fontWeight: "700", marginTop: 10 },
  signupCopy: { color: "#8d8b84", fontSize: 9, lineHeight: 15, textAlign: "center", marginTop: 5 },
  signupCta: { alignSelf: "stretch", marginTop: 12 },
  guestLoginButton: { alignSelf: "stretch", marginTop: 9, minHeight: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(131, 114, 31, 0.34)", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)") },
  guestLoginText: { color: "#83721f", fontSize: 12, fontWeight: "700" },
  phoneRequired: { flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", marginTop: 10 },
  phoneRequiredText: { color: "#8493A0", fontSize: 7 },
  settingsLabel: { color: "#97948e", fontSize: 8, fontWeight: "700", letterSpacing: 1, marginTop: 19, marginBottom: 8 },
  settingsPanel: { paddingHorizontal: 11, borderRadius: 17 },
  appearancePanel: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 17 },
  appearanceHeadingRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9 },
  opacityReadout: { minWidth: 39, textAlign: "right", color: "#83721f", fontSize: 10, fontWeight: "700" },
  opacityOptions: { flexDirection: "row", gap: 4, marginTop: 7 },
  opacityOption: { flex: 1, minWidth: 0, minHeight: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.52)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.92)") },
  opacityOptionActive: { backgroundColor: "rgba(232, 216, 140, 0.95)", borderColor: "rgba(233, 209, 119, 0.86)", shadowColor: "#83721f", shadowOpacity: 0.10, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  opacityOptionText: { color: "#8f8c85", fontSize: 8, fontWeight: "600" },
  opacityOptionTextActive: { color: "#6e6538", fontWeight: "700" },
  tintRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 4 },
  tintOptions: { flexDirection: "row", gap: 7 },
  tintOption: { alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 11, borderWidth: 1, borderColor: "rgba(131, 114, 31, 0.2)" },
  tintOptionActive: { borderColor: "#83721f", backgroundColor: "rgba(241, 222, 85, 0.28)" },
  tintSwatch: { width: 24, height: 24, borderRadius: 9, borderWidth: 1.5 },
  presetRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  presetButton: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: "rgba(131, 114, 31, 0.18)", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.35)") },
  presetButtonActive: { backgroundColor: "rgba(232, 214, 120, 0.55)", borderColor: "rgba(131, 114, 31, 0.45)" },
  presetLabel: { fontSize: 12, fontWeight: "600", color: "#6f6a58" },
  presetLabelActive: { color: "#4a4210" },
  tintOptionText: { fontSize: 9.5, fontWeight: "600", color: "#7c7863" },
  tintOptionTextActive: { color: "#4A4210" },
  opacityScaleCaption: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 10, paddingHorizontal: 2 },
  opacityScaleText: { color: "#989791", fontSize: 7 },
  settingRow: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 9 },
  adBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 15, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"), shadowColor: "#544f3a", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  adBannerText: { flex: 1, fontSize: 10.5, lineHeight: 14.5, color: "#6d6b63" },
  adBannerCta: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#F1DE55" },
  adBannerCtaText: { fontSize: 10.5, fontWeight: "700", color: "#4A4210" },
  adBannerClose: { padding: 2 },
  tierPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.7)"), borderWidth: 1, borderColor: "rgba(131, 114, 31, 0.3)" },
  tierPillActive: { backgroundColor: "#F1DE55", borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)") },
  tierPillText: { fontSize: 10.5, fontWeight: "700", color: "#78756d" },
  tierPillTextActive: { color: "#4A4210" },
  settingIconPink: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#f4eecb", alignItems: "center", justifyContent: "center" },
  settingIconBlue: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#E9F1F5", alignItems: "center", justifyContent: "center" },
  settingContent: { flex: 1 },
  toggleFrame: { minWidth: 54, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.62)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), shadowColor: "#726f68", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  settingTitle: { color: "#58564f", fontSize: 9, fontWeight: "700" },
  settingSub: { color: "#94928d", fontSize: 7, marginTop: 3 },
  quietHoursControls: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5, marginTop: 7 },
  quietHourButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: "rgba(115, 147, 169, 0.42)", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), alignItems: "center", justifyContent: "center" },
  quietHourValue: { color: "#5d7382", fontSize: 11, fontWeight: "700", marginRight: 3 },
  settingDivider: { height: 1, backgroundColor: "rgba(219, 216, 204, 0.50)" },
  premiumLock: { width: 24, height: 24, borderRadius: 9, backgroundColor: "#f3ecc5", alignItems: "center", justifyContent: "center" },
  footerNote: { color: "#9e9c97", fontSize: 8, textAlign: "center", marginTop: 15 },
  bottomBar: { minHeight: 62, paddingBottom: Platform.OS === "web" ? 2 : 1, backgroundColor: "transparent", borderTopWidth: 1, borderTopColor: glassNestedFill("rgba(255, 255, 255, 0.55)"), flexDirection: "row", alignItems: "center", justifyContent: "space-around", shadowColor: "#737068", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
  tabButton: { width: "25%", minHeight: 50, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 3 },
  tabIconWrap: { height: 28, minWidth: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.92)"), backgroundColor: "rgba(255, 255, 255, 0.28)" },
  tabIconActive: { backgroundColor: "rgba(239, 233, 199, 0.96)", borderColor: "rgba(226, 213, 153, 0.98)", shadowColor: "#83721f", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabLabel: { color: "#969590", fontSize: 8, fontWeight: "500" },
  tabLabelActive: { color: "#83721f", fontWeight: "700" },
  toast: { position: "absolute", top: "50%", marginTop: -34, left: 21, right: 21, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F1DE55", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#544d2f", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  fieldError: { color: "#83721f", fontSize: 8.5, lineHeight: 13, marginTop: -6, marginBottom: 10 },
  fieldHint: { color: "#8E96A2", fontSize: 8, lineHeight: 13, marginTop: -6, marginBottom: 10 },
  suggestionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: 12 },
  suggestionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.66)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#75736a", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  suggestionChipActive: { backgroundColor: "rgba(239, 232, 193, 0.96)", borderColor: "rgba(224, 211, 147, 1)" },
  suggestionChipText: { color: "#838179", fontSize: 8.5, fontWeight: "600" },
  suggestionChipTextActive: { color: "#6f6740", fontWeight: "700" },
  photoPicker: { alignItems: "center", gap: 9, paddingVertical: 18, borderRadius: 20, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.6)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#75736a", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  photoPlaceholder: { width: 84, height: 84, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242, 236, 202, 0.9)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  photoPreview: { width: 84, height: 84, borderRadius: 30, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  photoPickerText: { color: "#6a6760", fontSize: 10.5, fontWeight: "700" },
  photoPickerHint: { color: "#98958f", fontSize: 8, textAlign: "center", paddingHorizontal: 18 },
  photoSafety: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)") },
  photoSafetyText: { flex: 1, color: "#818A93", fontSize: 8, lineHeight: 13 },
  summaryCard: { padding: 13, borderRadius: 18 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryAvatar: { width: 46, height: 46, borderRadius: 17, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  summaryAvatarFallback: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#f1e7b9", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)") },
  summaryAvatarText: { color: "#83721f", fontSize: 17, fontWeight: "800" },
  summaryName: { color: "#524f3e", fontSize: 12, fontWeight: "700" },
  summaryMeta: { color: "#918f86", fontSize: 8, marginTop: 3 },
  summaryTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  summaryTag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11, backgroundColor: "rgba(242, 236, 202, 0.9)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  summaryTagText: { color: "#83721f", fontSize: 8, fontWeight: "600" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)") },
  summaryRowText: { flex: 1, color: "#818A93", fontSize: 8, lineHeight: 13 },
  toastText: { color: "#4A4210", fontSize: 9, fontWeight: "500", flex: 1 },
  refreshGlass: { position: "absolute", top: 64, left: 39, right: 39, height: 42, borderRadius: 15, overflow: "hidden", backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.67)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), alignItems: "center", justifyContent: "center", shadowColor: "#7d7b72", shadowOpacity: 0.1, shadowRadius: 12, elevation: 6, zIndex: 20 },
  refreshGlassContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  refreshGlassText: { color: "#7d7b72", fontSize: 9, fontWeight: "600" },
  modalSafe: { flex: 1, backgroundColor: "#FAF8F7" },
  modalKeyboard: { flex: 1 },
  modalHeader: { height: 51, paddingHorizontal: 21, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalBody: { paddingHorizontal: 23, paddingTop: 22, paddingBottom: 25 },
  modalTitle: { color: "#474435", fontSize: 27, lineHeight: 32, letterSpacing: -0.8, fontWeight: "700" },
  modalSubtitle: { color: "#87847e", fontSize: 10, lineHeight: 17, marginTop: 9, marginBottom: 17, maxWidth: 330 },
  authPromise: { padding: 11, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  authPromiseIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center" },
  authPromiseTitle: { color: "#625f4d", fontSize: 9, fontWeight: "700" },
  authPromiseCopy: { color: "#95938c", fontSize: 8, marginTop: 3 },
  formField: { marginBottom: 15 },
  fieldLabel: { fontSize: 8, color: "#939089", letterSpacing: 0.8, fontWeight: "700", marginBottom: 6 },
  fieldInput: { minHeight: 45, borderRadius: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(220, 214, 189, 0.72)", backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), color: "#4b4a44", fontSize: 12 },
  resendRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 2 },
  resendPrompt: { fontSize: 12.5, color: "#6F6B60" },
  resendButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(131, 114, 31, 0.35)",
    backgroundColor: "rgba(247, 240, 205, 0.55)",
  },
  resendButtonDisabled: { borderColor: "rgba(141, 154, 165, 0.28)", backgroundColor: glassNestedFill("rgba(237, 240, 243, 0.55)") },
  resendButtonText: { fontSize: 12.5, fontWeight: "700", color: "#83721f" },
  resendButtonTextDisabled: { color: "#8D9AA5" },
  resendHint: { fontSize: 11, lineHeight: 15, color: "#9b988f", marginTop: -2 },
  codeInput: { letterSpacing: 9, fontSize: 19, fontWeight: "700", textAlign: "center" },
  interestOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  interestOption: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.67)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)") },
  interestOptionActive: { backgroundColor: "#f0e9c3", borderColor: "#e6da9c" },
  interestOptionText: { fontSize: 8, color: "#8c8983" },
  interestOptionTextActive: { color: "#7a7245", fontWeight: "700" },
  verifiedNote: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 11 },
  verifiedNoteText: { flex: 1, color: "#8594A0", fontSize: 8 },
  authContinue: { marginTop: 17 },
  backLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, padding: 11 },
  backLinkText: { color: "#83721f", fontSize: 9, fontWeight: "600" },
  modalPrivacy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  modalPrivacyText: { color: "#84939F", fontSize: 8, textAlign: "center" },
  prototypeNote: { textAlign: "center", color: "#a7a6a1", fontSize: 7, lineHeight: 11, marginTop: 8, paddingHorizontal: 8 },
  composerModalShade: { flex: 1, padding: 22, justifyContent: "center", backgroundColor: "rgba(57, 53, 32, 0.22)" },
  groupModal: { padding: 16, borderRadius: 20 },
  modalTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupModalIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: "#f1e9c2", alignItems: "center", justifyContent: "center" },
  verificationModalIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: "#EAF3EE", alignItems: "center", justifyContent: "center" },
  verificationStep: { minHeight: 38, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.65)"), marginTop: 6 },
  verificationStepText: { flex: 1, color: "#7e7c74", fontSize: 8 },
  groupModalTitle: { color: "#504d3e", fontSize: 16, fontWeight: "700", marginTop: 11 },
  groupModalCopy: { color: "#8f8d86", fontSize: 9, lineHeight: 15, marginTop: 4, marginBottom: 11 },
  groupCreateButton: { marginTop: 10 },
  cancelGroup: { alignItems: "center", padding: 9 },
  cancelGroupText: { color: "#908d86", fontSize: 9 },
  handoffOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: "center", alignItems: "center" },
  handoffBlur: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(250, 248, 248, 0.10)" },
  handoffCard: { width: 235, padding: 14, borderRadius: 19, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), shadowColor: "#66614c", shadowOpacity: 0.10, shadowRadius: 18, elevation: 5 },
  handoffHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  handoffTitle: { color: "#686551", fontSize: 10, fontWeight: "700" },
  handoffSkeleton: { flexDirection: "row", gap: 9, alignItems: "center", padding: 10, marginTop: 10, backgroundColor: "rgba(243, 240, 223, 0.75)", borderRadius: 12 },
  skeletonAvatar: { width: 30, height: 30, borderRadius: 11, backgroundColor: "#e1d9b4" },
  skeletonTextGroup: { flex: 1, gap: 6 },
  skeletonLineLong: { width: "80%", height: 6, borderRadius: 4, backgroundColor: "#ded8bb" },
  skeletonLineShort: { width: "53%", height: 5, borderRadius: 4, backgroundColor: "#e8e3cd" },
  handoffCaption: { color: "#928f88", fontSize: 8, textAlign: "center", marginTop: 8 },
  messageMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  receiptWrap: { flexDirection: "row", alignItems: "center", gap: 2 },
  receiptText: { color: "#83721f", fontSize: 6 },
  receiptReadText: { color: "#64A09A" },
  typingRow: { flexDirection: "row", justifyContent: "flex-start" },
  typingBubble: { minHeight: 27, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, borderBottomLeftRadius: 5, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.86)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.98)"), paddingHorizontal: 10 },
  typingDots: { flexDirection: "row", alignItems: "center", gap: 3 },
  typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#E9D177" },
  typingDotMiddle: { opacity: 0.72 },
  typingDotLast: { opacity: 0.46 },
  typingText: { color: "#8f8d85", fontSize: 8 },
  selfieEntry: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.92)") },
  selfieEntryIcon: { width: 30, height: 30, borderRadius: 11, backgroundColor: "#f0ebcd", alignItems: "center", justifyContent: "center" },
  navigationMenuShade: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(53, 50, 31, 0.24)" },
  navigationMenuBlur: { width: "100%", borderRadius: 26, overflow: "hidden", backgroundColor: "rgba(250, 248, 239, 0)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#4f4b36", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 24, zIndex: 100 },
  navigationMenuCard: { flexShrink: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, backgroundColor: "rgba(251, 249, 238, 0)" },
  navigationMenuScroll: { flexGrow: 0, flexShrink: 1 },
  navigationMenuContent: { flexGrow: 1 },
  navigationMenuHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  navigationMenuTitle: { color: "#4e4c47", fontSize: 17, fontWeight: "700", marginTop: 4 },
  navigationMenuGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 7 },
  navigationMenuItem: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 15, paddingHorizontal: 9, backgroundColor: glassNestedFill("rgba(241, 246, 252, 0.36)"), borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#747057", shadowOpacity: 0.055, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  navigationMenuItemActive: { backgroundColor: "rgba(243, 234, 194, 0.96)", borderColor: "rgba(227, 214, 147, 1)" },
  navigationMenuIcon: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(240, 235, 205, 0.86)" },
  navigationMenuIconActive: { backgroundColor: "#F1DE55" },
  navigationMenuItemText: { flex: 1, color: "#6c6a62", fontSize: 10, fontWeight: "700" },
  navigationMenuItemTextActive: { color: "#70673f" },
  navigationMenuHint: { color: "#8c8983", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 10, paddingHorizontal: 7 },
  actionMenuShade: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(63, 58, 37, 0.2)" },
  actionMenuBlur: { width: "100%", borderRadius: 25, overflow: "hidden", backgroundColor: "rgba(251, 249, 238, 0)", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.99)"), shadowColor: "#4f4b36", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 22 },
  actionMenuCard: { flexShrink: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: "rgba(251, 249, 238, 0)" },
  actionMenuHandle: { width: 32, height: 3, borderRadius: 2, backgroundColor: "rgba(133, 120, 139, 0.36)", alignSelf: "center", marginBottom: 13 },
  actionMenuEyebrow: { color: "#83721f", fontSize: 7, fontWeight: "700", letterSpacing: 1.1 },
  actionMenuTitle: { color: "#4e4c47", fontSize: 18, fontWeight: "700", marginTop: 4 },
  actionMenuSub: { color: "#8b8882", fontSize: 9, marginTop: 3, marginBottom: 11 },
  actionMenuRow: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 9 },
  actionMenuIconBlue: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#E7F0F4", alignItems: "center", justifyContent: "center" },
  actionMenuIconPink: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#f3edd2", alignItems: "center", justifyContent: "center" },
  actionMenuCopy: { flex: 1, gap: 3 },
  actionMenuItemTitle: { color: "#58564f", fontSize: 9, fontWeight: "700" },
  actionMenuItemSub: { color: "#908d87", fontSize: 7.5 },
  actionMenuDivider: { height: 1, marginLeft: 43, backgroundColor: "rgba(214, 208, 183, 0.55)" },
  actionMenuPrivacy: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.56)"), marginTop: 6 },
  actionMenuPrivacyText: { color: "#86939D", fontSize: 7 },
  /**
   * Account status notice.
   *
   * Deliberately reads as a calm, official card rather than an error: the
   * member is being told about a decision, not scolded. It sits above the
   * bottom bar so it is visible on every tab.
   */
  accountNotice: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.7)"),
    backgroundColor: glassNestedFill("rgba(252, 250, 240, 0.95)"),
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#55513a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    gap: 6,
  },
  accountNoticeHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  accountNoticeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(235, 226, 183, 0.9)",
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.8)"),
  },
  accountNoticeTitle: { flex: 1, fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: "#4a4737" },
  accountNoticeBody: { fontSize: 12.5, lineHeight: 18, color: "#6a6760" },
  accountNoticeReason: { fontSize: 12, lineHeight: 17, color: "#85837a", fontStyle: "italic" },
  accountNoticeAllowed: { fontSize: 12, lineHeight: 17, color: "#7690A1" },
  accountNoticeAction: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"),
    backgroundColor: "rgba(241, 235, 208, 0.92)",
  },
  accountNoticeActionText: { fontSize: 12.5, fontWeight: "700", color: "#83721f" },

  /** In-flight state: clearly inert, but still legible. */
  actionButtonDisabled: { opacity: 0.62 },

  noticeMarkButton: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.85)"),
    backgroundColor: "rgba(241, 235, 208, 0.92)",
  },
  noticeMarkText: { fontSize: 11.5, fontWeight: "700", color: "#83721f" },
  noticeRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: glassNestedFill("rgba(255, 255, 255, 0.7)"),
  },
  noticeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: "#E9D177",
  },
  noticeDotRead: { backgroundColor: "rgba(180, 176, 151, 0.55)" },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: "#4a4737" },
  noticeBody: { fontSize: 12, lineHeight: 17, color: "#6a6760" },
  channelRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  channelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.5)"),
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.34)"),
  },
  channelButtonActive: { backgroundColor: "rgba(247, 240, 205, 0.85)", borderColor: "rgba(196, 168, 74, 0.5)" },
  channelButtonText: { fontSize: 13, fontWeight: "600", color: "#7A8FA0" },
  channelButtonTextActive: { color: "#4A4210" },
  noticeMeta: { fontSize: 10.5, lineHeight: 14, color: "#99968e", letterSpacing: 0.3 },

  noticeStoreAction: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: glassNestedFill("rgba(255, 255, 255, 0.72)"),
    borderWidth: 1,
    borderColor: glassNestedFill("rgba(255, 255, 255, 0.9)"),
    shadowColor: "#666146",
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  noticeStoreActionText: { fontSize: 11.5, fontWeight: "700", color: "#83721f" },

});
