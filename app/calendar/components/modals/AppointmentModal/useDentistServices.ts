import { useEffect, useMemo, useState } from 'react';
import type { AppointmentService, DentistOption } from './types';

interface UseDentistServicesOptions {
  isOpen: boolean;
  calendarId: string;
  ownServices: AppointmentService[];
  currentUserId?: number;
  currentUserDbUserId?: string | null;
}

/**
 * For the selected calendar, loads the bookable dentists and (if a non-self
 * dentist is selected) the services available from that dentist.
 *
 * Services flow:
 * - selected dentist is current user (or none selected) → use `ownServices` (props).
 * - selected dentist is someone else → fetch that dentist's services by calendar.
 */
export function useDentistServices({
  isOpen,
  calendarId,
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

  const [selectedDentistUserId, setSelectedDentistUserId] = useState<string>('');

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
    const n = Number.parseInt(selectedDentistUserId, 10);
    if (!Number.isInteger(n) || n <= 0) return null;
    return dentists.find((d) => d.userId === n) || null;
  }, [dentists, selectedDentistUserId]);

  // Load external services when a non-self dentist is selected
  useEffect(() => {
    if (!isOpen || !calendarIdNum || !selectedDentist || selectedDentist.isCurrentUser) {
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
        const params = new URLSearchParams({
          calendarId: String(calendarIdNum),
          dentistUserId: String(selectedDentist.userId),
        });
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
  }, [isOpen, calendarIdNum, selectedDentist]);

  const effectiveServices = useMemo(
    () => (!selectedDentist || selectedDentist.isCurrentUser ? ownServices : externalServices),
    [ownServices, externalServices, selectedDentist]
  );

  return {
    dentists,
    selectedDentist,
    selectedDentistUserId,
    setSelectedDentistUserId,
    loadingDentists,
    dentistError,
    effectiveServices,
    loadingServices,
    servicesError,
  };
}
