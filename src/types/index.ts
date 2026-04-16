// ── Auth / Profile ─────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  full_name: string | null;
  mac_address: string | null;
  created_at: string;
}

// Phone devices are not pre-registered — any phone on the same LAN
// with the mobile app can send scans to the desktop's local HTTP server.

export interface UserSettings {
  user_id: string;
  local_save_enabled: boolean;
  local_save_folder: string | null;
  updated_at: string;
}

// ── Catalogue ──────────────────────────────────────────────────────────────

export interface CatalogueItem {
  id: string;
  name: string;
  code: string | null;
  synonyms: string[];
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CatalogueRequest {
  id: string;
  user_id: string;
  name: string;
  code: string | null;
  synonyms: string[];
  category: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
}

// ── Prescriptions ──────────────────────────────────────────────────────────

export interface Prescription {
  id: string;
  user_id: string;
  image_url: string;
  raw_extraction: ExtractionResult | null;
  status: 'en_attente' | 'en_cours' | 'validee';
  masked: boolean;
  created_at: string;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  extracted_name: string;
  extraction_confidence: number | null;
  suggested_item_id: string | null;
  matched_item_id: string | null;
  match_score: number | null;
  was_overridden: boolean;
  operator_note: string | null;
  created_at: string;
}

// ── Extraction ─────────────────────────────────────────────────────────────

export interface ExtractedItem {
  extracted_name: string;
  type: 'lab_test';
  confidence: number;
  /** Code hint from decision_history, or null */
  hint: string | null;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  language: string;
  handwritten: boolean;
  legibility: 'good' | 'partial' | 'poor';
  notes: string;
}

// ── Catalogue matching ─────────────────────────────────────────────────────

export interface CatalogueMatch {
  id: string;
  name: string;
  code: string | null;
  synonyms: string[];
  category: string | null;
  score: number;
  from_history: boolean;
  confirmation_count?: number;
}

export interface PrescriptionItemWithSuggestions extends PrescriptionItem {
  suggestions: CatalogueMatch[];
}

// ── Commit ─────────────────────────────────────────────────────────────────

export interface CommitItem {
  prescription_item_id: string;
  confirmed_item_id: string;
  was_overridden: boolean;
  operator_note: string | null;
}

// ── Devices ────────────────────────────────────────────────────────────────

export interface ScannerInfo {
  id: string;
  name: string;
  kind: 'hardware' | 'phone';
  address?: string;
}
