import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getResponsiveModalLayout } from "@/lib/responsive-modal-layout";

export function useResponsiveModalLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(
    () => getResponsiveModalLayout(width, height, { top: insets.top, bottom: insets.bottom }),
    [height, insets.bottom, insets.top, width],
  );
}
