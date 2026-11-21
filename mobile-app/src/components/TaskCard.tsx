import { memo, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { Task, TaskStatus } from '../types/task';
import { formatRelativeTime } from '../utils/time';

interface TaskCardProps {
  task: Task;
  onAdvanceStatus: (id: string, next: TaskStatus) => void;
  onDelete: (task: Task) => void;
  onTagPress?: (tag: string) => void;
  activeTag?: string | null;
}

function PulsingAIPlaceholder() {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={[styles.aiBox, styles.aiBoxPending]}>
      <View style={styles.aiHeaderRow}>
        <ActivityIndicator size="small" color={colors.indigoAccent} style={styles.spinner} />
        <Text style={styles.aiPendingLabel}>Generating AI summary…</Text>
      </View>
      <Animated.View style={[styles.shimmerBar, { opacity }]} />
      <Animated.View style={[styles.shimmerBar, styles.shimmerBarShort, { opacity }]} />
    </View>
  );
}

function TaskCardComponent({ task, onAdvanceStatus, onDelete, onTagPress, activeTag }: TaskCardProps) {
  return (
    <View style={styles.card}>
      {/* Header: short id + delete */}
      <View style={styles.headerRow}>
        <Text style={styles.idText} numberOfLines={1}>
          {task.id.slice(0, 12)}
        </Text>
        <Pressable
          onPress={() => onDelete(task)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${task.title}`}
          style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
        >
          <Text style={styles.deleteIcon}>✕</Text>
        </Pressable>
      </View>

      {/* Title + description */}
      <Text style={styles.title}>{task.title}</Text>
      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {task.description}
        </Text>
      ) : null}

      {/* AI Summary */}
      {task.ai_summary ? (
        <View style={styles.aiBox}>
          <View style={styles.aiHeaderRow}>
            <Text style={styles.aiSparkle}>✨</Text>
            <Text style={styles.aiLabel}>AI SUMMARY</Text>
          </View>
          <Text style={styles.aiText}>{task.ai_summary}</Text>
        </View>
      ) : (
        <PulsingAIPlaceholder />
      )}

      {/* Tags */}
      {task.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {task.tags.map((tag) => {
            const isActive = activeTag === tag;
            return (
              <Pressable
                key={tag}
                onPress={() => onTagPress?.(tag)}
                hitSlop={4}
                style={[styles.tagPill, isActive && styles.tagPillActive]}
              >
                <Text style={[styles.tagText, isActive && styles.tagTextActive]}>#{tag}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Footer: timestamp + status progression */}
      <View style={styles.footer}>
        <Text style={styles.timestamp}>🕒 {formatRelativeTime(task.updated_at || task.created_at)}</Text>

        {task.status === 'todo' ? (
          <Pressable
            onPress={() => onAdvanceStatus(task.id, 'in_progress')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          >
            <Text style={styles.actionText}>Start →</Text>
          </Pressable>
        ) : task.status === 'in_progress' ? (
          <Pressable
            onPress={() => onAdvanceStatus(task.id, 'done')}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.actionBtn,
              styles.completeBtn,
              pressed && styles.completeBtnPressed,
            ]}
          >
            <Text style={[styles.actionText, styles.completeText]}>Complete ✓</Text>
          </Pressable>
        ) : (
          <Text style={styles.doneLabel}>✓ Completed</Text>
        )}
      </View>
    </View>
  );
}

export const TaskCard = memo(TaskCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  idText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: -0.2,
  },
  deleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnPressed: {
    backgroundColor: colors.redBg,
  },
  deleteIcon: {
    color: colors.textFaint,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -4,
  },
  aiBox: {
    backgroundColor: colors.indigoBg,
    borderColor: colors.indigoBorder + '66', // ~40% alpha hairline
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 5,
    // Indigo glow (iOS shadow / Android 28+ colored elevation)
    shadowColor: colors.indigoBorder,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  aiBoxPending: {
    backgroundColor: colors.indigoBg + 'AA',
    borderColor: colors.indigoBorder + '40',
    shadowOpacity: 0,
    elevation: 0,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiSparkle: {
    fontSize: 11,
  },
  aiLabel: {
    color: colors.indigoAccent,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  aiText: {
    color: colors.indigoText,
    fontSize: 12.5,
    lineHeight: 18,
  },
  spinner: {
    transform: [{ scale: 0.7 }],
    marginLeft: -4,
    marginRight: -4,
  },
  aiPendingLabel: {
    color: colors.indigoAccent,
    fontSize: 11,
    fontWeight: '500',
  },
  shimmerBar: {
    height: 7,
    borderRadius: 3,
    backgroundColor: colors.indigoBorder + '55',
  },
  shimmerBarShort: {
    width: '70%',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.canvas,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tagPillActive: {
    borderColor: colors.indigoBorder + '80',
    backgroundColor: colors.indigoBg,
  },
  tagText: {
    color: colors.textSecondary,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  tagTextActive: {
    color: colors.indigoText,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11.5,
  },
  actionBtn: {
    borderColor: colors.borderStrong,
    borderWidth: 1,
    backgroundColor: colors.cardPressed,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnPressed: {
    backgroundColor: colors.border,
  },
  actionText: {
    color: colors.textPrimary,
    fontSize: 12.5,
    fontWeight: '600',
  },
  completeBtn: {
    borderColor: colors.emeraldBorder,
    backgroundColor: colors.emeraldBg,
  },
  completeBtnPressed: {
    backgroundColor: '#064E3B',
  },
  completeText: {
    color: colors.emerald,
  },
  doneLabel: {
    color: colors.emerald,
    fontFamily: fonts.mono,
    fontSize: 11,
    opacity: 0.85,
  },
});
