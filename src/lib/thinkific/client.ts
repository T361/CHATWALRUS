// =============================================================================
// Thinkific API Client (SERVER ONLY)
// =============================================================================
// WARNING: Never import this in client components.

export interface ThinkificConfig {
  apiKey: string;
  subdomain: string;
  baseUrl: string;
}

function getConfig(): ThinkificConfig | null {
  const apiKey = process.env.THINKIFIC_API_KEY;
  const subdomain = process.env.THINKIFIC_SUBDOMAIN;
  const baseUrl = process.env.THINKIFIC_BASE_URL || 'https://api.thinkific.com/api/public/v1';

  if (!apiKey || !subdomain) {
    return null;
  }

  return { apiKey, subdomain, baseUrl };
}

export function isThinkificConfigured(): boolean {
  return getConfig() !== null;
}

/**
 * Make an authenticated GET request to the Thinkific API.
 */
export async function thinkificGet<T>(
  endpoint: string,
  params?: Record<string, string>
): Promise<T> {
  const config = getConfig();
  if (!config) {
    throw new Error('[Thinkific] API key or subdomain not configured.');
  }

  const url = new URL(`${config.baseUrl}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-API-Key': config.apiKey,
      'X-Auth-Subdomain': config.subdomain,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error');
    throw new Error(`[Thinkific] ${response.status} ${response.statusText}: ${text}`);
  }

  return response.json();
}

/**
 * Paginate through all results from a Thinkific API endpoint.
 * Thinkific uses page-based pagination with `items` array.
 */
export async function thinkificPaginate<T>(
  endpoint: string,
  params?: Record<string, string>
): Promise<T[]> {
  const allItems: T[] = [];
  let page = 1;
  const limit = '100';

  while (true) {
    const response = await thinkificGet<{
      items: T[];
      meta: { pagination: { current_page: number; total_pages: number; total_items: number } };
    }>(endpoint, { ...params, page: String(page), limit });

    if (response.items && response.items.length > 0) {
      allItems.push(...response.items);
    }

    const pagination = response.meta?.pagination;
    if (!pagination || page >= pagination.total_pages) {
      break;
    }

    page++;
  }

  return allItems;
}
