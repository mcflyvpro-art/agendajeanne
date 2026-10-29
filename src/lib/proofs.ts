/**
 * Photos de preuve. Une photo ne sert qu'à la validation : dès que le parent a
 * validé ou renvoyé la tâche, elle est supprimée du stockage pour ne pas
 * l'encombrer. Un ménage quotidien (cron) rattrape les oubliées.
 */
export const PROOF_BUCKET = 'proofs';

/** Chemin dans le bucket, déduit de l'URL publique (`…/proofs/<enfant>/<horodatage>.jpg`). */
export function proofPath(url: string | null | undefined): string | null {
  const m = url?.match(/\/proofs\/([^?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
