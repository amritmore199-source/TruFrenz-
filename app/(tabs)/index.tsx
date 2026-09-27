import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  ScrollView,
  StatusBar,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
import { formatMeetupInvite, type MeetupInviteDraft } from "@/lib/meetup-invite";
import { mergeMeetupRefresh } from "@/lib/meetup-feed";
import { resolveChatProfile } from "@/lib/chat-profile";
import { addQuickReply, DEFAULT_QUICK_REPLIES, parseQuickReplies, removeQuickReply, type QuickReply } from "@/lib/quick-replies";
import { createIncomingMeetupInviteNotification, createIncomingMessageNotification, type IncomingNotification } from "@/lib/incoming-notifications";
import {
  chatRowRevealWidth,
  composerKeyboardLift,
  shouldHideTabBarForKeyboard,
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
  reportStoreCancellation,
  restorePurchases,
  subscriptionFromEntitlement,
  verifyPurchase,
  type StoreReceiptPayload,
} from "@/lib/account-client";
import { resolveMobileBackAction } from "@/lib/mobile-navigation";
import { useResponsiveModalLayout } from "@/hooks/use-responsive-modal-layout";
import { GLASS_OPACITY_STEPS, glassSurfaceColor } from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { WelcomeScreen } from "@/components/welcome-screen";
import { createGuestSession, createMemberSession, isGuestSession, parseSession, serializeSession, SESSION_STORAGE_KEY, shouldShowWelcome, type StoredSession } from "@/lib/session";
import { accountStateFrom, fetchNotices, fetchSession, markNoticesRead, reportEvents, requestOtp, runGuardedAction, verifyOtp, type MemberNotice, type RemoteAccount } from "@/lib/account-client";
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
  attachmentPreviewLabel,
  createPendingAttachment,
  pendingToDraft,
  type PendingAttachment,
} from "@/lib/attachment-preview";
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
type Message = {
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
  /** Group poll carried by the message. */
  poll?: PlanPoll;
  reactions?: Reaction[];
};
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

const Icon = ({ name, color = "#675D70", size = 20 }: { name: keyof typeof MaterialIcons.glyphMap; color?: string; size?: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

function Frosted({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { glassOpacity } = useAppAppearance();
  // The blur layer is what makes this read as frosted glass. Without it the
  // translucent fill alone lets the wallpaper's bright areas (white clothing and
  // faces in the photo) show through as hard-edged white patches inside the card.
  // Blurring first diffuses the backdrop, then the tint sits on top of it.
  const flattened = StyleSheet.flatten(style);
  const radius = flattened?.borderRadius ?? styles.frosted.borderRadius;
  return (
    <View style={[styles.frosted, style, { backgroundColor: glassSurfaceColor("rgba(255,255,255,0.79)", glassOpacity) }]}>
      <BlurView
        intensity={38}
        tint="light"
        experimentalBlurMethod="dimezisBlurView"
        style={[StyleSheet.absoluteFillObject, styles.noninteractive, { borderRadius: radius }]}
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
  const { glassOpacity, wallpaperVisible, setGlassOpacity, setWallpaperVisible } = useAppAppearance();
  // The root SafeAreaView already insets the bottom edge, so the keyboard lift
  // must discount that inset to avoid over-lifting the composer.
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
  const [showSignup, setShowSignup] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [authIntent, setAuthIntent] = useState<AuthIntent>("signup");
  const [authStep, setAuthStep] = useState<AuthStep>("welcome");
  const [phone, setPhone] = useState("");
  /** True while a sign-in request is in flight, so the button can show progress. */
  const [authBusy, setAuthBusy] = useState(false);
  /** One-time code echoed by the server when no SMS provider is configured. */
  const [demoCode, setDemoCode] = useState<string | null>(null);
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
  const [toast, setToast] = useState("");
  const [requestSent, setRequestSent] = useState<string[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<string[]>(["maya", "sam", "noah"]);
  const [suggestions, setSuggestions] = useState<Person[]>(suggestionSeeds);
  const [incomingRequests, setIncomingRequests] = useState<string[]>(["aria"]);
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
  const [blurDistance, setBlurDistance] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [typingChat, setTypingChat] = useState<string | null>(null);
  const [chatRowStates, setChatRowStates] = useState<Record<string, ChatRowState>>({});
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

  const openSignup = () => { setAuthIntent("signup"); setAuthStep("phone"); setProfileErrors({}); setShowSignup(true); tap(); };
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
    setSession(null);
    setJoined(false);
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

  const finishSignup = () => {
    if (email.trim() && !isValidCredential("Email", email)) { feedback("Check the recovery email address, or leave it blank"); return; }
    const parsedDob = dateOfBirth ? parseDateOfBirth(dateOfBirth) : null;
    persistSession(createMemberSession({ name: fullName.trim(), locality: locality.trim(), dateOfBirth: parsedDob ? formatDateOfBirth(parsedDob) : undefined, age: parsedDob ? ageFromDateOfBirth(parsedDob) : undefined }));
    setJoined(true);
    setShowSignup(false);
    setTab("Chats");
    feedback(`Welcome, ${fullName.trim().split(" ")[0] || "friend"}. Your circle is ready.`);
  };

  const continueAuth = () => {
    if (authStep === "phone") {
      if (!isValidCredential("Phone", phone)) { feedback("Enter a valid phone number to continue"); return; }
      // Ask the account service for a real one-time code. When the server is
      // unreachable the flow still advances locally so the app stays usable.
      void (async () => {
        setAuthBusy(true);
        const result = await requestOtp(phone, authIntent);
        setAuthBusy(false);
        if (!result.ok) {
          feedback(
            result.code === "account_not_found"
              ? "No account uses that number yet. Switch to Sign up to create one."
              : result.error,
          );
          return;
        }
        setDemoCode(result.data.demoCode ?? null);
        setAuthStep("code");
        feedback(
          result.data.demoCode
            ? `Prototype delivery: your code is ${result.data.demoCode}.`
            : `We sent a code to ${result.data.phone}.`,
        );
      })();
      return;
    }
    if (authStep === "code") {
      if (!isValidDemoCode(passcode)) { feedback("Enter the 6-digit code to continue"); return; }
      void (async () => {
        setAuthBusy(true);
        const result = await verifyOtp({
          code: passcode,
          // Signing in does not need onboarding fields; creating an account does.
          name: authIntent === "login" ? undefined : fullName.trim() || undefined,
          dateOfBirth: authIntent === "login" ? undefined : dateOfBirth || undefined,
          age: authIntent === "login" ? undefined : ageFromDateOfBirth(parseDateOfBirth(dateOfBirth) ?? new Date()) ?? undefined,
          homeArea: authIntent === "login" ? undefined : locality.trim() || undefined,
          email: authIntent === "login" ? undefined : email.trim() || undefined,
        });
        setAuthBusy(false);

        if (!result.ok) {
          if (result.code === "profile_incomplete") {
            // The code was valid but the account is new: finish creating it at
            // the end of onboarding.
            setAuthStep("profile");
            feedback("Add your name to finish creating your account.");
            return;
          }
          feedback(result.error);
          return;
        }

        setRemoteAccount(result.data.account);

        if (authIntent === "login") {
          const account = result.data.account;
          // Reflect the account's own details so the greeting and profile are
          // the member's, not the placeholder the device had before.
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
          return;
        }
        setAuthStep("profile");
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
      const unread = displayUnread(chat.unread, state);
      const filterMatch = chatFilter === "All" || (chatFilter === "Unread" ? unread > 0 : chat.kind === "group");
      return queryMatch && filterMatch;
    });
  }, [search, chatFilter, acceptedFriends, chatMessages, suggestions, chatRowStates, showArchived]);

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
    return discoverable && searchMatch && interestMatch && !acceptedFriends.includes(person.id) && !incomingRequests.includes(person.id);
  }), [search, interestFilter, acceptedFriends, incomingRequests, discoverable, suggestions]);

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

  const profileRelationship = (person: Person | null): ViewerRelationship => {
    if (!person) return "stranger";
    if (acceptedFriends.includes(person.id)) return "accepted";
    if (requestSent.includes(person.id)) return "request-sent";
    if (incomingRequests.includes(person.id)) return "request-received";
    return "stranger";
  };

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
      setIncomingRequests((current) => current.filter((id) => id !== person.id));
      setAcceptedFriends((current) => [...current, person.id]);
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
    setAcceptedFriends((current) => current.filter((id) => id !== person.id));
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
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
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

  const pushMessage = (message: Message) => {
    if (!selectedChat) return;
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
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
    setSelectedChat(null);
  }, [clearPendingAttachment]);
  const toggleChatArchive = () => {
    if (!selectedChat) return;
    setChatRowStates((current) => toggleArchived(current, selectedChat));
    feedback(rowStateFor(chatRowStates, selectedChat).archived ? "Moved back to your inbox." : "Archived. Find it again under Archived.");
  };

  const unfriendCurrent = () => {
    if (!selectedChat) return;
    const name = currentThread?.name ?? "them";
    setChatRowStates((current) => archiveOnUnfriend(current, selectedChat));
    setAcceptedFriends((current) => current.filter((id) => id !== selectedChat));
    feedback(`You unfriended ${name.split(" ")[0]}. The conversation is archived and read-only, and your messages stay on your device.`);
    tap();
  };

  const blockCurrent = () => {
    if (!selectedChat) return;
    const name = currentThread?.name ?? "them";
    setChatRowStates((current) => archiveOnUnfriend(current, selectedChat));
    setAcceptedFriends((current) => current.filter((id) => id !== selectedChat));
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

  const showIncomingNotification = (next: IncomingNotification) => {
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
      showIncomingNotification(createIncomingMeetupInviteNotification({ id, senderName: "Sam Rivera", chatId, meetupTitle, venue, time }));
      return;
    }
    const chatId = "maya";
    const messagePreview = "Want to grab coffee this Saturday?";
    setChatMessages((current) => ({ ...current, [chatId]: [...(current[chatId] ?? []), { id, from: "them", text: messagePreview, time: "now" }] }));
    showIncomingNotification(createIncomingMessageNotification({ id, senderName: "Maya Chen", chatId, messagePreview }));
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
    setAcceptedFriends((current) => current.includes(id) ? current : [...current, id]);
    setIncomingRequests((current) => current.filter((item) => item !== id));
    const person = suggestions.find((item) => item.id === id);
    if (person) {
      setChatMessages((current) => current[person.id] ? current : { ...current, [person.id]: [{ id: `hello-${Date.now()}`, from: "them", text: "Thanks for accepting my friend request. Nice to meet you!", time: "now" }] });
    }
    feedback("Friend request accepted. You can chat now.");
  };

  const sendFriendRequest = (person: Person) => {
    if (requireAccount("send-friend-request")) return;
    if (!joined) { feedback("Create your phone-verified profile before sending a request."); openSignup(); return; }
    const myVerification = "phone-only" as const;
    if (!canRequestFriendship(myVerification)) {
      setVerificationPrompt(true);
      return;
    }
    if (!allowAction("send-friend-requests")) return;
    setRequestSent((current) => current.includes(person.id) ? current : [...current, person.id]);
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
            <Icon name="arrow-back" size={18} color="#6D6178" />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : <View style={styles.brandIcon}><Icon name="spa" size={17} color="#FFFFFF" /></View>}
        {thread ? <View style={styles.threadHeading}><Pressable onPress={() => (currentThread?.kind === "group" ? setGroupInfoOpen(true) : openChatProfile())} style={({ pressed }) => [styles.threadAvatarButton, pressed && styles.rowPressed]} accessibilityRole="button" accessibilityLabel={`View ${currentThread?.name ?? "friend"} profile`}><Image source={currentThread?.image} style={styles.threadAvatar} /></Pressable><View style={styles.threadHeadingCopy}><Pressable onPress={() => currentThread?.kind === "group" && setGroupInfoOpen(true)} accessibilityRole={currentThread?.kind === "group" ? "button" : undefined} accessibilityLabel={currentThread?.kind === "group" ? `Open ${currentThread.name} group info` : undefined}><Text style={styles.threadTitle} numberOfLines={1}>{currentThread?.name ?? "Conversation"}</Text></Pressable><Text style={styles.topBarSub} numberOfLines={1}>{currentThread?.kind === "group" ? `${group.members.length} members · invite-only` : currentThread?.verified ? "ID + selfie verified" : "Accepted friend"}</Text><Text style={styles.threadStatus} numberOfLines={1}>{[threadAvailabilityLabel, threadFriendStatus].filter(Boolean).join(" · ")}</Text></View></View> : <Text style={styles.brandWord}>Trufrenz</Text>}
      </View>
      {thread ? <View style={styles.topActions}>{currentThread?.kind === "friend" ? <><Pressable onPress={() => startCall(false)} accessibilityRole="button" accessibilityLabel={`Call ${currentThread?.name ?? "friend"}`} style={styles.roundAction}><Icon name="call" size={18} color="#766B82" /></Pressable><Pressable onPress={() => startCall(true)} accessibilityRole="button" accessibilityLabel={`Video call ${currentThread?.name ?? "friend"}`} style={styles.roundAction}><Icon name="videocam" size={19} color="#766B82" /></Pressable></> : null}<Pressable onPress={() => setChatMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open conversation options" style={styles.roundAction}><Icon name="more-vert" size={21} color="#766B82" /></Pressable></View> : <View style={styles.topActions}><Pressable onPress={previewIncomingNotification} onLongPress={() => setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: "Maya Chen", peerVerified: true, video: false, direction: "incoming" }))} accessibilityRole="button" accessibilityLabel="Show sample incoming notification, long press for a sample incoming call" style={styles.roundAction}><Icon name="notifications-none" size={20} color="#766B82" /><View style={styles.notificationDot} /></Pressable><Pressable onPress={() => setNavigationMenuOpen(true)} accessibilityRole="button" accessibilityLabel="Open navigation options" style={styles.roundAction}><Icon name="more-vert" size={20} color="#766B82" /></Pressable><Pressable onPress={openSignup} accessibilityRole="button" accessibilityLabel="Open your profile" style={styles.userAvatar}>{joined ? <Text style={styles.userInitial}>{fullName.charAt(0).toUpperCase()}</Text> : <Icon name="person-outline" size={18} color="#796E84" />}</Pressable></View>}
    </View>
  );

  const verificationBadge = (person: Person, compact = false) => {
    const strong = person.verification === "ID + selfie verified";
    return <View style={[styles.verificationPill, strong ? styles.verifiedPill : styles.phonePill, compact && styles.compactBadge]}><Icon name={strong ? "verified" : "phone-iphone"} size={compact ? 11 : 12} color={strong ? "#588B79" : "#92939E"} /><Text style={[styles.verificationText, !strong && styles.phoneVerifiedText]}>{compact ? (strong ? "Verified" : "Phone") : person.verification}</Text></View>;
  };

  const renderChats = () => {
    if (selectedChat && currentThread) {
      const conversationMessages = chatMessages[selectedChat] ?? [];
      // Lift the composer by the keyboard height, discounting the bottom inset
      // the root SafeAreaView already applies so it lands just above the keys.
      const composerLift = composerKeyboardLift(keyboardHeight, insets.bottom);
      return <View style={[styles.threadScreen, { paddingBottom: composerLift }]}>
        {topBar(true)}
        <View style={styles.threadSafety}><Icon name="lock-outline" size={13} color="#7D8AA0" /><Text style={styles.threadSafetyText}>Only friends can see these messages. Your exact location is never shared.</Text></View>
        <ScrollView style={styles.threadBody} contentContainerStyle={styles.threadContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dayDivider}><View style={styles.dividerLine} /><Text style={styles.dayLabel}>TODAY</Text><View style={styles.dividerLine} /></View>
          <View style={styles.sharedInterest}><Icon name="auto-awesome" size={15} color="#A77C9A" /><Text style={styles.sharedInterestText}>You both like slow weekend mornings</Text></View>
          {conversationMessages.map((message) => {
            const receipt = outgoingReceipt(message.receipt ?? (message.from === "me" ? "sent" : undefined), chatPrivacy.shareReadReceipts);
            const showReceipt = shouldShowReceipt({ from: message.from, receipt: message.receipt ?? (message.from === "me" ? "sent" : undefined) }, chatPrivacy.shareReadReceipts) && receipt;
            const mine = message.from === "me";
            const visibleReactions = summariseReactions(message.reactions ?? []);
            return (
              <View key={message.id} style={[styles.messageRow, mine && styles.myMessageRow]}>
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
                      style={[styles.messageBubble, mine ? styles.myBubble : styles.theirBubble, { backgroundColor: glassSurfaceColor(mine ? "rgba(234,223,235,0.94)" : "rgba(255,255,255,0.91)", glassOpacity) }]}
                    >
                      {message.kind === "voice" ? (
                        <View style={styles.voiceRow}>
                          <View style={styles.voicePlay}><Icon name="play-arrow" size={16} color="#8E7894" /></View>
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
                        {showReceipt && receipt ? <View accessibilityLabel={receiptLabel(receipt)} style={styles.receiptWrap}><Icon name={receiptIcon(receipt)} size={12} color={receipt === "read" ? "#62A4A0" : "#927C96"} /><Text style={[styles.receiptText, receipt === "read" && styles.receiptReadText]}>{receiptLabel(receipt)}</Text></View> : null}
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
            );
          })}
          {typingChat === selectedChat ? <View style={styles.typingRow}><View style={styles.typingBubble}><View style={styles.typingDots}><View style={styles.typingDot} /><View style={[styles.typingDot, styles.typingDotMiddle]} /><View style={[styles.typingDot, styles.typingDotLast]} /></View><Text style={styles.typingText}>{currentThread.name.split(" ")[0]} is typing</Text></View></View> : null}
        </ScrollView>
        <View style={styles.hangoutStrip}><Icon name="event-available" size={16} color="#9C7694" /><Text style={styles.hangoutStripText}>Want to meet? Send a gentle hangout invite.</Text><Pressable onPress={() => setPlanComposerKind("hangout")}><Text style={styles.inviteLink}>Hangout</Text></Pressable><Pressable onPress={() => setPlanComposerKind("meetup")}><Text style={styles.inviteLink}>Meetup</Text></Pressable>{currentThread?.kind === "group" ? <Pressable onPress={startPlanPoll}><Text style={styles.inviteLink}>Poll</Text></Pressable> : null}</View>
        {activeRowState.readOnly ? <View style={styles.readOnlyBar}><Icon name="lock-outline" size={14} color="#9A7796" /><Text style={styles.readOnlyBarText}>This conversation is read-only. Unarchive it to send new messages.</Text></View> : null}
        {pendingAttachment ? <AttachmentPreviewStrip pending={pendingAttachment} sizeBytes={pendingPhotoBytes} onRemove={clearPendingAttachment} /> : null}
        <View style={styles.composerRow}><Pressable onPress={() => setAttachmentSheetOpen(true)} accessibilityLabel="Open attachments" style={styles.composerIcon}><Icon name="add-circle-outline" size={24} color="#8C8495" /></Pressable><Pressable onPress={() => setQuickRepliesOpen(true)} accessibilityLabel="Open quick replies" style={styles.quickReplyButton}><Icon name="quickreply" size={18} color="#8E7894" /></Pressable><TextInput value={messageDraft} onChangeText={setMessageDraft} placeholder={pendingAttachment ? "Add a caption…" : "Write a message…"} placeholderTextColor="#9B96A1" style={styles.composerInput} onSubmitEditing={sendComposerContent} returnKeyType="send" /><Pressable onPress={sendComposerContent} accessibilityLabel={pendingAttachment ? "Send with this attachment" : "Send message"} style={({ pressed }) => [styles.sendButton, (messageDraft.trim() || pendingAttachment) && styles.sendButtonActive, pressed && styles.pressed]}><Icon name="arrow-upward" size={19} color={messageDraft.trim() || pendingAttachment ? "#FFFFFF" : "#96919D"} /></Pressable></View>
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
      <View style={styles.chatHeading}><View><Text style={styles.greeting}>{joined ? `Hello, ${fullName.split(" ")[0] || "friend"}` : "A little closer."}</Text><Text style={styles.chatTitle}>Your conversations</Text></View><Pressable onPress={() => setComposerOpen(true)} style={({ pressed }) => [styles.composeButton, pressed && styles.pressed]}><Icon name="edit-square" size={19} color="#FFFFFF" /></Pressable></View>
      <View style={styles.searchBar}><Icon name="search" size={18} color="#968D9A" /><TextInput value={search} onChangeText={setSearch} placeholder="Search conversations & friends" placeholderTextColor="#A6A1A8" style={styles.searchInput} returnKeyType="search" /><Pressable onPress={() => feedback("Search chats, people, and groups from here.")}><Icon name="tune" size={17} color="#90869A" /></Pressable></View>
      <View style={styles.filterRow}>{filters.map((filter) => <Pressable key={filter} onPress={() => setChatFilter(filter)} style={[styles.filterChip, chatFilter === filter && styles.filterChipActive]}><Text style={[styles.filterChipText, chatFilter === filter && styles.filterChipTextActive]}>{filter}{filter === "Unread" ? "  2" : ""}</Text></Pressable>)}</View>
      {chatFilter === "All" && !search ? <View style={styles.circlesSection}><View style={styles.sectionHeaderLine}><Text style={styles.sectionEyebrow}>YOUR PEOPLE</Text><Pressable onPress={() => setTab("Friends")}><Text style={styles.sectionLink}>See all <Icon name="chevron-right" size={12} color="#9B7296" /></Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circlesRow}>
        {joined ? <Pressable onPress={() => setTab("You")} style={styles.circleItem}><View style={styles.myCircle}><Text style={styles.myCircleInitial}>{fullName.charAt(0).toUpperCase()}</Text><View style={styles.addSmall}><Icon name="add" size={11} color="#FFFFFF" /></View></View><Text style={styles.circleName}>Your note</Text></Pressable> : <Pressable onPress={openSignup} style={styles.circleItem}><View style={styles.addCircle}><Icon name="add" size={22} color="#977C9B" /></View><Text style={styles.circleName}>Set up</Text></Pressable>}
        {friendCircles.map((chat) => <Pressable key={chat.id} onPress={() => startThread(chat.id)} style={styles.circleItem}><View style={styles.circleImageWrap}><Image source={chat.image} style={styles.circleImage} /><View style={[styles.circleStatus, chat.online && styles.circleStatusOnline]} /></View><Text style={styles.circleName} numberOfLines={1}>{chat.name.split(" ")[0]}</Text></Pressable>)}
        <Pressable onPress={() => setTab("Friends")} style={styles.circleItem}><View style={styles.addCircle}><Icon name="group-add" size={18} color="#977C9B" /></View><Text style={styles.circleName}>Add friend</Text></Pressable>
      </ScrollView></View> : null}
      <View style={styles.listHeading}><Text style={styles.sectionEyebrow}>{chatFilter === "Groups" ? "YOUR PRIVATE CIRCLES" : chatFilter === "Unread" ? "UNREAD MESSAGES" : "RECENT CHATS"}</Text><Pressable onPress={() => feedback("Conversations stay private to your accepted friends.")}><Icon name="more-horiz" size={20} color="#9B94A0" /></Pressable></View>
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
              onOpen={() => startThread(chat.id)}
              onToggleMute={() => { setChatRowStates((current) => toggleMuted(current, chat.id)); feedback(rowStateFor(chatRowStates, chat.id).muted ? "Unmuted." : "Muted. Messages still arrive, just without the badge."); }}
              onToggleArchive={() => { setChatRowStates((current) => toggleArchived(current, chat.id)); feedback(rowStateFor(chatRowStates, chat.id).archived ? "Moved back to your inbox." : "Archived. Find it again under Archived."); }}
            />
          );
        })}
        {createdGroups.map((name) => <Pressable key={name} onPress={() => feedback("Invite an accepted friend to start the group conversation.")} style={styles.chatRow}><View style={[styles.chatAvatarWrap, styles.addCircle]}><Icon name="groups" size={22} color="#8D7697" /></View><View style={styles.chatInfo}><Text style={styles.chatName}>{name}</Text><Text style={styles.chatPreview}>Private group · Invite friends to begin</Text></View><Icon name="chevron-right" size={18} color="#AAA2AB" /></Pressable>)}
        {visibleChats.length === 0 ? <View style={styles.emptyChats}><View style={styles.emptyIcon}><Icon name="forum" size={22} color="#947D98" /></View><Text style={styles.emptyTitle}>{chatEmptyCopy.title}</Text><Text style={styles.emptyCopy}>{chatEmptyCopy.body}</Text>{!joined ? <ActionButton onPress={() => { setAuthIntent("signup"); setAuthStep("phone"); setShowSignup(true); }} style={styles.emptyAction}><Text style={styles.actionText}>Create your account</Text><Icon name="arrow-forward" color="#FFFFFF" size={15} /></ActionButton> : acceptedFriends.length === 0 ? <ActionButton onPress={() => setTab("Friends")} style={styles.emptyAction}><Text style={styles.actionText}>Meet neighbors</Text><Icon name="arrow-forward" color="#FFFFFF" size={15} /></ActionButton> : null}</View> : null}
        <View style={styles.safeNote}><Icon name="lock-outline" size={13} color="#8E8A97" /><Text style={styles.safeNoteText}>Messages open after you both accept a friend request.</Text></View>
      </ScrollView>
    </>;
  };

  const renderFriends = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>A SMALLER INTERNET, A CLOSER CIRCLE</Text><Text style={styles.pageTitle}>Friends, not profiles.</Text><Text style={styles.pageSub}>Meet kind people nearby, then connect only when you both say yes.</Text></View>
    <View style={styles.friendsTools}><View style={styles.searchBar}><Icon name="search" size={17} color="#968D9A" /><TextInput value={search} onChangeText={setSearch} placeholder="Search by name or interest" placeholderTextColor="#A6A1A8" style={styles.searchInput} /><Icon name="tune" size={17} color="#90869A" /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.interestFilterRow}>{["Nearby", "Verified", "Coffee", "Books", "Hiking"].map((tag) => <Pressable key={tag} onPress={() => toggleInterest(tag)} style={[styles.filterChip, interestFilter.includes(tag) && styles.filterChipActive]}><Text style={[styles.filterChipText, interestFilter.includes(tag) && styles.filterChipTextActive]}>{tag}</Text></Pressable>)}</ScrollView></View>
      <View style={[styles.friendsScroll, styles.friendsContent]}>
      {incomingRequests.length > 0 ? <View style={styles.requestPanel}><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>WAITING FOR YOU</Text><Text style={styles.requestHeading}>Friend requests <View style={styles.requestCount}><Text style={styles.requestCountText}>{incomingRequests.length}</Text></View></Text></View><Icon name="people-alt" size={20} color="#9B7D99" /></View>{incomingRequests.map((id) => { const person = suggestions.find((item) => item.id === id)!; return <View key={id} style={styles.requestRow}><Image source={person.image} style={styles.requestAvatar} /><View style={styles.requestDetails}><Text style={styles.requestName}>{person.name}</Text><Text style={styles.requestMutual}>You both enjoy {person.interests[0].toLowerCase()}</Text>{verificationBadge(person, true)}</View><View style={styles.requestButtons}><Pressable onPress={() => acceptRequest(id)} style={styles.acceptButton}><Icon name="check" size={17} color="#FFFFFF" /></Pressable><Pressable onPress={() => { setIncomingRequests((current) => current.filter((item) => item !== id)); feedback("Request quietly dismissed."); }} style={styles.declineButton}><Icon name="close" size={16} color="#8F8992" /></Pressable></View></View>; })}</View> : null}
      <View style={styles.suggestHeading}><View><Text style={styles.sectionEyebrow}>GENTLY INTRODUCED · NO SWIPES</Text><Text style={styles.sectionTitle}>A few neighbors nearby</Text></View><View style={styles.sortChip}><Icon name="auto-awesome" size={13} color="#9C789A" /><Text style={styles.sortChipText}>Shared interests</Text></View></View>
      {!discoverable ? <Frosted style={styles.discoveryPaused}><Icon name="visibility-off" size={17} color="#7895A5" /><View style={{ flex: 1 }}><Text style={styles.discoveryPausedTitle}>You&apos;re out of suggestions for now.</Text><Text style={styles.noPressureText}>Turn discovery back on from You → Appear in suggestions.</Text></View></Frosted> : null}
      <View style={styles.friendConnectionList}>{filteredSuggestions.map((person) => { const sent = requestSent.includes(person.id); const sharedInterests = findCommonInterests(joined && profileInterests.length ? profileInterests : ["Coffee walks", "Bookshops", "Park hangs"], person.interests); return <Frosted key={person.id} style={styles.neighborRow}><Pressable accessibilityRole="button" accessibilityLabel={`View ${person.name} profile`} onPress={() => { setProfilePerson(person); tap(); }} style={({ pressed }) => [styles.neighborTapArea, pressed && styles.pressed]}><Image source={person.image} style={styles.neighborAvatar} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.name} details`} onPress={() => { setProfilePerson(person); tap(); }} style={({ pressed }) => [styles.neighborInfo, pressed && styles.pressed]}><View style={styles.neighborNameRow}><Text style={styles.neighborName} numberOfLines={1}>{person.name}</Text><Text style={styles.suggestAge}>{person.age}</Text>{person.verification === "ID + selfie verified" ? <Icon name="verified" size={13} color="#63A087" /> : null}</View><Text style={styles.neighborAbout} numberOfLines={1}>{person.about}</Text>{visibleStatus(person.status) ? <Text style={styles.neighborStatus} numberOfLines={1}>{statusLabel(visibleStatus(person.status))}</Text> : null}<View style={styles.neighborMeta}><Icon name="place" size={11} color="#938894" /><Text style={styles.neighborMetaText}>{person.locality}</Text>{person.verification === "Phone verified" ? <Text style={styles.phoneOnlyLabel}>Phone</Text> : null}</View><View style={styles.commonInterestTags}>{sharedInterests.slice(0, 2).map((tag) => <View key={tag} style={styles.commonInterestTag}><Icon name="auto-awesome" size={9} color="#9A7897" /><Text style={styles.commonInterestTagText}>{tag}</Text></View>)}</View></Pressable><Pressable accessibilityLabel={sent ? "Friend request sent" : `Ask ${person.name} for friendship`} onPress={() => sendFriendRequest(person)} style={[styles.compactRequestButton, sent && styles.requestSentButton]}><Icon name={sent ? "check" : "person-add-alt-1"} size={13} color={sent ? "#5C8A76" : "#8D748F"} /><Text style={[styles.compactRequestText, sent && styles.requestSentText]}>{sent ? "Sent" : "Request"}</Text></Pressable></Frosted>; })}
      {discoverable && filteredSuggestions.length === 0 ? <View style={styles.noMatches}><Icon name="search-off" size={17} color="#9A899D" /><Text style={styles.noMatchesText}>No neighbors match those filters yet.</Text></View> : null}</View>
      <Frosted style={styles.noPressureCard}><View style={styles.noPressureIcon}><Icon name="favorite-border" size={16} color="#A47C9D" /></View><View style={{ flex: 1 }}><Text style={styles.noPressureTitle}>No open DMs, no awkwardness.</Text><Text style={styles.noPressureText}>Chat starts only after you both accept. Declining is quiet.</Text></View></Frosted>
      </View>
  </>;

  const renderMeetups = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>EASY COMPANY, NEARBY</Text><Text style={styles.pageTitle}>A plan makes it easy.</Text><Text style={styles.pageSub}>Small, friendly gatherings you can join at your own pace.</Text></View>
    <Frosted style={styles.meetupIntroCard}><View style={styles.meetupIntroArt}><View style={styles.artBubblePink} /><View style={styles.artBubbleBlue} /><View style={styles.artCenter}><Icon name="diversity-3" size={22} color="#93738E" /></View></View><View style={{ flex: 1 }}><Text style={styles.meetupIntroTitle}>Better in good company.</Text><Text style={styles.meetupIntroCopy}>Meet in public, bring a friend, leave whenever you like.</Text></View><Icon name="verified-user" size={18} color="#6F9C88" /></Frosted>
    <View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>COMING UP</Text><Text style={styles.sectionTitle}>Plans near you</Text></View><Pressable onPress={() => feedback("Meetups are shown by your saved home locality.")} style={styles.locationChip}><Icon name="place" size={13} color="#81758B" /><Text style={styles.locationChipText}>Pacific Heights</Text></Pressable></View>
    {sharedPlans.length ? <><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>YOUR PLANS</Text><Text style={styles.sectionTitle}>Follow-ups from chats</Text></View></View>
      <View style={styles.planFollowList}>{sharedPlans.map(({ chatId, chatName, card }) => { const timing = planTiming(card); return <Frosted key={card.id} style={styles.planFollowCard}><View style={styles.planFollowTop}><View style={styles.planFollowPill}><Text style={styles.planFollowPillText}>{PLAN_KIND_LABEL[card.kind].toUpperCase()}</Text></View><Text style={[styles.planFollowTiming, timing.emphasis === "today" && styles.planFollowTimingToday]}>{timing.label}</Text></View><Text style={styles.planFollowTitle} numberOfLines={1}>{card.title}</Text><View style={styles.meetupPlace}><Icon name="place" size={13} color="#97909B" /><Text style={styles.meetupPlaceText} numberOfLines={1}>{card.proposal.place}</Text></View><View style={styles.meetupPlace}><Icon name="schedule" size={13} color="#97909B" /><Text style={styles.meetupPlaceText}>{card.proposal.date} · {card.proposal.time}</Text></View><View style={styles.planFollowActions}><Pressable onPress={() => startThread(chatId)} style={styles.planFollowButton}><Text style={styles.planFollowButtonText}>Open chat</Text></Pressable><Pressable onPress={() => feedback(`Plan link copied: ${card.link}`)} style={styles.planFollowGhost}><Icon name="link" size={14} color="#8E8595" /></Pressable>{canCheckIn(card) ? <Pressable onPress={() => feedback(checkInSafetyNote(chatName))} style={styles.planFollowCheckIn}><Text style={styles.planFollowCheckInText}>Check in</Text></Pressable> : null}</View><Text style={styles.planFollowWho} numberOfLines={1}>with {chatName.split(" ")[0]} · {card.status}</Text></Frosted>; })}</View></> : null}
    <View style={styles.meetupList}>{meetups.map((meetup) => { const going = joinedMeetups.includes(meetup.id); return <Frosted key={meetup.id} style={styles.meetupCard}><Image source={meetup.image} style={styles.meetupPhoto} resizeMode="cover" /><View style={styles.meetupCopy}><Text style={styles.meetupDay}>{meetup.day}</Text><Text style={styles.meetupTitle}>{meetup.title}</Text><View style={styles.meetupPlace}><Icon name="place" size={13} color="#97909B" /><Text style={styles.meetupPlaceText}>{meetup.place}</Text></View><View style={styles.meetupMeta}><Icon name="groups" size={13} color="#99819B" /><Text style={styles.meetupMetaText}>{meetup.people}</Text><View style={styles.metaDivider} /><Text style={styles.meetupTag}>{going ? "You're on the list" : meetup.tag}</Text></View></View><Pressable onPress={() => { if (!going && !allowAction("join-meetups")) return; setJoinedMeetups((current) => going ? current.filter((id) => id !== meetup.id) : [...current, meetup.id]); if (!going) void runGuardedAction("meetup-join", { meetup: meetup.title }); feedback(going ? "RSVP removed quietly." : "You are on the list. Keep it easy."); }} style={[styles.rsvpButton, going && styles.rsvpJoined]}><Text style={[styles.rsvpText, going && styles.rsvpTextJoined]}>{going ? "Going" : "Join"}</Text></Pressable></Frosted>; })}
      <Pressable onPress={prepareMeetupInvite} style={styles.createPlanLink}><Icon name="add-circle-outline" size={18} color="#947B9B" /><Text style={styles.createPlanText}>Create a meetup invite</Text><Icon name="arrow-forward" size={15} color="#A18AA2" /></Pressable>
    </View>
  </>;

  const renderYou = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>YOUR PLACE IN THE CIRCLE</Text><Text style={styles.pageTitle}>{joined ? `A little more you, ${fullName.split(" ")[0]}.` : "Settle in, when you're ready."}</Text><Text style={styles.pageSub}>You decide when you&apos;re around, and what you share.</Text></View>
    {joined ? <Frosted style={styles.profileCard}><View style={styles.profileAvatarFrame}>{myProfile.photos.length ? <Image source={{ uri: myProfile.photos.find((photo) => photo.id === myProfile.primaryPhotoId)?.uri ?? myProfile.photos[0].uri }} style={styles.profileAvatarPhoto} /> : <View style={styles.profileAvatar}><Text style={styles.profileInitial}>{(myProfile.name || fullName).charAt(0).toUpperCase()}</Text></View>}{myProfile.verification === "id-selfie" ? <View style={styles.profileVerifiedDot}><Icon name="check" size={11} color="#FFFFFF" /></View> : null}</View><Text style={styles.profileName}>{myProfile.name || fullName}{myProfile.age ? `, ${myProfile.age}` : ""}</Text>{visibleStatus(myProfile.status) ? <View style={styles.profileStatusChip}><View style={styles.profileStatusDot} /><Text style={styles.profileStatusText} numberOfLines={1}>{statusLabel(visibleStatus(myProfile.status))}</Text></View> : null}<View style={styles.profilePhoneBadge}><Icon name={myProfile.verification === "id-selfie" ? "verified-user" : "phone-iphone"} size={12} color={myProfile.verification === "id-selfie" ? "#5E947B" : "#788B9B"} /><Text style={styles.profilePhoneText}>{myProfile.verification === "id-selfie" ? "ID + selfie verified" : "Phone verified"}</Text></View><Text style={styles.profileLocality}><Icon name="place" size={14} color="#8D8295" />  {myProfile.locality.trim() || locality.trim() || "Nearby"} · {myProfile.privacy.hideExactLocality ? "distance kept soft" : "exact locality shared"}</Text>{myProfile.bio ? <Text style={styles.profileBio}>{myProfile.bio}</Text> : null}<View style={styles.profileInterests}>{(myProfile.interests.length ? myProfile.interests : profileInterests).slice(0, 4).map((item) => <View key={item} style={styles.profileInterest}><Text style={styles.profileInterestText}>{item}</Text></View>)}</View><View style={styles.profileMetaRow}><View style={styles.profileMetaPill}><Icon name={myProfile.available ? "check-circle" : "pause-circle-outline"} size={12} color={myProfile.available ? "#5E947B" : "#8E8595"} /><Text style={styles.profileMetaText}>{myProfile.available ? "Available for a hello" : "Not available"}</Text></View><View style={styles.profileMetaPill}><Icon name="photo-library" size={12} color="#8E8595" /><Text style={styles.profileMetaText}>{myProfile.photos.length}/6 photos</Text></View><View style={styles.profileMetaPill}><Icon name="group-add" size={12} color="#8E8595" /><Text style={styles.profileMetaText}>{REQUEST_AUDIENCE_LABEL[myProfile.privacy.requestAudience]}</Text></View></View>{myProfile.verification !== "id-selfie" ? <Pressable onPress={startProfileVerification} style={styles.getVerifiedButton}><Icon name="badge" size={14} color="#FFFFFF" /><Text style={styles.getVerifiedText}>Get Verified</Text></Pressable> : null}<Pressable onPress={openProfileEditor} style={styles.editProfileButton}><Text style={styles.editProfileText}>Edit profile</Text><Icon name="arrow-forward" size={15} color="#907B98" /></Pressable></Frosted> : <Frosted style={styles.signupCard}><View style={styles.signupIcon}><Icon name="mark-chat-unread" size={23} color="#937891" /></View><Text style={styles.signupTitle}>A circle that feels like yours.</Text><Text style={styles.signupCopy}>Create a standalone account with phone verification. New conversations begin only after a mutual yes.</Text><ActionButton onPress={openSignup} style={styles.signupCta}><Text style={styles.actionText}>Create your profile</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><View style={styles.phoneRequired}><Icon name="lock-outline" size={14} color="#8091A0" /><Text style={styles.phoneRequiredText}>Phone verification is required; your number stays private.</Text></View></Frosted>}
    {joined ? <Pressable onPress={() => setSelfieModalVisible(true)} style={({ pressed }) => [styles.selfieEntry, pressed && styles.pressed]}><View style={styles.selfieEntryIcon}><Icon name="face-retouching-natural" size={17} color="#8F7594" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Optional selfie identity check</Text><Text style={styles.settingSub}>Capture locally · verified badge only after provider review.</Text></View><Icon name="chevron-right" size={18} color="#A69FAB" /></Pressable> : null}
    <Text style={styles.settingsLabel}>HOW YOU SHOW UP</Text>
    <Frosted style={styles.settingsPanel}>
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="circle" size={16} color="#75A98F" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Available for a hello</Text><Text style={styles.settingSub}>Let accepted friends know you&apos;re around.</Text></View><View style={styles.toggleFrame}><Switch value={available} onValueChange={(value) => { setAvailable(value); tap(); feedback(value ? "You're showing as available." : "Available status paused."); }} trackColor={{ false: "#DDD9E1", true: "#B8D9CA" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="visibility-off" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Appear in suggestions</Text><Text style={styles.settingSub}>You can pause discovery any time.</Text></View><View style={styles.toggleFrame}><Switch value={discoverable} onValueChange={(value) => { setDiscoverable(value); tap(); feedback(value ? "You&apos;re back in suggestions." : "You&apos;ve been hidden from suggestions."); }} trackColor={{ false: "#DDD9E1", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
      <View style={styles.settingDivider} />
      {/* Exact distance is a Premium feature, so turning the softening off offers the upgrade. */}
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="my-location" size={17} color="#987998" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Soften my distance</Text><Text style={styles.settingSub}>Show a broad area, never an exact pin.</Text></View><View style={styles.toggleFrame}><Switch value={blurDistance} onValueChange={(value) => { if (!value) { const mapPermission = liveMapGate(tier); if (!mapPermission.allowed) { openPaywall(mapPermission.message, "quarterly"); return; } } setBlurDistance(value); tap(); feedback(value ? "Approximate distance is on." : "Exact distance is visible now."); }} trackColor={{ false: "#DDD9E1", true: "#E6C8DA" }} thumbColor="#FFFFFF" /></View></View>
    </Frosted>
    <Text style={styles.settingsLabel}>PRIVACY & LITTLE EXTRAS</Text>
    <Frosted style={styles.settingsPanel}>
      <Pressable onPress={() => feedback("Safety center · report, block, and meetup reminders.")} style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="shield" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Safety center</Text><Text style={styles.settingSub}>Report, block, and meetup comfort.</Text></View><Icon name="chevron-right" size={18} color="#A69FAB" /></Pressable>
      <View style={styles.settingDivider} />
      <Pressable onPress={() => { tap(); if (paidTier) { setManageOpen(true); } else { openPaywall(undefined, subscription.planId); } }} accessibilityRole="button" accessibilityLabel={paidTier ? `Manage Trufrenz Premium, ${tierLabel(tier)}` : "Upgrade to Trufrenz Premium"} style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="workspace-premium" size={17} color="#A27898" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{paidTier ? "Trufrenz Premium" : "A little more Trufrenz"}</Text><Text style={styles.settingSub}>{paidTier ? `${activePlanLine(subscription)} · manage` : "Calls, live map, and read receipts · from ₹49"}</Text></View><View style={[styles.tierPill, paidTier && styles.tierPillActive]}><Text style={[styles.tierPillText, paidTier && styles.tierPillTextActive]}>{tierLabel(tier)}</Text></View></Pressable><Pressable onPress={() => { setCallSession(createCallSession({ id: `call-${Date.now()}`, peerName: "Maya Chen", peerVerified: true, video: false, direction: "incoming" })); tap(); }} accessibilityRole="button" accessibilityLabel="Preview an incoming call screen" style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="call" size={17} color="#7393A8" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Preview an incoming call</Text><Text style={styles.settingSub}>Caller photo, verified badge, Accept or Decline</Text></View><Icon name="chevron-right" size={17} color="#A9A1AB" /></Pressable>
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
          <View style={styles.settingIconPink}><Icon name="campaign" size={17} color="#987998" /></View>
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
                  <MaterialIcons name="open-in-new" size={13} color="#8E6F91" />
                  <Text style={styles.noticeStoreActionText}>{storeManageActionLabel(Platform.OS)}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Frosted>
    ) : null}

    <Frosted style={styles.appearancePanel}>
      <View style={styles.appearanceHeadingRow}><View style={styles.settingIconPink}><Icon name="blur-on" size={17} color="#987998" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Frosted glass opacity</Text><Text style={styles.settingSub}>Choose how much of the wallpaper shows through.</Text></View><Text style={styles.opacityReadout}>{glassOpacity}%</Text></View>
      <View accessibilityLabel="Frosted glass opacity presets" style={styles.opacityOptions}>
        {GLASS_OPACITY_STEPS.map((value) => {
          const selected = value === glassOpacity;
          return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Set frosted glass opacity to ${value} percent`} onPress={() => { setGlassOpacity(value); tap(); feedback(`Frosted glass opacity set to ${value}%.`); }} style={({ pressed }) => [styles.opacityOption, selected && styles.opacityOptionActive, pressed && styles.pressed]}><Text style={[styles.opacityOptionText, selected && styles.opacityOptionTextActive]}>{value}%</Text></Pressable>;
        })}
      </View>
      <View style={styles.opacityScaleCaption}><Text style={styles.opacityScaleText}>More wallpaper</Text><Text style={styles.opacityScaleText}>More opaque</Text></View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="wallpaper" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Show wallpaper</Text><Text style={styles.settingSub}>Use the soft photo backdrop across the app.</Text></View><View style={styles.toggleFrame}><Switch accessibilityLabel="Show wallpaper" value={wallpaperVisible} onValueChange={(value) => { setWallpaperVisible(value); tap(); feedback(value ? "Wallpaper is visible." : "Wallpaper is hidden."); }} trackColor={{ false: "#DDD9E1", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View></View>
    </Frosted>
    <Text style={styles.settingsLabel}>ACCOUNT</Text>
    <Frosted style={styles.settingsPanel}>
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="person-outline" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{isGuestSession(session) ? "Guest preview" : "Signed in"}</Text><Text style={styles.settingSub}>{isGuestSession(session) ? "Browse-only mode · join any time to chat and meet up." : `Phone verified${fullName.trim() ? ` · ${fullName.trim()}` : ""}`}</Text></View><View style={styles.verificationPill}><Icon name={isGuestSession(session) ? "visibility" : "verified"} size={12} color="#588B79" /><Text style={styles.verificationText}>{isGuestSession(session) ? "Guest" : "Member"}</Text></View></View>
      <View style={styles.settingDivider} />
      <Pressable onPress={() => { if (isGuestSession(session)) { setAuthIntent("signup"); setAuthStep("phone"); setShowSignup(true); } else { signOut(); } }} accessibilityRole="button" accessibilityLabel={isGuestSession(session) ? "Create an account" : "Sign out"} style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}><View style={styles.settingIconPink}><Icon name={isGuestSession(session) ? "person-add" : "logout"} size={17} color="#987998" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>{isGuestSession(session) ? "Create your account" : "Sign out"}</Text><Text style={styles.settingSub}>{isGuestSession(session) ? "Sign up to chat, request friends, and join meetups." : "Return to the welcome screen on this device."}</Text></View><Icon name="chevron-right" size={18} color="#A69FAB" /></Pressable>
    </Frosted>
    <Text style={styles.footerNote}>Your space. Your pace. Always friends first.</Text>
  </>;

  const renderContent = () => {
    if (tab === "Chats") return renderChats();
    if (tab === "Friends") return renderFriends();
    if (tab === "Meetups") return renderMeetups();
    return renderYou();
  };

  const showWelcome = sessionLoaded && shouldShowWelcome(session);

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
      {showWelcome ? null : <View style={[styles.backgroundImageWrap, styles.noninteractive]}><Image source={require("../../assets/images/kindred-background.jpg")} style={[styles.backgroundImage, { opacity: wallpaperVisible ? 0.27 : 0 }]} resizeMode="cover" /></View>}
      {showWelcome ? null : <>
      <View style={[styles.backgroundWash, styles.noninteractive]} />
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
      {showWelcome ? null : <Animated.View style={[styles.screenContent, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>{tab === "Chats" && selectedChat ? renderContent() : <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={tab === "Friends" || tab === "Meetups" ? <RefreshControl refreshing={isRefreshing} onRefresh={refreshNearbyFeed} tintColor="#9D7E9E" colors={["#9D7E9E", "#87AEBF"]} progressBackgroundColor="#FCF9FC" /> : undefined}>{renderContent()}</ScrollView>}</Animated.View>}
      {isRefreshing ? <View style={styles.refreshGlass} pointerEvents="none"><BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} /><View style={styles.refreshGlassContent}><ActivityIndicator size="small" color="#987998" /><Text style={styles.refreshGlassText}>Refreshing your nearby circle</Text></View></View> : null}
      {transitionBusy ? <View style={styles.handoffOverlay} pointerEvents="none"><BlurView intensity={25} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.handoffBlur}><View style={styles.handoffCard}><View style={styles.handoffHeadline}><ActivityIndicator size="small" color="#9B7E9D" /><Text style={styles.handoffTitle}>{tab === "Meetups" ? "Finding a plan nearby" : "Back to your conversations"}</Text></View><Animated.View style={[styles.handoffSkeleton, { opacity: loaderPulse }]}><View style={styles.skeletonAvatar} /><View style={styles.skeletonTextGroup}><View style={styles.skeletonLineLong} /><View style={styles.skeletonLineShort} /></View></Animated.View><Text style={styles.handoffCaption}>A little closer, one moment.</Text></View></BlurView></View> : null}
      {toast ? <View style={styles.toast}><Icon name="check-circle" size={16} color="#FFFFFF" /><Text style={styles.toastText}>{toast}</Text></View> : null}
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
              <Icon name="shield-moon" size={18} color="#8E6F91" />
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
            <Icon name="chevron-right" size={16} color="#8E6F91" />
          </Pressable>
        </View>
      ) : null}
      {showWelcome || adDismissed || !entitlements.ads ? null : (
        <View style={styles.adBanner}>
          <Icon name="workspace-premium" size={15} color="#A27898" />
          <Text style={styles.adBannerText} numberOfLines={2}>{BANNER_AD_COPY}</Text>
          <Pressable onPress={() => { tap(); openPaywall(undefined, "quarterly"); }} accessibilityRole="button" accessibilityLabel="See Trufrenz Premium plans" style={({ pressed }) => [styles.adBannerCta, pressed && styles.pressed]}>
            <Text style={styles.adBannerCtaText}>See plans</Text>
          </Pressable>
          <Pressable onPress={() => { setAdDismissed(true); tap(); }} accessibilityRole="button" accessibilityLabel="Dismiss advertisement" hitSlop={8} style={({ pressed }) => [styles.adBannerClose, pressed && styles.pressed]}>
            <Icon name="close" size={14} color="#9A93A4" />
          </Pressable>
        </View>
      )}
      {showWelcome || shouldHideTabBarForKeyboard({ keyboardHeight, hasOpenChat: Boolean(selectedChat) }) ? null : <View style={[styles.bottomBar, { backgroundColor: glassSurfaceColor("rgba(251,249,248,0.76)", glassOpacity) }]}><BlurView intensity={24} tint="light" experimentalBlurMethod="dimezisBlurView" style={[StyleSheet.absoluteFillObject, styles.noninteractive]} />{(["Chats", "Friends", "Meetups", "You"] as Tab[]).map((item) => { const active = tab === item && !selectedChat; const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Chats: "forum", Friends: "diversity-3", Meetups: "event-available", You: "person-outline" }; return <Pressable key={item} onPress={() => { setTab(item); if (item !== "Chats") setSelectedChat(null); tap(); }} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Icon name={iconName[item]} color={active ? "#8E6F91" : "#9A969F"} size={19} /></View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item}</Text></Pressable>; })}</View>}
      <Modal visible={navigationMenuOpen} transparent animationType="fade" onRequestClose={() => setNavigationMenuOpen(false)}>
        <Pressable style={[styles.navigationMenuShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={() => setNavigationMenuOpen(false)}>
          <BlurView intensity={34} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.navigationMenuBlur, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor("rgba(250,248,251,0.92)", glassOpacity) }]}>
            <Pressable onPress={(event) => event.stopPropagation()} style={[styles.navigationMenuCard, { maxHeight: modalLayout.maxHeight - 2, backgroundColor: glassSurfaceColor("rgba(250,248,251,0.87)", glassOpacity) }]}>
              <ScrollView style={styles.navigationMenuScroll} contentContainerStyle={styles.navigationMenuContent} showsVerticalScrollIndicator={false}>
              <View style={styles.actionMenuHandle} />
              <View style={styles.navigationMenuHeader}><View><Text style={styles.actionMenuEyebrow}>MOVE AROUND</Text><Text style={styles.navigationMenuTitle}>Where would you like to go?</Text></View><Pressable onPress={() => setNavigationMenuOpen(false)} accessibilityLabel="Close navigation options" style={styles.roundAction}><Icon name="close" size={18} color="#746A7D" /></Pressable></View>
              <View style={styles.navigationMenuGrid}>{(["Chats", "Friends", "Meetups", "You"] as Tab[]).map((item) => { const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Chats: "forum", Friends: "diversity-3", Meetups: "event-available", You: "person-outline" }; const active = tab === item && !selectedChat; return <Pressable key={item} onPress={() => navigateFromMenu(item)} accessibilityRole="button" accessibilityLabel={`Go to ${item}`} style={({ pressed }) => [styles.navigationMenuItem, { width: modalLayout.compact ? "100%" : "48%", minHeight: modalLayout.compact ? 50 : 58 }, active && styles.navigationMenuItemActive, pressed && styles.pressed]}><View style={[styles.navigationMenuIcon, active && styles.navigationMenuIconActive]}><Icon name={iconName[item]} size={20} color={active ? "#FFFFFF" : "#806F88"} /></View><Text style={[styles.navigationMenuItemText, active && styles.navigationMenuItemTextActive]}>{item === "Chats" ? "Conversations" : item === "You" ? "Profile" : item}</Text></Pressable>; })}</View>
              <Text style={styles.navigationMenuHint}>Your phone’s Back button also closes sheets, returns from a chat, and takes you back to Conversations.</Text>
              </ScrollView>
            </Pressable>
          </BlurView>
        </Pressable>
      </Modal>
      <Modal visible={showSignup} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSignup}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}><View style={styles.brandMark}><View style={styles.brandIcon}><Icon name="spa" size={16} color="#FFFFFF" /></View><Text style={styles.brandWord}>Trufrenz</Text></View><Pressable onPress={closeSignup} accessibilityLabel="Close signup" style={styles.roundAction}><Icon name="close" size={19} color="#746A7D" /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.pageEyebrow}>{authStep === "phone" ? (authIntent === "login" ? "WELCOME BACK" : "STEP 1 OF 4 · PHONE") : authStep === "code" ? "ONE SMALL SAFETY STEP" : authStep === "profile" ? "STEP 2 OF 4 · ABOUT YOU" : authStep === "photo" ? "STEP 3 OF 4 · YOUR PHOTO" : "STEP 4 OF 4 · ALL SET"}</Text>
              <Text style={styles.modalTitle}>{authStep === "phone" ? (authIntent === "login" ? "Log in with\nyour number." : "Your number.\nYour own account.") : authStep === "code" ? "Check your\nphone." : authStep === "profile" ? "What should friends\ncall you?" : authStep === "photo" ? "Show your\nfriendly face." : "You're ready\nto belong."}</Text>
              <Text style={styles.modalSubtitle}>{authStep === "phone" ? "Phone OTP verification is required. Your number is used for safety, never shown on your profile." : authStep === "code" ? (demoCode ? `Prototype delivery: your code is ${demoCode}. A live build sends this by SMS.` : `We sent a 6-digit code to ${phone || "your phone"}. It expires in 10 minutes.`) : authStep === "profile" ? "Your name, date of birth, and neighborhood help nearby friends find you. Nothing here is public beyond your circle." : authStep === "photo" ? "A real photo helps people recognize you at a meetup. You can add or change it later." : "Here's what your neighbors will see. You can update everything from your profile."}</Text>
              {authStep === "phone" ? <><View style={styles.formField}><Text style={styles.fieldLabel}>PHONE NUMBER · REQUIRED</Text><TextInput value={phone} onChangeText={setPhone} placeholder="+1 (415) 555-0142" placeholderTextColor="#AAA4AC" keyboardType="phone-pad" autoCapitalize="none" style={styles.fieldInput} returnKeyType="done" /></View><Frosted style={styles.authPromise}><View style={styles.authPromiseIcon}><Icon name="lock-outline" size={18} color="#7690A1" /></View><View style={{ flex: 1 }}><Text style={styles.authPromiseTitle}>The chat comes after the yes.</Text><Text style={styles.authPromiseCopy}>Verified members · quiet friend requests · no open DMs</Text></View></Frosted></> : null}
              {authStep === "code" ? <View style={styles.formField}><Text style={styles.fieldLabel}>6-DIGIT OTP</Text><TextInput value={passcode} onChangeText={(value) => setPasscode(value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••••" placeholderTextColor="#AAA4AC" keyboardType="number-pad" style={[styles.fieldInput, styles.codeInput]} /></View> : null}
              {authStep === "profile" ? <>
                <View style={styles.formField}><Text style={styles.fieldLabel}>NAME OR NICKNAME</Text><TextInput value={fullName} onChangeText={(value) => { setFullName(value); setProfileErrors((current) => ({ ...current, name: undefined })); }} placeholder="What do people call you?" placeholderTextColor="#AAA4AC" style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.name ? <Text style={styles.fieldError}>{profileErrors.name}</Text> : null}
                <View style={styles.formField}><Text style={styles.fieldLabel}>DATE OF BIRTH · ADULTS ONLY</Text><TextInput value={dateOfBirth} onChangeText={(value) => { setDateOfBirth(value); setProfileErrors((current) => ({ ...current, dateOfBirth: undefined })); }} placeholder="1996-04-18 or 04/18/1996" placeholderTextColor="#AAA4AC" keyboardType={Platform.OS === "web" ? "default" : "numbers-and-punctuation"} style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.dateOfBirth ? <Text style={styles.fieldError}>{profileErrors.dateOfBirth}</Text> : <Text style={styles.fieldHint}>{dateOfBirth && parseDateOfBirth(dateOfBirth) ? `Age ${ageFromDateOfBirth(parseDateOfBirth(dateOfBirth)!)} · shown as an age, never your birth date.` : "We show your age, never your exact birth date."}</Text>}
                <View style={styles.formField}><Text style={styles.fieldLabel}>LOCALITY</Text><TextInput value={locality} onChangeText={(value) => { setLocality(value); setProfileErrors((current) => ({ ...current, locality: undefined })); }} placeholder="Your neighborhood" placeholderTextColor="#AAA4AC" style={styles.fieldInput} returnKeyType="done" /></View>
                {profileErrors.locality ? <Text style={styles.fieldError}>{profileErrors.locality}</Text> : null}
                <View style={styles.suggestionRow}>{LOCALITY_SUGGESTIONS.slice(0, 4).map((item) => <Pressable key={item} onPress={() => { setLocality(item); setProfileErrors((current) => ({ ...current, locality: undefined })); tap(); }} style={[styles.suggestionChip, locality === item && styles.suggestionChipActive]}><Text style={[styles.suggestionChipText, locality === item && styles.suggestionChipTextActive]}>{item}</Text></Pressable>)}</View>
                <View style={styles.formField}><Text style={styles.fieldLabel}>EMAIL FOR RECOVERY · OPTIONAL</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#AAA4AC" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.fieldInput} /></View>
                <Text style={styles.fieldLabel}>THINGS YOU ENJOY · PICK UP TO 4</Text>
                <View style={styles.interestOptions}>{INTEREST_SUGGESTIONS.map((item) => { const selected = profileInterests.includes(item); return <Pressable key={item} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Interest ${item}`} onPress={() => { setProfileInterests((current) => toggleProfileInterest(current, item)); setProfileErrors((current) => ({ ...current, interests: undefined })); tap(); }} style={[styles.interestOption, selected && styles.interestOptionActive]}><Text style={[styles.interestOptionText, selected && styles.interestOptionTextActive]}>{item}</Text></Pressable>; })}</View>
                {profileErrors.interests ? <Text style={styles.fieldError}>{profileErrors.interests}</Text> : null}
                <View style={styles.verifiedNote}><Icon name="phone-iphone" size={15} color="#7A8FA0" /><Text style={styles.verifiedNoteText}>Phone verified. Add a selfie or ID later for a stronger badge.</Text></View>
              </> : null}
              {authStep === "photo" ? <>
                <Pressable onPress={pickProfilePhoto} accessibilityRole="button" accessibilityLabel="Choose a profile photo" style={({ pressed }) => [styles.photoPicker, pressed && styles.pressed]}>
                  {profilePhoto ? <Image source={{ uri: profilePhoto }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Icon name="add-a-photo" size={26} color="#9A8AA0" /></View>}
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
                <View style={styles.summaryRow}><Icon name="groups" size={15} color="#8F7594" /><Text style={styles.summaryRowText}>Chats open after a mutual yes. Meetups are always in public places.</Text></View>
                <Text style={styles.fieldLabel}>BEFORE YOU JOIN · HOW TRUFRENZ STAYS KIND</Text>
                <SafetyOnboardingCarousel onComplete={finishSignup} />
              </> : null}
              <ActionButton onPress={continueAuth} disabled={authBusy} style={styles.authContinue}><Text style={styles.actionText}>{authBusy ? "Please wait…" : authStep === "phone" ? (authIntent === "login" ? "Send my login code" : "Send my code") : authStep === "code" ? (authIntent === "login" ? "Log in" : "Verify & continue") : authStep === "profile" ? "Continue" : authStep === "photo" ? (profilePhoto ? "Use this photo" : "Skip for now") : "Join the circle"}</Text><Icon name="arrow-forward" size={16} color="#FFFFFF" /></ActionButton>
              <Pressable onPress={backAuth} style={styles.backLink}><Icon name="arrow-back" size={14} color="#8C7D92" /><Text style={styles.backLinkText}>{authStep === "phone" ? "Back to welcome" : "Back"}</Text></Pressable>
              <View style={styles.modalPrivacy}><Icon name="lock-outline" size={13} color="#8496A3" /><Text style={styles.modalPrivacyText}>Your number stays private and never appears on your profile.</Text></View>
              <Text style={styles.prototypeNote}>Prototype only: phone codes and identity checks are not connected to a live verification service.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={composerOpen} animationType="fade" transparent onRequestClose={() => setComposerOpen(false)}>
        <View style={[styles.composerModalShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}><Frosted style={[styles.groupModal, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight }]}><View style={styles.modalTopLine}><View style={styles.groupModalIcon}><Icon name="groups" size={19} color="#90768F" /></View><Pressable onPress={() => setComposerOpen(false)} style={styles.roundAction}><Icon name="close" size={18} color="#746A7D" /></Pressable></View><Text style={styles.groupModalTitle}>A little private circle</Text><Text style={styles.groupModalCopy}>Groups are invite-only, for friends you&apos;ve already accepted.</Text><TextInput value={newGroupName} onChangeText={setNewGroupName} placeholder="Give your group a name" placeholderTextColor="#A6A0AA" style={styles.fieldInput} /><ActionButton onPress={toggleGroup} style={styles.groupCreateButton}><Text style={styles.actionText}>Create private group</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setComposerOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Not now</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={verificationPrompt} animationType="fade" transparent onRequestClose={() => setVerificationPrompt(false)}>
        <View style={[styles.composerModalShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]}><Frosted style={[styles.groupModal, { width: "100%", maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight }]}><View style={styles.modalTopLine}><View style={styles.verificationModalIcon}><Icon name="verified-user" size={19} color="#65947E" /></View><Pressable onPress={() => setVerificationPrompt(false)} style={styles.roundAction}><Icon name="close" size={18} color="#746A7D" /></Pressable></View><Text style={styles.groupModalTitle}>A little extra trust, first.</Text><Text style={styles.groupModalCopy}>Your phone is verified. To send friend requests, add a live-selfie match or ID check for the stronger badge. You can keep browsing until then.</Text><View style={styles.verificationStep}><Icon name="phone-iphone" size={16} color="#7C94A5" /><Text style={styles.verificationStepText}>Phone verification · complete</Text><Icon name="check-circle" size={15} color="#72A58B" /></View><View style={styles.verificationStep}><Icon name="face" size={16} color="#987C9B" /><Text style={styles.verificationStepText}>Selfie match or ID check · optional</Text><Icon name="lock-outline" size={14} color="#A8A1AA" /></View><ActionButton onPress={() => { setVerificationPrompt(false); setSelfieModalVisible(true); }} style={styles.groupCreateButton}><Text style={styles.actionText}>Start selfie check</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setVerificationPrompt(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Maybe later</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={actionMenuOpen} transparent animationType="fade" onRequestClose={() => setActionMenuOpen(false)}>
        <Pressable style={[styles.actionMenuShade, { paddingHorizontal: modalLayout.horizontalGutter, paddingTop: modalLayout.topPadding, paddingBottom: modalLayout.bottomPadding }]} onPress={() => setActionMenuOpen(false)}><BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={[styles.actionMenuBlur, { maxWidth: modalLayout.maxWidth, maxHeight: modalLayout.maxHeight, backgroundColor: glassSurfaceColor("rgba(250,248,251,0.92)", glassOpacity) }]}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.actionMenuCard, { maxHeight: modalLayout.maxHeight - 2, backgroundColor: glassSurfaceColor("rgba(250,248,251,0.88)", glassOpacity) }]}><ScrollView style={styles.navigationMenuScroll} contentContainerStyle={styles.navigationMenuContent} showsVerticalScrollIndicator={false}><View style={styles.actionMenuHandle} /><Text style={styles.actionMenuEyebrow}>KEEP IT EASY</Text><Text style={styles.actionMenuTitle}>Share something small.</Text><Text style={styles.actionMenuSub}>Only this accepted friend can see what you send.</Text><Pressable onPress={shareApproximateArea} style={styles.actionMenuRow}><View style={styles.actionMenuIconBlue}><Icon name="near-me" size={18} color="#7393A8" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Share my approximate area</Text><Text style={styles.actionMenuItemSub}>Broad neighborhood only · no live pin</Text></View><Icon name="chevron-right" size={17} color="#A9A1AB" /></Pressable><View style={styles.actionMenuDivider} /><Pressable onPress={prepareMeetupInvite} style={styles.actionMenuRow}><View style={styles.actionMenuIconPink}><Icon name="event-available" size={18} color="#9A7796" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Invite them to a meetup</Text><Text style={styles.actionMenuItemSub}>Adds a friendly invite to your editable draft</Text></View><Icon name="chevron-right" size={17} color="#A9A1AB" /></Pressable><View style={styles.actionMenuPrivacy}><Icon name="lock-outline" size={13} color="#8092A0" /><Text style={styles.actionMenuPrivacyText}>Trufrenz never shares your exact location automatically.</Text></View><Pressable onPress={() => setActionMenuOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Cancel</Text></Pressable></ScrollView></Pressable></BlurView></Pressable>
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
  backgroundImageWrap: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { width: "100%", height: "100%", opacity: 0.27 },
  backgroundWash: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(250,248,247,0.24)" },
  screenContent: { flex: 1 },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientPink: { position: "absolute", top: 120, right: -140, height: 330, width: 330, borderRadius: 170, backgroundColor: "rgba(250,220,234,0.18)" },
  ambientBlue: { position: "absolute", top: 390, left: -180, height: 320, width: 320, borderRadius: 170, backgroundColor: "rgba(208,231,246,0.17)" },
  ambientLilac: { position: "absolute", top: 640, right: -180, height: 270, width: 270, borderRadius: 140, backgroundColor: "rgba(231,221,241,0.12)" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 19, paddingTop: 8, paddingBottom: 18, flexGrow: 1 },
  topBar: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: { width: 31, height: 31, borderRadius: 12, backgroundColor: "#957A99", alignItems: "center", justifyContent: "center" },
  brandWord: { fontSize: 18, fontWeight: "700", letterSpacing: -0.45, color: "#4E4856" },
  topBarSub: { marginTop: 2, color: "#8F8993", fontSize: 9 },
  backButton: { height: 35, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  backButtonText: { color: "#6D6178", fontSize: 9, fontWeight: "700" },
  threadHeading: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  threadHeadingCopy: { flex: 1, minWidth: 0 },
  threadTitle: { color: "#4E4856", fontSize: 14, fontWeight: "700" },
  threadStatus: { color: "#8A7F92", fontSize: 9, fontWeight: "600", marginTop: 2 },
  neighborStatus: { color: "#8E8194", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
  threadAvatarButton: { width: 37, height: 37, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", padding: 1, backgroundColor: "rgba(255,255,255,0.8)" },
  threadAvatar: { width: "100%", height: "100%", borderRadius: 12 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  roundAction: { position: "relative", height: 35, width: 35, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", alignItems: "center", justifyContent: "center", shadowColor: "#766D7D", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 1 },
  notificationDot: { position: "absolute", right: 7, top: 7, height: 6, width: 6, borderRadius: 3, backgroundColor: "#DB91B2", borderWidth: 1, borderColor: "#FFFFFF" },
  userAvatar: { height: 35, width: 35, borderRadius: 14, backgroundColor: "#EEE5EF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF" },
  userInitial: { color: "#816C8A", fontSize: 15, fontWeight: "700" },
  greeting: { color: "#9B8E9C", fontSize: 11, fontWeight: "500", letterSpacing: 0.2 },
  chatHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11, marginBottom: 15 },
  chatTitle: { color: "#3D3946", fontSize: 24, fontWeight: "700", letterSpacing: -0.75, marginTop: 3 },
  composeButton: { width: 39, height: 39, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#A17FA1", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", shadowColor: "#977B97", shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  frosted: { backgroundColor: "rgba(255,255,255,0.79)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", borderRadius: 19, shadowColor: "#8B8492", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.075, shadowRadius: 15, elevation: 3 },
  searchBar: { height: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.73)" },
  searchInput: { flex: 1, color: "#504B57", fontSize: 11, paddingVertical: 0, outlineStyle: "none" as any },
  filterRow: { flexDirection: "row", gap: 7, marginTop: 10, marginBottom: 10 },
  filterChip: { minHeight: 27, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", shadowColor: "#766D7D", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  filterChipActive: { backgroundColor: "#EFE4F0", borderColor: "#E2D2E5" },
  filterChipText: { fontSize: 10, color: "#938A95", fontWeight: "500" },
  filterChipTextActive: { color: "#806B88", fontWeight: "700" },
  circlesSection: { marginTop: 3, marginBottom: 12 },
  sectionHeaderLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: "#9A929D", fontSize: 8, fontWeight: "700", letterSpacing: 1.1 },
  sectionLink: { color: "#9B7898", fontSize: 9, fontWeight: "600" },
  circlesRow: { alignItems: "flex-start", gap: 17, paddingTop: 10, paddingBottom: 3 },
  circleItem: { width: 51, alignItems: "center", gap: 4 },
  circleImageWrap: { width: 48, height: 48, borderRadius: 18, borderWidth: 1.5, borderColor: "#E7CEE0", padding: 2, position: "relative" },
  circleImage: { width: "100%", height: "100%", borderRadius: 15 },
  circleStatus: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: "#C8C4C9", borderWidth: 2, borderColor: "#FAF8F7" },
  circleStatusOnline: { backgroundColor: "#70AD91" },
  circleName: { color: "#77717D", fontSize: 8, textAlign: "center" },
  addCircle: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(240,229,242,0.80)", borderWidth: 1, borderColor: "#FFFFFF" },
  myCircle: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#E2EDF4" },
  myCircleInitial: { fontSize: 17, color: "#6F8B9D", fontWeight: "700" },
  addSmall: { position: "absolute", bottom: -1, right: -1, backgroundColor: "#A77F9D", width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "#FAF8F7", alignItems: "center", justifyContent: "center" },
  listHeading: { height: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2, borderBottomWidth: 1, borderBottomColor: "rgba(211,204,212,0.42)" },
  chatListScroll: { flex: 1 },
  chatList: { paddingBottom: 13 },
  chatRow: { minHeight: 69, flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.66)", paddingHorizontal: 8, paddingVertical: 8, marginBottom: 6, shadowColor: "#817888", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.055, shadowRadius: 9, elevation: 1 },
  rowPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  chatAvatarWrap: { position: "relative", width: 48, height: 48 },
  chatAvatar: { width: 48, height: 48, borderRadius: 18, backgroundColor: "#EEE7EF" },
  groupMini: { position: "absolute", width: 19, height: 19, bottom: -3, right: -3, borderRadius: 8, backgroundColor: "#9D83A2", borderWidth: 2, borderColor: "#FAF8F7", alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", width: 11, height: 11, bottom: 0, right: 0, borderRadius: 6, backgroundColor: "#70AD91", borderWidth: 2, borderColor: "#FAF8F7" },
  chatInfo: { flex: 1, minWidth: 0 },
  chatTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chatNameCluster: { flexDirection: "row", alignItems: "center", gap: 4 },
  chatName: { color: "#47414D", fontSize: 12, fontWeight: "650" as any },
  chatTime: { color: "#A19BA4", fontSize: 8 },
  chatTimeUnread: { color: "#9D7398", fontWeight: "700" },
  chatLastRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 },
  chatPreview: { color: "#8E8891", fontSize: 10, flex: 1, paddingRight: 7 },
  unreadBadge: { minWidth: 17, height: 17, borderRadius: 8.5, paddingHorizontal: 4, backgroundColor: "#B18AAE", alignItems: "center", justifyContent: "center" },
  unreadCount: { color: "#FFFFFF", fontSize: 8, fontWeight: "700" },
  safeNote: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, paddingVertical: 8 },
  safeNoteText: { color: "#99939E", fontSize: 8 },
  emptyChats: { alignItems: "center", paddingVertical: 35, paddingHorizontal: 24 },
  emptyIcon: { width: 53, height: 53, borderRadius: 20, backgroundColor: "#EFE6F0", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#524B59", fontSize: 15, fontWeight: "700", marginTop: 10 },
  emptyCopy: { color: "#908995", fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 5 },
  actionButton: { height: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: "#A17FA1", borderWidth: 1, borderColor: "rgba(255,255,255,0.54)", paddingHorizontal: 14, shadowColor: "#715C78", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 9, elevation: 2 },
  actionButtonSecondary: { backgroundColor: "#F0E6F0" },
  actionText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  emptyAction: { marginTop: 13 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  threadScreen: { flex: 1, paddingHorizontal: 16, paddingTop: 6 },
  threadSafety: { minHeight: 31, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, marginBottom: 2 },
  threadSafetyText: { color: "#93909A", fontSize: 8 },
  threadBody: { flex: 1 },
  threadContent: { paddingTop: 10, paddingBottom: 16, gap: 10 },
  dayDivider: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginVertical: 6 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(211,203,215,0.58)" },
  dayLabel: { color: "#9A939D", fontSize: 8, letterSpacing: 1 },
  sharedInterest: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 11, backgroundColor: "rgba(247,235,245,0.80)", paddingHorizontal: 10, paddingVertical: 6, marginBottom: 5 },
  sharedInterestText: { color: "#9A7E98", fontSize: 8 },
  messageRow: { flexDirection: "row", justifyContent: "flex-start" },
  myMessageRow: { justifyContent: "flex-end" },
  readOnlyBar: { flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 12, marginBottom: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(246,238,247,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)" },
  readOnlyBarText: { flex: 1, color: "#7A6B73", fontSize: 9, fontWeight: "600" },
  senderLabel: { color: "#8E8595", fontSize: 8.5, fontWeight: "700", marginBottom: 2 },
  messageColumn: { maxWidth: "86%", gap: 4 },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 130 },
  voicePlay: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.8)" },
  voiceWave: { flexDirection: "row", alignItems: "center", gap: 2, flex: 1, height: 22 },
  voiceBar: { flex: 1, borderRadius: 2, backgroundColor: "rgba(150,120,150,0.55)" },
  voiceTime: { color: "#8A7F92", fontSize: 9, fontWeight: "700" },
  locationRow: { flexDirection: "row", alignItems: "flex-start", gap: 7, minWidth: 150 },
  locationCopy: { flex: 1, minWidth: 0 },
  locationNote: { color: "#8A7F92", fontSize: 8.5, fontWeight: "600", marginTop: 3 },
  photoBubble: { width: 190, height: 140, borderRadius: 13, backgroundColor: "rgba(232,226,234,0.9)" },
  reactionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: -2 },
  myReactionRow: { justifyContent: "flex-end" },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 11, borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", backgroundColor: "rgba(255,255,255,0.82)", paddingHorizontal: 6, paddingVertical: 3, shadowColor: "#7A6E80", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  reactionChipMine: { borderColor: "rgba(190,150,190,0.65)", backgroundColor: "rgba(246,238,247,0.94)" },
  reactionEmoji: { fontSize: 11 },
  reactionCount: { color: "#7C7286", fontSize: 9, fontWeight: "700" },
  reactionPicker: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 2, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 6, paddingVertical: 5, shadowColor: "#7A6E80", shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  myReactionPicker: { alignSelf: "flex-end" },
  reactionChoice: { paddingHorizontal: 4, paddingVertical: 2 },
  reactionChoiceEmoji: { fontSize: 17 },
  messageBubble: { maxWidth: "83%", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 16 },
  theirBubble: { backgroundColor: "rgba(255,255,255,0.91)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", borderBottomLeftRadius: 6, shadowColor: "#786D7F", shadowOpacity: 0.06, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  myBubble: { backgroundColor: "rgba(234,223,235,0.94)", borderWidth: 1, borderColor: "rgba(255,255,255,0.82)", borderBottomRightRadius: 6, shadowColor: "#786D7F", shadowOpacity: 0.055, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  messageText: { color: "#514B56", fontSize: 12, lineHeight: 18 },
  myMessageText: { color: "#61516A" },
  messageTime: { textAlign: "right", color: "#AAA2AC", fontSize: 7, marginTop: 4 },
  myMessageTime: { color: "#927C96" },
  hangoutStrip: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderTopWidth: 1, borderTopColor: "rgba(221,214,224,0.47)" },
  hangoutStripText: { flex: 1, color: "#928995", fontSize: 8 },
  inviteLink: { color: "#98779A", fontSize: 9, fontWeight: "700" },
  composerRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 5, paddingBottom: 4 },
  composerIcon: { width: 30, alignItems: "center" },
  quickReplyButton: { width: 29, height: 34, borderRadius: 11, backgroundColor: "rgba(244,236,245,0.86)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", alignItems: "center", justifyContent: "center" },
  composerInput: { minHeight: 39, flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.83)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", color: "#554F59", fontSize: 11, outlineStyle: "none" as any },
  sendButton: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#E8E4E9", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#766D7D", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 1 },
  sendButtonActive: { backgroundColor: "#9E7C9E" },
  pageIntro: { marginTop: 17, marginBottom: 17 },
  pageEyebrow: { color: "#A0849E", fontSize: 8, fontWeight: "700", letterSpacing: 1.1, marginBottom: 7 },
  pageTitle: { color: "#45404B", fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.65 },
  pageSub: { color: "#89838E", fontSize: 10, lineHeight: 16, marginTop: 5 },
  friendsTools: { gap: 8 },
  interestFilterRow: { gap: 6, paddingVertical: 1 },
  friendsScroll: { marginTop: 14 },
  friendsContent: { paddingBottom: 20 },
  requestPanel: { padding: 12, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", marginBottom: 17 },
  requestHeading: { color: "#524A57", fontSize: 14, fontWeight: "700", marginTop: 4 },
  requestCount: { paddingHorizontal: 6, minWidth: 19, height: 18, borderRadius: 8, backgroundColor: "#F4E4EE", alignItems: "center", justifyContent: "center" },
  requestCountText: { color: "#A37295", fontSize: 9, fontWeight: "700" },
  requestRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  requestAvatar: { width: 42, height: 42, borderRadius: 15 },
  requestDetails: { flex: 1, gap: 3 },
  requestName: { color: "#514A55", fontSize: 11, fontWeight: "700" },
  requestMutual: { color: "#98909A", fontSize: 8 },
  requestButtons: { flexDirection: "row", gap: 5 },
  acceptButton: { width: 29, height: 29, borderRadius: 11, backgroundColor: "#8FB5A2", alignItems: "center", justifyContent: "center" },
  declineButton: { width: 29, height: 29, borderRadius: 11, backgroundColor: "#F2EFF2", alignItems: "center", justifyContent: "center" },
  suggestHeading: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { color: "#4B4651", fontSize: 17, fontWeight: "700", letterSpacing: -0.3, marginTop: 4 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5, backgroundColor: "#F3EAF3" },
  sortChipText: { fontSize: 7, color: "#977C97", fontWeight: "600" },
  friendConnectionList: { gap: 7 },
  neighborRow: { minHeight: 68, borderRadius: 15, paddingVertical: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  neighborTapArea: { borderRadius: 13 },
  neighborAvatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#EFE8EF" },
  neighborInfo: { flex: 1, minWidth: 0, gap: 3 },
  neighborNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  neighborName: { color: "#4B4551", fontSize: 10, fontWeight: "700", maxWidth: 130 },
  neighborAbout: { color: "#8E8791", fontSize: 8 },
  neighborMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  neighborMetaText: { color: "#968E98", fontSize: 7 },
  commonInterestTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 1 },
  commonInterestTag: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 3, backgroundColor: "rgba(248,242,249,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)" },
  commonInterestTagText: { color: "#967A96", fontSize: 7, fontWeight: "600" },
  phoneOnlyLabel: { color: "#928C94", fontSize: 7, backgroundColor: "#F1EFF2", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, overflow: "hidden", marginLeft: 2 },
  compactRequestButton: { minWidth: 60, height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, borderWidth: 1, borderColor: "#E3D6E5", backgroundColor: "rgba(246,239,247,0.78)", paddingHorizontal: 6 },
  compactRequestText: { color: "#8D748F", fontSize: 8, fontWeight: "700" },
  discoveryPaused: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginBottom: 9, borderRadius: 14 },
  discoveryPausedTitle: { color: "#6C6470", fontSize: 9, fontWeight: "700" },
  noMatches: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  noMatchesText: { color: "#918994", fontSize: 9 },
  suggestCard: { width: "48.5%", borderRadius: 17, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#8B8492", shadowOpacity: 0.065, shadowRadius: 12, elevation: 3 },
  suggestPhotoWrap: { height: 106, position: "relative", backgroundColor: "#F0EAF0" },
  suggestPhoto: { width: "100%", height: "100%" },
  localityTag: { position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4 },
  localityText: { color: "#766D7B", fontSize: 7 },
  tierBadge: { position: "absolute", top: 6, right: 6, width: 23, height: 23, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  suggestBody: { padding: 8 },
  suggestNameRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  suggestName: { color: "#4B4551", fontSize: 10, fontWeight: "700", flexShrink: 1 },
  suggestAge: { color: "#9A929D", fontSize: 8 },
  verificationPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 3 },
  verifiedPill: { backgroundColor: "#EAF4EF" },
  phonePill: { backgroundColor: "#F1F0F3" },
  compactBadge: { marginTop: 4 },
  verificationText: { color: "#568C77", fontSize: 7, fontWeight: "600" },
  phoneVerifiedText: { color: "#89868E" },
  suggestAbout: { color: "#8E8791", fontSize: 8, lineHeight: 12, minHeight: 24, marginTop: 5 },
  suggestTags: { flexDirection: "row", gap: 4, marginTop: 5, marginBottom: 7 },
  suggestTag: { borderRadius: 6, backgroundColor: "#F5EEF5", paddingHorizontal: 5, paddingVertical: 3, color: "#947D95", fontSize: 7 },
  requestFriendButton: { minHeight: 30, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#A080A1", borderWidth: 1, borderColor: "rgba(255,255,255,0.66)", paddingHorizontal: 4, shadowColor: "#715C78", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  requestFriendText: { color: "#FFFFFF", fontSize: 7, fontWeight: "700" },
  requestSentButton: { backgroundColor: "#EAF2ED", borderWidth: 1, borderColor: "#DFECE3" },
  requestSentText: { color: "#608771" },
  noPressureCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 14, marginTop: 13 },
  noPressureIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#F5E8F1", alignItems: "center", justifyContent: "center" },
  noPressureTitle: { color: "#655A68", fontSize: 9, fontWeight: "700" },
  noPressureText: { color: "#968E99", fontSize: 8, marginTop: 3 },
  meetupIntroCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 17, marginBottom: 18 },
  meetupIntroArt: { width: 44, height: 44, position: "relative", alignItems: "center", justifyContent: "center" },
  artBubblePink: { position: "absolute", top: 2, left: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: "#F0D9E8" },
  artBubbleBlue: { position: "absolute", bottom: 1, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: "#DDECF5" },
  artCenter: { width: 32, height: 32, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.78)", alignItems: "center", justifyContent: "center" },
  meetupIntroTitle: { color: "#5A4E60", fontSize: 10, fontWeight: "700" },
  meetupIntroCopy: { color: "#948A98", fontSize: 8, lineHeight: 12, marginTop: 3 },
  locationChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.76)", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 5 },
  locationChipText: { color: "#837A88", fontSize: 7 },
  meetupScroll: { flex: 1, marginTop: 11 },
  meetupList: { gap: 9, paddingBottom: 20, marginTop: 11 },
  planFollowList: { gap: 8, marginBottom: 14 },
  planFollowCard: { padding: 11, borderRadius: 16, gap: 5 },
  planFollowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planFollowPill: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "rgba(240,238,248,0.94)" },
  planFollowPillText: { color: "#7E6E92", fontSize: 7.5, fontWeight: "700", letterSpacing: 0.5 },
  planFollowTiming: { color: "#8E8595", fontSize: 9, fontWeight: "700" },
  planFollowTimingToday: { color: "#A2568B" },
  planFollowTitle: { color: "#4E4856", fontSize: 11.5, fontWeight: "700" },
  planFollowActions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  planFollowButton: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#9D7E9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  planFollowButtonText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "700" },
  planFollowGhost: { width: 30, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", backgroundColor: "rgba(255,255,255,0.68)" },
  planFollowCheckIn: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#6E9C86", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" },
  planFollowCheckInText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: "700" },
  planFollowWho: { color: "#948C99", fontSize: 8.5, marginTop: 2 },
  meetupCard: { minHeight: 99, padding: 9, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 16 },
  meetupPhoto: { width: 60, height: 72, borderRadius: 12, backgroundColor: "#EFE7F0" },
  meetupCopy: { flex: 1, minWidth: 0 },
  meetupDay: { color: "#A17D9C", fontSize: 7, fontWeight: "700", letterSpacing: 0.6 },
  meetupTitle: { color: "#514B56", fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 4 },
  meetupPlace: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3 },
  meetupPlaceText: { color: "#928B96", fontSize: 7, flex: 1 },
  meetupMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  meetupMetaText: { color: "#8F8491", fontSize: 7 },
  metaDivider: { height: 8, width: 1, backgroundColor: "#D8D2DA" },
  meetupTag: { color: "#789080", fontSize: 7 },
  rsvpButton: { alignSelf: "flex-end", borderRadius: 9, backgroundColor: "#A180A2", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", paddingHorizontal: 9, paddingVertical: 6, marginBottom: 1, shadowColor: "#715C78", shadowOpacity: 0.10, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  rsvpText: { color: "#FFFFFF", fontSize: 8, fontWeight: "700" },
  rsvpJoined: { backgroundColor: "#E7F0EA" },
  rsvpTextJoined: { color: "#5B8A73" },
  createPlanLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36 },
  createPlanText: { color: "#8B768E", fontSize: 9, fontWeight: "600" },
  profileCard: { alignItems: "center", padding: 16, borderRadius: 20 },
  profileAvatarFrame: { width: 84, height: 84, borderRadius: 30, padding: 3, borderWidth: 1.5, borderColor: "#E8D9E9", position: "relative" },
  profileAvatarPhoto: { width: "100%", height: "100%", borderRadius: 26, backgroundColor: "#EFE7F0" },
  profileVerifiedDot: { position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: 9, borderWidth: 2, borderColor: "#FCF9FC", backgroundColor: "#D98BA6", alignItems: "center", justifyContent: "center" },
  profileBio: { color: "#6E6672", fontSize: 10.5, lineHeight: 16, textAlign: "center", marginTop: 8, paddingHorizontal: 6 },
  profileMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 11 },
  profileMetaPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  profileMetaText: { color: "#86808C", fontSize: 8, fontWeight: "600" },
  getVerifiedButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, borderRadius: 13, paddingHorizontal: 16, marginTop: 12, backgroundColor: "#9D7E9E", borderWidth: 1, borderColor: "rgba(255,255,255,0.64)", shadowColor: "#604F67", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  getVerifiedText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  profileAvatar: { position: "relative", width: 59, height: 59, borderRadius: 21, backgroundColor: "#E9E0F0", alignItems: "center", justifyContent: "center" },
  profileInitial: { color: "#826D8A", fontSize: 25, fontWeight: "700" },
  profileCheck: { position: "absolute", right: -2, bottom: -2, width: 19, height: 19, borderRadius: 8, backgroundColor: "#72A58B", borderColor: "#FFFFFF", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  profileName: { color: "#514A57", fontSize: 15, fontWeight: "700", marginTop: 7 },
  profileStatusChip: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7, maxWidth: 230, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(247,239,250,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#6B5A73", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  profileStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#C79BC0" },
  profileStatusText: { flexShrink: 1, color: "#6F6577", fontSize: 9.5, fontWeight: "650" as any },
  profilePhoneBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 7, backgroundColor: "#EDF1F4", paddingHorizontal: 7, paddingVertical: 4, marginTop: 6 },
  profilePhoneText: { color: "#798A97", fontSize: 8 },
  profileLocality: { flexDirection: "row", alignItems: "center", color: "#938A96", fontSize: 8, marginTop: 8 },
  profileInterests: { flexDirection: "row", gap: 5, marginTop: 11 },
  profileInterest: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#F3EAF3" },
  profileInterestText: { color: "#907A93", fontSize: 8 },
  editProfileButton: { width: "100%", borderTopWidth: 1, borderTopColor: "rgba(212,204,215,0.47)", marginTop: 12, paddingTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  editProfileText: { color: "#8C7291", fontSize: 9, fontWeight: "700" },
  signupCard: { alignItems: "center", padding: 17 },
  signupIcon: { width: 47, height: 47, borderRadius: 17, backgroundColor: "#F0E5F0", alignItems: "center", justifyContent: "center" },
  signupTitle: { color: "#574D5B", fontSize: 15, fontWeight: "700", marginTop: 10 },
  signupCopy: { color: "#908894", fontSize: 9, lineHeight: 15, textAlign: "center", marginTop: 5 },
  signupCta: { alignSelf: "stretch", marginTop: 12 },
  phoneRequired: { flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center", marginTop: 10 },
  phoneRequiredText: { color: "#8493A0", fontSize: 7 },
  settingsLabel: { color: "#9A929D", fontSize: 8, fontWeight: "700", letterSpacing: 1, marginTop: 19, marginBottom: 8 },
  settingsPanel: { paddingHorizontal: 11, borderRadius: 17 },
  appearancePanel: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 17 },
  appearanceHeadingRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9 },
  opacityReadout: { minWidth: 39, textAlign: "right", color: "#8A708F", fontSize: 10, fontWeight: "700" },
  opacityOptions: { flexDirection: "row", gap: 4, marginTop: 7 },
  opacityOption: { flex: 1, minWidth: 0, minHeight: 35, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.52)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)" },
  opacityOptionActive: { backgroundColor: "rgba(226,210,232,0.95)", borderColor: "rgba(190,164,197,0.86)", shadowColor: "#8E7794", shadowOpacity: 0.10, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  opacityOptionText: { color: "#938997", fontSize: 8, fontWeight: "600" },
  opacityOptionTextActive: { color: "#755C7D", fontWeight: "700" },
  opacityScaleCaption: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, marginBottom: 10, paddingHorizontal: 2 },
  opacityScaleText: { color: "#9C949E", fontSize: 7 },
  settingRow: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 9 },
  adBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.85)", shadowColor: "#5A4A5E", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  adBannerText: { flex: 1, fontSize: 10.5, lineHeight: 14.5, color: "#6F6879" },
  adBannerCta: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#A2789B" },
  adBannerCtaText: { fontSize: 10.5, fontWeight: "700", color: "#FFFFFF" },
  adBannerClose: { padding: 2 },
  tierPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(160,148,166,0.3)" },
  tierPillActive: { backgroundColor: "#A2789B", borderColor: "rgba(255,255,255,0.6)" },
  tierPillText: { fontSize: 10.5, fontWeight: "700", color: "#7A7284" },
  tierPillTextActive: { color: "#FFFFFF" },
  settingIconPink: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#F4EAF2", alignItems: "center", justifyContent: "center" },
  settingIconBlue: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#E9F1F5", alignItems: "center", justifyContent: "center" },
  settingContent: { flex: 1 },
  toggleFrame: { minWidth: 54, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", shadowColor: "#756C7B", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1 },
  settingTitle: { color: "#5B535F", fontSize: 9, fontWeight: "700" },
  settingSub: { color: "#97909A", fontSize: 7, marginTop: 3 },
  settingDivider: { height: 1, backgroundColor: "rgba(220,214,222,0.50)" },
  premiumLock: { width: 24, height: 24, borderRadius: 9, backgroundColor: "#F3E7F1", alignItems: "center", justifyContent: "center" },
  footerNote: { color: "#A19AA4", fontSize: 8, textAlign: "center", marginTop: 15 },
  bottomBar: { minHeight: 62, paddingBottom: Platform.OS === "web" ? 2 : 1, backgroundColor: "rgba(251,249,248,0.76)", borderTopWidth: 1, borderTopColor: "rgba(218,211,222,0.68)", flexDirection: "row", alignItems: "center", justifyContent: "space-around", shadowColor: "#766D7D", shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 4 },
  tabButton: { width: "25%", minHeight: 50, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 3 },
  tabIconWrap: { height: 28, minWidth: 48, borderRadius: 13, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", backgroundColor: "rgba(255,255,255,0.28)" },
  tabIconActive: { backgroundColor: "rgba(240,229,240,0.96)", borderColor: "rgba(224,207,227,0.98)", shadowColor: "#8E7794", shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabLabel: { color: "#99939C", fontSize: 8, fontWeight: "500" },
  tabLabelActive: { color: "#826C89", fontWeight: "700" },
  toast: { position: "absolute", bottom: 72, left: 21, right: 21, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#675D70", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#56485E", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  fieldError: { color: "#B57184", fontSize: 8.5, lineHeight: 13, marginTop: -6, marginBottom: 10 },
  fieldHint: { color: "#8E96A2", fontSize: 8, lineHeight: 13, marginTop: -6, marginBottom: 10 },
  suggestionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: 12 },
  suggestionChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#7A6F80", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  suggestionChipActive: { backgroundColor: "rgba(238,228,240,0.96)", borderColor: "rgba(222,205,226,1)" },
  suggestionChipText: { color: "#867E8C", fontSize: 8.5, fontWeight: "600" },
  suggestionChipTextActive: { color: "#755F7B", fontWeight: "700" },
  photoPicker: { alignItems: "center", gap: 9, paddingVertical: 18, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.6)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#7A6F80", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  photoPlaceholder: { width: 84, height: 84, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(240,233,243,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)" },
  photoPreview: { width: 84, height: 84, borderRadius: 30, borderWidth: 1, borderColor: "rgba(255,255,255,0.98)" },
  photoPickerText: { color: "#6E6474", fontSize: 10.5, fontWeight: "700" },
  photoPickerHint: { color: "#9A939E", fontSize: 8, textAlign: "center", paddingHorizontal: 18 },
  photoSafety: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)" },
  photoSafetyText: { flex: 1, color: "#818A93", fontSize: 8, lineHeight: 13 },
  summaryCard: { padding: 13, borderRadius: 18 },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  summaryAvatar: { width: 46, height: 46, borderRadius: 17, borderWidth: 1, borderColor: "rgba(255,255,255,0.98)" },
  summaryAvatarFallback: { width: 46, height: 46, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#EFE3F1", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)" },
  summaryAvatarText: { color: "#8B718F", fontSize: 17, fontWeight: "800" },
  summaryName: { color: "#534B5A", fontSize: 12, fontWeight: "700" },
  summaryMeta: { color: "#938C9B", fontSize: 8, marginTop: 3 },
  summaryTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 11 },
  summaryTag: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11, backgroundColor: "rgba(240,233,243,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  summaryTagText: { color: "#7D6E85", fontSize: 8, fontWeight: "600" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.56)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)" },
  summaryRowText: { flex: 1, color: "#818A93", fontSize: 8, lineHeight: 13 },
  toastText: { color: "#FFFFFF", fontSize: 9, fontWeight: "500", flex: 1 },
  refreshGlass: { position: "absolute", top: 64, left: 39, right: 39, height: 42, borderRadius: 15, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.67)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center", shadowColor: "#81778A", shadowOpacity: 0.1, shadowRadius: 12, elevation: 6, zIndex: 20 },
  refreshGlassContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  refreshGlassText: { color: "#84768A", fontSize: 9, fontWeight: "600" },
  modalSafe: { flex: 1, backgroundColor: "#FAF8F7" },
  modalKeyboard: { flex: 1 },
  modalHeader: { height: 51, paddingHorizontal: 21, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalBody: { paddingHorizontal: 23, paddingTop: 22, paddingBottom: 25 },
  modalTitle: { color: "#48414F", fontSize: 27, lineHeight: 32, letterSpacing: -0.8, fontWeight: "700" },
  modalSubtitle: { color: "#89828E", fontSize: 10, lineHeight: 17, marginTop: 9, marginBottom: 17, maxWidth: 330 },
  authPromise: { padding: 11, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20 },
  authPromiseIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#EAF1F5", alignItems: "center", justifyContent: "center" },
  authPromiseTitle: { color: "#655B6B", fontSize: 9, fontWeight: "700" },
  authPromiseCopy: { color: "#98909C", fontSize: 8, marginTop: 3 },
  formField: { marginBottom: 15 },
  fieldLabel: { fontSize: 8, color: "#978D99", letterSpacing: 0.8, fontWeight: "700", marginBottom: 6 },
  fieldInput: { minHeight: 45, borderRadius: 13, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(220,211,222,0.72)", backgroundColor: "rgba(255,255,255,0.78)", color: "#4E4753", fontSize: 12 },
  codeInput: { letterSpacing: 9, fontSize: 19, fontWeight: "700", textAlign: "center" },
  interestOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  interestOption: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.67)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)" },
  interestOptionActive: { backgroundColor: "#F0E4F0", borderColor: "#E4D4E7" },
  interestOptionText: { fontSize: 8, color: "#8E8792" },
  interestOptionTextActive: { color: "#806989", fontWeight: "700" },
  verifiedNote: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 11 },
  verifiedNoteText: { flex: 1, color: "#8594A0", fontSize: 8 },
  authContinue: { marginTop: 17 },
  backLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, padding: 11 },
  backLinkText: { color: "#8C7D92", fontSize: 9, fontWeight: "600" },
  modalPrivacy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  modalPrivacyText: { color: "#84939F", fontSize: 8, textAlign: "center" },
  prototypeNote: { textAlign: "center", color: "#AAA4AC", fontSize: 7, lineHeight: 11, marginTop: 8, paddingHorizontal: 8 },
  composerModalShade: { flex: 1, padding: 22, justifyContent: "center", backgroundColor: "rgba(58,49,64,0.22)" },
  groupModal: { padding: 16, borderRadius: 20 },
  modalTopLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  groupModalIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: "#F0E5F1", alignItems: "center", justifyContent: "center" },
  verificationModalIcon: { width: 37, height: 37, borderRadius: 13, backgroundColor: "#EAF3EE", alignItems: "center", justifyContent: "center" },
  verificationStep: { minHeight: 38, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.65)", marginTop: 6 },
  verificationStepText: { flex: 1, color: "#817987", fontSize: 8 },
  groupModalTitle: { color: "#514A57", fontSize: 16, fontWeight: "700", marginTop: 11 },
  groupModalCopy: { color: "#928A96", fontSize: 9, lineHeight: 15, marginTop: 4, marginBottom: 11 },
  groupCreateButton: { marginTop: 10 },
  cancelGroup: { alignItems: "center", padding: 9 },
  cancelGroupText: { color: "#948A98", fontSize: 9 },
  handoffOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10, justifyContent: "center", alignItems: "center" },
  handoffBlur: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center", backgroundColor: "rgba(250,248,248,0.10)" },
  handoffCard: { width: 235, padding: 14, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.76)", borderWidth: 1, borderColor: "rgba(255,255,255,0.96)", shadowColor: "#695D70", shadowOpacity: 0.10, shadowRadius: 18, elevation: 5 },
  handoffHeadline: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  handoffTitle: { color: "#6B6071", fontSize: 10, fontWeight: "700" },
  handoffSkeleton: { flexDirection: "row", gap: 9, alignItems: "center", padding: 10, marginTop: 10, backgroundColor: "rgba(243,238,244,0.75)", borderRadius: 12 },
  skeletonAvatar: { width: 30, height: 30, borderRadius: 11, backgroundColor: "#DFD5E3" },
  skeletonTextGroup: { flex: 1, gap: 6 },
  skeletonLineLong: { width: "80%", height: 6, borderRadius: 4, backgroundColor: "#DED5E1" },
  skeletonLineShort: { width: "53%", height: 5, borderRadius: 4, backgroundColor: "#E8E1EA" },
  handoffCaption: { color: "#968C9A", fontSize: 8, textAlign: "center", marginTop: 8 },
  messageMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  receiptWrap: { flexDirection: "row", alignItems: "center", gap: 2 },
  receiptText: { color: "#9A899D", fontSize: 6 },
  receiptReadText: { color: "#64A09A" },
  typingRow: { flexDirection: "row", justifyContent: "flex-start" },
  typingBubble: { minHeight: 27, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, borderBottomLeftRadius: 5, backgroundColor: "rgba(255,255,255,0.86)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", paddingHorizontal: 10 },
  typingDots: { flexDirection: "row", alignItems: "center", gap: 3 },
  typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#A189A3" },
  typingDotMiddle: { opacity: 0.72 },
  typingDotLast: { opacity: 0.46 },
  typingText: { color: "#958997", fontSize: 8 },
  selfieEntry: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 9, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)" },
  selfieEntryIcon: { width: 30, height: 30, borderRadius: 11, backgroundColor: "#F0E7F1", alignItems: "center", justifyContent: "center" },
  navigationMenuShade: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(54,47,61,0.24)" },
  navigationMenuBlur: { width: "100%", borderRadius: 26, overflow: "hidden", backgroundColor: "rgba(249,247,250,0)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#514659", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 24, zIndex: 100 },
  navigationMenuCard: { flexShrink: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, backgroundColor: "rgba(250,248,251,0)" },
  navigationMenuScroll: { flexGrow: 0, flexShrink: 1 },
  navigationMenuContent: { flexGrow: 1 },
  navigationMenuHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  navigationMenuTitle: { color: "#504A56", fontSize: 17, fontWeight: "700", marginTop: 4 },
  navigationMenuGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 7 },
  navigationMenuItem: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 15, paddingHorizontal: 9, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#786A80", shadowOpacity: 0.055, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  navigationMenuItemActive: { backgroundColor: "rgba(241,230,242,0.96)", borderColor: "rgba(225,207,228,1)" },
  navigationMenuIcon: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,231,241,0.86)" },
  navigationMenuIconActive: { backgroundColor: "#987A9A" },
  navigationMenuItemText: { flex: 1, color: "#716676", fontSize: 10, fontWeight: "700" },
  navigationMenuItemTextActive: { color: "#765F7C" },
  navigationMenuHint: { color: "#8E8793", fontSize: 8, lineHeight: 13, textAlign: "center", marginTop: 10, paddingHorizontal: 7 },
  actionMenuShade: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(64,55,70,0.2)" },
  actionMenuBlur: { width: "100%", borderRadius: 25, overflow: "hidden", backgroundColor: "rgba(250,248,251,0)", borderWidth: 1, borderColor: "rgba(255,255,255,0.99)", shadowColor: "#514659", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 22 },
  actionMenuCard: { flexShrink: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: "rgba(250,248,251,0)" },
  actionMenuHandle: { width: 32, height: 3, borderRadius: 2, backgroundColor: "rgba(133,120,139,0.36)", alignSelf: "center", marginBottom: 13 },
  actionMenuEyebrow: { color: "#A0879F", fontSize: 7, fontWeight: "700", letterSpacing: 1.1 },
  actionMenuTitle: { color: "#504A56", fontSize: 18, fontWeight: "700", marginTop: 4 },
  actionMenuSub: { color: "#8D8692", fontSize: 9, marginTop: 3, marginBottom: 11 },
  actionMenuRow: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 9 },
  actionMenuIconBlue: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#E7F0F4", alignItems: "center", justifyContent: "center" },
  actionMenuIconPink: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#F3EAF1", alignItems: "center", justifyContent: "center" },
  actionMenuCopy: { flex: 1, gap: 3 },
  actionMenuItemTitle: { color: "#5B535F", fontSize: 9, fontWeight: "700" },
  actionMenuItemSub: { color: "#928B97", fontSize: 7.5 },
  actionMenuDivider: { height: 1, marginLeft: 43, backgroundColor: "rgba(213,206,217,0.55)" },
  actionMenuPrivacy: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.56)", marginTop: 6 },
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
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(252,249,250,0.95)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#5C4A5E",
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
    backgroundColor: "rgba(233,222,236,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  accountNoticeTitle: { flex: 1, fontSize: 14.5, lineHeight: 19, fontWeight: "700", color: "#4E4351" },
  accountNoticeBody: { fontSize: 12.5, lineHeight: 18, color: "#6E6472" },
  accountNoticeReason: { fontSize: 12, lineHeight: 17, color: "#8A7F8E", fontStyle: "italic" },
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
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(240,233,242,0.92)",
  },
  accountNoticeActionText: { fontSize: 12.5, fontWeight: "700", color: "#8E6F91" },

  /** In-flight state: clearly inert, but still legible. */
  actionButtonDisabled: { opacity: 0.62 },

  noticeMarkButton: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    backgroundColor: "rgba(240,233,242,0.92)",
  },
  noticeMarkText: { fontSize: 11.5, fontWeight: "700", color: "#8E6F91" },
  noticeRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.7)",
  },
  noticeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: "#C58FA6",
  },
  noticeDotRead: { backgroundColor: "rgba(180,172,188,0.55)" },
  noticeCopy: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: "#4E4351" },
  noticeBody: { fontSize: 12, lineHeight: 17, color: "#6E6472" },
  noticeMeta: { fontSize: 10.5, lineHeight: 14, color: "#9C93A2", letterSpacing: 0.3 },

  noticeStoreAction: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#6B5A72",
    shadowOpacity: 0.07,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  noticeStoreActionText: { fontSize: 11.5, fontWeight: "700", color: "#8E6F91" },

});
