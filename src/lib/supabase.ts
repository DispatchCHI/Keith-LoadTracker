import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isTauriRuntime } from "./layout";
import { withCloudFetchSlot } from "./syncControl";

export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  if (url.includes("YOUR_PROJECT") || anonKey.includes("YOUR_ANON")) return null;
  return { url, anonKey };
}

export function isCloudConfigured(): boolean {
  return supabaseConfig() !== null;
}

let client: SupabaseClient | null = null;

type CloudFetchResult = {
  status: number;
  headers: Array<[string, string]>;
  /** Base64-encoded body — see the matching note in src-tauri/src/cloud_fetch.rs. */
  body: string;
};

/**
 * btoa/atob choke (or blow the call stack via String.fromCharCode(...bytes))
 * on large payloads, so encode/decode in fixed-size chunks. A full loads-table
 * sync can be several MB; this keeps that fast instead of hanging the UI.
 */
const BASE64_CHUNK_SIZE = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function headerRecord(headers?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function requestParts(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ url: string; method: string; headers: Record<string, string>; body: string | null }> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const headers = headerRecord(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  let body: string | null = null;
  const raw = init?.body;
  if (raw !== undefined && raw !== null) {
    const buf = raw instanceof ArrayBuffer
      ? new Uint8Array(raw)
      : typeof raw === "string"
        ? new TextEncoder().encode(raw)
        : raw instanceof Uint8Array
          ? raw
          : new Uint8Array(await new Response(raw as BodyInit).arrayBuffer());
    body = bytesToBase64(buf);
  } else if (input instanceof Request && method !== "GET" && method !== "HEAD") {
    body = bytesToBase64(new Uint8Array(await input.arrayBuffer()));
  }
  return { url, method, headers, body };
}

async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return withCloudFetchSlot(async () => {
    if (!isTauriRuntime()) return fetch(input, init);

    const parts = await requestParts(input, init);
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<CloudFetchResult>("cloud_fetch", {
      args: {
        url: parts.url,
        method: parts.method,
        headers: Object.entries(parts.headers),
        body: parts.body,
      },
    });
    return new Response(base64ToBytes(result.body), {
      status: result.status,
      headers: result.headers,
    });
  });
}

export function getSupabase(): SupabaseClient | null {
  const config = supabaseConfig();
  if (!config) return null;
  if (!client) {
    const desktop = isTauriRuntime();
    client = createClient(config.url, config.anonKey, {
      global: { fetch: supabaseFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !desktop,
      },
    });
  }
  return client;
}
