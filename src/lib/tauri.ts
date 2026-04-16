/**
 * Typed wrappers around Tauri commands.
 * All functions gracefully degrade when running in browser (dev without Tauri).
 */
import { invoke } from '@tauri-apps/api/core';
import type { ScannerInfo } from '@/types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── MAC address ───────────────────────────────────────────────────────────

/** Returns the device MAC address, or empty string in browser dev mode. */
export async function getMacAddress(): Promise<string> {
  if (!isTauri) return 'DEV-MAC-PLACEHOLDER';
  return invoke<string>('get_mac_address');
}

// ── Filesystem ────────────────────────────────────────────────────────────

export interface SaveOriginalOptions {
  basePath: string;
  dateStr: string;   // "YYYY-MM-DD"
  filename: string;
  data: Uint8Array;
}

/** Saves the unmasked prescription original to the local filesystem. */
export async function savePrescriptionOriginal(opts: SaveOriginalOptions): Promise<string> {
  if (!isTauri) {
    console.warn('savePrescriptionOriginal: not in Tauri, skipping');
    return '';
  }
  return invoke<string>('save_prescription_original', {
    basePath: opts.basePath,
    dateStr: opts.dateStr,
    filename: opts.filename,
    data: Array.from(opts.data),
  });
}

/** Opens a native folder picker and returns the selected path. */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  return invoke<string | null>('pick_folder');
}

// ── Scanner discovery ─────────────────────────────────────────────────────

/** Returns available hardware scanners from the OS. */
export async function listScanners(): Promise<ScannerInfo[]> {
  if (!isTauri) return [];
  return invoke<ScannerInfo[]>('list_scanners');
}

// ── Phone server ──────────────────────────────────────────────────────────

/** Starts the local HTTP server for phone scan reception. Returns the port. */
export async function startPhoneServer(): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>('start_phone_server');
}

export async function stopPhoneServer(): Promise<void> {
  if (!isTauri) return;
  return invoke<void>('stop_phone_server');
}

export async function getPhoneServerPort(): Promise<number> {
  if (!isTauri) return 0;
  return invoke<number>('get_phone_server_port');
}
