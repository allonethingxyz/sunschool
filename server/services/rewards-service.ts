/**
 * Rewards Service
 *
 * Manages the full rewards lifecycle:
 *  - Parent creates/edits/deletes rewards (goals)
 *  - Learner saves points toward goals (delegation)
 *  - Learner requests redemption when goal is met
 *  - Parent approves/rejects redemption
 *  - Repeatable: on approval, savings reset → can earn again
 *  - Double-or-loss: enabled per learner; 2x points on correct, -1 on wrong
 */

import { pool } from '../db';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function toReward(row: any) {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    tokenCost: row.token_cost,
    category: row.category,
    isActive: row.is_active,
    maxRedemptions: row.max_redemptions,
    currentRedemptions: row.current_redemptions,
    imageEmoji: row.image_emoji ?? '🎁',
    color: row.color ?? '#4A90D9',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRedemption(row: any) {
  return {
    id: row.id,
    learnerId: row.learner_id,
    rewardId: row.reward_id,
    tokensSpent: row.tokens_spent,
    status: row.status,
    timesRedeemed: row.times_redeemed ?? 1,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    completedAt: row.completed_at,
    parentNotes: row.parent_notes,
    learnerNotes: row.learner_notes,
  };
}

function toSavings(row: any) {
  return {
    id: row.id,
    learnerId: row.learner_id,
    rewardId: row.reward_id,
    savedPoints: row.saved_points,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Refund helper — returns saved points to learners' general balances
// ─────────────────────────────────────────────────────────────────────────────

async function refundSavingsForReward(client: any, rewardId: string) {
  const { rows: savings } = await client.query(
    `SELECT learner_id, saved_points FROM reward_goal_savings
     WHERE reward_id = $1 AND saved_points > 0`,
    [rewardId]
  );

  for (const s of savings) {
    // Credit points back to learner balance
    await client.query(
      `UPDATE learner_points
       SET current_balance = current_balance + $1, last_updated = NOW()
       WHERE learner_id = $2`,
      [s.saved_points, s.learner_id]
    );

    // Record ledger entry for the refund
    await client.query(
      `INSERT INTO points_ledger (learner_id, amount, source_type, source_id, description)
       VALUES ($1, $2, 'GOAL_REFUND', $3, 'Reward removed — saved points refunded')`,
      [s.learner_id, s.saved_points, rewardId]
    );

    // Zero out the savings
    await client.query(
      `UPDATE reward_goal_savings SET saved_points = 0, updated_at = NOW()
       WHERE learner_id = $1 AND reward_id = $2`,
      [s.learner_id, rewardId]
    );
  }

  return savings.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reward CRUD (parent)
// ─────────────────────────────────────────────────────────────────────────────

export async function getRewardsForParent(parentId: number) {
  const { rows } = await pool.query(
    `SELECT r.*,
       (SELECT COUNT(*) FROM reward_redemptions rr WHERE rr.reward_id = r.id AND rr.status = 'APPROVED') AS total_redeemed
     FROM rewards r
     WHERE r.parent_id = $1
     ORDER BY r.created_at DESC`,
    [parentId]
  );
  return rows.map(toReward);
}

export async function createReward(
  parentId: number,
  data: {
    title: string;
    description?: string;
    tokenCost: number;
    category?: string;
    maxRedemptions?: number | null;
    imageEmoji?: string;
    color?: string;
  }
) {
  const { rows } = await pool.query(
    `INSERT INTO rewards
       (parent_id, title, description, token_cost, category, max_redemptions, image_emoji, color)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      parentId,
      data.title,
      data.description ?? null,
      data.tokenCost,
      data.category ?? 'GENERAL',
      data.maxRedemptions ?? null,
      data.imageEmoji ?? '🎁',
      data.color ?? '#4A90D9',
    ]
  );
  return toReward(rows[0]);
}

export async function updateReward(
  rewardId: string,
  parentId: number,
  data: Partial<{
    title: string;
    description: string;
    tokenCost: number;
    category: string;
    isActive: boolean;
    maxRedemptions: number | null;
    imageEmoji: string;
    color: string;
  }>
) {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.title !== undefined)         { fields.push(`title=$${idx++}`);          values.push(data.title); }
  if (data.description !== undefined)   { fields.push(`description=$${idx++}`);    values.push(data.description); }
  if (data.tokenCost !== undefined)     { fields.push(`token_cost=$${idx++}`);     values.push(data.tokenCost); }
  if (data.category !== undefined)      { fields.push(`category=$${idx++}`);       values.push(data.category); }
  if (data.isActive !== undefined)      { fields.push(`is_active=$${idx++}`);      values.push(data.isActive); }
  if (data.maxRedemptions !== undefined){ fields.push(`max_redemptions=$${idx++}`);values.push(data.maxRedemptions); }
  if (data.imageEmoji !== undefined)    { fields.push(`image_emoji=$${idx++}`);    values.push(data.imageEmoji); }
  if (data.color !== undefined)         { fields.push(`color=$${idx++}`);          values.push(data.color); }

  if (!fields.length) throw new Error('No fields to update');

  fields.push(`updated_at=NOW()`);
  values.push(rewardId, parentId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE rewards SET ${fields.join(', ')}
       WHERE id=$${idx++} AND parent_id=$${idx}
       RETURNING *`,
      values
    );
    if (!rows[0]) throw new Error('Reward not found or not owned by parent');

    // If reward was just deactivated, refund all learner savings
    if (data.isActive === false) {
      await refundSavingsForReward(client, rewardId);
    }

    await client.query('COMMIT');
    return toReward(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteReward(rewardId: string, parentId: number) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Refund all learner savings for this reward back to their balances
    await refundSavingsForReward(client, rewardId);

    await client.query(
      `DELETE FROM rewards WHERE id=$1 AND parent_id=$2`,
      [rewardId, parentId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reward progress (savings per learner)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all available rewards for a learner (from their parent) with savings progress.
 */
export async function getRewardsForLearner(learnerId: number) {
  // Find parent of learner
  const { rows: userRows } = await pool.query(
    `SELECT parent_id FROM users WHERE id=$1`,
    [learnerId]
  );
  if (!userRows[0]?.parent_id) return [];

  const parentId = userRows[0].parent_id;

  const { rows } = await pool.query(
    `SELECT r.*,
       COALESCE(gs.saved_points, 0) AS saved_points,
       gs.id AS savings_id
     FROM rewards r
     LEFT JOIN reward_goal_savings gs
       ON gs.reward_id = r.id AND gs.learner_id = $1
     WHERE r.parent_id = $2 AND r.is_active = TRUE
     ORDER BY r.token_cost ASC, r.title ASC`,
    [learnerId, parentId]
  );

  return rows.map(row => ({
    ...toReward(row),
    savedPoints: row.saved_points ?? 0,
    savingsId: row.savings_id ?? null,
  }));
}

/**
 * Get savings for a specific learner+reward pair.
 */
export async function getSavings(learnerId: number, rewardId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM reward_goal_savings WHERE learner_id=$1 AND reward_id=$2`,
    [learnerId, rewardId]
  );
  return rows[0] ? toSavings(rows[0]) : null;
}

/**
 * Delegate points from the learner's general balance to a reward goal.
 * Deducts from points_ledger and adds to reward_goal_savings.
 */
export async function delegatePointsToGoal(
  learnerId: number,
  rewardId: string,
  points: number
) {
  if (points <= 0) throw new Error('Points must be positive');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check balance
    const { rows: balRows } = await client.query(
      `SELECT current_balance FROM learner_points WHERE learner_id=$1`,
      [learnerId]
    );
    const balance = balRows[0]?.current_balance ?? 0;
    if (balance < points) throw new Error('Insufficient balance');

    // Deduct from learner_points
    await client.query(
      `UPDATE learner_points
       SET current_balance = current_balance - $1, last_updated = NOW()
       WHERE learner_id = $2`,
      [points, learnerId]
    );

    // Record ledger entry
    await client.query(
      `INSERT INTO points_ledger (learner_id, amount, source_type, source_id, description)
       VALUES ($1, $2, 'GOAL_DELEGATION', $3, 'Points saved toward reward goal')`,
      [learnerId, -points, rewardId]
    );

    // Upsert goal savings
    await client.query(
      `INSERT INTO reward_goal_savings (learner_id, reward_id, saved_points)
       VALUES ($1, $2, $3)
       ON CONFLICT (learner_id, reward_id)
       DO UPDATE SET saved_points = reward_goal_savings.saved_points + $3, updated_at = NOW()`,
      [learnerId, rewardId, points]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redemption requests
// ─────────────────────────────────────────────────────────────────────────────

export async function requestRedemption(learnerId: number, rewardId: string) {
  // Verify savings ≥ reward cost
  const { rows: rewardRows } = await pool.query(
    `SELECT token_cost FROM rewards WHERE id=$1 AND is_active=TRUE`,
    [rewardId]
  );
  if (!rewardRows[0]) throw new Error('Reward not found');
  const tokenCost = rewardRows[0].token_cost;

  const { rows: savingsRows } = await pool.query(
    `SELECT saved_points FROM reward_goal_savings WHERE learner_id=$1 AND reward_id=$2`,
    [learnerId, rewardId]
  );
  const savedPoints = savingsRows[0]?.saved_points ?? 0;
  if (savedPoints < tokenCost) {
    throw new Error(`Need ${tokenCost} saved points, have ${savedPoints}`);
  }

  // Check for existing pending request
  const { rows: existingRows } = await pool.query(
    `SELECT id FROM reward_redemptions
     WHERE learner_id=$1 AND reward_id=$2 AND status='PENDING'`,
    [learnerId, rewardId]
  );
  if (existingRows[0]) throw new Error('Redemption already pending');

  const { rows } = await pool.query(
    `INSERT INTO reward_redemptions (learner_id, reward_id, tokens_spent, status)
     VALUES ($1, $2, $3, 'PENDING')
     RETURNING *`,
    [learnerId, rewardId, tokenCost]
  );
  return toRedemption(rows[0]);
}

export async function getRedemptionsForParent(
  parentId: number,
  status?: string
) {
  const params: any[] = [parentId];
  let filter = '';
  if (status) {
    params.push(status);
    filter = `AND rr.status = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT rr.*,
       u.name AS learner_name, u.username AS learner_username,
       r.title AS reward_title, r.image_emoji, r.color, r.token_cost
     FROM reward_redemptions rr
     JOIN users u ON u.id = rr.learner_id
     JOIN rewards r ON r.id = rr.reward_id
     WHERE r.parent_id = $1 ${filter}
     ORDER BY rr.requested_at DESC`,
    params
  );
  return rows.map(row => ({
    ...toRedemption(row),
    learnerName: row.learner_name,
    learnerUsername: row.learner_username,
    rewardTitle: row.reward_title,
    rewardEmoji: row.image_emoji,
    rewardColor: row.color,
    rewardCost: row.token_cost,
  }));
}

export async function getRedemptionsForLearner(learnerId: number) {
  const { rows } = await pool.query(
    `SELECT rr.*, r.title AS reward_title, r.image_emoji, r.color
     FROM reward_redemptions rr
     JOIN rewards r ON r.id = rr.reward_id
     WHERE rr.learner_id = $1
     ORDER BY rr.requested_at DESC
     LIMIT 50`,
    [learnerId]
  );
  return rows.map(row => ({
    ...toRedemption(row),
    rewardTitle: row.reward_title,
    rewardEmoji: row.image_emoji,
    rewardColor: row.color,
  }));
}

export async function approveRedemption(
  redemptionId: string,
  parentId: number,
  notes?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify the redemption belongs to this parent
    const { rows: rRows } = await client.query(
      `SELECT rr.*, r.token_cost, r.max_redemptions, r.current_redemptions
       FROM reward_redemptions rr
       JOIN rewards r ON r.id = rr.reward_id
       WHERE rr.id=$1 AND r.parent_id=$2 AND rr.status='PENDING'`,
      [redemptionId, parentId]
    );
    if (!rRows[0]) throw new Error('Redemption not found or not pending');
    const r = rRows[0];

    // Approve
    await client.query(
      `UPDATE reward_redemptions
       SET status='APPROVED', approved_at=NOW(), completed_at=NOW(), parent_notes=$1
       WHERE id=$2`,
      [notes ?? null, redemptionId]
    );

    // Increment reward.current_redemptions
    const { rows: updatedReward } = await client.query(
      `UPDATE rewards SET current_redemptions = current_redemptions + 1, updated_at=NOW()
       WHERE id=$1
       RETURNING current_redemptions, max_redemptions`,
      [r.reward_id]
    );

    // Deduct saved_points (reset to 0 so they can earn again)
    await client.query(
      `UPDATE reward_goal_savings SET saved_points=0, updated_at=NOW()
       WHERE learner_id=$1 AND reward_id=$2`,
      [r.learner_id, r.reward_id]
    );

    // Auto-deactivate if max redemptions reached
    const ur = updatedReward[0];
    if (ur?.max_redemptions && ur.current_redemptions >= ur.max_redemptions) {
      await client.query(
        `UPDATE rewards SET is_active = FALSE, updated_at=NOW() WHERE id=$1`,
        [r.reward_id]
      );
      // Refund any other learners' savings for this now-deactivated reward
      await refundSavingsForReward(client, r.reward_id);
    }

    await client.query('COMMIT');
    return { success: true, learnerId: r.learner_id, rewardId: r.reward_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectRedemption(
  redemptionId: string,
  parentId: number,
  notes?: string
) {
  const { rows: rRows } = await pool.query(
    `SELECT rr.learner_id, rr.reward_id, rr.tokens_spent
     FROM reward_redemptions rr
     JOIN rewards r ON r.id = rr.reward_id
     WHERE rr.id=$1 AND r.parent_id=$2 AND rr.status='PENDING'`,
    [redemptionId, parentId]
  );
  if (!rRows[0]) throw new Error('Redemption not found');

  await pool.query(
    `UPDATE reward_redemptions
     SET status='REJECTED', rejected_at=NOW(), parent_notes=$1
     WHERE id=$2`,
    [notes ?? null, redemptionId]
  );
  return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Double-or-loss mode
// ─────────────────────────────────────────────────────────────────────────────

export async function setDoubleOrLoss(learnerId: number, enabled: boolean) {
  await pool.query(
    `UPDATE learner_profiles SET double_or_loss_enabled=$1 WHERE user_id=$2`,
    [enabled, learnerId]
  );
  return { enabled };
}

export async function getDoubleOrLoss(learnerId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT double_or_loss_enabled FROM learner_profiles WHERE user_id=$1`,
    [learnerId]
  );
  return rows[0]?.double_or_loss_enabled ?? false;
}

/**
 * Apply double-or-loss scoring to an earned/lost amount.
 * For wrong answers the caller passes a negative count; we multiply by the base.
 *
 * doubleOrLoss=true:
 *   correct → base * 2
 *   wrong   → deduct 1 point per wrong answer from general balance
 */
export async function applyDoubleOrLossDeduction(
  learnerId: number,
  wrongCount: number
) {
  if (wrongCount <= 0) return;
  const deduction = wrongCount;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clamp deduction to balance (never go below 0)
    const { rows: balRows } = await client.query(
      `SELECT current_balance FROM learner_points WHERE learner_id=$1`,
      [learnerId]
    );
    const balance = balRows[0]?.current_balance ?? 0;
    const actualDeduction = Math.min(deduction, balance);
    if (actualDeduction <= 0) {
      await client.query('COMMIT');
      return;
    }

    await client.query(
      `UPDATE learner_points
       SET current_balance = current_balance - $1, last_updated=NOW()
       WHERE learner_id=$2`,
      [actualDeduction, learnerId]
    );
    await client.query(
      `INSERT INTO points_ledger (learner_id, amount, source_type, description)
       VALUES ($1, $2, 'DOUBLE_OR_LOSS_DEDUCTION', 'Double-or-loss: wrong answer penalty')`,
      [learnerId, -actualDeduction]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reward progress summary for dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function getRewardSummaryForLearner(learnerId: number) {
  const { rows } = await pool.query(
    `SELECT r.id, r.title, r.token_cost, r.image_emoji, r.color,
       COALESCE(gs.saved_points, 0) AS saved_points,
       COALESCE(rr_pending.cnt, 0) AS pending_redemptions
     FROM rewards r
     JOIN users u ON u.id = $1
     LEFT JOIN reward_goal_savings gs
       ON gs.reward_id = r.id AND gs.learner_id = $1
     LEFT JOIN (
       SELECT reward_id, COUNT(*) AS cnt
       FROM reward_redemptions
       WHERE learner_id=$1 AND status='PENDING'
       GROUP BY reward_id
     ) rr_pending ON rr_pending.reward_id = r.id
     WHERE r.parent_id = u.parent_id AND r.is_active = TRUE
     ORDER BY r.token_cost ASC`,
    [learnerId]
  );
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    tokenCost: row.token_cost,
    imageEmoji: row.image_emoji ?? '🎁',
    color: row.color ?? '#4A90D9',
    savedPoints: row.saved_points ?? 0,
    hasPendingRedemption: row.pending_redemptions > 0,
    progressPct: Math.min(100, Math.round(((row.saved_points ?? 0) / row.token_cost) * 100)),
  }));
}
