import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { isValidCredential, isValidDemoCode } from "@/lib/onboarding";
import { canOpenChat, canRequestFriendship } from "@/lib/social-access";
import { receiptIcon, receiptLabel } from "@/lib/chat-status";
import { isInboxMeetupTransition } from "@/lib/ui-transitions";
import { SelfieVerificationModal } from "@/components/selfie-verification-modal";

type Tab = "Chats" | "Friends" | "Meetups" | "You";
type AuthStep = "welcome" | "phone" | "code" | "profile";
type Message = { id: string; from: "me" | "them"; text: string; time: string; receipt?: "sending" | "sent" | "delivered" | "read" };
type Person = {
  id: string;
  name: string;
  age: number;
  locality: string;
  interests: string[];
  image: any;
  verification: "ID + selfie verified" | "Phone verified";
  about: string;
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

const friends: Person[] = [
  { id: "maya", name: "Maya Chen", age: 28, locality: "Pacific Heights", interests: ["Coffee walks", "Ceramics"], image: require("../../assets/images/people/maya.jpg"), verification: "ID + selfie verified", about: "Recently discovered the little flower shop on Fillmore." },
  { id: "sam", name: "Sam Rivera", age: 31, locality: "Lower Pacific Heights", interests: ["Bouldering", "Coffee"], image: require("../../assets/images/people/sam.jpg"), verification: "Phone verified", about: "New to the neighborhood. Looking for a walking buddy." },
  { id: "noah", name: "Noah Kim", age: 27, locality: "Japantown", interests: ["Books", "Cooking"], image: require("../../assets/images/people/noah.jpg"), verification: "ID + selfie verified", about: "Has a book recommendation for every kind of day." },
];

const suggestions: Person[] = [
  friends[0],
  friends[1],
  friends[2],
  { id: "aria", name: "Aria Patel", age: 29, locality: "Western Addition", interests: ["Hiking", "Art books"], image: require("../../assets/images/people/aria.jpg"), verification: "ID + selfie verified", about: "Slow hikes, gallery afternoons, and good chai." },
  { id: "jules", name: "Jules Morgan", age: 30, locality: "Cow Hollow", interests: ["Gardening", "Coffee"], image: require("../../assets/images/people/jules.jpg"), verification: "ID + selfie verified", about: "Plant person, amateur baker, excellent listener." },
  { id: "eli", name: "Eli Brooks", age: 34, locality: "Marina District", interests: ["Music", "Bookshops"], image: require("../../assets/images/people/eli.jpg"), verification: "Phone verified", about: "New to the city and always curious about a new café." },
  { id: "dani", name: "Dani Flores", age: 27, locality: "Lower Pac Heights", interests: ["Art walks", "Hiking"], image: require("../../assets/images/people/dani.jpg"), verification: "ID + selfie verified", about: "Down for a relaxed gallery or park afternoon." },
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

const meetupSeeds = [
  { id: "coffee", day: "TODAY · 10:30 AM", title: "Coffee and a slow start", place: "Juniper Café · Pacific Heights", people: "3 neighbors going", image: require("../../assets/images/people/friends.jpg"), tag: "4 places left" },
  { id: "park", day: "SATURDAY · 4:00 PM", title: "A little walk in the park", place: "Alta Plaza Park · Pacific Heights", people: "Maya, Sam + 2 more", image: require("../../assets/images/people/maya.jpg"), tag: "Small group" },
  { id: "books", day: "SUNDAY · 11:00 AM", title: "Bookshop & tea afternoon", place: "Green Apple Books · 1.2 mi", people: "Hosted by Noah", image: require("../../assets/images/people/noah.jpg"), tag: "3 places left" },
];

const Icon = ({ name, color = "#675D70", size = 20 }: { name: keyof typeof MaterialIcons.glyphMap; color?: string; size?: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

function Frosted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.frosted, style]}>{children}</View>;
}

function ActionButton({ children, onPress, style, secondary = false }: { children: React.ReactNode; onPress: () => void; style?: object; secondary?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.actionButton, secondary && styles.actionButtonSecondary, style, pressed && styles.pressed]}>{children}</Pressable>;
}

export default function KindredApp() {
  const [tab, setTab] = useState<Tab>("Chats");
  const previousTab = useRef<Tab>("Chats");
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const loaderPulse = useRef(new Animated.Value(0.55)).current;
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>("welcome");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [interest, setInterest] = useState("Coffee walks");
  const [joined, setJoined] = useState(false);
  const [verificationPrompt, setVerificationPrompt] = useState(false);
  const [selfieModalVisible, setSelfieModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"All" | "Unread" | "Groups">("All");
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [chatMessages, setChatMessages] = useState(initialMessages);
  const [toast, setToast] = useState("");
  const [requestSent, setRequestSent] = useState<string[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<string[]>(["maya", "sam", "noah"]);
  const [incomingRequests, setIncomingRequests] = useState<string[]>(["aria"]);
  const [interestFilter, setInterestFilter] = useState<string[]>([]);
  const [joinedMeetups, setJoinedMeetups] = useState<string[]>([]);
  const [available, setAvailable] = useState(true);
  const [discoverable, setDiscoverable] = useState(true);
  const [blurDistance, setBlurDistance] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [typingChat, setTypingChat] = useState<string | null>(null);
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

  const feedback = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2400);
  };
  const tap = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openSignup = () => { setAuthStep("welcome"); setShowSignup(true); tap(); };
  const closeSignup = () => setShowSignup(false);
  const backAuth = () => {
    if (authStep === "profile") setAuthStep("code");
    else if (authStep === "code") setAuthStep("phone");
    else setAuthStep("welcome");
  };

  const continueAuth = () => {
    if (authStep === "welcome") { setAuthStep("phone"); return; }
    if (authStep === "phone") {
      if (!isValidCredential("Phone", phone)) { feedback("Enter a valid phone number to continue"); return; }
      setAuthStep("code"); return;
    }
    if (authStep === "code") {
      if (!isValidDemoCode(passcode)) { feedback("Enter the 6-digit demo code to continue"); return; }
      setAuthStep("profile"); return;
    }
    if (!fullName.trim()) { feedback("Add your name to finish your profile"); return; }
    if (email.trim() && !isValidCredential("Email", email)) { feedback("Check the recovery email address, or leave it blank"); return; }
    setJoined(true);
    setShowSignup(false);
    setTab("You");
    feedback("Your profile is ready. Welcome to the neighborhood.");
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
      const queryMatch = !q || `${chat.name} ${chat.lastMessage}`.toLowerCase().includes(q);
      const filterMatch = chatFilter === "All" || (chatFilter === "Unread" ? chat.unread > 0 : chat.kind === "group");
      return queryMatch && filterMatch;
    });
  }, [search, chatFilter, acceptedFriends, chatMessages]);

  const filteredSuggestions = useMemo(() => suggestions.filter((person) => {
    const q = search.trim().toLowerCase();
    const searchMatch = !q || `${person.name} ${person.locality} ${person.interests.join(" ")}`.toLowerCase().includes(q);
    const interestMatch = interestFilter.length === 0 || interestFilter.some((tag) => tag === "Verified" ? person.verification === "ID + selfie verified" : tag === "Nearby" ? person.locality.includes("Pacific Heights") : person.interests.some((value) => value.toLowerCase().includes(tag.toLowerCase())));
    return discoverable && searchMatch && interestMatch && !acceptedFriends.includes(person.id) && !incomingRequests.includes(person.id);
  }), [search, interestFilter, acceptedFriends, incomingRequests, discoverable]);

  const currentThread = selectedChat ? (seedConversations.find((chat) => chat.id === selectedChat) ?? (() => {
    const person = suggestions.find((item) => item.id === selectedChat);
    return person ? { id: person.id, name: person.name, image: person.image, kind: "friend" as const, lastMessage: "You are now friends", time: "now", unread: 0, verified: person.verification === "ID + selfie verified" } : null;
  })()) : null;

  const sendMessage = () => {
    const text = messageDraft.trim();
    if (!selectedChat || !text) return;
    const message: Message = { id: `${Date.now()}`, from: "me", text, time: "now", receipt: "sent" };
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
    setMessageDraft("");
    setTypingChat(selectedChat);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingChat(null), 2200);
    tap();
  };

  const shareApproximateArea = () => {
    if (!selectedChat || !currentThread) return;
    const message: Message = { id: `area-${Date.now()}`, from: "me", text: "I’m around Pacific Heights — just an approximate area. Want to pick a public meetup spot?", time: "now", receipt: "sent" };
    setChatMessages((current) => ({ ...current, [selectedChat]: [...(current[selectedChat] ?? []), message] }));
    setActionMenuOpen(false);
    feedback("Approximate area shared in the chat. No live pin was sent.");
  };

  const prepareMeetupInvite = () => {
    setMessageDraft("Want to join me for coffee at Juniper Café this week? ☕");
    setActionMenuOpen(false);
    feedback("Meetup invite added to your draft. Edit it before sending.");
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
    if (!joined) { feedback("Create your phone-verified profile before sending a request."); openSignup(); return; }
    const myVerification = "phone-only" as const;
    if (!canRequestFriendship(myVerification)) {
      setVerificationPrompt(true);
      return;
    }
    setRequestSent((current) => current.includes(person.id) ? current : [...current, person.id]);
    feedback("Request sent quietly. Chat opens after they accept.");
    tap();
  };

  const newHangout = () => {
    if (!currentThread) return;
    setMessageDraft("Want to grab a coffee together this week? ☕");
    feedback("A friendly hangout invite is ready to edit.");
  };

  const startThread = (id: string) => {
    const isGroup = seedConversations.some((chat) => chat.id === id && chat.kind === "group");
    if (!canOpenChat(acceptedFriends.includes(id), isGroup)) { feedback("Accept a friend request before starting a chat."); return; }
    setSelectedChat(id);
    setTab("Chats");
    setTypingChat(id);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTypingChat(null), 2400);
  };

  const toggleGroup = () => {
    if (!newGroupName.trim()) { feedback("Give your private group a name first."); return; }
    setCreatedGroups((current) => [...current, newGroupName.trim()]);
    setNewGroupName("");
    setComposerOpen(false);
    feedback("Private group created. Invite accepted friends from the group chat.");
  };

  const topBar = (thread = false) => (
    <View style={styles.topBar}>
      <View style={styles.brandMark}>
        {thread ? <Pressable onPress={() => setSelectedChat(null)} style={styles.backButton}><Icon name="arrow-back" size={21} color="#6D6178" /></Pressable> : <View style={styles.brandIcon}><Icon name="spa" size={17} color="#FFFFFF" /></View>}
        <View><Text style={styles.brandWord}>{thread ? (currentThread?.name ?? "Conversation") : "kindred"}</Text>{thread ? <Text style={styles.topBarSub}>{currentThread?.kind === "group" ? "Private friend group" : currentThread?.verified ? "ID + selfie verified" : "Accepted friend"}</Text> : null}</View>
      </View>
      {thread ? <View style={styles.topActions}><Pressable onPress={prepareMeetupInvite} style={styles.roundAction}><Icon name="event-available" size={19} color="#766B82" /></Pressable><Pressable onPress={() => setActionMenuOpen(true)} accessibilityLabel="Open conversation actions" style={styles.roundAction}><Icon name="more-horiz" size={21} color="#766B82" /></Pressable></View> : <View style={styles.topActions}><Pressable onPress={() => setTab("You")} style={styles.roundAction}><Icon name="notifications-none" size={20} color="#766B82" /><View style={styles.notificationDot} /></Pressable><Pressable onPress={openSignup} style={styles.userAvatar}>{joined ? <Text style={styles.userInitial}>{fullName.charAt(0).toUpperCase()}</Text> : <Icon name="person-outline" size={18} color="#796E84" />}</Pressable></View>}
    </View>
  );

  const verificationBadge = (person: Person, compact = false) => {
    const strong = person.verification === "ID + selfie verified";
    return <View style={[styles.verificationPill, strong ? styles.verifiedPill : styles.phonePill, compact && styles.compactBadge]}><Icon name={strong ? "verified" : "phone-iphone"} size={compact ? 11 : 12} color={strong ? "#588B79" : "#92939E"} /><Text style={[styles.verificationText, !strong && styles.phoneVerifiedText]}>{compact ? (strong ? "Verified" : "Phone") : person.verification}</Text></View>;
  };

  const renderChats = () => {
    if (selectedChat && currentThread) {
      const conversationMessages = chatMessages[selectedChat] ?? [];
      return <View style={styles.threadScreen}>
        {topBar(true)}
        <View style={styles.threadSafety}><Icon name="lock-outline" size={13} color="#7D8AA0" /><Text style={styles.threadSafetyText}>Only friends can see these messages. Your exact location is never shared.</Text></View>
        <ScrollView style={styles.threadBody} contentContainerStyle={styles.threadContent} showsVerticalScrollIndicator={false}>
          <View style={styles.dayDivider}><View style={styles.dividerLine} /><Text style={styles.dayLabel}>TODAY</Text><View style={styles.dividerLine} /></View>
          <View style={styles.sharedInterest}><Icon name="auto-awesome" size={15} color="#A77C9A" /><Text style={styles.sharedInterestText}>You both like slow weekend mornings</Text></View>
          {conversationMessages.map((message) => {
            const receipt = message.receipt ?? (message.from === "me" ? "sent" : null);
            return <View key={message.id} style={[styles.messageRow, message.from === "me" && styles.myMessageRow]}><View style={[styles.messageBubble, message.from === "me" ? styles.myBubble : styles.theirBubble]}><Text style={[styles.messageText, message.from === "me" && styles.myMessageText]}>{message.text}</Text><View style={styles.messageMeta}><Text style={[styles.messageTime, message.from === "me" && styles.myMessageTime]}>{message.time}</Text>{receipt ? <View accessibilityLabel={receiptLabel(receipt)} style={styles.receiptWrap}><Icon name={receiptIcon(receipt)} size={12} color={receipt === "read" ? "#62A4A0" : "#927C96"} /><Text style={[styles.receiptText, receipt === "read" && styles.receiptReadText]}>{receiptLabel(receipt)}</Text></View> : null}</View></View></View>;
          })}
          {typingChat === selectedChat ? <View style={styles.typingRow}><View style={styles.typingBubble}><View style={styles.typingDots}><View style={styles.typingDot} /><View style={[styles.typingDot, styles.typingDotMiddle]} /><View style={[styles.typingDot, styles.typingDotLast]} /></View><Text style={styles.typingText}>{currentThread.name.split(" ")[0]} is typing</Text></View></View> : null}
        </ScrollView>
        <View style={styles.hangoutStrip}><Icon name="event-available" size={16} color="#9C7694" /><Text style={styles.hangoutStripText}>Want to meet? Send a gentle hangout invite.</Text><Pressable onPress={newHangout}><Text style={styles.inviteLink}>Invite</Text></Pressable></View>
        <View style={styles.composerRow}><Pressable onPress={() => setActionMenuOpen(true)} accessibilityLabel="Open sharing actions" style={styles.composerIcon}><Icon name="add-circle-outline" size={24} color="#8C8495" /></Pressable><TextInput value={messageDraft} onChangeText={setMessageDraft} placeholder="Write a message…" placeholderTextColor="#9B96A1" style={styles.composerInput} onSubmitEditing={sendMessage} returnKeyType="send" /><Pressable onPress={sendMessage} style={({ pressed }) => [styles.sendButton, messageDraft.trim() && styles.sendButtonActive, pressed && styles.pressed]}><Icon name="arrow-upward" size={19} color={messageDraft.trim() ? "#FFFFFF" : "#96919D"} /></Pressable></View>
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
        {visibleChats.map((chat) => <Pressable key={chat.id} onPress={() => startThread(chat.id)} style={({ pressed }) => [styles.chatRow, pressed && styles.rowPressed]}>
          <View style={styles.chatAvatarWrap}><Image source={chat.image} style={styles.chatAvatar} />{chat.kind === "group" ? <View style={styles.groupMini}><Icon name="groups" size={10} color="#FFFFFF" /></View> : chat.online ? <View style={styles.onlineDot} /> : null}</View>
          <View style={styles.chatInfo}><View style={styles.chatTitleRow}><View style={styles.chatNameCluster}><Text style={styles.chatName}>{chat.name}</Text>{chat.verified ? <Icon name="verified" size={13} color="#61A088" /> : null}</View><Text style={[styles.chatTime, chat.unread > 0 && styles.chatTimeUnread]}>{chat.time}</Text></View><View style={styles.chatLastRow}><Text style={styles.chatPreview} numberOfLines={1}>{chat.lastMessage}</Text>{chat.unread > 0 ? <View style={styles.unreadBadge}><Text style={styles.unreadCount}>{chat.unread}</Text></View> : null}</View></View>
        </Pressable>)}
        {createdGroups.map((name) => <Pressable key={name} onPress={() => feedback("Invite an accepted friend to start the group conversation.")} style={styles.chatRow}><View style={[styles.chatAvatarWrap, styles.addCircle]}><Icon name="groups" size={22} color="#8D7697" /></View><View style={styles.chatInfo}><Text style={styles.chatName}>{name}</Text><Text style={styles.chatPreview}>Private group · Invite friends to begin</Text></View><Icon name="chevron-right" size={18} color="#AAA2AB" /></Pressable>)}
        {visibleChats.length === 0 ? <View style={styles.emptyChats}><View style={styles.emptyIcon}><Icon name="forum" size={22} color="#947D98" /></View><Text style={styles.emptyTitle}>Nothing here just yet</Text><Text style={styles.emptyCopy}>Your accepted friends&apos; messages will appear here.</Text><ActionButton onPress={() => setTab("Friends")} style={styles.emptyAction}><Text style={styles.actionText}>Meet neighbors</Text><Icon name="arrow-forward" color="#FFFFFF" size={15} /></ActionButton></View> : null}
        <View style={styles.safeNote}><Icon name="lock-outline" size={13} color="#8E8A97" /><Text style={styles.safeNoteText}>Messages open after you both accept a friend request.</Text></View>
      </ScrollView>
    </>;
  };

  const renderFriends = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>A SMALLER INTERNET, A CLOSER CIRCLE</Text><Text style={styles.pageTitle}>Friends, not profiles.</Text><Text style={styles.pageSub}>Meet kind people nearby, then connect only when you both say yes.</Text></View>
    <View style={styles.friendsTools}><View style={styles.searchBar}><Icon name="search" size={17} color="#968D9A" /><TextInput value={search} onChangeText={setSearch} placeholder="Search by name or interest" placeholderTextColor="#A6A1A8" style={styles.searchInput} /><Icon name="tune" size={17} color="#90869A" /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.interestFilterRow}>{["Nearby", "Verified", "Coffee", "Books", "Hiking"].map((tag) => <Pressable key={tag} onPress={() => toggleInterest(tag)} style={[styles.filterChip, interestFilter.includes(tag) && styles.filterChipActive]}><Text style={[styles.filterChipText, interestFilter.includes(tag) && styles.filterChipTextActive]}>{tag}</Text></Pressable>)}</ScrollView></View>
    <ScrollView style={styles.friendsScroll} contentContainerStyle={styles.friendsContent} showsVerticalScrollIndicator={false}>
      {incomingRequests.length > 0 ? <View style={styles.requestPanel}><View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>WAITING FOR YOU</Text><Text style={styles.requestHeading}>Friend requests <View style={styles.requestCount}><Text style={styles.requestCountText}>{incomingRequests.length}</Text></View></Text></View><Icon name="people-alt" size={20} color="#9B7D99" /></View>{incomingRequests.map((id) => { const person = suggestions.find((item) => item.id === id)!; return <View key={id} style={styles.requestRow}><Image source={person.image} style={styles.requestAvatar} /><View style={styles.requestDetails}><Text style={styles.requestName}>{person.name}</Text><Text style={styles.requestMutual}>You both enjoy {person.interests[0].toLowerCase()}</Text>{verificationBadge(person, true)}</View><View style={styles.requestButtons}><Pressable onPress={() => acceptRequest(id)} style={styles.acceptButton}><Icon name="check" size={17} color="#FFFFFF" /></Pressable><Pressable onPress={() => { setIncomingRequests((current) => current.filter((item) => item !== id)); feedback("Request quietly dismissed."); }} style={styles.declineButton}><Icon name="close" size={16} color="#8F8992" /></Pressable></View></View>; })}</View> : null}
      <View style={styles.suggestHeading}><View><Text style={styles.sectionEyebrow}>GENTLY INTRODUCED</Text><Text style={styles.sectionTitle}>Suggested for you</Text></View><View style={styles.sortChip}><Icon name="auto-awesome" size={13} color="#9C789A" /><Text style={styles.sortChipText}>Shared interests</Text></View></View>
      {!discoverable ? <Frosted style={styles.discoveryPaused}><Icon name="visibility-off" size={17} color="#7895A5" /><View style={{ flex: 1 }}><Text style={styles.discoveryPausedTitle}>You&apos;re out of suggestions for now.</Text><Text style={styles.noPressureText}>Turn discovery back on from You → Appear in suggestions.</Text></View></Frosted> : null}
      <View style={styles.friendConnectionList}>{filteredSuggestions.map((person) => { const sent = requestSent.includes(person.id); return <Frosted key={person.id} style={styles.neighborRow}><Image source={person.image} style={styles.neighborAvatar} /><View style={styles.neighborInfo}><View style={styles.neighborNameRow}><Text style={styles.neighborName} numberOfLines={1}>{person.name}</Text><Text style={styles.suggestAge}>{person.age}</Text>{person.verification === "ID + selfie verified" ? <Icon name="verified" size={13} color="#63A087" /> : null}</View><Text style={styles.neighborAbout} numberOfLines={1}>{person.about}</Text><View style={styles.neighborMeta}><Icon name="place" size={11} color="#938894" /><Text style={styles.neighborMetaText}>{person.locality}</Text><View style={styles.neighborMetaDot} /><Text style={styles.neighborInterest} numberOfLines={1}>{person.interests[0]}</Text>{person.verification === "Phone verified" ? <Text style={styles.phoneOnlyLabel}>Phone</Text> : null}</View></View><Pressable accessibilityLabel={sent ? "Friend request sent" : `Ask ${person.name} for friendship`} onPress={() => sendFriendRequest(person)} style={[styles.compactRequestButton, sent && styles.requestSentButton]}><Icon name={sent ? "check" : "person-add-alt-1"} size={13} color={sent ? "#5C8A76" : "#8D748F"} /><Text style={[styles.compactRequestText, sent && styles.requestSentText]}>{sent ? "Sent" : "Request"}</Text></Pressable></Frosted>; })}
      {discoverable && filteredSuggestions.length === 0 ? <View style={styles.noMatches}><Icon name="search-off" size={17} color="#9A899D" /><Text style={styles.noMatchesText}>No neighbors match those filters yet.</Text></View> : null}</View>
      <Frosted style={styles.noPressureCard}><View style={styles.noPressureIcon}><Icon name="favorite-border" size={16} color="#A47C9D" /></View><View style={{ flex: 1 }}><Text style={styles.noPressureTitle}>No open DMs, no awkwardness.</Text><Text style={styles.noPressureText}>Chat starts only after you both accept. Declining is quiet.</Text></View></Frosted>
    </ScrollView>
  </>;

  const renderMeetups = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>EASY COMPANY, NEARBY</Text><Text style={styles.pageTitle}>A plan makes it easy.</Text><Text style={styles.pageSub}>Small, friendly gatherings you can join at your own pace.</Text></View>
    <Frosted style={styles.meetupIntroCard}><View style={styles.meetupIntroArt}><View style={styles.artBubblePink} /><View style={styles.artBubbleBlue} /><View style={styles.artCenter}><Icon name="diversity-3" size={22} color="#93738E" /></View></View><View style={{ flex: 1 }}><Text style={styles.meetupIntroTitle}>Better in good company.</Text><Text style={styles.meetupIntroCopy}>Meet in public, bring a friend, leave whenever you like.</Text></View><Icon name="verified-user" size={18} color="#6F9C88" /></Frosted>
    <View style={styles.sectionHeaderLine}><View><Text style={styles.sectionEyebrow}>COMING UP</Text><Text style={styles.sectionTitle}>Plans near you</Text></View><Pressable onPress={() => feedback("Meetups are shown by your saved home locality.")} style={styles.locationChip}><Icon name="place" size={13} color="#81758B" /><Text style={styles.locationChipText}>Pacific Heights</Text></Pressable></View>
    <ScrollView style={styles.meetupScroll} contentContainerStyle={styles.meetupList} showsVerticalScrollIndicator={false}>{meetupSeeds.map((meetup) => { const going = joinedMeetups.includes(meetup.id); return <Frosted key={meetup.id} style={styles.meetupCard}><Image source={meetup.image} style={styles.meetupPhoto} resizeMode="cover" /><View style={styles.meetupCopy}><Text style={styles.meetupDay}>{meetup.day}</Text><Text style={styles.meetupTitle}>{meetup.title}</Text><View style={styles.meetupPlace}><Icon name="place" size={13} color="#97909B" /><Text style={styles.meetupPlaceText}>{meetup.place}</Text></View><View style={styles.meetupMeta}><Icon name="groups" size={13} color="#99819B" /><Text style={styles.meetupMetaText}>{meetup.people}</Text><View style={styles.metaDivider} /><Text style={styles.meetupTag}>{going ? "You're on the list" : meetup.tag}</Text></View></View><Pressable onPress={() => { setJoinedMeetups((current) => going ? current.filter((id) => id !== meetup.id) : [...current, meetup.id]); feedback(going ? "RSVP removed quietly." : "You are on the list. Keep it easy."); }} style={[styles.rsvpButton, going && styles.rsvpJoined]}><Text style={[styles.rsvpText, going && styles.rsvpTextJoined]}>{going ? "Going" : "Join"}</Text></Pressable></Frosted>; })}
      <Pressable onPress={() => { setNewGroupName("Coffee & conversation"); setComposerOpen(true); }} style={styles.createPlanLink}><Icon name="add-circle-outline" size={18} color="#947B9B" /><Text style={styles.createPlanText}>Have a plan to share?</Text><Icon name="arrow-forward" size={15} color="#A18AA2" /></Pressable>
    </ScrollView>
  </>;

  const renderYou = () => <>
    {topBar()}
    <View style={styles.pageIntro}><Text style={styles.pageEyebrow}>YOUR PLACE IN THE CIRCLE</Text><Text style={styles.pageTitle}>{joined ? `A little more you, ${fullName.split(" ")[0]}.` : "Settle in, when you're ready."}</Text><Text style={styles.pageSub}>You decide when you&apos;re around, and what you share.</Text></View>
    {joined ? <Frosted style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitial}>{fullName.charAt(0).toUpperCase()}</Text></View><Text style={styles.profileName}>{fullName}{age ? `, ${age}` : ""}</Text><View style={styles.profilePhoneBadge}><Icon name="phone-iphone" size={12} color="#788B9B" /><Text style={styles.profilePhoneText}>Phone verified</Text></View><Text style={styles.profileLocality}><Icon name="place" size={14} color="#8D8295" />  Pacific Heights · distance kept soft</Text><View style={styles.profileInterests}>{[interest, "Friendship first"].map((item) => <View key={item} style={styles.profileInterest}><Text style={styles.profileInterestText}>{item}</Text></View>)}</View><Pressable onPress={() => feedback("Profile editor is ready for the connected account flow.")} style={styles.editProfileButton}><Text style={styles.editProfileText}>Edit profile</Text><Icon name="arrow-forward" size={15} color="#907B98" /></Pressable></Frosted> : <Frosted style={styles.signupCard}><View style={styles.signupIcon}><Icon name="mark-chat-unread" size={23} color="#937891" /></View><Text style={styles.signupTitle}>A circle that feels like yours.</Text><Text style={styles.signupCopy}>Create a standalone account with phone verification. New conversations begin only after a mutual yes.</Text><ActionButton onPress={openSignup} style={styles.signupCta}><Text style={styles.actionText}>Create your profile</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><View style={styles.phoneRequired}><Icon name="lock-outline" size={14} color="#8091A0" /><Text style={styles.phoneRequiredText}>Phone verification is required; your number stays private.</Text></View></Frosted>}
    {joined ? <Pressable onPress={() => setSelfieModalVisible(true)} style={({ pressed }) => [styles.selfieEntry, pressed && styles.pressed]}><View style={styles.selfieEntryIcon}><Icon name="face-retouching-natural" size={17} color="#8F7594" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Optional selfie identity check</Text><Text style={styles.settingSub}>Capture locally · verified badge only after provider review.</Text></View><Icon name="chevron-right" size={18} color="#A69FAB" /></Pressable> : null}
    <Text style={styles.settingsLabel}>HOW YOU SHOW UP</Text>
    <Frosted style={styles.settingsPanel}>
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="circle" size={16} color="#75A98F" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Available for a hello</Text><Text style={styles.settingSub}>Let accepted friends know you&apos;re around.</Text></View><Switch value={available} onValueChange={(value) => { setAvailable(value); tap(); feedback(value ? "You're showing as available." : "Available status paused."); }} trackColor={{ false: "#DDD9E1", true: "#B8D9CA" }} thumbColor="#FFFFFF" /></View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="visibility-off" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Appear in suggestions</Text><Text style={styles.settingSub}>You can pause discovery any time.</Text></View><Switch value={discoverable} onValueChange={(value) => { setDiscoverable(value); tap(); feedback(value ? "You're back in suggestions." : "You've been hidden from suggestions."); }} trackColor={{ false: "#DDD9E1", true: "#B9D9E9" }} thumbColor="#FFFFFF" /></View>
      <View style={styles.settingDivider} />
      <View style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="my-location" size={17} color="#987998" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Soften my distance</Text><Text style={styles.settingSub}>Show a broad area, never an exact pin.</Text></View><Switch value={blurDistance} onValueChange={(value) => { setBlurDistance(value); tap(); feedback(value ? "Approximate distance is on." : "Exact location remains hidden until you share with an accepted friend."); }} trackColor={{ false: "#DDD9E1", true: "#E6C8DA" }} thumbColor="#FFFFFF" /></View>
    </Frosted>
    <Text style={styles.settingsLabel}>PRIVACY & LITTLE EXTRAS</Text>
    <Frosted style={styles.settingsPanel}>
      <Pressable onPress={() => feedback("Safety center · report, block, and meetup reminders.")} style={styles.settingRow}><View style={styles.settingIconBlue}><Icon name="shield" size={17} color="#7393A9" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>Safety center</Text><Text style={styles.settingSub}>Report, block, and meetup comfort.</Text></View><Icon name="chevron-right" size={18} color="#A69FAB" /></Pressable>
      <View style={styles.settingDivider} />
      <Pressable onPress={() => feedback("Premium preview · live map and voice/video calls are planned paid features.")} style={styles.settingRow}><View style={styles.settingIconPink}><Icon name="workspace-premium" size={17} color="#A27898" /></View><View style={styles.settingContent}><Text style={styles.settingTitle}>A little more Kindred</Text><Text style={styles.settingSub}>Live map and calls · premium preview</Text></View><View style={styles.premiumLock}><Icon name="lock" size={12} color="#9D7799" /></View></Pressable>
    </Frosted>
    <Text style={styles.footerNote}>Your space. Your pace. Always friends first.</Text>
  </>;

  const renderContent = () => {
    if (tab === "Chats") return renderChats();
    if (tab === "Friends") return renderFriends();
    if (tab === "Meetups") return renderMeetups();
    return renderYou();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF8F7" />
      <View style={styles.ambient}><View style={styles.ambientPink} /><View style={styles.ambientBlue} /><View style={styles.ambientLilac} /></View>
      <Animated.View style={[styles.screenContent, { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }]}>{tab === "Chats" && selectedChat ? renderContent() : <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{renderContent()}</ScrollView>}</Animated.View>
      {transitionBusy ? <View style={styles.handoffOverlay} pointerEvents="none"><BlurView intensity={25} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.handoffBlur}><View style={styles.handoffCard}><View style={styles.handoffHeadline}><ActivityIndicator size="small" color="#9B7E9D" /><Text style={styles.handoffTitle}>{tab === "Meetups" ? "Finding a plan nearby" : "Back to your conversations"}</Text></View><Animated.View style={[styles.handoffSkeleton, { opacity: loaderPulse }]}><View style={styles.skeletonAvatar} /><View style={styles.skeletonTextGroup}><View style={styles.skeletonLineLong} /><View style={styles.skeletonLineShort} /></View></Animated.View><Text style={styles.handoffCaption}>A little closer, one moment.</Text></View></BlurView></View> : null}
      {toast ? <View style={styles.toast}><Icon name="check-circle" size={16} color="#FFFFFF" /><Text style={styles.toastText}>{toast}</Text></View> : null}
      <View style={styles.bottomBar}>{(["Chats", "Friends", "Meetups", "You"] as Tab[]).map((item) => { const active = tab === item && !selectedChat; const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Chats: "forum", Friends: "diversity-3", Meetups: "event-available", You: "person-outline" }; return <Pressable key={item} onPress={() => { setTab(item); if (item !== "Chats") setSelectedChat(null); tap(); }} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}><View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Icon name={iconName[item]} color={active ? "#8E6F91" : "#9A969F"} size={19} /></View><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item}</Text></Pressable>; })}</View>
      <Modal visible={showSignup} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSignup}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}><View style={styles.brandMark}><View style={styles.brandIcon}><Icon name="spa" size={16} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View><Pressable onPress={closeSignup} style={styles.roundAction}><Icon name="close" size={19} color="#746A7D" /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.pageEyebrow}>{authStep === "welcome" ? "A GOOD PLACE TO BELONG" : authStep === "phone" ? "PHONE VERIFICATION" : authStep === "code" ? "ONE SMALL SAFETY STEP" : "MAKE IT FEEL LIKE YOU"}</Text>
              <Text style={styles.modalTitle}>{authStep === "welcome" ? "People, with a little more heart." : authStep === "phone" ? "Your number.\nYour own account." : authStep === "code" ? "Check your\nphone." : "What should friends call you?"}</Text>
              <Text style={styles.modalSubtitle}>{authStep === "welcome" ? "A standalone neighborhood circle for friendship. Chats open after a mutual yes." : authStep === "phone" ? "Phone OTP verification is required. Your number is used for safety, never shown on your profile." : authStep === "code" ? `A one-time code would be sent to ${phone || "your phone"}. Enter any 6 digits for this prototype.` : "Start with your name, age, and the small things you enjoy. You can change these later."}</Text>
              {authStep === "welcome" ? <Frosted style={styles.authPromise}><View style={styles.authPromiseIcon}><Icon name="lock-outline" size={18} color="#7690A1" /></View><View style={{ flex: 1 }}><Text style={styles.authPromiseTitle}>The chat comes after the yes.</Text><Text style={styles.authPromiseCopy}>Verified members · quiet friend requests · no open DMs</Text></View></Frosted> : null}
              {authStep === "phone" ? <View style={styles.formField}><Text style={styles.fieldLabel}>PHONE NUMBER · REQUIRED</Text><TextInput value={phone} onChangeText={setPhone} placeholder="+1 (415) 555-0142" placeholderTextColor="#AAA4AC" keyboardType="phone-pad" autoCapitalize="none" style={styles.fieldInput} returnKeyType="done" /></View> : null}
              {authStep === "code" ? <View style={styles.formField}><Text style={styles.fieldLabel}>6-DIGIT OTP</Text><TextInput value={passcode} onChangeText={(value) => setPasscode(value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••••" placeholderTextColor="#AAA4AC" keyboardType="number-pad" style={[styles.fieldInput, styles.codeInput]} /></View> : null}
              {authStep === "profile" ? <><View style={styles.formField}><Text style={styles.fieldLabel}>NAME OR NICKNAME</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="What do people call you?" placeholderTextColor="#AAA4AC" style={styles.fieldInput} returnKeyType="done" /></View><View style={styles.formField}><Text style={styles.fieldLabel}>AGE</Text><TextInput value={age} onChangeText={(value) => setAge(value.replace(/[^0-9]/g, "").slice(0, 2))} placeholder="Your age" placeholderTextColor="#AAA4AC" keyboardType="number-pad" style={styles.fieldInput} /></View><View style={styles.formField}><Text style={styles.fieldLabel}>EMAIL FOR ACCOUNT RECOVERY · OPTIONAL</Text><TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor="#AAA4AC" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={styles.fieldInput} /></View><Text style={styles.fieldLabel}>SOMETHING YOU ENJOY</Text><View style={styles.interestOptions}>{["Coffee walks", "Bookshops", "Park hangs", "Try something new"].map((item) => <Pressable key={item} onPress={() => setInterest(item)} style={[styles.interestOption, interest === item && styles.interestOptionActive]}><Text style={[styles.interestOptionText, interest === item && styles.interestOptionTextActive]}>{item}</Text></Pressable>)}</View><View style={styles.verifiedNote}><Icon name="phone-iphone" size={15} color="#7A8FA0" /><Text style={styles.verifiedNoteText}>Phone verified. Add a selfie or ID later for a stronger badge.</Text></View></> : null}
              <ActionButton onPress={continueAuth} style={styles.authContinue}><Text style={styles.actionText}>{authStep === "welcome" ? "Set up my account" : authStep === "phone" ? "Send my code" : authStep === "code" ? "Verify & continue" : "Join the circle"}</Text><Icon name="arrow-forward" size={16} color="#FFFFFF" /></ActionButton>
              {authStep !== "welcome" ? <Pressable onPress={backAuth} style={styles.backLink}><Icon name="arrow-back" size={14} color="#8C7D92" /><Text style={styles.backLinkText}>Back</Text></Pressable> : null}
              <View style={styles.modalPrivacy}><Icon name="lock-outline" size={13} color="#8496A3" /><Text style={styles.modalPrivacyText}>Your number stays private and never appears on your profile.</Text></View>
              <Text style={styles.prototypeNote}>Prototype only: phone codes and identity checks are not connected to a live verification service.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal visible={composerOpen} animationType="fade" transparent onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.composerModalShade}><Frosted style={styles.groupModal}><View style={styles.modalTopLine}><View style={styles.groupModalIcon}><Icon name="groups" size={19} color="#90768F" /></View><Pressable onPress={() => setComposerOpen(false)} style={styles.roundAction}><Icon name="close" size={18} color="#746A7D" /></Pressable></View><Text style={styles.groupModalTitle}>A little private circle</Text><Text style={styles.groupModalCopy}>Groups are invite-only, for friends you&apos;ve already accepted.</Text><TextInput value={newGroupName} onChangeText={setNewGroupName} placeholder="Give your group a name" placeholderTextColor="#A6A0AA" style={styles.fieldInput} /><ActionButton onPress={toggleGroup} style={styles.groupCreateButton}><Text style={styles.actionText}>Create private group</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setComposerOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Not now</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={verificationPrompt} animationType="fade" transparent onRequestClose={() => setVerificationPrompt(false)}>
        <View style={styles.composerModalShade}><Frosted style={styles.groupModal}><View style={styles.modalTopLine}><View style={styles.verificationModalIcon}><Icon name="verified-user" size={19} color="#65947E" /></View><Pressable onPress={() => setVerificationPrompt(false)} style={styles.roundAction}><Icon name="close" size={18} color="#746A7D" /></Pressable></View><Text style={styles.groupModalTitle}>A little extra trust, first.</Text><Text style={styles.groupModalCopy}>Your phone is verified. To send friend requests, add a live-selfie match or ID check for the stronger badge. You can keep browsing until then.</Text><View style={styles.verificationStep}><Icon name="phone-iphone" size={16} color="#7C94A5" /><Text style={styles.verificationStepText}>Phone verification · complete</Text><Icon name="check-circle" size={15} color="#72A58B" /></View><View style={styles.verificationStep}><Icon name="face" size={16} color="#987C9B" /><Text style={styles.verificationStepText}>Selfie match or ID check · optional</Text><Icon name="lock-outline" size={14} color="#A8A1AA" /></View><ActionButton onPress={() => { setVerificationPrompt(false); setSelfieModalVisible(true); }} style={styles.groupCreateButton}><Text style={styles.actionText}>Start selfie check</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></ActionButton><Pressable onPress={() => setVerificationPrompt(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Maybe later</Text></Pressable></Frosted></View>
      </Modal>
      <Modal visible={actionMenuOpen} transparent animationType="fade" onRequestClose={() => setActionMenuOpen(false)}>
        <Pressable style={styles.actionMenuShade} onPress={() => setActionMenuOpen(false)}><BlurView intensity={35} tint="light" experimentalBlurMethod="dimezisBlurView" style={styles.actionMenuBlur}><Pressable onPress={(event) => event.stopPropagation()} style={styles.actionMenuCard}><View style={styles.actionMenuHandle} /><Text style={styles.actionMenuEyebrow}>KEEP IT EASY</Text><Text style={styles.actionMenuTitle}>Share something small.</Text><Text style={styles.actionMenuSub}>Only this accepted friend can see what you send.</Text><Pressable onPress={shareApproximateArea} style={styles.actionMenuRow}><View style={styles.actionMenuIconBlue}><Icon name="near-me" size={18} color="#7393A8" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Share my approximate area</Text><Text style={styles.actionMenuItemSub}>Broad neighborhood only · no live pin</Text></View><Icon name="chevron-right" size={17} color="#A9A1AB" /></Pressable><View style={styles.actionMenuDivider} /><Pressable onPress={prepareMeetupInvite} style={styles.actionMenuRow}><View style={styles.actionMenuIconPink}><Icon name="event-available" size={18} color="#9A7796" /></View><View style={styles.actionMenuCopy}><Text style={styles.actionMenuItemTitle}>Invite them to a meetup</Text><Text style={styles.actionMenuItemSub}>Adds a friendly invite to your editable draft</Text></View><Icon name="chevron-right" size={17} color="#A9A1AB" /></Pressable><View style={styles.actionMenuPrivacy}><Icon name="lock-outline" size={13} color="#8092A0" /><Text style={styles.actionMenuPrivacyText}>Kindred never shares your exact location automatically.</Text></View><Pressable onPress={() => setActionMenuOpen(false)} style={styles.cancelGroup}><Text style={styles.cancelGroupText}>Cancel</Text></Pressable></Pressable></BlurView></Pressable>
      </Modal>
      <SelfieVerificationModal visible={selfieModalVisible} onClose={() => setSelfieModalVisible(false)} onCaptured={() => feedback("Selfie captured on this device. A verification provider must review it before your badge changes.")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FAF8F7" },
  screenContent: { flex: 1 },
  ambient: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientPink: { position: "absolute", top: 120, right: -140, height: 330, width: 330, borderRadius: 170, backgroundColor: "rgba(250,220,234,0.30)" },
  ambientBlue: { position: "absolute", top: 390, left: -180, height: 320, width: 320, borderRadius: 170, backgroundColor: "rgba(208,231,246,0.32)" },
  ambientLilac: { position: "absolute", top: 640, right: -180, height: 270, width: 270, borderRadius: 140, backgroundColor: "rgba(231,221,241,0.20)" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 19, paddingTop: 8, paddingBottom: 18, flexGrow: 1 },
  topBar: { minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandIcon: { width: 31, height: 31, borderRadius: 12, backgroundColor: "#957A99", alignItems: "center", justifyContent: "center" },
  brandWord: { fontSize: 18, fontWeight: "700", letterSpacing: -0.45, color: "#4E4856" },
  topBarSub: { marginTop: 2, color: "#8F8993", fontSize: 9 },
  backButton: { height: 37, width: 34, justifyContent: "center" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  roundAction: { position: "relative", height: 35, width: 35, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", right: 7, top: 7, height: 6, width: 6, borderRadius: 3, backgroundColor: "#DB91B2", borderWidth: 1, borderColor: "#FFFFFF" },
  userAvatar: { height: 35, width: 35, borderRadius: 14, backgroundColor: "#EEE5EF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF" },
  userInitial: { color: "#816C8A", fontSize: 15, fontWeight: "700" },
  greeting: { color: "#9B8E9C", fontSize: 11, fontWeight: "500", letterSpacing: 0.2 },
  chatHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11, marginBottom: 15 },
  chatTitle: { color: "#3D3946", fontSize: 24, fontWeight: "700", letterSpacing: -0.75, marginTop: 3 },
  composeButton: { width: 39, height: 39, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#A17FA1", shadowColor: "#977B97", shadowOpacity: 0.18, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  frosted: { backgroundColor: "rgba(255,255,255,0.70)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", borderRadius: 19, shadowColor: "#8B8492", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.055, shadowRadius: 15, elevation: 2 },
  searchBar: { height: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.64)" },
  searchInput: { flex: 1, color: "#504B57", fontSize: 11, paddingVertical: 0, outlineStyle: "none" as any },
  filterRow: { flexDirection: "row", gap: 7, marginTop: 10, marginBottom: 10 },
  filterChip: { minHeight: 27, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.54)", borderWidth: 1, borderColor: "rgba(255,255,255,0.90)" },
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
  chatRow: { minHeight: 69, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: "rgba(225,220,227,0.47)", paddingVertical: 8 },
  rowPressed: { opacity: 0.74 },
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
  actionButton: { height: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, backgroundColor: "#A17FA1", paddingHorizontal: 14 },
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
  messageBubble: { maxWidth: "83%", paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 16 },
  theirBubble: { backgroundColor: "rgba(255,255,255,0.85)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", borderBottomLeftRadius: 6 },
  myBubble: { backgroundColor: "#EADFEB", borderBottomRightRadius: 6 },
  messageText: { color: "#514B56", fontSize: 12, lineHeight: 18 },
  myMessageText: { color: "#61516A" },
  messageTime: { textAlign: "right", color: "#AAA2AC", fontSize: 7, marginTop: 4 },
  myMessageTime: { color: "#927C96" },
  hangoutStrip: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderTopWidth: 1, borderTopColor: "rgba(221,214,224,0.47)" },
  hangoutStripText: { flex: 1, color: "#928995", fontSize: 8 },
  inviteLink: { color: "#98779A", fontSize: 9, fontWeight: "700" },
  composerRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 5, paddingBottom: 4 },
  composerIcon: { width: 30, alignItems: "center" },
  composerInput: { minHeight: 39, flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.83)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", color: "#554F59", fontSize: 11, outlineStyle: "none" as any },
  sendButton: { width: 34, height: 34, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#E8E4E9" },
  sendButtonActive: { backgroundColor: "#9E7C9E" },
  pageIntro: { marginTop: 17, marginBottom: 17 },
  pageEyebrow: { color: "#A0849E", fontSize: 8, fontWeight: "700", letterSpacing: 1.1, marginBottom: 7 },
  pageTitle: { color: "#45404B", fontSize: 23, lineHeight: 28, fontWeight: "700", letterSpacing: -0.65 },
  pageSub: { color: "#89838E", fontSize: 10, lineHeight: 16, marginTop: 5 },
  friendsTools: { gap: 8 },
  interestFilterRow: { gap: 6, paddingVertical: 1 },
  friendsScroll: { flex: 1, marginTop: 14 },
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
  neighborAvatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: "#EFE8EF" },
  neighborInfo: { flex: 1, minWidth: 0, gap: 3 },
  neighborNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  neighborName: { color: "#4B4551", fontSize: 10, fontWeight: "700", maxWidth: 130 },
  neighborAbout: { color: "#8E8791", fontSize: 8 },
  neighborMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  neighborMetaText: { color: "#968E98", fontSize: 7 },
  neighborMetaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#B5AAB7", marginHorizontal: 2 },
  neighborInterest: { color: "#997D99", fontSize: 7, maxWidth: 67 },
  phoneOnlyLabel: { color: "#928C94", fontSize: 7, backgroundColor: "#F1EFF2", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, overflow: "hidden", marginLeft: 2 },
  compactRequestButton: { minWidth: 60, height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 10, borderWidth: 1, borderColor: "#E3D6E5", backgroundColor: "rgba(246,239,247,0.78)", paddingHorizontal: 6 },
  compactRequestText: { color: "#8D748F", fontSize: 8, fontWeight: "700" },
  discoveryPaused: { flexDirection: "row", alignItems: "center", gap: 8, padding: 11, marginBottom: 9, borderRadius: 14 },
  discoveryPausedTitle: { color: "#6C6470", fontSize: 9, fontWeight: "700" },
  noMatches: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  noMatchesText: { color: "#918994", fontSize: 9 },
  suggestCard: { width: "48.5%", borderRadius: 17, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.79)", borderWidth: 1, borderColor: "rgba(255,255,255,0.98)", shadowColor: "#8B8492", shadowOpacity: 0.045, shadowRadius: 12, elevation: 2 },
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
  requestFriendButton: { minHeight: 30, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#A080A1", paddingHorizontal: 4 },
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
  meetupList: { gap: 9, paddingBottom: 20 },
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
  rsvpButton: { alignSelf: "flex-end", borderRadius: 9, backgroundColor: "#A180A2", paddingHorizontal: 9, paddingVertical: 6, marginBottom: 1 },
  rsvpText: { color: "#FFFFFF", fontSize: 8, fontWeight: "700" },
  rsvpJoined: { backgroundColor: "#E7F0EA" },
  rsvpTextJoined: { color: "#5B8A73" },
  createPlanLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36 },
  createPlanText: { color: "#8B768E", fontSize: 9, fontWeight: "600" },
  profileCard: { alignItems: "center", padding: 16, borderRadius: 20 },
  profileAvatar: { position: "relative", width: 59, height: 59, borderRadius: 21, backgroundColor: "#E9E0F0", alignItems: "center", justifyContent: "center" },
  profileInitial: { color: "#826D8A", fontSize: 25, fontWeight: "700" },
  profileCheck: { position: "absolute", right: -2, bottom: -2, width: 19, height: 19, borderRadius: 8, backgroundColor: "#72A58B", borderColor: "#FFFFFF", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  profileName: { color: "#514A57", fontSize: 15, fontWeight: "700", marginTop: 7 },
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
  settingRow: { minHeight: 59, flexDirection: "row", alignItems: "center", gap: 9 },
  settingIconPink: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#F4EAF2", alignItems: "center", justifyContent: "center" },
  settingIconBlue: { width: 31, height: 31, borderRadius: 11, backgroundColor: "#E9F1F5", alignItems: "center", justifyContent: "center" },
  settingContent: { flex: 1 },
  settingTitle: { color: "#5B535F", fontSize: 9, fontWeight: "700" },
  settingSub: { color: "#97909A", fontSize: 7, marginTop: 3 },
  settingDivider: { height: 1, backgroundColor: "rgba(220,214,222,0.50)" },
  premiumLock: { width: 24, height: 24, borderRadius: 9, backgroundColor: "#F3E7F1", alignItems: "center", justifyContent: "center" },
  footerNote: { color: "#A19AA4", fontSize: 8, textAlign: "center", marginTop: 15 },
  bottomBar: { minHeight: 62, paddingBottom: Platform.OS === "web" ? 2 : 1, backgroundColor: "rgba(251,249,248,0.95)", borderTopWidth: 1, borderTopColor: "rgba(218,211,222,0.50)", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  tabButton: { width: "25%", alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 3 },
  tabIconWrap: { height: 26, minWidth: 45, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: "#F0E5F0" },
  tabLabel: { color: "#99939C", fontSize: 8, fontWeight: "500" },
  tabLabelActive: { color: "#826C89", fontWeight: "700" },
  toast: { position: "absolute", bottom: 72, left: 21, right: 21, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#675D70", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#56485E", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  toastText: { color: "#FFFFFF", fontSize: 9, fontWeight: "500", flex: 1 },
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
  actionMenuShade: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(64,55,70,0.16)" },
  actionMenuBlur: { minHeight: 295, maxHeight: "72%", width: "100%", borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: "hidden", backgroundColor: "rgba(250,248,251,0.62)", borderWidth: 1, borderBottomWidth: 0, borderColor: "rgba(255,255,255,0.92)" },
  actionMenuCard: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 13, backgroundColor: "rgba(250,248,251,0.58)" },
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
});
