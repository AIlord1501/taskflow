import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createTask,
  deleteTask,
  getBaseUrl,
  listTasks,
  loadBaseUrl,
  setBaseUrl,
  updateTaskStatus,
} from './src/api/taskClient';
import { CreateTaskSheet } from './src/components/CreateTaskSheet';
import { ServerConfigModal } from './src/components/ServerConfigModal';
import { TaskCard } from './src/components/TaskCard';
import { colors, fonts } from './src/theme';
import type {
  ApiConnectionMode,
  CreateTaskInput,
  StatusFilter,
  Task,
  TaskStatus,
} from './src/types/task';

const POLL_INTERVAL_MS = 3000;

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Android is edge-to-edge: the #09090B SafeAreaView paints behind the light status bar. */}
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TaskFlowScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TaskFlowScreen() {
  const insets = useSafeAreaInsets();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<ApiConnectionMode>('mock');
  const [apiUrl, setApiUrl] = useState(getBaseUrl());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const applyList = useCallback((result: { tasks: Task[]; mode: ApiConnectionMode }) => {
    setTasks(result.tasks);
    setMode(result.mode);
  }, []);

  const refresh = useCallback(async () => {
    applyList(await listTasks());
  }, [applyList]);

  // Initial load: restore saved server URL, then fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await loadBaseUrl();
      const result = await listTasks();
      if (cancelled) return;
      setApiUrl(url);
      applyList(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyList]);

  // Auto-poll every 3s while any task is awaiting its AI summary.
  const pendingAi = useMemo(() => tasks.filter((t) => t.ai_summary === null).length, [tasks]);

  useEffect(() => {
    if (pendingAi === 0) return;
    const id = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pendingAi, refresh]);

  const onPullToRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    }),
    [tasks],
  );

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (filter === 'all' || t.status === filter) && (!activeTag || t.tags.includes(activeTag)),
      ),
    [tasks, filter, activeTag],
  );

  const handleCreate = useCallback(async (input: CreateTaskInput) => {
    const result = await createTask(input);
    setMode(result.mode);
    setTasks((prev) => [result.task, ...prev]);
  }, []);

  const handleAdvance = useCallback(async (id: string, next: TaskStatus) => {
    const now = new Date().toISOString();
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: next, updated_at: now } : t)));
    const result = await updateTaskStatus(id, next);
    setMode(result.mode);
    if (result.task) {
      const updated = result.task;
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  }, []);

  const handleDelete = useCallback((task: Task) => {
    Alert.alert('Delete task?', `"${task.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setTasks((prev) => prev.filter((t) => t.id !== task.id));
          const result = await deleteTask(task.id);
          setMode(result.mode);
        },
      },
    ]);
  }, []);

  const handleTagPress = useCallback((tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
  }, []);

  const handleSaveServer = useCallback(
    async (url: string) => {
      const saved = await setBaseUrl(url);
      setApiUrl(saved);
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const isLive = mode === 'live';

  return (
    <View style={styles.screen}>
      {/* ---------- Header ---------- */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoGlyph}>{'>_'}</Text>
          </View>
          <Text style={styles.brandText}>TaskFlow</Text>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statusPill, isLive ? styles.statusPillLive : styles.statusPillMock]}>
            <View style={[styles.statusDot, { backgroundColor: isLive ? colors.emerald : colors.amber }]} />
            <Text
              style={[styles.statusText, { color: isLive ? '#6EE7B7' : colors.textSecondary }]}
              numberOfLines={1}
            >
              {isLive ? 'Go API' : 'Preview'}
            </Text>
          </View>

          <Pressable
            onPress={() => setConfigOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Server settings"
            style={({ pressed }) => [styles.gearBtn, pressed && styles.gearBtnPressed]}
          >
            <Text style={styles.gearIcon}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {/* ---------- Segmented filter tabs ---------- */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                style={[styles.tab, active && styles.tabActive]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{f.label}</Text>
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                    {counts[f.id]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ---------- Sub-bar: tag filter + AI polling indicator ---------- */}
      {activeTag || pendingAi > 0 ? (
        <View style={styles.subBar}>
          {activeTag ? (
            <Pressable onPress={() => setActiveTag(null)} style={styles.activeTagChip}>
              <Text style={styles.activeTagText}>#{activeTag}  ✕</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {pendingAi > 0 ? (
            <View style={styles.pollingChip}>
              <Text style={styles.pollingText}>✨ Polling AI · {pendingAi} pending</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ---------- Task list ---------- */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
          <Text style={styles.loadingText}>Connecting to {apiUrl}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleTasks}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              onAdvanceStatus={handleAdvance}
              onDelete={handleDelete}
              onTagPress={handleTagPress}
              activeTag={activeTag}
            />
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 96 }]}
          ItemSeparatorComponent={ItemSeparator}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullToRefresh}
              tintColor={colors.textSecondary}
              colors={[colors.indigoAccent]}
              progressBackgroundColor={colors.card}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No tasks here</Text>
              <Text style={styles.emptySub}>
                {activeTag ? `Nothing tagged #${activeTag} in this view.` : 'Tap + to capture your first task.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ---------- Floating action button ---------- */}
      <Pressable
        onPress={() => setCreateOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="New task"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 20 },
          pressed && styles.fabPressed,
        ]}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      <CreateTaskSheet visible={createOpen} onClose={() => setCreateOpen(false)} onSubmit={handleCreate} />

      <ServerConfigModal
        visible={configOpen}
        currentUrl={apiUrl}
        onClose={() => setConfigOpen(false)}
        onSave={handleSaveServer}
      />
    </View>
  );
}

function ItemSeparator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    color: colors.textPrimary,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  brandText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillLive: {
    borderColor: '#065F4680',
    backgroundColor: '#022C2280',
  },
  statusPillMock: {
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '500',
  },
  gearBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearBtnPressed: {
    backgroundColor: colors.border,
  },
  gearIcon: {
    color: colors.textSecondary,
    fontSize: 17,
    lineHeight: 20,
  },
  tabsWrap: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  tabs: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  tabActive: {
    backgroundColor: colors.ctaBg,
    borderColor: colors.ctaBg,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.ctaText,
    fontWeight: '600',
  },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: colors.canvas,
    alignItems: 'center',
  },
  tabCountActive: {
    backgroundColor: '#D4D4D8',
  },
  tabCountText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  tabCountTextActive: {
    color: colors.ctaText,
  },
  subBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  activeTagChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.indigoBorder + '80',
    backgroundColor: colors.indigoBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeTagText: {
    color: colors.indigoText,
    fontFamily: fonts.mono,
    fontSize: 11.5,
  },
  pollingChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.indigoBorder + '55',
    backgroundColor: colors.indigoBg + 'AA',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pollingText: {
    color: colors.indigoText,
    fontSize: 11.5,
  },
  listContent: {
    padding: 16,
  },
  separator: {
    height: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11.5,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    gap: 4,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  emptySub: {
    color: colors.textMuted,
    fontSize: 12.5,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.ctaBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: {
    backgroundColor: '#D4D4D8',
    transform: [{ scale: 0.96 }],
  },
  fabIcon: {
    color: colors.ctaText,
    fontSize: 30,
    fontWeight: '400',
    lineHeight: 32,
    marginTop: -2,
  },
});
