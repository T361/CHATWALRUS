// =============================================================================
// Slack Alert Service
// Supports three routing modes per company:
//   channel_only  — post to companies.slack_channel_id (or SLACK_DEFAULT_CHANNEL_ID)
//   dm_only       — DM the CSM (companies.csm_owner_email → Slack user lookup)
//   both          — post to channel AND DM the CSM
// =============================================================================

export interface SlackAlertPayload {
  companyName: string;
  milestoneDay: number;
  benchmarkPercent: number;
  averageCompletion: number;
  atRiskCount: number;
  notStartedCount: number;
  dashboardUrl: string;
  /** Per-company overrides pulled from companies table */
  slackChannelId?: string | null;
  csmOwnerEmail?: string | null;
  slackRouting?: 'channel_only' | 'dm_only' | 'both' | null;
}

export async function sendSlackAlert(payload: SlackAlertPayload): Promise<boolean> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  if (!slackToken) {
    console.log('[Slack] SLACK_BOT_TOKEN not configured — alert skipped.');
    return false;
  }

  const routing = payload.slackRouting || 'channel_only';
  const channelId = payload.slackChannelId || process.env.SLACK_DEFAULT_CHANNEL_ID || null;
  const message = buildSlackMessage(payload);

  let sentAny = false;

  // ── Channel post ──
  if ((routing === 'channel_only' || routing === 'both') && channelId) {
    sentAny = await postToChannel(slackToken, channelId, message) || sentAny;
  }

  // ── CSM DM ──
  if ((routing === 'dm_only' || routing === 'both') && payload.csmOwnerEmail) {
    const dmChannel = await openDmChannel(slackToken, payload.csmOwnerEmail);
    if (dmChannel) {
      sentAny = await postToChannel(slackToken, dmChannel, message) || sentAny;
    }
  }

  if (!sentAny) {
    console.log('[Slack] No channel or DM configured — alert logged only:');
    console.log('[Slack]', JSON.stringify(payload));
  }

  return sentAny;
}

async function postToChannel(
  token: string,
  channelId: string,
  message: { fallback: string; blocks: unknown[] }
): Promise<boolean> {
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: channelId,
        text: message.fallback,
        blocks: message.blocks,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`[Slack] chat.postMessage error: ${data.error} (channel: ${channelId})`);
      return false;
    }
    console.log(`[Slack] Alert sent to channel ${channelId}`);
    return true;
  } catch (err) {
    console.error('[Slack] Failed to post message:', err);
    return false;
  }
}

/**
 * Resolve a CSM email address to a Slack DM channel ID.
 * Uses users.lookupByEmail + conversations.open.
 */
async function openDmChannel(token: string, email: string): Promise<string | null> {
  try {
    // Step 1: Look up user by email
    const lookupRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const lookupData = await lookupRes.json();
    if (!lookupData.ok || !lookupData.user?.id) {
      console.warn(`[Slack] Could not find Slack user for email ${email}: ${lookupData.error}`);
      return null;
    }

    // Step 2: Open DM channel
    const openRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ users: lookupData.user.id }),
    });
    const openData = await openRes.json();
    if (!openData.ok || !openData.channel?.id) {
      console.warn(`[Slack] Could not open DM for ${email}: ${openData.error}`);
      return null;
    }

    return openData.channel.id;
  } catch (err) {
    console.error('[Slack] DM channel open failed:', err);
    return null;
  }
}

function buildSlackMessage(payload: SlackAlertPayload) {
  const delta = (payload.benchmarkPercent - payload.averageCompletion).toFixed(1);
  const fallback = `⚠️ ${payload.companyName} — Day ${payload.milestoneDay}: avg ${payload.averageCompletion.toFixed(1)}% vs benchmark ${payload.benchmarkPercent.toFixed(1)}% (${delta}% behind)`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `⚠️ Engagement Alert: ${payload.companyName}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Milestone:*\nDay ${payload.milestoneDay}` },
        { type: 'mrkdwn', text: `*Benchmark:*\n${payload.benchmarkPercent.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Average Completion:*\n${payload.averageCompletion.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Gap:*\n${delta}% behind` },
        { type: 'mrkdwn', text: `*At Risk:*\n${payload.atRiskCount} learners` },
        { type: 'mrkdwn', text: `*Not Started:*\n${payload.notStartedCount} learners` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          style: 'danger',
          text: { type: 'plain_text', text: '🔍 View Dashboard', emoji: true },
          url: payload.dashboardUrl,
        },
      ],
    },
  ];

  return { fallback, blocks };
}
