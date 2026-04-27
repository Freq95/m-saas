import { useEffect, useMemo, useState } from 'react';
import type { AppointmentService, DentistOption } from './types';

interface UseDentistServicesOptions {
  isOpen: boolean;
  calendarId: string;
  dentistUserId: string;
  ownServices: AppointmentService[];
  currentUserId?: number;
  currentUserDbUserId?: string | null;
}

/**
 * Loads the bookable dentists for the selected calendar and the service catalog
 * for the selected dentist. When no dentist is selected, falls back to the
 * calendar owner's services.
 */
export function useDentistServices({
  isOpen,
  calendarId,
  dentistUserId,
  ownServices,
  currentUserId,
  currentUserDbUserId,
}: UseDentistServicesOptions) {
  const [dentists, setDentists] = useState<DentistOption[]>([]);
  const [loadingDentists, setLoadingDentists] = useState(false);
  const [dentistError, setDentistError] = useState<string | null>(null);

  const [externalServices, setExternalServices] = useState<AppointmentService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const fallbackSelfDentist: DentistOption | null = useMemo(() => {
    if (!currentUserId || !currentUserDbUserId) return null;
    return {
      userId: currentUserId,
      dbUserId: currentUserDbUserId,
      displayName: 'Profilul tau',
      isOwner: true,
      isCurrentUser: true,
    };
  }, [currentUserId, currentUserDbUserId]);

  const calendarIdNum = useMemo(() => {
    const n = Number.parseInt(calendarId, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [calendarId]);

  const dentistUserIdNum = useMemo(() => {
    const n = Number.parseInt(dentistUserId, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [dentistUserId]);

  // Load dentists when calendar changes
  useEffect(() => {
    if (!isOpen || !calendarIdNum) {
      setDentists(fallbackSelfDentist ? [fallbackSelfDentist] : []);
      setDentistError(null);
      setLoadingDentists(false);
      return;
    }

    const controller = new AbortController();
    setLoadingDentists(true);
    setDentistError(null);

    (async () => {
      try {
        const res = await fetch(`/api/calendars/${calendarIdNum}/dentists`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || 'Nu am putut incarca lista dentistilor.');
        }
        if (!controller.signal.aborted) {
          setDentists(Array.isArray(payload?.dentists) ? payload.dentists : []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setDentists(fallbackSelfDentist ? [fallbackSelfDentist] : []);
        setDentistError(
          err instanceof Error ? err.message : 'Nu am putut incarca lista dentistilor.'
        );
      } finally {
        if (!controller.signal.aborted) setLoadingDentists(false);
      }
    })();

    return () => controller.abort();
  }, [isOpen, calendarIdNum, fallbackSelfDentist]);

  const selectedDentist = useMemo<DentistOption | null>(() => {
    const n = Number.parseInt(dentistUserId, 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    return dentists.find((d) => d.userId === n) || null;
  }, [dentists, dentistUserId]);

  // Load services for the selected dentist. Falls back to the calendar owner
  // when no dentist is explicitly chosen.
  useEffect(() => {
    if (!isOpen || !calendarIdNum) {
      setExternalServices([]);
      setLoadingServices(false);
      setServicesError(null);
      return;
    }

    const controller = new AbortController();
    setLoadingServices(true);
    setServicesError(null);

    (async () => {
      try {
        const params = new URLSearchParams({ calendarId: String(calendarIdNum) });
        if (dentistUserIdNum) {
          params.set('dentistUserId', String(dentistUserIdNum));
        }
        const res = await fetch(`/api/services?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || 'Nu am putut incarca serviciile.');
        }
        if (!controller.signal.aborted) {
          setExternalServices(Array.isArray(payload?.services) ? payload.services : []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setExternalServices([]);
        setServicesError(err instanceof Error ? err.message : 'Nu am putut incarca serviciile.');
      } finally {
        if (!controller.signal.aborted) setLoadingServices(false);
      }
    })();

    return () => controller.abort();
  }, [isOpen, calendarIdNum, dentistUserIdNum]);

  const effectiveServices = useMemo(
    () => (calendarIdNum ? externalServices : ownServices),
    [calendarIdNum, externalServices, ownServices]
  );

  return {
    dentists,
    selectedDentist,
    loadingDentists,
    dentistError,
    effectiveServices,
    loadingServices,
    servicesError,
  };
}
