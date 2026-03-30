import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { colors, typography } from '../styles/theme';
import { Eye, Download, ChevronDown, ChevronRight, Filter } from 'react-feather';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../hooks/use-auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PromptEntry {
  id: number;
  lessonId: number;
  lessonTitle: string;
  type: 'lesson' | 'quiz' | 'svg' | 'feedback';
  model: string;
  temperature: number;
  systemMessage: string;
  userMessage: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TYPE_COLORS: Record<string, string> = {
  lesson: '#2563EB',
  quiz: '#16A34A',
  svg: '#9333EA',
  feedback: '#EA580C',
};

const TYPE_LABELS: Record<string, string> = {
  lesson: 'Lesson',
  quiz: 'Quiz',
  svg: 'SVG',
  feedback: 'Feedback',
};

// ---------------------------------------------------------------------------
// PromptAuditPage
// ---------------------------------------------------------------------------
const PromptAuditPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedLearner, availableLearners } = useMode();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [selectedLearnerId, setSelectedLearnerId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Use selectedLearner from ModeContext, or fallback to local selection
  const learnerId = selectedLearnerId ?? selectedLearner?.id ?? null;
  const learnerName = useMemo(() => {
    if (!learnerId) return null;
    if (selectedLearner?.id === learnerId) return selectedLearner.name;
    const found = availableLearners.find((l) => l.id === learnerId);
    return found?.name ?? null;
  }, [learnerId, selectedLearner, availableLearners]);

  // Fetch prompts for the selected learner
  const {
    data: prompts = [],
    isLoading,
    error,
  } = useQuery<PromptEntry[]>({
    queryKey: [`/api/learners/${learnerId}/prompts`],
    queryFn: () =>
      apiRequest('GET', `/api/learners/${learnerId}/prompts`).then(
        (res) => res.data,
      ),
    enabled: !!learnerId,
  });

  // ---------------------------------------------------------------------------
  // Filtered data
  // ---------------------------------------------------------------------------
  const filteredPrompts = useMemo(() => {
    let result = prompts;
    if (filterType) {
      result = result.filter((p) => p.type === filterType);
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      result = result.filter((p) => new Date(p.createdAt) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((p) => new Date(p.createdAt) <= to);
    }
    return result;
  }, [prompts, filterType, filterDateFrom, filterDateTo]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const summary = useMemo(() => {
    const counts: Record<string, number> = { lesson: 0, quiz: 0, svg: 0, feedback: 0 };
    for (const p of filteredPrompts) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
    return { total: filteredPrompts.length, ...counts };
  }, [filteredPrompts]);

  const groupedByLesson = useMemo(() => {
    const groups: Record<number, { title: string; entries: PromptEntry[] }> = {};
    // Already sorted most-recent first by API; preserve order
    for (const p of filteredPrompts) {
      if (!groups[p.lessonId]) {
        groups[p.lessonId] = { title: p.lessonTitle || `Lesson ${p.lessonId}`, entries: [] };
      }
      groups[p.lessonId].entries.push(p);
    }
    return Object.entries(groups);
  }, [filteredPrompts]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const res = await apiRequest('GET', `/api/learners/${learnerId}/prompts`);
      const data = res.data;
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompts-${learnerName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback to local data
      const blob = new Blob([JSON.stringify(prompts, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompts-${learnerName ?? 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderBadge = (type: string) => (
    <View style={[s.badge, { backgroundColor: TYPE_COLORS[type] ?? colors.accent3 }]}>
      <Text style={s.badgeText}>{TYPE_LABELS[type] ?? type}</Text>
    </View>
  );

  const renderCodeBlock = (label: string, text: string) => (
    <View style={s.codeBlockWrapper}>
      <Text style={s.codeBlockLabel}>{label}</Text>
      <View style={s.codeBlock}>
        <Text style={s.codeBlockText} selectable>{text}</Text>
      </View>
    </View>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Eye size={22} color={colors.onPrimary} />
          <Text style={s.headerTitle}>
            Prompt Audit{learnerName ? ` \u2014 ${learnerName}` : ''}
          </Text>
        </View>
        <Text style={s.headerSubtitle}>
          Every AI prompt used for your child, fully transparent
        </Text>
      </View>

      <View style={s.contentContainer}>
        {/* Learner picker when there are multiple learners */}
        {availableLearners.length > 1 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Select Learner</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {availableLearners.map((l) => (
                <TouchableOpacity
                  key={l.id}
                  style={[
                    s.learnerBtn,
                    (learnerId === l.id) && s.learnerBtnActive,
                  ]}
                  onPress={() => setSelectedLearnerId(l.id)}
                >
                  <Text
                    style={[
                      s.learnerBtnText,
                      (learnerId === l.id) && s.learnerBtnTextActive,
                    ]}
                  >
                    {l.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Loading / Error / Empty */}
        {isLoading && (
          <ActivityIndicator size="large" color={colors.primary} style={s.loader} />
        )}
        {error && (
          <View style={s.emptyContainer}>
            <Text style={s.emptyText}>Failed to load prompts. Please try again.</Text>
          </View>
        )}
        {!isLoading && !error && !learnerId && (
          <View style={s.emptyContainer}>
            <Eye size={48} color={colors.textSecondary} />
            <Text style={s.emptyTitle}>No Learner Selected</Text>
            <Text style={s.emptyText}>Select a learner to view their AI prompts.</Text>
          </View>
        )}
        {!isLoading && !error && learnerId && prompts.length === 0 && (
          <View style={s.emptyContainer}>
            <Eye size={48} color={colors.textSecondary} />
            <Text style={s.emptyTitle}>No Prompts Yet</Text>
            <Text style={s.emptyText}>
              AI prompts will appear here after lessons are generated.
            </Text>
          </View>
        )}

        {/* Main list */}
        {!isLoading && !error && prompts.length > 0 && (
          <ScrollView>
            {/* Filters */}
            <View style={s.filterRow}>
              <TouchableOpacity
                style={s.filterToggle}
                onPress={() => setShowFilters(!showFilters)}
              >
                <Filter size={14} color={colors.primary} />
                <Text style={s.filterToggleText}>
                  {showFilters ? 'Hide Filters' : 'Filters'}
                </Text>
              </TouchableOpacity>
              {(filterType || filterDateFrom || filterDateTo) && (
                <TouchableOpacity
                  onPress={() => {
                    setFilterType(null);
                    setFilterDateFrom('');
                    setFilterDateTo('');
                  }}
                >
                  <Text style={s.clearFiltersText}>Clear Filters</Text>
                </TouchableOpacity>
              )}
            </View>

            {showFilters && (
              <View style={s.filtersContainer}>
                <View style={s.filterGroup}>
                  <Text style={s.filterLabel}>Prompt Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <TouchableOpacity
                      style={[s.filterChip, !filterType && s.filterChipActive]}
                      onPress={() => setFilterType(null)}
                    >
                      <Text style={[s.filterChipText, !filterType && s.filterChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {(['lesson', 'quiz', 'svg', 'feedback'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[s.filterChip, filterType === t && s.filterChipActive]}
                        onPress={() => setFilterType(t)}
                      >
                        <Text style={[s.filterChipText, filterType === t && s.filterChipTextActive]}>
                          {TYPE_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={s.filterGroup}>
                  <Text style={s.filterLabel}>Date Range</Text>
                  <View style={s.dateRow}>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      style={{ padding: 6, borderRadius: 4, border: `1px solid ${colors.border}`, fontSize: 13 }}
                    />
                    <Text style={s.dateRangeSeparator}>to</Text>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      style={{ padding: 6, borderRadius: 4, border: `1px solid ${colors.border}`, fontSize: 13 }}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Summary bar + Export */}
            <View style={s.summaryRow}>
              <View style={s.summaryChips}>
                <View style={s.summaryChip}>
                  <Text style={s.summaryChipLabel}>Total</Text>
                  <Text style={s.summaryChipValue}>{summary.total}</Text>
                </View>
                {(['lesson', 'quiz', 'svg', 'feedback'] as const).map((t) => (
                  <View
                    key={t}
                    style={[s.summaryChip, { borderLeftWidth: 3, borderLeftColor: TYPE_COLORS[t] }]}
                  >
                    <Text style={s.summaryChipLabel}>{TYPE_LABELS[t]}</Text>
                    <Text style={s.summaryChipValue}>{(summary as any)[t] ?? 0}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity style={s.exportBtn} onPress={handleExport}>
                <Download size={14} color={colors.onPrimary} />
                <Text style={s.exportBtnText}>Export All Prompts</Text>
              </TouchableOpacity>
            </View>

            {/* Grouped prompt entries */}
            {groupedByLesson.map(([lessonId, group]) => (
              <View key={lessonId} style={s.lessonGroup}>
                <Text style={s.lessonGroupTitle}>{group.title}</Text>
                {group.entries.map((entry) => {
                  const isExpanded = expandedIds.has(entry.id);
                  return (
                    <TouchableOpacity
                      key={entry.id}
                      style={s.card}
                      onPress={() => toggleExpand(entry.id)}
                      activeOpacity={0.7}
                    >
                      {/* Card header */}
                      <View style={s.cardHeader}>
                        <View style={s.cardHeaderLeft}>
                          {renderBadge(entry.type)}
                          <Text style={s.cardModel}>
                            {entry.model}
                            {entry.temperature != null
                              ? ` \u00B7 temp ${entry.temperature}`
                              : ''}
                          </Text>
                        </View>
                        <View style={s.cardHeaderRight}>
                          <Text style={s.cardTimestamp}>
                            {new Date(entry.createdAt).toLocaleString()}
                          </Text>
                          {isExpanded ? (
                            <ChevronDown size={16} color={colors.textSecondary} />
                          ) : (
                            <ChevronRight size={16} color={colors.textSecondary} />
                          )}
                        </View>
                      </View>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <View style={s.cardBody}>
                          {entry.systemMessage
                            ? renderCodeBlock('System Message', entry.systemMessage)
                            : null}
                          {entry.userMessage
                            ? renderCodeBlock('User Message', entry.userMessage)
                            : null}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {filteredPrompts.length === 0 && prompts.length > 0 && (
              <View style={s.emptyContainer}>
                <Text style={s.emptyTitle}>No Matching Prompts</Text>
                <Text style={s.emptyText}>
                  Try adjusting your filters to see results.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.onPrimary,
    marginBottom: 0,
  },
  headerSubtitle: {
    ...typography.subtitle1,
    color: colors.onPrimary,
    opacity: 0.9,
  },
  contentContainer: {
    flex: 1,
    padding: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h6,
    color: colors.text,
    marginBottom: 12,
  },

  // Learner picker
  learnerBtn: {
    backgroundColor: colors.surfaceColor,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  learnerBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  learnerBtnText: {
    ...typography.body2,
    color: colors.text,
  },
  learnerBtnTextActive: {
    color: colors.onPrimary,
  },

  // Loading / empty states
  loader: {
    marginTop: 32,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    ...typography.h6,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  filterToggleText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: '500',
  },
  clearFiltersText: {
    ...typography.body2,
    color: colors.error,
    fontWeight: '500',
  },
  filtersContainer: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterGroup: {
    marginBottom: 12,
  },
  filterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.onPrimary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateRangeSeparator: {
    ...typography.body2,
    color: colors.textSecondary,
  },

  // Summary bar
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    marginBottom: 24,
    gap: 12,
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryChipLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryChipValue: {
    ...typography.subtitle1,
    color: colors.text,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
  },
  exportBtnText: {
    ...typography.button,
    color: colors.onPrimary,
    fontSize: 13,
  },

  // Lesson groups
  lessonGroup: {
    marginBottom: 24,
  },
  lessonGroupTitle: {
    ...typography.h5,
    color: colors.text,
    marginBottom: 10,
  },

  // Prompt card
  card: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardModel: {
    ...typography.body2,
    color: colors.textSecondary,
  },
  cardTimestamp: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardBody: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },

  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Code block
  codeBlockWrapper: {
    marginTop: 12,
  },
  codeBlockLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: '#F5F5F5',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  codeBlockText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
});

export default PromptAuditPage;
