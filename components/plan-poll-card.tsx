import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { glassSurfaceColor,
  glassNestedFill,
} from "@/lib/appearance-preferences";
import { useAppAppearance } from "@/lib/appearance-context";
import { canVote, pollResults, winningProposal, type PlanPoll } from "@/lib/plan-cards";

type Props = {
  poll: PlanPoll;
  viewerId: string;
  onVote: (optionId: string) => void;
  onUseWinning: () => void;
};

/** A group poll for deciding hangout plans together, shown as a card in chat. */
export function PlanPollCard({ poll, viewerId, onVote, onUseWinning }: Props) {
  const { glassOpacity } = useAppAppearance();
  const results = pollResults(poll);
  const totalVotes = results.reduce((sum, item) => sum + item.count, 0);
  const votable = canVote(poll, viewerId);
  const winner = winningProposal(poll);

  return (
    <View accessibilityLabel={`Poll: ${poll.question}, ${totalVotes} votes`} style={[styles.card, { backgroundColor: glassSurfaceColor(glassNestedFill("rgba(255, 255, 255, 0.9)"), glassOpacity) }]}>
      <View style={styles.headerRow}>
        <View style={styles.pill}>
          <MaterialIcons name="how-to-vote" size={13} color="#83721f" />
          <Text style={styles.pillText}>Group poll</Text>
        </View>
        <Text style={styles.voteCount}>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</Text>
      </View>

      <Text style={styles.question}>{poll.question}</Text>

      {results.map((result) => {
        const option = poll.options.find((item) => item.id === result.optionId);
        const mine = option?.votes.includes(viewerId) ?? false;
        const share = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
        return (
          <Pressable
            key={result.optionId}
            accessibilityRole="radio"
            accessibilityState={{ selected: mine, disabled: !votable }}
            accessibilityLabel={`Vote for ${result.label}, ${result.count} votes${result.tied ? ", tied" : result.leading ? ", leading" : ""}`}
            onPress={() => votable && onVote(result.optionId)}
            style={({ pressed }) => [styles.option, mine && styles.optionMine, result.leading && !result.tied && styles.optionLeading, pressed && votable && styles.pressed]}
          >
            <View style={styles.optionTop}>
              <Text style={[styles.optionLabel, mine && styles.optionLabelMine]} numberOfLines={1}>{result.label}</Text>
              <Text style={styles.optionCount}>{result.count}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${share}%` }, result.leading && !result.tied && styles.barFillLeading]} />
            </View>
            {result.leading && result.tied ? <Text style={styles.tieNote}>Tied — pick one to break the tie</Text> : null}
            {result.leading && !result.tied ? <Text style={styles.leadNote}>Leading</Text> : null}
          </Pressable>
        );
      })}

      {votable ? <Text style={styles.hint}>One vote each — tap another option to change your mind.</Text> : <Text style={styles.hint}>{poll.closed ? "This poll is closed." : "Only group members can vote."}</Text>}

      {winner ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Turn the leading option into a plan" onPress={onUseWinning} style={({ pressed }) => [styles.convert, pressed && styles.pressed]}>
          <MaterialIcons name="event-available" size={15} color="#4A4210" />
          <Text style={styles.convertText}>Turn this into a plan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.96)"), paddingHorizontal: 12, paddingVertical: 11, gap: 7, shadowColor: "#75726a", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "rgba(246, 240, 209, 0.9)" },
  pillText: { color: "#83721f", fontSize: 9, fontWeight: "700", letterSpacing: 0.4 },
  voteCount: { color: "#97948e", fontSize: 9, fontWeight: "650" as any },
  question: { color: "#4e4a3b", fontSize: 12, fontWeight: "700" },
  option: { borderRadius: 13, borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.94)"), backgroundColor: glassNestedFill("rgba(252, 251, 244, 0.78)"), paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  optionMine: { borderColor: "rgba(233, 209, 119, 0.6)", backgroundColor: "rgba(247, 241, 214, 0.9)" },
  optionLeading: { borderColor: "rgba(140, 190, 168, 0.55)" },
  optionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  optionLabel: { flex: 1, color: "#6b6962", fontSize: 10.5, fontWeight: "650" as any },
  optionLabelMine: { color: "#6f673a" },
  optionCount: { color: "#8c887f", fontSize: 10, fontWeight: "700" },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: "rgba(232, 229, 209, 0.9)", overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2, backgroundColor: "#c0b061" },
  barFillLeading: { backgroundColor: "#7FAE96" },
  leadNote: { color: "#5E947B", fontSize: 8.5, fontWeight: "700" },
  tieNote: { color: "#95938a", fontSize: 8.5, fontWeight: "600" },
  hint: { color: "#97948e", fontSize: 8.5 },
  convert: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2, borderRadius: 12, paddingVertical: 9, backgroundColor: "#F1DE55", borderWidth: 1, borderColor: glassNestedFill("rgba(255, 255, 255, 0.6)") },
  convertText: { color: "#4A4210", fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
});
