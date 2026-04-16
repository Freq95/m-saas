import { useEffect, useRef } from 'react';
import type { AppointmentFormPayload } from './types';

/**
 * Thin wrapper that calls `onSubmit(payload)` and skips any side-effects
 * after unmount. The parent owns optimism & refetch.
 */
export function useAppointmentSubmit(
  onSubmit: (payload: AppointmentFormPayload) => Promise<void>
) {
  const isMountedRef = useRef(true);
  const onSubmitRef = useRef(onSubmit);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const submit = async (payload: AppointmentFormPayload): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      await onSubmitRef.current(payload);
      if (!isMountedRef.current) return { ok: true };
      return { ok: true };
    } catch (err) {
      if (!isMountedRef.current) return { ok: true };
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Nu am putut salva programarea.',
      };
    }
  };

  return { submit, isMountedRef };
}
