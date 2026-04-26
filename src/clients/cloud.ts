/**
 * Hetzner Cloud API client (api.hetzner.cloud/v1).
 * Uses Bearer token auth, JSON bodies, auto-pagination, action polling.
 */

import type { CloudConfig } from '../config.js';
import {
  HetznerApiError,
  type HetznerAction,
  type PaginationMeta,
  type RateLimitInfo,
  parseRateLimitHeaders,
  sleep,
} from './common.js';

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

export class CloudClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout = 30_000;
  public lastRateLimit: RateLimitInfo | null = null;

  constructor(config: CloudConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  /**
   * Make a single HTTP request to the Cloud API.
   */
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, params } = options;
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };

    let requestBody: string | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Track rate limit
      this.lastRateLimit = parseRateLimitHeaders(response.headers);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as {
          error?: { code?: string; message?: string; details?: unknown };
        } | null;
        const hErr = errorBody?.error;
        throw new HetznerApiError(
          response.status,
          hErr?.code ?? 'unknown',
          hErr?.message ?? response.statusText,
          hErr?.details,
        );
      }

      // 204 No Content
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof HetznerApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new HetznerApiError(0, 'TIMEOUT', `Request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Auto-paginate a list endpoint and return all items.
   * `key` is the response key containing the array (e.g. 'servers', 'volumes').
   */
  async requestAll<T = unknown>(
    path: string,
    key: string,
    params?: Record<string, string | number | boolean | undefined | null>,
  ): Promise<T[]> {
    const allItems: T[] = [];
    let page = 1;
    const perPage = 50;

    while (true) {
      const result = await this.request<Record<string, unknown>>(path, {
        params: { ...params, page, per_page: perPage },
      });

      const items = result[key] as T[] | undefined;
      if (items && Array.isArray(items)) {
        allItems.push(...items);
      }

      const meta = result.meta as { pagination?: PaginationMeta } | undefined;
      if (!meta?.pagination?.next_page) break;
      page = meta.pagination.next_page;
    }

    return allItems;
  }

  /**
   * Poll an action until it completes (success or error).
   */
  async pollAction(actionId: number, timeoutMs = 300_000): Promise<HetznerAction> {
    const start = Date.now();
    let delay = 1000;

    while (Date.now() - start < timeoutMs) {
      const result = await this.request<{ action: HetznerAction }>(`/actions/${actionId}`);
      if (result.action.status === 'success' || result.action.status === 'error') {
        return result.action;
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, 5000);
    }

    throw new HetznerApiError(
      0,
      'POLL_TIMEOUT',
      `Action ${actionId} did not complete within ${timeoutMs}ms`,
    );
  }

  /**
   * Returns a rate-limit warning string if remaining requests are low, else null.
   */
  rateLimitWarning(): string | null {
    if (this.lastRateLimit && this.lastRateLimit.remaining < 100) {
      return `⚠️ Rate limit: ${this.lastRateLimit.remaining}/${this.lastRateLimit.limit} requests remaining. Resets at ${new Date(this.lastRateLimit.reset * 1000).toISOString()}.`;
    }
    return null;
  }

  /**
   * Serializes data to JSON and appends a rate-limit warning if applicable.
   */
  formatOutput(data: unknown): string {
    return this.appendWarning(JSON.stringify(data, null, 2));
  }

  /**
   * Appends a rate-limit warning to a pre-formatted output string if applicable.
   */
  appendWarning(output: string): string {
    const warning = this.rateLimitWarning();
    if (warning) output += '\n' + warning;
    return output;
  }
}
