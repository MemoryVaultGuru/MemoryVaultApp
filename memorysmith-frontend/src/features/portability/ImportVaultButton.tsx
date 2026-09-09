import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyImport, prepareImport } from '../../shared/api/source';

type Phase = 'idle' | 'uploading' | 'importing' | 'failed';

/**
 * Takes a `.vault` file and makes a vault of it (RN-PRT-012).
 *
 * **The file is uploaded, not posted.** A request body has a ceiling a real
 * vault clears easily, so the client asks for a place to put the file, uploads
 * it there, and then asks for it to be applied — the mirror image of how the
 * export hands an object over by a short-lived URL.
 *
 * An import always creates a NEW vault, so there is nothing to confirm and
 * nothing to overwrite: what a failed import leaves is a vault somebody can
 * delete.
 */
export function ImportVaultButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [failure, setFailure] = useState<string | null>(null);

  async function importFile(file: File): Promise<void> {
    setPhase('uploading');
    setFailure(null);
    try {
      const prepared = await prepareImport();
      const uploaded = await fetch(prepared.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/zip' },
      });
      if (!uploaded.ok) throw new Error('upload failed');

      setPhase('importing');
      // The name of the file is what the vault is called, because the
      // subscription holds each name once and the document may be coming home
      // to the subscription it left (RN-KNW-032).
      const job = await applyImport(prepared.uploadKey, file.name.replace(/\.vault$/i, ''));
      setPhase('idle');
      void navigate(`/vaults/${job.vaultId}`);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : null);
      setPhase('failed');
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".vault,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      <button
        type="button"
        className="vault-nav-link vault-nav-action"
        onClick={() => input.current?.click()}
        disabled={phase === 'uploading' || phase === 'importing'}
      >
        {phase === 'uploading' && t('portability.uploading')}
        {phase === 'importing' && t('portability.importing')}
        {phase === 'failed' && (failure ?? t('portability.importFailed'))}
        {phase === 'idle' && t('portability.import')}
      </button>
    </>
  );
}
