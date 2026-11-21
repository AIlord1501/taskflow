import { useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import type { CreateTaskInput } from '../types/task';

interface CreateTaskSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTaskInput) => Promise<void>;
}

function parseTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function CreateTaskSheet({ visible, onClose, onSubmit }: CreateTaskSheetProps) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const descriptionRef = useRef<ComponentRef<typeof TextInput>>(null);

  const tags = useMemo(() => parseTags(tagsRaw), [tagsRaw]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setTagsRaw('');
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Task title is required.');
      return;
    }
    if (trimmed.length > 255) {
      setError('Title must be 255 characters or fewer.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ title: trimmed, description: description.trim(), tags });
      reset();
      onClose();
    } catch {
      setError('Could not create task. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityLabel="Dismiss" />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text style={styles.heading}>New Task</Text>
              <View style={styles.statusChip}>
                <Text style={styles.statusChipText}>To Do</Text>
              </View>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.form}
            showsVerticalScrollIndicator={false}
          >
            <View>
              <Text style={styles.label}>
                Title <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  if (error) setError(null);
                }}
                placeholder="e.g. Add rate limiting to Go API"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                autoFocus
                maxLength={255}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => descriptionRef.current?.focus()}
                selectionColor={colors.indigoAccent}
              />
            </View>

            <View>
              <Text style={styles.label}>Description</Text>
              <TextInput
                ref={descriptionRef}
                value={description}
                onChangeText={setDescription}
                placeholder="Context, acceptance criteria, links… The AI worker will summarize it."
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.textArea]}
                multiline
                textAlignVertical="top"
                selectionColor={colors.indigoAccent}
              />
            </View>

            <View>
              <Text style={styles.label}>
                # Tags <Text style={styles.hint}>(comma-separated)</Text>
              </Text>
              <TextInput
                value={tagsRaw}
                onChangeText={setTagsRaw}
                placeholder="golang, backend, high-priority"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.monoInput]}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                selectionColor={colors.indigoAccent}
              />
              {tags.length > 0 ? (
                <View style={styles.tagPreview}>
                  {tags.map((tag) => (
                    <View key={tag} style={styles.tagPill}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
                submitting && styles.disabled,
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.ctaText} />
              ) : (
                <Text style={styles.primaryText}>Create Task</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderColor: colors.border,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  statusChip: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.canvas,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusChipText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
  },
  closeBtn: {
    padding: 4,
  },
  closeIcon: {
    color: colors.textMuted,
    fontSize: 15,
  },
  form: {
    paddingVertical: 16,
    gap: 16,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  required: {
    color: colors.textMuted,
  },
  hint: {
    color: colors.textMuted,
    fontWeight: '400',
  },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  textArea: {
    minHeight: 96,
    lineHeight: 20,
  },
  monoInput: {
    fontFamily: fonts.mono,
    fontSize: 13,
  },
  tagPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tagPill: {
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.canvas,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tagText: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  errorBox: {
    backgroundColor: colors.redBg,
    borderColor: '#7F1D1D',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: colors.red,
    fontSize: 12.5,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 9,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnPressed: {
    backgroundColor: colors.cardPressed,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  primaryBtn: {
    flex: 2,
    height: 44,
    borderRadius: 9,
    backgroundColor: colors.ctaBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: '#D4D4D8',
  },
  primaryText: {
    color: colors.ctaText,
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
});
