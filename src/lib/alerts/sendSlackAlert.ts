// =============================================================================
// Slack Alert Skeleton
// =============================================================================
// TODO: Implement full Slack integration when SLACK_BOT_TOKEN is available.

export interface SlackAlertPayload {
  companyName: string;
  milestoneDay: number;
  benchmarkPercent: number;
  averageCompletion: number;
  atRiskCount: number;
  notStartedCount: number;
  dashboardUrl: string;
}

/**
 * Send an alert to Slack.
 * Skeleton: logs instead of sending if env vars are missing.
 */
export async function sendSlackAlert(payload: SlackAlertPayload): Promise<boolean> {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_DEFAULT_CHANNEL_ID;

  if (!slackToken || !channelId) {
    console.log('[Slack] SLACK_BOT_TOKEN or SLACK_DEFAULT_CHANNEL_ID not configured. Alert skipped.');
    console.log('[Slack] Would have sent:', JSON.stringify(payload, null, 2));
    return false;
  }

  const message = buildSlackMessage(payload);

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${slackToken}`,
      },
      body: JSON.stringify({
        channel: channelId,
        text: message.fallback,
        blocks: message.blocks,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('[Slack] API error:', data.error);
      return false;
    }

    console.log('[Slack] Alert sent successfully.');
    return true;
  } catch (error) {
    console.error('[Slack] Failed to send alert:', error);
    return false;
  }
}

function buildSlackMessage(payload: SlackAlertPayload) {
  const fallback = `⚠️ ${payload.companyName} - Day ${payload.milestoneDay}: Average ${payload.averageCompletion.toFixed(1)}% vs Benchmark ${payload.benchmarkPercent.toFixed(1)}%`;

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `⚠️ Engagement Alert: ${payload.companyName}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Milestone Day:*\n${payload.milestoneDay}` },
        { type: 'mrkdwn', text: `*Benchmark:*\n${payload.benchmarkPercent.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*Average Completion:*\n${payload.averageCompletion.toFixed(1)}%` },
        { type: 'mrkdwn', text: `*At Risk:*\n${payload.atRiskCount} learners` },
        { type: 'mrkdwn', text: `*Not Started:*\n${payload.notStartedCount} learners` },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Dashboard' },
          url: payload.dashboardUrl,
        },
      ],
    },
  ];

  return { fallback, blocks };
}
