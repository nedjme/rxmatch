// ── Claude extraction output ───────────────────────────────────────────────

/** An item as extracted from the prescription image by Claude. */
export interface ExtractedItem {
  extracted_name: string;
  /** Claude uses "medicine" | "lab_test"; the DB uses "medicament" | "analyse". */
  type: 'medicine' | 'lab_test';
  dose: string | null;
  frequency: string | null;
  confidence: number;
  /** Code hint recognised from decision_history examples, or null. */
  hint: string | null;
}

/** The full JSON object returned by Claude. */
export interface ExtractionResult {
  items:          ExtractedItem[];
  language:       string;
  handwritten:    boolean;
  legibility:     'good' | 'partial' | 'poor';
  notes:          string;
  patient_name:   string | null;
  doctor_name:    string | null;
  prescription_date: string | null;
}

// ── Catalogue matching ─────────────────────────────────────────────────────

export interface CatalogueMatch {
  id:                 string;
  name:               string;
  type:               string;
  code:               string | null;
  synonyms:           string[];
  score:              number;
  from_history:       boolean;
  confirmation_count?: number;
}

// ── API response shapes ────────────────────────────────────────────────────

/** A single prescription_item row enriched with its top-3 catalogue suggestions. */
export interface PrescriptionItemWithSuggestions {
  id:                    string;
  prescription_id:       string;
  extracted_name:        string;
  extracted_dose:        string | null;
  extracted_frequency:   string | null;
  extraction_confidence: number | null;
  suggested_item_id:     string | null;
  matched_item_id:       string | null;
  match_score:           number | null;
  was_overridden:        boolean;
  operator_note:         string | null;
  suggestions:           CatalogueMatch[];
}

/** Shape returned by POST /api/prescriptions/extract. */
export interface ExtractionResponse {
  prescription_id: string;
  extraction:      ExtractionResult;
  items:           PrescriptionItemWithSuggestions[];
}

// ── Commit request ─────────────────────────────────────────────────────────

export interface CommitItem {
  prescription_item_id: string;
  confirmed_item_id:    string;
  was_overridden:       boolean;
  operator_note:        string | null;
}

export interface CommitRequest {
  items: CommitItem[];
}
