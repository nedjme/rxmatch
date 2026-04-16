/**
 * DevicePicker — discovers hardware scanners and phones on the LAN,
 * then lets the user pick one to scan from.
 *
 * Phone discovery: polls a temp-file trigger written by the Tauri phone server.
 * Hardware scanner: invokes list_scanners Tauri command.
 */
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { listScanners, startPhoneServer, stopPhoneServer } from '@/lib/tauri';
import type { ScannerInfo } from '@/types';

interface Props {
  /** Called with the raw image File when a scan is received */
  onImageReceived: (file: File) => void;
  onCancel: () => void;
}

export default function DevicePicker({ onImageReceived, onCancel }: Props) {
  const [devices, setDevices] = useState<ScannerInfo[]>([]);
  const [phonePort, setPhonePort] = useState<number>(0);
  const [scanning, setScanning] = useState(false);
  const [waitingPhone, setWaitingPhone] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    discover();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      stopPhoneServer();
    };
  }, []);

  async function discover() {
    setScanning(true);
    try {
      // Hardware scanners
      const hw = await listScanners();

      // Start phone server and get port for display
      const port = await startPhoneServer();
      setPhonePort(port);

      // Show phone entry if server started
      const phoneEntry: ScannerInfo[] = port > 0
        ? [{ id: 'phone', name: 'Téléphone (application mobile)', kind: 'phone' }]
        : [];

      setDevices([...hw, ...phoneEntry]);
    } catch (err) {
      toast.error('Erreur lors de la découverte des appareils');
    } finally {
      setScanning(false);
    }
  }

  function handleSelectPhone() {
    setWaitingPhone(true);
    // Poll the trigger file the Rust phone server writes when it receives an image
    pollRef.current = setInterval(checkPhoneTrigger, 500);
  }

  async function checkPhoneTrigger() {
    try {
      // Read the trigger file via Tauri's fs plugin
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const os = await import('@tauri-apps/api/path');
      const tempDir = await os.tempDir();
      const triggerPath = `${tempDir}/rxmatch_phone_trigger`;
      const imagePath = await readTextFile(triggerPath);
      if (!imagePath) return;

      // Clear trigger
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(triggerPath, '');

      // Read the actual image
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const bytes = await readFile(imagePath);
      const file = new File([bytes], 'phone_scan.jpg', { type: 'image/jpeg' });

      if (pollRef.current) clearInterval(pollRef.current);
      setWaitingPhone(false);
      onImageReceived(file);
    } catch {
      // File doesn't exist yet — keep polling
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Sélectionner un appareil</h2>
        <button onClick={onCancel} className="text-navy-400 hover:text-white text-sm">
          Annuler
        </button>
      </div>

      {scanning ? (
        <div className="flex items-center gap-3 text-navy-400 py-8 justify-center">
          <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          Recherche des appareils…
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-10 text-navy-500 space-y-3">
          <p>Aucun appareil détecté.</p>
          <button onClick={discover} className="text-teal-400 hover:text-teal-300 text-sm underline">
            Réessayer
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device) => (
            <button
              key={device.id}
              onClick={() => {
                if (device.kind === 'phone') handleSelectPhone();
                else toast.info('Sélection scanner matériel — non encore implémenté');
              }}
              className="w-full flex items-center gap-4 bg-navy-700 hover:bg-navy-600 border border-navy-600 rounded-xl px-5 py-4 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-navy-600 flex items-center justify-center flex-shrink-0">
                {device.kind === 'phone' ? <PhoneIcon /> : <ScannerIcon />}
              </div>
              <div>
                <div className="text-white font-medium text-sm">{device.name}</div>
                <div className="text-navy-400 text-xs mt-0.5 capitalize">{device.kind}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Phone waiting state */}
      {waitingPhone && (
        <div className="mt-4 p-4 bg-teal-500/10 border border-teal-500/30 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <div className="text-teal-400 font-medium text-sm">En attente du scan…</div>
              {phonePort > 0 && (
                <div className="text-navy-400 text-xs mt-0.5">
                  Ouvrez l'application mobile et appuyez sur Scanner
                  <br />
                  Adresse du serveur : port <span className="text-white font-mono">{phonePort}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => { setWaitingPhone(false); if (pollRef.current) clearInterval(pollRef.current); }}
            className="mt-3 text-xs text-navy-400 hover:text-white underline"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Manual file upload fallback */}
      <div className="pt-2 border-t border-navy-700">
        <label className="text-xs text-navy-500 hover:text-navy-300 cursor-pointer underline">
          Ou importer un fichier image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageReceived(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
function ScannerIcon() {
  return (
    <svg className="w-5 h-5 text-navy-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
    </svg>
  );
}
