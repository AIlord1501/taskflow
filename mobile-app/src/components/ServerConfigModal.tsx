import { useEffect, useState } from 'react';
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
import { DEFAULT_BASE_URL, normalizeBaseUrl, testConnection } from '../api/taskClient';
import { colors, fonts } from '../theme';

interface ServerConfigModalProps {
  visible: boolean;
  currentUrl: string;
  onClose: () => void;
  onSave: (url: string) => Promise<void>;
}

type PresetId = 'emulator' | 'lan' | 'production';

interface Preset {
  id: PresetId;
  label: string;
  hint: string;
  template: string;
}

const PRESETS: Preset[] = [
  {
    id: 'emulator',
    label: 'Android Emulator',
    hint: '10.0.2.2 → your PC’s localhost',
    template: DEFAULT_BASE_URL,
  },
  {
    id: 'lan',
    label: 'Local Wi-Fi (Expo Go)',
    hint: 'Real phone on same network as your PC',
    template: 'http://192.168.1.10:8080/api/v1',
  },
  {
    id: 'production',
    label: 'Production HTTPS',
    hint: 'Deployed Go API',
    template: 'https://api.example.com/api/v1',
  },
];

function detectPreset(url: string): PresetId {
  if (url.includes('10.0.2.2')) return 'emulator';
  if (/^https:\/\//i.test(url)) return 'production';
  return 'lan';
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export function ServerConfigModal({ visible, currentUrl, onClose, onSave }: ServerConfigModalProps) {
  const [preset, setPreset] = useState<PresetId>(detectPreset(currentUrl));
  const [url, setUrl] = useState(currentUrl);
  const [testState, setTestState] = useState<TestState>('idle');
  const [saving, setSaving] = useState(false);

  // Re-sync the form each time the modal opens.
  useEffect(() => {
    if (!visible) return;
    setUrl(currentUrl);
    setPreset(detectPreset(currentUrl));
    setTestState('idle');
  }, [visible, currentUrl]);

  const selectPreset = (p: Preset) => {
    setPreset(p.id);
    setTestState('idle');
    // Keep the user's URL if it already matches this preset type.
    setUrl(detectPreset(url) === p.id ? url : p.template);
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestState((await testConnection(url)) ? 'ok' : 'fail');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(url);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const resolved = url.trim() ? normalizeBaseUrl(url) : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.dialog}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.heading}>Server Configuration</Text>
              <Text style={styles.subheading}>Point the app at your TaskFlow Go API</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {/* Presets */}
            <View style={styles.presetList}>
              {PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => selectPreset(p)}
                    style={[styles.presetRow, active && styles.presetRowActive]}
                  >
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.presetTextWrap}>
                      <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>
                        {p.label}
                      </Text>
                      <Text style={styles.presetHint}>{p.hint}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* URL input */}
            <View>
              <Text style={styles.label}>API Base URL</Text>
              <TextInput
                value={url}
                onChangeText={(v) => {
                  setUrl(v);
                  setTestState('idle');
                }}
                placeholder={DEFAULT_BASE_URL}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
                selectionColor={colors.indigoAccent}
              />
              {resolved && resolved !== url.trim() ? (
                <Text style={styles.resolved}>→ {resolved}</Text>
              ) : null}
            </View>

            {preset === 'lan' ? (
              <View style={styles.tipBox}>
                <Text style={styles.tipText}>
                  Find your PC’s IPv4 with <Text style={styles.code}>ipconfig</Text> (Windows) and make
                  sure port 8080 is allowed through the firewall.
                </Text>
              </View>
            ) : null}

            {/* Test result */}
            {testState !== 'idle' ? (
              <View
                style={[
                  styles.testResult,
                  testState === 'ok' && styles.testOk,
                  testState === 'fail' && styles.testFail,
                ]}
              >
                {testState === 'testing' ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : null}
                <Text
                  style={[
                    styles.testText,
                    testState === 'ok' && { color: colors.emerald },
                    testState === 'fail' && { color: colors.red },
                  ]}
                >
                  {testState === 'testing'
                    ? 'Pinging /health…'
                    : testState === 'ok'
                      ? 'Connected — Go API is healthy'
                      : 'Unreachable — app will fall back to preview data'}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={handleTest}
              disabled={testState === 'testing' || !url.trim()}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
            >
              <Text style={styles.secondaryText}>Test</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !url.trim()}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.primaryBtnPressed,
                (saving || !url.trim()) && styles.disabled,
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.ctaText} />
              ) : (
                <Text style={styles.primaryText}>Save & Reconnect</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  dialog: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  subheading: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeIcon: {
    color: colors.textMuted,
    fontSize: 15,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  presetList: {
    gap: 8,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.canvas,
  },
  presetRowActive: {
    borderColor: colors.indigoBorder + '80',
    backgroundColor: colors.indigoBg + '99',
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.indigoAccent,
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.indigoAccent,
  },
  presetTextWrap: {
    flex: 1,
  },
  presetLabel: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontWeight: '500',
  },
  presetLabelActive: {
    color: colors.indigoText,
  },
  presetHint: {
    color: colors.textMuted,
    fontSize: 11.5,
    marginTop: 1,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
  },
  resolved: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 6,
  },
  tipBox: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.canvas,
  },
  tipText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  code: {
    fontFamily: fonts.mono,
    color: colors.textPrimary,
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testOk: {
    borderColor: colors.emeraldBorder,
    backgroundColor: colors.emeraldBg,
  },
  testFail: {
    borderColor: '#7F1D1D',
    backgroundColor: colors.redBg,
  },
  testText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  secondaryBtn: {
    flex: 1,
    height: 42,
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
    height: 42,
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
    opacity: 0.5,
  },
});
