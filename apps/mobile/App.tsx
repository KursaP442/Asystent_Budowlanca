import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { UI_TOKENS } from '@asystent/ui-tokens';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Asystent Budowlańca</Text>
        <Text style={styles.mode}>Wersja lokalna</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>MIEJSCE PRACY</Text>
        <Text style={styles.title}>Twoja budowa, w jednym miejscu</Text>
        <Text style={styles.description}>
          Projekty, dokumentacja i współpraca z wykonawcami — w przygotowaniu.
        </Text>
        <View style={styles.notice}>
          <View style={styles.noticeDot} />
          <View style={styles.noticeText}>
            <Text style={styles.noticeTitle}>Aplikacja jest uruchomiona lokalnie</Text>
            <Text style={styles.description}>
              Zapisywanie projektów będzie dostępne po uruchomieniu lokalnego backendu.
            </Text>
          </View>
        </View>
      </View>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: UI_TOKENS.color.background,
  },
  header: {
    minHeight: 64,
    paddingHorizontal: UI_TOKENS.spacing.lg,
    backgroundColor: UI_TOKENS.color.navigation,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: UI_TOKENS.color.surface,
    fontSize: 17,
    fontWeight: '600',
  },
  mode: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  content: {
    padding: UI_TOKENS.spacing.lg,
    gap: UI_TOKENS.spacing.sm,
  },
  eyebrow: {
    color: UI_TOKENS.color.mutedText,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  title: {
    color: UI_TOKENS.color.text,
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  description: {
    color: UI_TOKENS.color.mutedText,
    fontSize: 15,
    lineHeight: 23,
  },
  notice: {
    marginTop: UI_TOKENS.spacing.md,
    padding: UI_TOKENS.spacing.md,
    borderWidth: 1,
    borderColor: UI_TOKENS.color.border,
    borderRadius: 16,
    backgroundColor: UI_TOKENS.color.surface,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: UI_TOKENS.spacing.sm,
  },
  noticeDot: {
    width: 10,
    height: 10,
    marginTop: 5,
    borderRadius: 5,
    backgroundColor: UI_TOKENS.color.warning,
  },
  noticeText: {
    flex: 1,
    gap: UI_TOKENS.spacing.xs,
  },
  noticeTitle: {
    color: UI_TOKENS.color.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
