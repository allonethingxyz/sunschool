import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, SafeAreaView, ActivityIndicator, Switch,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';
import { useTheme } from '../styles/theme';
import { Plus, Edit2, Trash2, CheckCircle, XCircle, Gift, Target, Users, ChevronDown } from 'react-feather';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Reward {
  id: string; title: string; description: string | null;
  tokenCost: number; category: string; isActive: boolean;
  maxRedemptions: number | null; currentRedemptions: number;
  imageEmoji: string; color: string; savedPoints?: number;
}

interface Redemption {
  id: string; learnerId: number; rewardId: string; tokensSpent: number;
  status: string; timesRedeemed: number; requestedAt: string;
  learnerName: string; rewardTitle: string; rewardEmoji: string; rewardColor: string;
  parentNotes: string | null;
}

interface Learner {
  id: number; name: string; username: string;
}

// ─── Emoji picker options ────────────────────────────────────────────────────
const EMOJIS = ['🎁','⭐','🏆','🎮','🍦','🎬','🎨','📚','🚀','🦋','🌟','🎪','🎯','🛹','🎸','🎀'];
const COLORS = ['#4A90D9','#6BCB77','#FF8F00','#EF5350','#AB47BC','#00ACC1','#FF6B6B','#FFD93D'];
const CATEGORIES = ['GENERAL','SCREEN_TIME','FOOD_TREAT','OUTING','TOY_GAME','EXPERIENCE','OTHER'];

// ─── Reward Form ─────────────────────────────────────────────────────────────

interface RewardFormProps {
  initial?: Partial<Reward>;
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const RewardForm: React.FC<RewardFormProps> = ({ initial, onSave, onCancel, isSaving }) => {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tokenCost, setTokenCost] = useState(String(initial?.tokenCost ?? 10));
  const [category, setCategory] = useState(initial?.category ?? 'GENERAL');
  const [emoji, setEmoji] = useState(initial?.imageEmoji ?? '🎁');
  const [color, setColor] = useState(initial?.color ?? '#4A90D9');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const theme = useTheme();

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), description: description.trim() || null,
      tokenCost: Number(tokenCost) || 10, category, imageEmoji: emoji, color, isActive });
  };

  return (
    <View style={[styles.form, { backgroundColor: theme.colors.surfaceColor }]}>
      <Text style={[styles.formTitle, { color: theme.colors.textPrimary }]}>
        {initial?.id ? 'Edit Reward' : 'New Reward'}
      </Text>

      {/* Emoji + color selector */}
      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Icon</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {EMOJIS.map(e => (
          <TouchableOpacity key={e} onPress={() => setEmoji(e)}
            style={[styles.emojiBtn, emoji === e && { borderColor: theme.colors.primary, borderWidth: 2 }]}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Color</Text>
      <View style={styles.colorRow}>
        {COLORS.map(c => (
          <TouchableOpacity key={c} onPress={() => setColor(c)}
            style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotSelected]} />
        ))}
      </View>

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Title *</Text>
      <TextInput
        style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.divider }]}
        value={title} onChangeText={setTitle} placeholder="e.g. Movie Night"
        placeholderTextColor={theme.colors.textSecondary}
      />

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Description</Text>
      <TextInput
        style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.divider, minHeight: 60 }]}
        value={description} onChangeText={setDescription} placeholder="Optional description"
        placeholderTextColor={theme.colors.textSecondary} multiline
      />

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Points Required</Text>
      <TextInput
        style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.divider }]}
        value={tokenCost} onChangeText={setTokenCost} keyboardType="numeric"
        placeholder="10" placeholderTextColor={theme.colors.textSecondary}
      />

      <Text style={[styles.label, { color: theme.colors.textSecondary }]}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} onPress={() => setCategory(c)}
            style={[styles.categoryChip, category === c && { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.categoryChipText, category === c && { color: '#fff' }]}>
              {c.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.colors.textSecondary, marginBottom: 0 }]}>Active</Text>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: theme.colors.primary }} />
      </View>

      <View style={styles.formButtons}>
        <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]}
          onPress={handleSave} disabled={isSaving || !title.trim()}>
          {isSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Reward Card ─────────────────────────────────────────────────────────────

const RewardCard: React.FC<{
  reward: Reward;
  onEdit: () => void;
  onDelete: () => void;
  learnerProgress?: { name: string; saved: number }[];
}> = ({ reward, onEdit, onDelete, learnerProgress }) => {
  const [expanded, setExpanded] = useState(false);
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderLeftColor: reward.color, borderLeftWidth: 4 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: reward.color + '20' }]}>
          <Text style={{ fontSize: 28 }}>{reward.imageEmoji}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{reward.title}</Text>
          <Text style={[styles.cardSub, { color: theme.colors.textSecondary }]}>
            {reward.tokenCost} pts · {reward.category.replace('_', ' ')} · {reward.currentRedemptions} redeemed
          </Text>
          {!reward.isActive && (
            <View style={styles.inactiveBadge}><Text style={styles.inactiveBadgeText}>Inactive</Text></View>
          )}
        </View>
        <TouchableOpacity onPress={onEdit} style={styles.iconBtn}>
          <Edit2 size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.iconBtn}>
          <Trash2 size={16} color="#EF5350" />
        </TouchableOpacity>
      </View>

      {reward.description && (
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>{reward.description}</Text>
      )}

      {learnerProgress && learnerProgress.length > 0 && (
        <TouchableOpacity style={styles.progressToggle} onPress={() => setExpanded(e => !e)}>
          <Text style={[styles.progressToggleText, { color: theme.colors.primary }]}>
            Learner progress ({learnerProgress.length})
          </Text>
          <ChevronDown size={14} color={theme.colors.primary} />
        </TouchableOpacity>
      )}

      {expanded && learnerProgress?.map((lp, i) => (
        <View key={i} style={styles.progressRow}>
          <Text style={[styles.progressName, { color: theme.colors.textPrimary }]}>{lp.name}</Text>
          <View style={[styles.progressBar, { backgroundColor: theme.colors.divider }]}>
            <View style={[styles.progressFill, {
              width: `${Math.min(100, Math.round((lp.saved / reward.tokenCost) * 100))}%` as any,
              backgroundColor: reward.color,
            }]} />
          </View>
          <Text style={[styles.progressPts, { color: theme.colors.textSecondary }]}>
            {lp.saved}/{reward.tokenCost}
          </Text>
        </View>
      ))}
    </View>
  );
};

// ─── Redemption Request Card ──────────────────────────────────────────────────

const RedemptionCard: React.FC<{
  r: Redemption;
  onApprove: (notes?: string) => void;
  onReject: (notes?: string) => void;
  isProcessing: boolean;
}> = ({ r, onApprove, onReject, isProcessing }) => {
  const [notes, setNotes] = useState('');
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderLeftColor: r.rewardColor, borderLeftWidth: 4 }]}>
      <View style={styles.cardHeader}>
        <Text style={{ fontSize: 28, marginRight: 10 }}>{r.rewardEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
            {r.learnerName} → {r.rewardTitle}
          </Text>
          <Text style={[styles.cardSub, { color: theme.colors.textSecondary }]}>
            {r.tokensSpent} pts · {new Date(r.requestedAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor:
          r.status === 'APPROVED' ? '#E8F5E9' : r.status === 'REJECTED' ? '#FFEBEE' : '#FFF8E1' }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color:
            r.status === 'APPROVED' ? '#2E7D32' : r.status === 'REJECTED' ? '#C62828' : '#F57F17' }}>
            {r.status}
          </Text>
        </View>
      </View>

      {r.status === 'PENDING' && (
        <>
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.divider, marginTop: 8 }]}
            value={notes} onChangeText={setNotes} placeholder="Optional note for learner"
            placeholderTextColor={theme.colors.textSecondary}
          />
          <View style={styles.redemptionActions}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#E8F5E9', flex: 1, marginRight: 8 }]}
              onPress={() => onApprove(notes)} disabled={isProcessing}>
              <CheckCircle size={16} color="#2E7D32" />
              <Text style={[styles.actionBtnText, { color: '#2E7D32', marginLeft: 6 }]}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#FFEBEE', flex: 1 }]}
              onPress={() => onReject(notes)} disabled={isProcessing}>
              <XCircle size={16} color="#C62828" />
              <Text style={[styles.actionBtnText, { color: '#C62828', marginLeft: 6 }]}>Reject</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {r.parentNotes && (
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary, marginTop: 6 }]}>
          Note: {r.parentNotes}
        </Text>
      )}
    </View>
  );
};

// ─── Learner Settings Card (Double-or-Loss) ───────────────────────────────────

const LearnerSettingsCard: React.FC<{ learner: Learner }> = ({ learner }) => {
  const theme = useTheme();
  const { data: settings } = useQuery({
    queryKey: [`/api/learner-settings/${learner.id}`],
    queryFn: () => apiRequest('GET', `/api/learner-settings/${learner.id}`).then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest('PUT', `/api/learner-settings/${learner.id}/double-or-loss`, { enabled }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/learner-settings/${learner.id}`] }),
  });

  const enabled = settings?.doubleOrLossEnabled ?? false;

  return (
    <View style={[styles.settingCard, { backgroundColor: theme.colors.surfaceColor }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{learner.name}</Text>
        <Text style={[styles.cardSub, { color: theme.colors.textSecondary }]}>
          Double-or-Loss mode: {enabled ? '⚡ ON' : 'Off'}
        </Text>
        <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>
          {enabled ? '2× points for correct, -1 for wrong answers' : 'Standard scoring (1 pt per correct answer)'}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={v => toggleMutation.mutate(v)}
        trackColor={{ true: '#FF8F00' }}
      />
    </View>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

type Tab = 'rewards' | 'redemptions' | 'settings';

const ParentRewardsPage: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('rewards');
  const [showForm, setShowForm] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);

  // ── Data ──
  const { data: rewards = [], isLoading: loadingRewards } = useQuery<Reward[]>({
    queryKey: ['/api/rewards'],
    queryFn: () => apiRequest('GET', '/api/rewards').then(r => r.data),
  });

  const { data: redemptions = [], isLoading: loadingRedemptions } = useQuery<Redemption[]>({
    queryKey: ['/api/redemptions'],
    queryFn: () => apiRequest('GET', '/api/redemptions').then(r => r.data),
  });

  const { data: learners = [] } = useQuery<Learner[]>({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then(r => r.data),
  });

  const { data: summary = [] } = useQuery<any[]>({
    queryKey: ['/api/rewards-summary-all'],
    queryFn: async () => {
      if (!learners.length) return [];
      const all = await Promise.all(
        learners.map(l =>
          apiRequest('GET', `/api/rewards-summary?learnerId=${l.id}`)
            .then(r => r.data.map((s: any) => ({ ...s, learnerName: l.name, learnerId: l.id })))
        )
      );
      return all.flat();
    },
    enabled: learners.length > 0,
  });

  // Build per-reward learner progress map
  const rewardProgress: Record<string, { name: string; saved: number }[]> = {};
  summary.forEach((s: any) => {
    if (!rewardProgress[s.id]) rewardProgress[s.id] = [];
    rewardProgress[s.id].push({ name: s.learnerName, saved: s.savedPoints });
  });

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/rewards', data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/rewards'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest('PUT', `/api/rewards/${id}`, data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/rewards'] }); setEditingReward(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/rewards/${id}`).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/rewards'] }),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest('PUT', `/api/redemptions/${id}/approve`, { notes }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/redemptions'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiRequest('PUT', `/api/redemptions/${id}/reject`, { notes }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/redemptions'] }),
  });

  const pendingCount = redemptions.filter(r => r.status === 'PENDING').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surfaceColor }]}>
        <Gift size={22} color={theme.colors.primary} />
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Rewards Center</Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: theme.colors.surfaceColor, borderBottomColor: theme.colors.divider }]}>
        {([
          { key: 'rewards', label: 'Rewards', icon: <Target size={15} /> },
          { key: 'redemptions', label: `Requests${pendingCount ? ` (${pendingCount})` : ''}`, icon: <Gift size={15} /> },
          { key: 'settings', label: 'Settings', icon: <Users size={15} /> },
        ] as const).map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.key)}>
            {tab.icon}
            <Text style={[styles.tabText, { color: activeTab === tab.key ? theme.colors.primary : theme.colors.textSecondary }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* ── Rewards tab ── */}
        {activeTab === 'rewards' && (
          <>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.colors.primary }]}
              onPress={() => { setEditingReward(null); setShowForm(true); }}>
              <Plus size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Reward</Text>
            </TouchableOpacity>

            {loadingRewards ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> :
              rewards.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>🎁</Text>
                  <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No rewards yet. Add one!</Text>
                </View>
              ) : rewards.map(r => (
                <RewardCard key={r.id} reward={r}
                  learnerProgress={rewardProgress[r.id]}
                  onEdit={() => { setEditingReward(r); setShowForm(true); }}
                  onDelete={() => deleteMutation.mutate(r.id)}
                />
              ))
            }
          </>
        )}

        {/* ── Redemptions tab ── */}
        {activeTab === 'redemptions' && (
          <>
            {loadingRedemptions ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} /> :
              redemptions.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>📭</Text>
                  <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>No redemption requests yet.</Text>
                </View>
              ) : redemptions.map(r => (
                <RedemptionCard key={r.id} r={r}
                  onApprove={notes => approveMutation.mutate({ id: r.id, notes })}
                  onReject={notes => rejectMutation.mutate({ id: r.id, notes })}
                  isProcessing={approveMutation.isPending || rejectMutation.isPending}
                />
              ))
            }
          </>
        )}

        {/* ── Settings tab ── */}
        {activeTab === 'settings' && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
              Double-or-Loss Mode
            </Text>
            <Text style={[styles.sectionDesc, { color: theme.colors.textSecondary }]}>
              When enabled, correct answers earn 2× points. Wrong answers deduct 1 point each.
            </Text>
            {learners.map(l => <LearnerSettingsCard key={l.id} learner={l} />)}
          </>
        )}
      </ScrollView>

      {/* ── Reward form modal ── */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}>
            <RewardForm
              initial={editingReward ?? undefined}
              isSaving={createMutation.isPending || updateMutation.isPending}
              onCancel={() => { setShowForm(false); setEditingReward(null); }}
              onSave={data => {
                if (editingReward) {
                  updateMutation.mutate({ id: editingReward.id, ...data });
                } else {
                  createMutation.mutate(data);
                }
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, gap: 6,
  },
  tabText: { fontSize: 12, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 14, borderRadius: 12, marginBottom: 16, gap: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    marginBottom: 12, elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  emojiCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { fontSize: 12 },
  cardDesc: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  iconBtn: { padding: 8 },
  inactiveBadge: { backgroundColor: '#EEEEEE', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  inactiveBadgeText: { fontSize: 10, color: '#757575', fontWeight: '600' },
  progressToggle: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 4 },
  progressToggleText: { fontSize: 12, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  progressName: { fontSize: 12, fontWeight: '600', width: 70 },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressPts: { fontSize: 11, width: 50, textAlign: 'right' },
  settingCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 12 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  redemptionActions: { flexDirection: 'row', marginTop: 10 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
  },
  cancelBtn: { backgroundColor: '#F5F5F5', marginRight: 8, flex: 1 },
  cancelBtnText: { fontWeight: '600', color: '#333' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  form: { borderRadius: 16, padding: 20 },
  formTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  formButtons: { flexDirection: 'row', marginTop: 16 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, marginBottom: 12,
  },
  emojiBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  colorRow: { flexDirection: 'row', marginBottom: 12 },
  colorDot: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
  colorDotSelected: { borderWidth: 3, borderColor: '#333' },
  categoryChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
    backgroundColor: '#F0F0F0',
  },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  sectionDesc: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
});

export default ParentRewardsPage;
