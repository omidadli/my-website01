import assert from 'node:assert/strict';
import {
  INITIAL_FREE_COINS,
  COINS_PER_MESSAGE,
  calculateRemainingCoins,
  canSendMessageWithCoins,
  getNeuromarketingTrigger,
  TOOL_PLANS,
  getPlans,
} from '../lib/toolPlans';

console.log('--- Testing Neuromarketing Coin Economy & Psychology ---');

// 1. Initial constants
assert.equal(INITIAL_FREE_COINS, 500, 'Initial free coins must be 500');
assert.equal(COINS_PER_MESSAGE, 150, 'Coins per message must be 150');

// 2. Depletion sequence: 500 -> 350 -> 200 -> 50 (leaves 50 dangling coins for loss aversion)
assert.equal(calculateRemainingCoins(0), 500, '0 messages = 500 coins');
assert.equal(calculateRemainingCoins(1), 350, '1 message = 350 coins');
assert.equal(calculateRemainingCoins(2), 200, '2 messages = 200 coins');
assert.equal(calculateRemainingCoins(3), 50, '3 messages = 50 coins (Zeigarnik hook)');
assert.equal(calculateRemainingCoins(4), 0, '4 messages = 0 coins');

// 3. canSendMessageWithCoins threshold
assert.equal(canSendMessageWithCoins(0), true, 'Can send first message');
assert.equal(canSendMessageWithCoins(1), true, 'Can send second message');
assert.equal(canSendMessageWithCoins(2), true, 'Can send third message');
assert.equal(canSendMessageWithCoins(3), false, 'Cannot send 4th message with 50 coins (triggers paywall)');

// 4. Neuromarketing Triggers for all 4 tools
const toolIds = ['business-therapist', 'growth-path', 'problem-solver', 'mock-customer'];
for (const id of toolIds) {
  const trigger = getNeuromarketingTrigger(id);
  assert.ok(trigger.headline.length > 10, `${id} has persuasive headline`);
  assert.ok(trigger.subheadline.length > 20, `${id} has persuasive subheadline`);
  assert.ok(trigger.lossWarning.includes('۵۰ سکه'), `${id} loss warning mentions 50 remaining coins`);
  assert.ok(trigger.dailyHook.includes('روزی'), `${id} daily hook anchors to daily cost`);
  assert.ok(trigger.roiComparison.length > 15, `${id} has tangible ROI comparison`);
}

// 5. Daily cost breakdown and tangible comparisons for all plans
for (const id of toolIds) {
  const plans = getPlans(id);
  assert.equal(plans.length, 3, `${id} must have exactly 3 tiered plans (decoy psychology)`);
  for (const p of plans) {
    assert.ok(p.dailyCost && p.dailyCost.includes('روزی'), `${id} plan ${p.id} has dailyCost`);
    assert.ok(p.dailyComparison && p.dailyComparison.length > 5, `${id} plan ${p.id} has dailyComparison`);
  }
}

console.log('✓ All 5 neuromarketing coin economy assertions passed successfully!');
