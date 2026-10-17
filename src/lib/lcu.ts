import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface LcuStatus {
  connected: boolean;
  port: number | null;
}

export interface LcuEvent<T = unknown> {
  uri: string;
  eventType: "Create" | "Update" | "Delete";
  data: T;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function getLcuStatus(): Promise<LcuStatus> {
  return invoke<LcuStatus>("lcu_status");
}

export function lcuRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  return invoke<T>("lcu_request", { method, path, body: body ?? null });
}

export function onLcuStatus(callback: (status: LcuStatus) => void): Promise<UnlistenFn> {
  return listen<LcuStatus>("lcu-status", (event) => callback(event.payload));
}

export function onLcuEvent(callback: (event: LcuEvent) => void): Promise<UnlistenFn> {
  return listen<LcuEvent>("lcu-event", (event) => callback(event.payload));
}
