import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Modal,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';
import { useTheme } from '../styles/theme';
import { useMode } from '../context/ModeContext';
import { Gift, ArrowLeft } from 'react-feather';
import { useLocation } from 'wouter';

interface RewardGoal {
  id: string;
  title: string;
  description: string | null;
  tokenCost: number;
  category: string;
  isActive: boolean;
  imageEmoji: string;
  color: string;
  savedPoints: number;
  hasPendingRedemption?: boolean;
}

interface RedemptionHistory {
  id: string;
  rewardTitle: string;
  rewardEmoji: string;
  rewardColor: string;
  tokensSpent: number;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  parentNotes: string | null;
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

const GoalCard: React.FC<{
  goal: RewardGoal;
  learnerId: number;
  onSavePoints: (rewardId: string) => void;
  onRedeem: (rewardId: string) => void;
  isProcessing: boolean;
}> = ({ goal, learnerId, onSavePoints, onRedeem, isProcessing }) => {
  const theme = useTheme();
  const saved = goal.savedPoints ?? 0;
  const pct = goal.tokenCost > 0 ? Math.min(100, Math.round((saved / goal.tokenCost) * 100)) : 0;
  const isComplete = saved >= goal.tokenCost;

  return (
    <View style={[styles.card, { borderLeftColor: goal.color, borderLeftWidth: 5 }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={[styles.emojiCircle, { backgroundColor: goal.color + '22' }]}>
          <Text style={{ fontSize: 32 }}>{goal.imageEmoji}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{goal.title}</Text>
          {goal.description && (
            <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>{goal.description}</Text>
          )}
        </View>
        {isComplete && !goal.hasPendingRedemption && (
          <View style={[styles.readyBadge, { backgroundColor: goal.color }]}>
            <Text style={styles.readyBadgeText}>Ready!</Text>
          </View>
        )}
        {goal.hasPendingRedemption && (
          <View style={[styles.readyBadge, { backgroundColor: '#FFB300' }]}>
            <Text style={styles.readyBadgeText}>Waiting…</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>
            {saved} / {goal.tokenCost} pts saved
          </Text>
          <Text style={[styles.progressPct, { color: goal.color }]}>{pct}%</Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.divider }]}>
          <View style={[styles.progressFill, { width: `${pct}%` as any, backgroundColor: goal.color }]} />
        </View>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        {!isComplete && !goal.hasPendingRedemption && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: goal.color + '20', borderColor: goal.color }]}
            onPress={() => onSavePoints(goal.id)} disabled={isProcessing}>
            <Text style={[styles.actionBtnText, { color: goal.color }]}>💰 Save Points</Text>
          </TouchableOpacity>
        )}
        {isComplete && !goal.hasPendingRedemption && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: goal.color, borderColor: goal.color }]}
            onPress={() => onRedeem(goal.id)} disabled={isProcessing}>
            <Text style={[styles.actionBtnText, { color: '#fff' }]}>🎉 Cash Out!</Text>
          </TouchableOpacity>
        )}
        {goal.hasPendingRedemption && (
          <Text style={[styles.waitingText, { color: theme.colors.textSecondary }]}>
            ⏳ Waiting for parent approval…
          </Text>
        )}
      </View>
    </View>
  );
};

// ─── Save Points Modal ────────────────────────────────────────────────────────

const SavePointsModal: React.FC<{
  goal: RewardGoal | null;
  balance: number;
  learnerId: number;
  visible: boolean;
  onClose: () => void;
}> = ({ goal, balance, learnerId, visible, onClose }) => {
  const theme = useTheme();
  const [points, setPoints] = useState(0);

  const saveMutation = useMutation({
    mutationFn: (pts: number) =>
      apiRequest('POST', `/api/rewards/${goal!.id}/save?learnerId=${learnerId}`, { points: pts }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/points/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rewards-summary'] });
      onClose();
    },
  });

  if (!goal) return null;

  const saved2 = goal.savedPoints ?? 0;
  const remaining = Math.max(0, goal.tokenCost - saved2);
  const maxSave = Math.min(balance, remaining);
  const presets = [1, 5, 10, maxSave].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { backgroundColor: theme.colors.surfaceColor }]}>
          <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>
            Save to {goal.imageEmoji} {goal.title}
          </Text>
          <Text style={[styles.modalSub, { color: theme.colors.textSecondary }]}>
            Balance: {balance} pts · {remaining > 0 ? `Need ${remaining} more` : '✓ Goal reached!'}
          </Text>

          {/* Preset buttons */}
          <View style={styles.presetRow}>
            {presets.map(p => (
              <TouchableOpacity key={p}
                style={[styles.presetBtn, points === p && { backgroundColor: goal.color }]}
                onPress={() => setPoints(p)}>
                <Text style={[styles.presetBtnText, points === p && { color: '#fff' }]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom amount */}
          <View style={styles.customRow}>
            <TouchableOpacity style={styles.stepper} onPress={() => setPoints(Math.max(0, points - 1))}>
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.pointsDisplay, { color: goal.color }]}>{points}</Text>
            <TouchableOpacity style={styles.stepper} onPress={() => setPoints(Math.min(maxSave, points + 1))}>
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={[styles.modalBtn, styles.cancelModalBtn]} onPress={onClose}>
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: goal.color, opacity: points > 0 ? 1 : 0.4 }]}
              onPress={() => saveMutation.mutate(points)}
              disabled={points <= 0 || saveMutation.isPending}>
              {saveMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Save {points} pts</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const LearnerGoalsPage: React.FC = () => {
  const theme = useTheme();
  const [, setLocation] = useLocation();
  const { selectedLearner } = useMode();
  const learnerId = selectedLearner?.id ?? 0;
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);
  const [tab, setTab] = useState<'goals' | 'history'>('goals');

  const { data: goals = [], isLoading } = useQuery<RewardGoal[]>({
    queryKey: ['/api/rewards', learnerId],
    queryFn: () => apiRequest('GET', `/api/rewards?learnerId=${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
  });

  const { data: balanceData } = useQuery({
    queryKey: ['/api/points/balance', learnerId],
    queryFn: () => apiRequest('GET', `/api/points/balance?learnerId=${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
  });

  const { data: redemptions = [] } = useQuery<RedemptionHistory[]>({
    queryKey: ['/api/redemptions/my', learnerId],
    queryFn: () => apiRequest('GET', `/api/redemptions/my?learnerId=${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
  });

  const redeemMutation = useMutation({
    mutationFn: (rewardId: string) =>
      apiRequest('POST', `/api/rewards/${rewardId}/redeem?learnerId=${learnerId}`).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rewards', learnerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/redemptions/my', learnerId] });
    },
  });

  const balance = balanceData?.balance ?? 0;
  const savingGoal = savingGoalId ? goals.find(g => g.id === savingGoalId) ?? null : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surfaceColor }]}>
        <TouchableOpacity onPress={() => setLocation('/learner')} style={{ marginRight: 12 }}>
          <ArrowLeft size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Gift size={20} color={theme.colors.primary} />
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>My Goals</Text>
        <View style={{ flex: 1 }} />
        <View style={[styles.balanceBadge, { backgroundColor: theme.colors.primary + '18' }]}>
          <Text style={[styles.balanceText, { color: theme.colors.primary }]}>⭐ {balance} pts</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: theme.colors.surfaceColor }]}>
        {(['goals', 'history'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: theme.colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? theme.colors.primary : theme.colors.textSecondary }]}>
              {t === 'goals' ? '🎯 Goals' : '📜 History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'goals' && (
          <>
            {isLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
            ) : goals.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 52 }}>🎁</Text>
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No goals yet!</Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
                  Ask your parent to add some rewards for you to earn.
                </Text>
              </View>
            ) : (
              goals.map(g => (
                <GoalCard
                  key={g.id} goal={g} learnerId={learnerId}
                  onSavePoints={id => setSavingGoalId(id)}
                  onRedeem={id => redeemMutation.mutate(id)}
                  isProcessing={redeemMutation.isPending}
                />
              ))
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {redemptions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 52 }}>📭</Text>
                <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No history yet</Text>
                <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
                  Cash out your first reward to see it here!
                </Text>
              </View>
            ) : redemptions.map(r => (
              <View key={r.id} style={[styles.historyCard, { borderLeftColor: r.rewardColor }]}>
                <View style={styles.cardHeader}>
                  <Text style={{ fontSize: 28, marginRight: 10 }}>{r.rewardEmoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>{r.rewardTitle}</Text>
                    <Text style={[styles.cardDesc, { color: theme.colors.textSecondary }]}>
                      {r.tokensSpent} pts · {new Date(r.requestedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor:
                    r.status === 'APPROVED' ? '#E8F5E9' : r.status === 'REJECTED' ? '#FFEBEE' : '#FFF8E1' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color:
                      r.status === 'APPROVED' ? '#2E7D32' : r.status === 'REJECTED' ? '#C62828' : '#E65100' }}>
                      {r.status === 'APPROVED' ? '✓ Approved' : r.status === 'REJECTED' ? '✗ Rejected' : '⏳ Pending'}
                    </Text>
                  </View>
                </View>
                {r.parentNotes && (
                  <Text style={[styles.cardDesc, { color: theme.colors.textSecondary, marginTop: 6 }]}>
                    Parent: {r.parentNotes}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <SavePointsModal
        goal={savingGoal}
        balance={balance}
        learnerId={learnerId}
        visible={!!savingGoalId}
        onClose={() => setSavingGoalId(null)}
      />
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  balanceBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  balanceText: { fontWeight: '700', fontSize: 14 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 5,
  },
  historyCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    borderLeftWidth: 4, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  emojiCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  readyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  readyBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  progressSection: { marginTop: 14 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12 },
  progressPct: { fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  cardActions: { marginTop: 14, flexDirection: 'row' },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  actionBtnText: { fontWeight: '700', fontSize: 14 },
  waitingText: { fontSize: 13, fontStyle: 'italic' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  empty: { alignItems: 'center', paddingVertical: 56 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalBox: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  modalSub: { fontSize: 13, marginBottom: 20 },
  presetRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  presetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#F0F0F0' },
  presetBtnText: { fontWeight: '700', color: '#333' },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 24 },
  stepper: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  stepperText: { fontSize: 22, fontWeight: '700', color: '#333' },
  pointsDisplay: { fontSize: 40, fontWeight: '800', minWidth: 60, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelModalBtn: { backgroundColor: '#F0F0F0' },
  cancelModalText: { fontWeight: '600', color: '#555', fontSize: 15 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

export default LearnerGoalsPage;
