import React, { useMemo, useState } from "react";
import {
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
import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { isValidCredential, isValidDemoCode } from "@/lib/onboarding";

type Person = {
  id: string;
  name: string;
  age: number;
  distance: string;
  interests: string[];
  note: string;
  image: any;
  tone: string;
  verified: boolean;
};
type Tab = "Nearby" | "Plans" | "Inbox" | "You";
type AuthStep = "welcome" | "details" | "code" | "profile";

const people: Person[] = [
  {
    id: "maya",
    name: "Maya",
    age: 28,
    distance: "0.4 mi away",
    interests: ["Ceramics", "Slow mornings"],
    note: "Looking for a Sunday market buddy ☀️",
    image: require("../../assets/images/people/maya.jpg"),
    tone: "#E7D9C7",
    verified: true,
  },
  {
    id: "sam",
    name: "Sam",
    age: 31,
    distance: "0.8 mi away",
    interests: ["Bouldering", "Good coffee"],
    note: "New to the neighborhood, always up for a walk.",
    image: require("../../assets/images/people/sam.jpg"),
    tone: "#D6E2DA",
    verified: true,
  },
  {
    id: "noah",
    name: "Noah",
    age: 27,
    distance: "1.2 mi away",
    interests: ["Books", "Cooking"],
    note: "Can recommend a book for literally any mood.",
    image: require("../../assets/images/people/noah.jpg"),
    tone: "#E5DCCB",
    verified: true,
  },
];

const plans = [
  { id: "coffee", day: "TODAY · 10:30 AM", title: "Coffee & a little fresh air", place: "Ritual Coffee · 0.6 mi", host: "Maya + 3 neighbors", icon: "local-cafe", color: "#E8DCCB", count: "3 spots left" },
  { id: "walk", day: "SAT · 4:00 PM", title: "Golden hour at Dolores Park", place: "Dolores Park · 1.1 mi", host: "Hosted by Jordan", icon: "wb-sunny", color: "#DDE9DF", count: "5 going" },
  { id: "books", day: "SUN · 11:00 AM", title: "The no-pressure book swap", place: "The Interval · 1.8 mi", host: "Hosted by Elise", icon: "auto-stories", color: "#E9DEEA", count: "2 spots left" },
];

const Icon = ({ name, color = "#456356", size = 20 }: { name: keyof typeof MaterialIcons.glyphMap; color?: string; size?: number }) => (
  <MaterialIcons name={name} color={color} size={size} />
);

function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.glassCard, style]}>{children}</View>;
}

function PressButton({ children, onPress, style, dark = false }: { children: React.ReactNode; onPress: () => void; style?: object; dark?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, dark && styles.darkButton, style, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export default function NearbyScreen() {
  const [tab, setTab] = useState<Tab>("Nearby");
  const [showSignup, setShowSignup] = useState(false);
  const [authMethod, setAuthMethod] = useState<"Email" | "Phone">("Email");
  const [authStep, setAuthStep] = useState<AuthStep>("welcome");
  const [credential, setCredential] = useState("");
  const [passcode, setPasscode] = useState("");
  const [fullName, setFullName] = useState("");
  const [interest, setInterest] = useState("Coffee walks");
  const [joined, setJoined] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [groupFriendly, setGroupFriendly] = useState(true);
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [joinedPlans, setJoinedPlans] = useState<string[]>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [onlineOnly, setOnlineOnly] = useState(false);

  const filteredPeople = useMemo(() => people.filter((person) => {
    const query = search.trim().toLowerCase();
    return !query || `${person.name} ${person.interests.join(" ")} ${person.note}`.toLowerCase().includes(query);
  }), [search]);

  const feedback = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2300);
  };
  const tap = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
  const openSignup = () => { setAuthStep("welcome"); setShowSignup(true); tap(); };
  const toggleSaved = (id: string) => {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    tap();
  };

  const closeSignup = () => setShowSignup(false);
  const continueAuth = () => {
    if (authStep === "welcome") { setAuthStep("details"); return; }
    if (authStep === "details") {
      if (!isValidCredential(authMethod, credential)) { feedback(authMethod === "Email" ? "Enter a valid email address to continue" : "Enter a valid phone number to continue"); return; }
      setAuthStep("code"); return;
    }
    if (authStep === "code") {
      if (!isValidDemoCode(passcode)) { feedback("Enter the 6-digit demo code to continue"); return; }
      setAuthStep("profile"); return;
    }
    if (!fullName.trim()) { feedback("Add your first name to finish your profile"); return; }
    setJoined(true);
    setTab("You");
    setShowSignup(false);
    feedback("Welcome to Kindred. Take it at your own pace.");
  };

  const header = (eyebrow: string, title: string, sub?: string) => (
    <View style={styles.pageHeader}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      {sub ? <Text style={styles.pageSub}>{sub}</Text> : null}
    </View>
  );

  const personCard = (person: Person) => {
    const isSaved = saved.includes(person.id);
    return (
      <GlassCard key={person.id} style={styles.personCard}>
        <View style={[styles.personPhotoWrap, { backgroundColor: person.tone }]}>
          <Image source={person.image} style={styles.personPhoto} resizeMode="cover" />
          <View style={styles.photoVignette} />
          <View style={styles.nearbyPill}><View style={styles.greenDot} /><Text style={styles.nearbyText}>Nearby now</Text></View>
          <Pressable accessibilityLabel={isSaved ? "Unsave profile" : "Save profile"} onPress={() => toggleSaved(person.id)} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Icon name={isSaved ? "bookmark" : "bookmark-border"} size={19} color={isSaved ? "#456356" : "#53695E"} />
          </Pressable>
          <View style={styles.nameOverlay}>
            <View style={styles.nameLine}><Text style={styles.personName}>{person.name}, {person.age}</Text><View style={styles.verifiedBadge}><Icon name="verified" color="#FFFFFF" size={15} /></View></View>
            <Text style={styles.distanceLight}><Icon name="near-me" size={12} color="#F8F6F1" />  {person.distance}</Text>
          </View>
        </View>
        <View style={styles.personBody}>
          <Text style={styles.personNote} numberOfLines={2}>{person.note}</Text>
          <View style={styles.chipRow}>{person.interests.map((item) => <View key={item} style={styles.interestChip}><Text style={styles.interestText}>{item}</Text></View>)}</View>
          <View style={styles.personActions}>
            <View style={styles.genuineHint}><Icon name="shield" color="#698575" size={14} /><Text style={styles.genuineText}>Verified in person</Text></View>
            <Pressable onPress={() => { setMessages((current) => current.includes(person.id) ? current : [...current, person.id]); feedback(`A hello is ready for ${person.name} 👋`); tap(); }} style={({ pressed }) => [styles.sayHelloButton, pressed && styles.pressed]}>
              <Text style={styles.sayHelloText}>{messages.includes(person.id) ? "Hello sent" : "Say hello"}</Text><Icon name={messages.includes(person.id) ? "check" : "arrow-forward"} size={15} color="#456356" />
            </Pressable>
          </View>
        </View>
      </GlassCard>
    );
  };

  const planCard = (plan: (typeof plans)[number]) => {
    const isJoined = joinedPlans.includes(plan.id);
    return (
      <GlassCard key={plan.id} style={styles.planCard}>
        <View style={[styles.planIcon, { backgroundColor: plan.color }]}><Icon name={plan.icon as keyof typeof MaterialIcons.glyphMap} size={21} /></View>
        <View style={styles.planContent}>
          <Text style={styles.planDay}>{plan.day}</Text>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.planPlace}><Icon name="place" size={13} color="#8A9189" />  {plan.place}</Text>
          <View style={styles.planMeta}><Text style={styles.planHost}>{plan.host}</Text><View style={styles.metaDot} /><Text style={styles.planCount}>{isJoined ? "You're in" : plan.count}</Text></View>
        </View>
        <Pressable onPress={() => { setJoinedPlans((current) => isJoined ? current.filter((id) => id !== plan.id) : [...current, plan.id]); tap(); feedback(isJoined ? "Removed from your plans" : "You're on the list. See you there!"); }} style={({ pressed }) => [styles.planJoin, isJoined && styles.planJoined, pressed && styles.pressed]}>
          <Text style={[styles.planJoinText, isJoined && styles.planJoinedText]}>{isJoined ? "Going" : "Join"}</Text>
        </Pressable>
      </GlassCard>
    );
  };

  const renderNearby = () => (
    <>
      <View style={styles.topBar}>
        <View style={styles.brandMark}><View style={styles.brandMarkInner}><Icon name="spa" size={18} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View>
        <Pressable onPress={openSignup} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
          {joined ? <Text style={styles.avatarInitial}>{fullName.trim().charAt(0).toUpperCase()}</Text> : <Icon name="person-outline" size={20} color="#4D6758" />}
        </Pressable>
      </View>
      <View style={styles.locationRow}><Icon name="place" size={16} color="#648271" /><Text style={styles.locationText}>PACIFIC HEIGHTS, SF</Text><Icon name="expand-more" size={17} color="#83938A" /></View>
      <View style={styles.heroLine}><Text style={styles.heroTitle}>Good people,</Text><Text style={styles.heroTitleItalic}>close by.</Text></View>
      <Text style={styles.heroCopy}>Meet your next friend over something simple.</Text>
      <GlassCard style={styles.safetyNote}><View style={styles.safetyIcon}><Icon name="verified-user" size={17} color="#456356" /></View><Text style={styles.safetyText}>Real people, gently verified. Always friends first.</Text><Icon name="chevron-right" size={17} color="#87968A" /></GlassCard>
      <View style={styles.discoveryHeader}><View><Text style={styles.sectionKicker}>A GOOD PLACE TO START</Text><Text style={styles.sectionTitle}>People near you</Text></View><Pressable onPress={() => feedback("Showing neighbors within 3 miles")} style={({ pressed }) => [styles.radiusButton, pressed && styles.pressed]}><Icon name="tune" size={15} color="#52705F" /><Text style={styles.radiusText}>3 miles</Text></Pressable></View>
      <View style={styles.searchBar}><Icon name="search" size={18} color="#87968C" /><TextInput value={search} onChangeText={setSearch} placeholder="Try coffee, books, climbing…" placeholderTextColor="#98A199" style={styles.searchInput} returnKeyType="search" /></View>
      <View style={styles.filterLine}><View style={styles.filterCopy}><Icon name="groups" size={17} color="#658070" /><Text style={styles.filterLabel}>Open to group hangs</Text></View><Switch value={groupFriendly} onValueChange={(value) => { setGroupFriendly(value); tap(); }} trackColor={{ false: "#D5D9D3", true: "#8FAE98" }} thumbColor="#FFFFFF" ios_backgroundColor="#D5D9D3" /></View>
      {filteredPeople.length ? <View style={styles.peopleList}>{filteredPeople.map(personCard)}</View> : <GlassCard style={styles.emptyCard}><Icon name="search-off" size={24} /><Text style={styles.emptyText}>No neighbors found. Try another interest.</Text></GlassCard>}
      <View style={styles.meetupBanner}><View style={{ flex: 1 }}><Text style={styles.bannerEyebrow}>SMALL PLANS, EASY HELLOS</Text><Text style={styles.bannerTitle}>A little company{`\n`}goes a long way.</Text><PressButton onPress={() => setTab("Plans")} style={styles.bannerButton}><Text style={styles.bannerButtonText}>Find a plan</Text><Icon name="arrow-forward" size={15} color="#FFFFFF" /></PressButton></View><Image source={require("../../assets/images/people/friends.jpg")} style={styles.bannerImage} resizeMode="cover" /></View>
      <Text style={styles.disclaimer}>Profiles shown here are sample community cards. Verification happens with consent.</Text>
    </>
  );

  const renderPlans = () => (
    <>
      <View style={styles.topBar}><View style={styles.brandMark}><View style={styles.brandMarkInner}><Icon name="spa" size={18} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View><Pressable onPress={openSignup} style={styles.avatarButton}><Icon name="person-outline" size={20} color="#4D6758" /></Pressable></View>
      {header("MAKE A LITTLE ROOM FOR PEOPLE", "Plans nearby", "Low-key meetups, hosted by people around you.")}
      <View style={styles.planFeature}><Image source={require("../../assets/images/people/friends.jpg")} style={styles.planFeatureImage} resizeMode="cover" /><View style={styles.planFeatureShade} /><View style={styles.planFeatureText}><View style={styles.featurePill}><Icon name="verified-user" size={12} color="#FFFFFF" /><Text style={styles.featurePillText}>COMMUNITY HOSTED</Text></View><Text style={styles.planFeatureTitle}>Better together,{`\n`}without the big plan.</Text><Text style={styles.planFeatureSub}>Little gatherings. Real neighbors. Zero pressure.</Text></View></View>
      <View style={styles.discoveryHeader}><View><Text style={styles.sectionKicker}>COMING UP</Text><Text style={styles.sectionTitle}>A few good ideas</Text></View><Pressable onPress={() => feedback("Showing plans within 3 miles")} style={styles.radiusButton}><Icon name="tune" size={15} color="#52705F" /><Text style={styles.radiusText}>3 miles</Text></Pressable></View>
      <View style={styles.planList}>{plans.map(planCard)}</View>
      <GlassCard style={styles.hostCard}><View style={styles.hostIcon}><Icon name="add" size={20} /></View><View style={{ flex: 1 }}><Text style={styles.hostTitle}>Have a small plan in mind?</Text><Text style={styles.hostCopy}>Make room for a couple of new neighbors.</Text></View><Pressable onPress={() => joined ? feedback("Plan creation is ready for your account") : openSignup()}><Icon name="arrow-forward" size={18} color="#587562" /></Pressable></GlassCard>
    </>
  );

  const renderInbox = () => (
    <>
      <View style={styles.topBar}><View style={styles.brandMark}><View style={styles.brandMarkInner}><Icon name="spa" size={18} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View></View>
      {header("GOOD CONVERSATIONS, AT YOUR PACE", "Your hellos", "A quiet place for new connections to begin.")}
      {messages.length ? <View style={styles.inboxList}>{messages.map((id) => {
        const person = people.find((item) => item.id === id)!;
        return <Pressable key={id} onPress={() => feedback(`Your conversation with ${person.name} is just getting started`)} style={({ pressed }) => [styles.inboxCard, pressed && styles.pressed]}><Image source={person.image} style={styles.inboxPhoto} /><View style={{ flex: 1 }}><View style={styles.inboxNameLine}><Text style={styles.inboxName}>{person.name}</Text><Text style={styles.inboxTime}>JUST NOW</Text></View><Text style={styles.inboxPreview}>You sent a friendly hello. Say a little more?</Text><View style={styles.inboxVerified}><Icon name="verified" color="#6B8A76" size={13} /><Text style={styles.inboxVerifiedText}>Verified community member</Text></View></View><Icon name="chevron-right" size={20} color="#95A096" /></Pressable>;
      })}</View> : <View style={styles.inboxEmpty}><View style={styles.inboxIllustration}><View style={styles.bubbleOne}><Icon name="waving-hand" color="#52705F" size={26} /></View><View style={styles.bubbleTwo}><Icon name="favorite-border" color="#B58E6C" size={18} /></View></View><Text style={styles.inboxEmptyTitle}>Your next good hello{`\n`}is just around the corner.</Text><Text style={styles.inboxEmptyCopy}>When you say hello to someone nearby, your conversation will find a home here. No rush to reply.</Text><PressButton onPress={() => setTab("Nearby")} style={styles.inboxCta}><Text style={styles.primaryButtonText}>Meet people nearby</Text><Icon name="arrow-forward" size={16} color="#FFFFFF" /></PressButton></View>}
    </>
  );

  const renderYou = () => (
    <>
      <View style={styles.topBar}><View style={styles.brandMark}><View style={styles.brandMarkInner}><Icon name="spa" size={18} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View><Pressable onPress={() => feedback("Your safety and privacy settings are up to date")} style={styles.avatarButton}><Icon name="settings" size={19} color="#4D6758" /></Pressable></View>
      {header("YOUR CORNER OF THE COMMUNITY", joined ? `A little more you, ${fullName.split(" ")[0]}.` : "People feel at home here.", joined ? "Your profile, just how you want it." : "A profile makes it easier for your future friends to say hello.")}
      {joined ? <GlassCard style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileInitial}>{fullName.charAt(0).toUpperCase()}</Text><View style={styles.profileVerified}><Icon name="verified" size={14} color="#FFFFFF" /></View></View><Text style={styles.profileName}>{fullName}</Text><Text style={styles.profileLocation}><Icon name="place" size={14} color="#71877A" />  Pacific Heights, San Francisco</Text><View style={styles.chipRow}><View style={styles.interestChip}><Text style={styles.interestText}>{interest}</Text></View><View style={styles.interestChip}><Text style={styles.interestText}>Open to friendship</Text></View></View><View style={styles.profilePrivacy}><Icon name="lock-outline" size={15} color="#698575" /><Text style={styles.profilePrivacyText}>Your phone and email stay private.</Text></View><Pressable onPress={openSignup} style={styles.profileEdit}><Text style={styles.profileEditText}>Edit your profile</Text><Icon name="arrow-forward" size={16} /></Pressable></GlassCard> : <GlassCard style={styles.joinCard}><View style={styles.joinIcon}><Icon name="favorite-border" size={23} /></View><Text style={styles.joinTitle}>Come as you are.</Text><Text style={styles.joinCopy}>Kindred is for finding your people, joining a little plan, and feeling more at home in your neighborhood. Always friendship first.</Text><PressButton onPress={openSignup} style={styles.joinCta}><Text style={styles.primaryButtonText}>Create your profile</Text><Icon name="arrow-forward" size={16} color="#FFFFFF" /></PressButton><View style={styles.independentAuth}><Icon name="lock-outline" size={15} color="#688477" /><Text style={styles.independentText}>Your own account, with email or phone.</Text></View></GlassCard>}
      <Text style={styles.settingsHeading}>YOUR COMFORT COMES FIRST</Text>
      <GlassCard style={styles.settingsCard}><View style={styles.settingRow}><View style={styles.settingIcon}><Icon name="visibility-off" size={18} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Hide my distance</Text><Text style={styles.settingSub}>Your exact location is never shown.</Text></View><Switch value={onlineOnly} onValueChange={(value) => { setOnlineOnly(value); tap(); feedback(value ? "Distance is now hidden" : "Distance is visible as an estimate"); }} trackColor={{ false: "#D5D9D3", true: "#8FAE98" }} thumbColor="#FFFFFF" /></View><View style={styles.settingDivider} /><Pressable onPress={() => feedback("Safety center · block, report, and meetup tips")} style={styles.settingRow}><View style={styles.settingIcon}><Icon name="shield" size={18} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Safety center</Text><Text style={styles.settingSub}>Simple tools to feel in control.</Text></View><Icon name="chevron-right" size={19} color="#89958D" /></Pressable></GlassCard>
      <Text style={styles.disclaimer}>You decide what you share, who you meet, and when.</Text>
    </>
  );

  const renderContent = () => {
    switch (tab) {
      case "Nearby": return renderNearby();
      case "Plans": return renderPlans();
      case "Inbox": return renderInbox();
      case "You": return renderYou();
    }
  };

  const openSignupFromNavigation = () => {
    if (!joined) openSignup();
    else setTab("You");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F4EE" />
      <View style={styles.backgroundOrbs}><View style={styles.orbMint} /><View style={styles.orbSand} /></View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {renderContent()}
      </ScrollView>
      {toast ? <View pointerEvents="none" style={styles.toast}><Icon name="check-circle" size={17} color="#FFFFFF" /><Text style={styles.toastText}>{toast}</Text></View> : null}
      <View style={styles.bottomBar}>
        {(["Nearby", "Plans", "Inbox", "You"] as Tab[]).map((item) => {
          const active = tab === item;
          const iconName: Record<Tab, keyof typeof MaterialIcons.glyphMap> = { Nearby: "explore", Plans: "event-available", Inbox: "forum", You: "person-outline" };
          return <Pressable key={item} onPress={() => { if (item === "You") openSignupFromNavigation(); else setTab(item); tap(); }} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
            <View style={[styles.tabIconWrap, active && styles.tabIconActive]}><Icon name={iconName[item]} color={active ? "#365B48" : "#8B948D"} size={20} /></View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item}</Text>
          </Pressable>;
        })}
      </View>
      <Modal visible={showSignup} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSignup}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom", "left", "right"]}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalHeader}><View style={styles.modalBrand}><View style={styles.brandMarkInner}><Icon name="spa" size={16} color="#FFFFFF" /></View><Text style={styles.brandWord}>kindred</Text></View><Pressable onPress={closeSignup} style={styles.closeButton}><Icon name="close" size={19} color="#51675A" /></Pressable></View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalStep}>{authStep === "welcome" ? "A SOFTER WAY TO MEET PEOPLE" : authStep === "details" ? "YOUR OWN KINDRED ACCOUNT" : authStep === "code" ? "ONE SMALL SAFETY STEP" : "START WITH THE GOOD STUFF"}</Text>
              <Text style={styles.modalTitle}>{authStep === "welcome" ? "Your people are\ncloser than you think." : authStep === "details" ? "Let's make this\nyours." : authStep === "code" ? "Check your\n{channel}.".replace("{channel}", authMethod === "Email" ? "inbox" : "phone") : "What should we\ncall you?"}</Text>
              <Text style={styles.modalSubtitle}>{authStep === "welcome" ? "Real neighbors. Little plans. No swiping, no pressure—just friendship." : authStep === "details" ? "Create an independent account with your email or phone. No social login needed." : authStep === "code" ? `We'd send a one-time code to ${credential || "your contact"}. Enter any 6 digits to preview the next step.` : "A first name is enough. You can share as much or as little as you like."}</Text>
              {authStep === "welcome" ? <>
                <View style={styles.authChoiceRow}>{(["Email", "Phone"] as const).map((method) => <Pressable key={method} onPress={() => setAuthMethod(method)} style={[styles.authChoice, authMethod === method && styles.authChoiceActive]}><Icon name={method === "Email" ? "mail-outline" : "phone-iphone"} size={18} color={authMethod === method ? "#456356" : "#8A968D"} /><Text style={[styles.authChoiceText, authMethod === method && styles.authChoiceTextActive]}>{method}</Text></Pressable>)}</View>
                <GlassCard style={styles.authPromise}><Icon name="shield" size={19} color="#63806E" /><View style={{ flex: 1 }}><Text style={styles.authPromiseTitle}>Friendship is the whole point.</Text><Text style={styles.authPromiseCopy}>Verified neighbors and small meetups, not dating.</Text></View></GlassCard>
                <View style={styles.authMiniPoints}><View><Icon name="verified-user" size={20} color="#607C6A" /><Text style={styles.authMiniText}>People{`\n`}verified</Text></View><View><Icon name="groups" size={20} color="#607C6A" /><Text style={styles.authMiniText}>Small, easy{`\n`}meetups</Text></View><View><Icon name="visibility-off" size={20} color="#607C6A" /><Text style={styles.authMiniText}>Your privacy{`\n`}stays yours</Text></View></View>
              </> : null}
              {authStep === "details" ? <View style={styles.formField}><Text style={styles.fieldLabel}>{authMethod === "Email" ? "EMAIL ADDRESS" : "PHONE NUMBER"}</Text><TextInput value={credential} onChangeText={setCredential} placeholder={authMethod === "Email" ? "you@example.com" : "+1 (415) 555-0142"} placeholderTextColor="#A0A89F" keyboardType={authMethod === "Email" ? "email-address" : "phone-pad"} autoCapitalize="none" autoCorrect={false} style={styles.fieldInput} returnKeyType="done" /></View> : null}
              {authStep === "code" ? <View style={styles.formField}><Text style={styles.fieldLabel}>6-DIGIT CODE</Text><TextInput value={passcode} onChangeText={(value) => setPasscode(value.replace(/[^0-9]/g, "").slice(0, 6))} placeholder="••••••" placeholderTextColor="#A0A89F" keyboardType="number-pad" style={[styles.fieldInput, styles.codeInput]} /></View> : null}
              {authStep === "profile" ? <><View style={styles.formField}><Text style={styles.fieldLabel}>FIRST NAME</Text><TextInput value={fullName} onChangeText={setFullName} placeholder="What do your friends call you?" placeholderTextColor="#A0A89F" style={styles.fieldInput} returnKeyType="done" /></View><View style={styles.formField}><Text style={styles.fieldLabel}>A GOOD WAY TO SPEND A FREE HOUR</Text><View style={styles.interestOptions}>{["Coffee walks", "Bookshops", "Park hangs", "Try something new"].map((item) => <Pressable key={item} onPress={() => setInterest(item)} style={[styles.interestOption, interest === item && styles.interestOptionActive]}><Text style={[styles.interestOptionText, interest === item && styles.interestOptionTextActive]}>{item}</Text></Pressable>)}</View></View></> : null}
              <PressButton onPress={continueAuth} style={styles.authContinue}><Text style={styles.primaryButtonText}>{authStep === "welcome" ? "Get started" : authStep === "details" ? "Continue" : authStep === "code" ? "Verify & continue" : "Find my people"}</Text><Icon name="arrow-forward" size={17} color="#FFFFFF" /></PressButton>
              {authStep !== "welcome" ? <Pressable onPress={() => setAuthStep(authStep === "profile" ? "details" : authStep === "code" ? "details" : "welcome")} style={styles.backLink}><Icon name="arrow-back" size={14} color="#62766A" /><Text style={styles.backLinkText}>Back</Text></Pressable> : null}
              <View style={styles.modalPrivacy}><Icon name="lock-outline" size={13} color="#789080" /><Text style={styles.modalPrivacyText}>Private by design. Your contact details are never shown on your profile.</Text></View>
              <Text style={styles.prototypeNote}>Prototype preview: code verification and account creation are not connected to a live email/SMS service.</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F5F4EE" },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  orbMint: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "rgba(203,224,208,0.40)", top: 80, right: -200 },
  orbSand: { position: "absolute", width: 290, height: 290, borderRadius: 145, backgroundColor: "rgba(236,220,194,0.32)", top: 410, left: -215 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 26 },
  topBar: { height: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  brandMark: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMarkInner: { width: 30, height: 30, borderRadius: 11, backgroundColor: "#5C806A", alignItems: "center", justifyContent: "center" },
  brandWord: { fontSize: 20, fontWeight: "700", letterSpacing: -0.7, color: "#355342" },
  avatarButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", shadowColor: "#344A3D", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  avatarInitial: { color: "#456356", fontSize: 16, fontWeight: "700" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  locationText: { fontSize: 10, letterSpacing: 1.7, color: "#708377", fontWeight: "700" },
  heroLine: { marginTop: 7 },
  heroTitle: { color: "#243D30", fontSize: 35, letterSpacing: -1.4, fontWeight: "600", lineHeight: 38 },
  heroTitleItalic: { color: "#527460", fontSize: 35, letterSpacing: -1.25, fontWeight: "500", lineHeight: 39, fontStyle: "italic" },
  heroCopy: { marginTop: 7, marginBottom: 15, color: "#78827B", fontSize: 13, letterSpacing: 0.05 },
  glassCard: { backgroundColor: "rgba(255,255,255,0.68)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", borderRadius: 23, shadowColor: "#596C5C", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.055, shadowRadius: 18, elevation: 3 },
  safetyNote: { minHeight: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.57)", marginBottom: 22 },
  safetyIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: "#E5EFE5", alignItems: "center", justifyContent: "center" },
  safetyText: { flex: 1, fontSize: 11, lineHeight: 16, color: "#5F7567", fontWeight: "500" },
  discoveryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 },
  sectionKicker: { fontSize: 9, letterSpacing: 1.35, color: "#87948A", fontWeight: "700", marginBottom: 4 },
  sectionTitle: { color: "#2C4034", fontSize: 21, letterSpacing: -0.5, fontWeight: "600" },
  radiusButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)" },
  radiusText: { fontSize: 11, color: "#56705E", fontWeight: "600" },
  searchBar: { height: 44, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.88)", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.64)", marginBottom: 10 },
  searchInput: { flex: 1, color: "#344A3D", fontSize: 12, paddingVertical: 0, outlineStyle: "none" as any },
  filterLine: { height: 37, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 1, marginBottom: 5 },
  filterCopy: { flexDirection: "row", alignItems: "center", gap: 7 },
  filterLabel: { color: "#758179", fontSize: 11, fontWeight: "500" },
  peopleList: { gap: 13 },
  personCard: { overflow: "hidden", borderRadius: 20 },
  personPhotoWrap: { height: 191, position: "relative", overflow: "hidden" },
  personPhoto: { width: "100%", height: "100%" },
  photoVignette: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(19,31,23,0.04)" },
  nearbyPill: { position: "absolute", top: 11, left: 11, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.89)" },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#7DA384" },
  nearbyText: { color: "#4B6655", fontSize: 9, fontWeight: "600" },
  saveButton: { position: "absolute", top: 10, right: 10, height: 33, width: 33, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.88)", alignItems: "center", justifyContent: "center" },
  nameOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingTop: 25, paddingBottom: 11, backgroundColor: "rgba(26,35,28,0.39)" },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  personName: { color: "#FFFFFF", fontSize: 21, fontWeight: "600", letterSpacing: -0.3 },
  verifiedBadge: { height: 18, width: 18, borderRadius: 9, backgroundColor: "#72907A", alignItems: "center", justifyContent: "center" },
  distanceLight: { color: "#F4F4EF", fontSize: 10, marginTop: 3 },
  personBody: { paddingHorizontal: 13, paddingTop: 10, paddingBottom: 11 },
  personNote: { color: "#536158", fontSize: 11, lineHeight: 16, marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  interestChip: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "rgba(230,237,229,0.82)" },
  interestText: { color: "#587161", fontSize: 9, fontWeight: "600" },
  personActions: { borderTopWidth: 1, borderTopColor: "rgba(118,141,123,0.11)", paddingTop: 9, marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  genuineHint: { flexDirection: "row", alignItems: "center", gap: 4 },
  genuineText: { color: "#7B897F", fontSize: 9 },
  sayHelloButton: { borderRadius: 12, backgroundColor: "#E9F0E8", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  sayHelloText: { color: "#456356", fontSize: 10, fontWeight: "600" },
  meetupBanner: { marginTop: 20, borderRadius: 22, overflow: "hidden", backgroundColor: "#314B3D", padding: 17, minHeight: 166, flexDirection: "row", alignItems: "center" },
  bannerEyebrow: { color: "#B4C6B5", letterSpacing: 1.15, fontSize: 8, fontWeight: "700" },
  bannerTitle: { color: "#FAF8F2", fontSize: 19, lineHeight: 23, fontWeight: "600", letterSpacing: -0.4, marginTop: 8 },
  primaryButton: { minHeight: 47, borderRadius: 15, backgroundColor: "#557960", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, shadowColor: "#46644F", shadowOpacity: 0.17, shadowRadius: 11, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  darkButton: { backgroundColor: "#365342" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  bannerButton: { alignSelf: "flex-start", minHeight: 34, marginTop: 11, borderRadius: 11, paddingHorizontal: 11, backgroundColor: "#668770", shadowOpacity: 0 },
  bannerButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "600" },
  bannerImage: { width: 105, height: 134, borderRadius: 15, marginLeft: 8, opacity: 0.88 },
  disclaimer: { textAlign: "center", color: "#939B92", fontSize: 9, lineHeight: 14, marginTop: 14, marginHorizontal: 9 },
  emptyCard: { padding: 22, alignItems: "center", gap: 8 },
  emptyText: { color: "#77827A", fontSize: 12, textAlign: "center" },
  pageHeader: { marginTop: 27, marginBottom: 21 },
  eyebrow: { color: "#7D8D81", fontSize: 9, fontWeight: "700", letterSpacing: 1.3, marginBottom: 9 },
  pageTitle: { color: "#263E31", fontSize: 31, lineHeight: 36, fontWeight: "600", letterSpacing: -1.15 },
  pageSub: { color: "#77837B", fontSize: 13, lineHeight: 20, marginTop: 6 },
  planFeature: { height: 204, overflow: "hidden", borderRadius: 22, marginBottom: 23, backgroundColor: "#364C3E" },
  planFeatureImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%", opacity: 0.62 },
  planFeatureShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,46,34,0.38)" },
  planFeatureText: { position: "absolute", top: 18, left: 16, right: 14, bottom: 15, justifyContent: "flex-end" },
  featurePill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "rgba(250,251,246,0.23)", marginBottom: 10 },
  featurePillText: { color: "#F7F7F0", fontSize: 8, letterSpacing: 0.8, fontWeight: "700" },
  planFeatureTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "600", letterSpacing: -0.6, lineHeight: 28 },
  planFeatureSub: { color: "#E7ECE5", fontSize: 10, marginTop: 7 },
  planList: { gap: 10 },
  planCard: { padding: 12, borderRadius: 18, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planIcon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  planContent: { flex: 1 },
  planDay: { color: "#829184", fontSize: 8, letterSpacing: 1, fontWeight: "700", marginTop: 1 },
  planTitle: { color: "#35493C", fontSize: 13, fontWeight: "600", lineHeight: 17, marginTop: 4 },
  planPlace: { color: "#7D877E", fontSize: 9, marginTop: 4 },
  planMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7 },
  planHost: { color: "#77867A", fontSize: 8 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#A6B0A4" },
  planCount: { color: "#698273", fontSize: 8, fontWeight: "600" },
  planJoin: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#E8F0E7", alignItems: "center", marginTop: 18 },
  planJoinText: { color: "#456356", fontSize: 10, fontWeight: "700" },
  planJoined: { backgroundColor: "#456356" },
  planJoinedText: { color: "#FFFFFF" },
  hostCard: { marginTop: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 17 },
  hostIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: "#E8EFE6", alignItems: "center", justifyContent: "center" },
  hostTitle: { color: "#425A49", fontSize: 11, fontWeight: "600" },
  hostCopy: { color: "#859087", fontSize: 9, marginTop: 3 },
  inboxEmpty: { alignItems: "center", paddingHorizontal: 15, paddingTop: 22 },
  inboxIllustration: { height: 112, width: 144, borderRadius: 36, backgroundColor: "rgba(224,235,222,0.65)", alignItems: "center", justifyContent: "center" },
  bubbleOne: { height: 59, width: 59, borderRadius: 25, backgroundColor: "#F8F7F1", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }], shadowColor: "#54735D", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  bubbleTwo: { position: "absolute", right: 24, top: 20, width: 33, height: 33, borderRadius: 14, backgroundColor: "#F1EAE1", alignItems: "center", justifyContent: "center" },
  inboxEmptyTitle: { color: "#304639", fontSize: 21, fontWeight: "600", letterSpacing: -0.5, textAlign: "center", lineHeight: 27, marginTop: 20 },
  inboxEmptyCopy: { color: "#79847B", fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 9, maxWidth: 270 },
  inboxCta: { alignSelf: "stretch", marginTop: 22 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  inboxList: { gap: 9 },
  inboxCard: { borderRadius: 19, padding: 12, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.94)", flexDirection: "row", alignItems: "center", gap: 10 },
  inboxPhoto: { height: 48, width: 48, borderRadius: 17 },
  inboxNameLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inboxName: { color: "#34483A", fontSize: 13, fontWeight: "600" },
  inboxTime: { color: "#98A098", fontSize: 7, letterSpacing: 0.6 },
  inboxPreview: { color: "#7B867E", fontSize: 9, marginTop: 5 },
  inboxVerified: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  inboxVerifiedText: { color: "#7A8B7F", fontSize: 8 },
  profileCard: { alignItems: "center", padding: 18, borderRadius: 22 },
  profileAvatar: { height: 65, width: 65, borderRadius: 24, backgroundColor: "#DDE8DC", alignItems: "center", justifyContent: "center", marginBottom: 9 },
  profileInitial: { fontSize: 27, color: "#54715D", fontWeight: "600" },
  profileVerified: { position: "absolute", right: -2, bottom: -2, height: 21, width: 21, borderRadius: 11, backgroundColor: "#75947B", borderWidth: 2, borderColor: "#F8F8F3", alignItems: "center", justifyContent: "center" },
  profileName: { color: "#354A3B", fontWeight: "600", fontSize: 18 },
  profileLocation: { color: "#7D8B80", fontSize: 10, marginTop: 5, marginBottom: 12 },
  profilePrivacy: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 14 },
  profilePrivacyText: { color: "#76877A", fontSize: 9 },
  profileEdit: { marginTop: 15, borderTopWidth: 1, borderColor: "rgba(110,132,116,0.13)", width: "100%", paddingTop: 13, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  profileEditText: { color: "#52705F", fontSize: 11, fontWeight: "600" },
  joinCard: { alignItems: "center", padding: 21, borderRadius: 22 },
  joinIcon: { height: 48, width: 48, borderRadius: 18, backgroundColor: "#E8EFE6", alignItems: "center", justifyContent: "center" },
  joinTitle: { color: "#354B3C", fontSize: 18, fontWeight: "600", marginTop: 12 },
  joinCopy: { color: "#7A867C", textAlign: "center", fontSize: 11, lineHeight: 17, marginTop: 7 },
  joinCta: { alignSelf: "stretch", marginTop: 16 },
  independentAuth: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 13 },
  independentText: { fontSize: 9, color: "#75877B" },
  settingsHeading: { fontSize: 9, color: "#87938A", letterSpacing: 1.15, fontWeight: "700", marginTop: 22, marginBottom: 9 },
  settingsCard: { paddingHorizontal: 12, borderRadius: 18 },
  settingRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 9 },
  settingIcon: { width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#E9F0E7" },
  settingTitle: { color: "#4B5D50", fontSize: 10, fontWeight: "600" },
  settingSub: { color: "#8B958C", fontSize: 8, marginTop: 3 },
  settingDivider: { height: 1, backgroundColor: "rgba(123,142,125,0.12)" },
  bottomBar: { minHeight: 67, paddingBottom: Platform.OS === "web" ? 3 : 2, backgroundColor: "rgba(251,250,246,0.95)", borderTopWidth: 1, borderTopColor: "rgba(110,129,114,0.12)", flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  tabButton: { width: "25%", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 3 },
  tabIconWrap: { height: 28, minWidth: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  tabIconActive: { backgroundColor: "#E5EEE4" },
  tabLabel: { color: "#89938B", fontSize: 8, fontWeight: "500" },
  tabLabelActive: { color: "#46624F", fontWeight: "700" },
  toast: { position: "absolute", bottom: 78, left: 24, right: 24, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: "#385342", flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#233B2B", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  toastText: { color: "#FFFFFF", fontSize: 10, fontWeight: "500", flex: 1 },
  modalSafe: { flex: 1, backgroundColor: "#F5F4EE" },
  modalKeyboard: { flex: 1 },
  modalHeader: { height: 54, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalBrand: { flexDirection: "row", alignItems: "center", gap: 7 },
  closeButton: { height: 34, width: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.75)", alignItems: "center", justifyContent: "center" },
  modalBody: { paddingHorizontal: 24, paddingTop: 25, paddingBottom: 26 },
  modalStep: { color: "#819086", fontWeight: "700", fontSize: 9, letterSpacing: 1.25, marginBottom: 11 },
  modalTitle: { color: "#293F32", fontSize: 31, lineHeight: 36, letterSpacing: -1, fontWeight: "600" },
  modalSubtitle: { color: "#758179", fontSize: 12, lineHeight: 19, marginTop: 10, marginBottom: 18, maxWidth: 330 },
  authChoiceRow: { flexDirection: "row", gap: 9, marginBottom: 14 },
  authChoice: { flex: 1, height: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, borderColor: "rgba(255,255,255,0.95)", borderWidth: 1, backgroundColor: "rgba(255,255,255,0.55)" },
  authChoiceActive: { borderColor: "#8DA890", backgroundColor: "#E9F0E7" },
  authChoiceText: { color: "#849087", fontSize: 11, fontWeight: "600" },
  authChoiceTextActive: { color: "#456356" },
  authPromise: { padding: 12, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 9 },
  authPromiseTitle: { color: "#516756", fontSize: 10, fontWeight: "600" },
  authPromiseCopy: { color: "#829086", fontSize: 9, marginTop: 3 },
  authMiniPoints: { flexDirection: "row", justifyContent: "space-around", marginTop: 23, marginBottom: 24 },
  authMiniText: { fontSize: 9, lineHeight: 13, color: "#78887D", textAlign: "center", marginTop: 6 },
  formField: { marginBottom: 16 },
  fieldLabel: { fontSize: 8, color: "#7D8B81", letterSpacing: 1, fontWeight: "700", marginBottom: 7 },
  fieldInput: { height: 49, borderRadius: 14, paddingHorizontal: 13, borderWidth: 1, borderColor: "rgba(125,149,129,0.18)", backgroundColor: "rgba(255,255,255,0.72)", color: "#34483A", fontSize: 13 },
  codeInput: { letterSpacing: 10, fontSize: 20, fontWeight: "600", textAlign: "center" },
  interestOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  interestOption: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: "rgba(255,255,255,0.63)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
  interestOptionActive: { backgroundColor: "#E5EEE4", borderColor: "#9BAF9D" },
  interestOptionText: { fontSize: 10, color: "#78857B" },
  interestOptionTextActive: { color: "#46614F", fontWeight: "600" },
  authContinue: { marginTop: 5 },
  backLink: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 5, padding: 12 },
  backLinkText: { color: "#62766A", fontSize: 10, fontWeight: "600" },
  modalPrivacy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 13 },
  modalPrivacyText: { color: "#829086", fontSize: 8, textAlign: "center", flexShrink: 1 },
  prototypeNote: { textAlign: "center", color: "#A0A59D", fontSize: 8, lineHeight: 12, marginTop: 9, paddingHorizontal: 7 },
});
