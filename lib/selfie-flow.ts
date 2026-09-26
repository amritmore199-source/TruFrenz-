export type SelfieStage = "intro" | "permission" | "capture" | "denied" | "scanning" | "success";

export function stageAfterCameraPermission(granted: boolean, canAskAgain: boolean): SelfieStage {
  if (granted) return "capture";
  return canAskAgain ? "permission" : "denied";
}

export function stageAfterSelfieCapture(photoUri: string | null | undefined): SelfieStage {
  return photoUri ? "scanning" : "capture";
}

/** A local capture is not identity verification; only a provider response can grant the badge. */
export function isIdentityVerified(providerValidated: boolean): boolean {
  return providerValidated;
}
