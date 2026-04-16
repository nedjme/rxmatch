import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ExtractionResult } from '@/types';

const MODEL_NORMAL = import.meta.env.VITE_GOOGLE_MODEL ?? 'gemini-2.0-flash';
const MODEL_ESCALATION = import.meta.env.VITE_GOOGLE_ESCALATION_MODEL ?? 'gemini-2.0-flash';

// ── System prompt (lab-only) ───────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a medical prescription parser for a CLINICAL LABORATORY in North Africa (Algeria, Morocco, Tunisia).
Extract ONLY laboratory tests from the prescription image. Ignore medicines entirely.

## Output format
Return ONLY valid JSON — no markdown, no explanation:
{
  "items": [
    {
      "extracted_name": "lab test name exactly as written",
      "type": "lab_test",
      "confidence": 0.0 to 1.0,
      "hint": "catalogue item code if recognised from history examples, otherwise null"
    }
  ],
  "language": "fr" or "ar" or "en",
  "handwritten": true or false,
  "legibility": "good" or "partial" or "poor",
  "notes": "brief observations"
}

## Common French lab test abbreviations
- NFS / FSC = Numération Formule Sanguine (CBC)
- VS = Vitesse de Sédimentation
- CRP = Protéine C-Réactive
- TP / TCA = bilan de coagulation
- ASAT / ALAT / GGT / PAL = bilan hépatique
- Créatinine, Urée, Ionogramme = bilan rénal
- TSH, T3, T4 = bilan thyroïdien
- ECBU = Examen Cytobactériologique des Urines
- BU = Bandelette Urinaire
- HBA1C, Glycémie = bilan diabète
- Cholestérol, Triglycérides, HDL, LDL = bilan lipidique
- NFS + VS + CRP = bilan inflammatoire
- Sérologie (hépatite, HIV, TPHA/VDRL) = bilan sérologique
- Hémogramme = synonyme de NFS
- Bilan préopératoire = NFS + TP + TCA + Groupe sanguin + glycémie + créatinine

## Common Arabic lab test names
- تحليل الدم / صورة دم كاملة = NFS
- تحليل البول = ECBU / BU
- سكر الدم / جلوكوز = Glycémie
- وظائف الكبد = bilan hépatique
- وظائف الكلى = bilan rénal
- هرمونات الغدة الدرقية = bilan thyroïdien
- سرعة الترسب = VS
- بروتين سي التفاعلي = CRP

## Rules
- If a name is ambiguous between a medicine and a lab test, prefer lab_test
- Set legibility "poor" if >30% of items have confidence < 0.5
- Set legibility "partial" if 1–30% of items have confidence < 0.5
- Confidence: 0.9–1.0 clear print, 0.7–0.9 minor uncertainty, 0.5–0.7 handwritten legible, 0.3–0.5 hard to read, 0.0–0.3 guessed`;

// ── JSON repair ───────────────────────────────────────────────────────────

function repairJson(raw: string): string {
  try { JSON.parse(raw); return raw; } catch { /* fall through */ }

  let s = raw.trimEnd();

  // Close unclosed string
  let inString = false, escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') inString = !inString;
  }
  if (inString) s += '"';

  // Close unclosed arrays/objects
  const stack: string[] = [];
  inString = false; escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }
  return s;
}

// ── History row type ──────────────────────────────────────────────────────

interface HistoryRow {
  extracted_name: string;
  matched_item_name: string;
  matched_item_code: string | null;
  confirmation_count: number;
}

// ── Gemini call ───────────────────────────────────────────────────────────

async function callGemini(
  modelName: string,
  base64Image: string,
  mimeType: string,
  history: HistoryRow[],
): Promise<string> {
  const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY as string;
  if (!apiKey) throw new Error('VITE_GOOGLE_AI_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { maxOutputTokens: 8192, temperature: 0.1 },
  });

  let userText = 'Extract all laboratory tests from this prescription image.';
  if (history.length > 0) {
    userText += '\n\nPreviously confirmed name mappings (use as hints):';
    for (const h of history) {
      userText += `\n- "${h.extracted_name}" → ${h.matched_item_name} (code: ${h.matched_item_code ?? 'N/A'}, confirmed ${h.confirmation_count}×)`;
    }
  }

  const result = await model.generateContent([
    { inlineData: { data: base64Image, mimeType } },
    userText,
  ]);

  return result.response.text();
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Extracts lab tests from a prescription image (base64).
 * Escalates to a more capable model on poor/partial legibility.
 * Returns the parsed ExtractionResult and which model was used.
 */
export async function extractPrescription(
  base64Image: string,
  mimeType: string,
  history: HistoryRow[],
): Promise<{ extraction: ExtractionResult; modelUsed: string }> {
  // Normal pass
  let rawText = await callGemini(MODEL_NORMAL, base64Image, mimeType, history);
  let modelUsed = 'normal';

  const parse = (text: string): ExtractionResult => {
    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    return JSON.parse(repairJson(stripped)) as ExtractionResult;
  };

  let extraction = parse(rawText);
  if (!Array.isArray(extraction.items)) extraction.items = [];

  // Escalate on poor quality
  const needsEscalation =
    extraction.legibility === 'poor' ||
    (extraction.legibility === 'partial' &&
      extraction.items.some((i) => i.confidence < 0.5));

  if (needsEscalation) {
    try {
      const escalatedText = await callGemini(MODEL_ESCALATION, base64Image, mimeType, history);
      const escalated = parse(escalatedText);
      if (Array.isArray(escalated.items) && escalated.items.length > 0) {
        extraction = escalated;
        modelUsed = 'escalated';
      }
    } catch {
      // Keep normal result if escalation fails
    }
  }

  return { extraction, modelUsed };
}
