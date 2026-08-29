// Client module: singleton OpenRouter SDK instance + raw fetch helper.
import { OpenRouter } from "@openrouter/sdk";
import { APP_REFERER, APP_TITLE, API_KEY, MGMT_KEY } from "./config.ts";

let _client: OpenRouter | null = null;

/** Shared SDK instance. Uses management key when available, else public key. */
export function getClient(): OpenRouter {
	const key = MGMT_KEY || API_KEY;
	if (!_client) {
		_client = new OpenRouter({
			apiKey: key,
			httpReferer: APP_REFERER,
			appTitle: APP_TITLE,
		});
	}
	return _client;
}

/** True when we only have the public key (privileged commands will fail). */
export function hasMgmtKey(): boolean {
	return Boolean(MGMT_KEY);
}

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Raw request to an API endpoint. Used for analytics/activity because the
 * official SDK fails to parse responses where numeric metrics arrive as strings
 * (e.g. "request_count": "14") — the zod schema rejects them and returns {}.
 */
export async function apiRaw<T>(
	endpoint: string,
	init?: RequestInit,
): Promise<T> {
	const key = MGMT_KEY || API_KEY;
	const headers = new Headers(init?.headers);
	headers.set("Authorization", `Bearer ${key}`);
	headers.set("HTTP-Referer", APP_REFERER);
	headers.set("X-Title", APP_TITLE);
	if (init?.body) headers.set("Content-Type", "application/json");

	const res = await fetch(`${BASE_URL}/${endpoint}`, { ...init, headers });
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
	}
	return (await res.json()) as T;
}

/** Raw POST with a JSON body (analytics/query). */
export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
	return apiRaw<T>(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}
