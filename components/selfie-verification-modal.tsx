import { glassNestedFill } from "@/lib/appearance-preferences";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { MaterialIcons } from "@expo/vector-icons";
import { stageAfterCameraPermission, stageAfterSelfieCapture, type SelfieStage } from "@/lib/selfie-flow";

const colors = {
  ink: "#43423d",
  muted: "#F5F5F7",
  purple: "#A78FA9",
  glass: glassNestedFill("rgba(0, 0, 0, 0.10)"),
  stroke: glassNestedFill("rgba(0, 0, 0, 0.10)"),
  green: "#6AA082",
};

export function SelfieVerificationModal({
  visible,
  onClose,
  onCaptured,
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<SelfieStage>("intro");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cameraRef = useRef<CameraView>(null);
  const scanProgress = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setStage("intro");
      setPhotoUri(null);
      setError("");
      return;
    }
    if (permission?.granted) setStage("capture");
  }, [visible, permission?.granted]);

  useEffect(() => {
    if (stage !== "scanning") return;
    scanProgress.setValue(0);
    successOpacity.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanProgress, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scanProgress, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    const scanTimer = setTimeout(() => {
      loop.stop();
      setStage("success");
      Animated.timing(successOpacity, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    }, 2400);
    return () => {
      clearTimeout(scanTimer);
      loop.stop();
    };
  }, [stage, scanProgress, successOpacity]);

  const askForCamera = async () => {
    setError("");
    if (permission?.granted) {
      setStage("capture");
      return;
    }
    setStage("permission");
    try {
      const nextPermission = await requestPermission();
      setStage(stageAfterCameraPermission(nextPermission.granted, nextPermission.canAskAgain));
    } catch {
      setError("Camera access could not be checked. You can still leave this step for later.");
    }
  };

  const captureSelfie = async () => {
    setError("");
    try {
      const image = await cameraRef.current?.takePictureAsync({ quality: 0.68, base64: false, exif: false, skipProcessing: true });
      setPhotoUri(image?.uri ?? null);
      setStage(stageAfterSelfieCapture(image?.uri));
    } catch {
      setError("The selfie could not be captured. Please try again in steady light.");
    }
  };

  const finish = () => {
    onCaptured();
    onClose();
  };

  const renderIntro = () => (
    <View style={styles.centeredContent}>
      <View style={styles.heroIcon}><MaterialIcons name="face-retouching-natural" size={29} color={colors.purple} /></View>
      <Text style={styles.kicker}>OPTIONAL IDENTITY CHECK</Text>
      <Text style={styles.title}>A small step for a little more trust.</Text>
      <Text style={styles.description}>Take a fresh front-camera selfie. A real identity provider would check it against your profile before Trufrenz grants the stronger badge.</Text>
      <View style={styles.promiseCard}>
        <MaterialIcons name="lock-outline" size={18} color="#F5F5F7" />
        <View style={styles.promiseCopy}>
          <Text style={styles.promiseTitle}>Your photo stays on this device in this prototype.</Text>
          <Text style={styles.promiseText}>It is not uploaded, stored in your profile, or treated as a completed identity check.</Text>
        </View>
      </View>
      <ActionButton onPress={() => { setError(""); setStage("permission"); }} icon="camera-alt" title={permission?.granted ? "Open selfie camera" : "Continue to camera permission"} />
      <Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Maybe later</Text></Pressable>
    </View>
  );

  const renderCapture = () => {
    if (!permission?.granted) return renderIntro();
    return (
      <View style={styles.captureContent}>
        <View style={styles.cameraFrame}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing="front" mode="picture" mirror onMountError={(event) => { setError(event.message || "The camera preview is unavailable on this device."); setStage("denied"); }} />
          <View style={styles.cameraShade} />
          <View style={styles.faceGuide} />
          <View style={styles.cameraHint}><MaterialIcons name="wb-sunny" size={14} color="#FFFFFF" /><Text style={styles.cameraHintText}>Face the light and look at the camera</Text></View>
        </View>
        <View style={styles.captureCopy}>
          <Text style={styles.kicker}>SELFIE MATCH · STEP 1 OF 2</Text>
          <Text style={styles.title}>Center your face.</Text>
          <Text style={styles.description}>Remove sunglasses; make sure your full face is visible. No audio is recorded.</Text>
          <View style={styles.captureControls}>
            <Pressable onPress={onClose} style={styles.cameraClose}><MaterialIcons name="close" size={19} color="#F5F5F7" /></Pressable>
            <Pressable onPress={captureSelfie} accessibilityLabel="Take selfie" style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}><View style={styles.shutterInner}><MaterialIcons name="camera-alt" size={21} color={colors.purple} /></View></Pressable>
            <View style={styles.cameraCloseSpacer} />
          </View>
        </View>
      </View>
    );
  };

  const renderPermissionRequest = () => (
    <View style={styles.centeredContent}>
      <View style={styles.permissionIcon}><MaterialIcons name="videocam" size={26} color="#F5F5F7" /></View>
      <Text style={styles.kicker}>CAMERA ACCESS</Text>
      <Text style={styles.title}>Your camera stays off until you say yes.</Text>
      <Text style={styles.description}>Trufrenz needs the front camera for one fresh selfie. We never turn it on in the background, and you can leave this step any time.</Text>
      <View style={styles.promiseCard}>
        <MaterialIcons name="lock-outline" size={18} color="#F5F5F7" />
        <View style={styles.promiseCopy}>
          <Text style={styles.promiseTitle}>Camera access is optional.</Text>
          <Text style={styles.promiseText}>If you choose Allow, a camera preview opens. If you choose Don’t Allow, you can still use Trufrenz without a selfie badge.</Text>
        </View>
      </View>
      <ActionButton onPress={askForCamera} icon="camera-alt" title="Request camera access" />
      <Pressable onPress={() => { setError(""); setStage("intro"); }} style={styles.secondaryButton}><Text style={styles.secondaryText}>Go back</Text></Pressable>
    </View>
  );

  const renderDenied = () => (
    <View style={styles.centeredContent}>
      <View style={styles.deniedIcon}><MaterialIcons name="no-photography" size={26} color="#F5F5F7" /></View>
      <Text style={styles.kicker}>CAMERA ACCESS PAUSED</Text>
      <Text style={styles.title}>No rush. You’re still welcome here.</Text>
      <Text style={styles.description}>To try the selfie check, enable camera access in device settings. You can keep using Trufrenz without it.</Text>
      <ActionButton onPress={() => { if (Platform.OS === "web") setError("Please allow camera access in your browser’s site settings, then try again."); else void Linking.openSettings(); }} icon="settings" title={Platform.OS === "web" ? "Camera settings help" : "Open device settings"} />
      <Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Not now</Text></Pressable>
    </View>
  );

  const renderScanning = () => {
    const scanTranslate = scanProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 192] });
    return (
      <View style={styles.centeredContent}>
        <View style={styles.scanFrame}>
          {photoUri ? <Image source={{ uri: photoUri }} style={styles.scanPhoto} /> : <View style={styles.scanPlaceholder}><MaterialIcons name="face" size={48} color="#F5F5F7" /></View>}
          <View style={styles.scanTint} />
          <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanTranslate }] }]} />
          <View style={styles.scanCornerTop} /><View style={styles.scanCornerBottom} />
        </View>
        <Text style={styles.kicker}>CHECKING THE SELFIE FRAME</Text>
        <Text style={styles.title}>Hold still for a moment.</Text>
        <Text style={styles.description}>We’re checking lighting and framing locally. This demo does not compare identities.</Text>
        <View style={styles.scanningStatus}><ActivityIndicator size="small" color={colors.purple} /><Text style={styles.scanningStatusText}>Soft scan in progress</Text></View>
      </View>
    );
  };

  const renderSuccess = () => (
    <Animated.View style={[styles.centeredContent, { opacity: successOpacity }]}>
      <View style={styles.successCheck}><MaterialIcons name="check" size={30} color="#FFFFFF" /></View>
      <Text style={styles.kicker}>SELFIE CAPTURED</Text>
      <Text style={styles.title}>That’s a good first step.</Text>
      <Text style={styles.description}>Your photo was captured locally. Identity review is not connected in this prototype, so your profile won’t receive a verified badge yet.</Text>
      <View style={styles.pendingPill}><MaterialIcons name="hourglass-top" size={14} color="#F5F5F7" /><Text style={styles.pendingText}>Captured · awaiting real provider review</Text></View>
      <View style={styles.successButtons}><ActionButton onPress={finish} icon="check" title="Done" /><Pressable onPress={() => { setPhotoUri(null); setStage("capture"); }} style={styles.retakeButton}><Text style={styles.retakeText}>Retake</Text></Pressable></View>
    </Animated.View>
  );

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.background}><View style={styles.ambientPink} /><View style={styles.ambientBlue} /></View>
        <View style={styles.header}>
          <View style={styles.headerBrand}><View style={styles.brandMark}><MaterialIcons name="spa" size={15} color="#FFFFFF" /></View><View><Text style={styles.brandText}>Trufrenz</Text><Text style={styles.headerSub}>Selfie identity check</Text></View></View>
          <Pressable onPress={onClose} accessibilityLabel="Close selfie check" style={styles.closeButton}><MaterialIcons name="close" size={20} color="#F5F5F7" /></Pressable>
        </View>
        <View style={styles.body}>
          {stage === "intro" ? renderIntro() : null}
          {stage === "permission" ? renderPermissionRequest() : null}
          {stage === "capture" ? renderCapture() : null}
          {stage === "denied" ? renderDenied() : null}
          {stage === "scanning" ? renderScanning() : null}
          {stage === "success" ? renderSuccess() : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ActionButton({ onPress, icon, title }: { onPress: () => void; icon: keyof typeof MaterialIcons.glyphMap; title: string }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}><MaterialIcons name={icon} size={17} color="#FFFFFF" /><Text style={styles.primaryButtonText}>{title}</Text><MaterialIcons name="arrow-forward" size={16} color="#FFFFFF" /></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#5D5C5B" },
  background: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  ambientPink: { position: "absolute", height: 300, width: 300, borderRadius: 150, top: 70, right: -180, backgroundColor: "rgba(255, 255, 255, 0.50)" },
  ambientBlue: { position: "absolute", height: 260, width: 260, borderRadius: 130, left: -170, bottom: 80, backgroundColor: "rgba(0, 0, 0, 0.10)" },
  header: { height: 56, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "rgba(255, 255, 255, 0.45)" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 11, backgroundColor: colors.purple, alignItems: "center", justifyContent: "center" },
  brandText: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  headerSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: colors.stroke, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, paddingHorizontal: 20, justifyContent: "center" },
  centeredContent: { width: "100%", alignItems: "center", paddingVertical: 15 },
  heroIcon: { width: 64, height: 64, borderRadius: 23, backgroundColor: "rgba(255, 255, 255, 0.93)", alignItems: "center", justifyContent: "center", marginBottom: 17 },
  kicker: { color: "#F5F5F7", fontSize: 12, fontWeight: "700", letterSpacing: 1.15, marginTop: 6, textAlign: "center" },
  title: { color: colors.ink, fontSize: 24, lineHeight: 30, letterSpacing: -0.65, fontWeight: "700", textAlign: "center", marginTop: 8, maxWidth: 330 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 8, maxWidth: 340 },
  promiseCard: { alignSelf: "stretch", minHeight: 65, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 9, marginTop: 17, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.stroke, overflow: "hidden" },
  promiseCopy: { flex: 1, gap: 3 },
  promiseTitle: { color: "#F5F5F7", fontSize: 12, fontWeight: "700" },
  promiseText: { color: "#F5F5F7", fontSize: 12, lineHeight: 17 },
  primaryButton: { width: "100%", minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, backgroundColor: colors.purple, paddingHorizontal: 13, marginTop: 15 },
  primaryButtonText: { flex: 1, textAlign: "center", color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  buttonPressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
  secondaryButton: { padding: 12, alignItems: "center" },
  secondaryText: { color: "#F5F5F7", fontSize: 12, fontWeight: "600" },
  captureContent: { flex: 1, justifyContent: "center", paddingVertical: 12 },
  cameraFrame: { width: "100%", height: 350, maxHeight: "52%", borderRadius: 24, overflow: "hidden", backgroundColor: "#CFCFCF", borderWidth: 2, borderColor: colors.stroke, alignSelf: "center" },
  cameraShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(38, 35, 16, 0.08)" },
  faceGuide: { width: 178, height: 234, alignSelf: "center", marginTop: 43, borderRadius: 90, borderWidth: 1.5, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderStyle: "dashed" },
  cameraHint: { position: "absolute", left: 10, right: 10, bottom: 10, minHeight: 31, borderRadius: 11, backgroundColor: "rgba(38, 35, 16, 0.45)", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  cameraHintText: { color: "#FFFFFF", fontSize: 12 },
  captureCopy: { alignItems: "center", paddingTop: 13 },
  captureControls: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 13 },
  // Resolved at render for the same reason as every other surface here: a
  // module-scope constant is fixed at import, so it could not follow the setting.
  cameraClose: { width: 38, height: 38, borderRadius: 14, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), borderWidth: 1, borderColor: colors.stroke, alignItems: "center", justifyContent: "center" },
  cameraCloseSpacer: { width: 38, height: 38 },
  shutter: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: "#93959C", backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#5D5D5D", alignItems: "center", justifyContent: "center" },
  shutterPressed: { transform: [{ scale: 0.95 }] },
  deniedIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#D0D0CF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  permissionIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#575B5D", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  scanFrame: { width: 205, height: 208, borderRadius: 25, overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: glassNestedFill("rgba(0, 0, 0, 0.10)"), marginBottom: 19, backgroundColor: "#5B5A54" },
  scanPhoto: { width: "100%", height: "100%", resizeMode: "cover" },
  scanPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  scanTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.10)" },
  scanLine: { position: "absolute", top: 0, left: 8, right: 8, height: 2, backgroundColor: "#CCD0CE", shadowColor: "#C8C8C8", shadowOpacity: 0.8, shadowRadius: 8, elevation: 5 },
  scanCornerTop: { position: "absolute", top: 12, left: 12, width: 26, height: 26, borderColor: "#93959C", borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 9 },
  scanCornerBottom: { position: "absolute", bottom: 12, right: 12, width: 26, height: 26, borderColor: "#858289", borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 9 },
  scanningStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 13, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: glassNestedFill("rgba(0, 0, 0, 0.10)") },
  scanningStatusText: { color: "#F5F5F7", fontSize: 12 },
  successCheck: { width: 60, height: 60, borderRadius: 22, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginBottom: 9 },
  pendingPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "#5C5A4F", marginTop: 14 },
  pendingText: { color: "#F5F5F7", fontSize: 12, fontWeight: "600" },
  successButtons: { width: "100%", alignItems: "center" },
  retakeButton: { padding: 11 },
  retakeText: { color: "#F5F5F7", fontSize: 12, fontWeight: "700" },
  errorText: { color: "#F5F5F7", textAlign: "center", fontSize: 12, marginHorizontal: 20, marginBottom: 9 },
});
