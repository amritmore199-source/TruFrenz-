export type ModalInsets = { top: number; bottom: number };

export type ResponsiveModalLayout = {
  compact: boolean;
  horizontalGutter: number;
  verticalGutter: number;
  topPadding: number;
  bottomPadding: number;
  maxWidth: number;
  maxHeight: number;
};

/** Computes a centered modal frame that respects device insets and short screens. */
export function getResponsiveModalLayout(
  width: number,
  height: number,
  insets: ModalInsets = { top: 0, bottom: 0 },
): ResponsiveModalLayout {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const horizontalGutter = safeWidth < 360 ? 12 : safeWidth < 430 ? 18 : 24;
  const verticalGutter = safeHeight < 620 ? 10 : safeHeight < 760 ? 18 : 24;
  const topInset = Math.max(0, insets.top);
  const bottomInset = Math.max(0, insets.bottom);
  const compact = safeWidth < 360 || safeHeight < 640;

  return {
    compact,
    horizontalGutter,
    verticalGutter,
    topPadding: topInset + verticalGutter,
    bottomPadding: bottomInset + verticalGutter,
    maxWidth: Math.max(0, Math.min(520, safeWidth - horizontalGutter * 2)),
    maxHeight: Math.max(0, Math.min(640, safeHeight - topInset - bottomInset - verticalGutter * 2)),
  };
}
