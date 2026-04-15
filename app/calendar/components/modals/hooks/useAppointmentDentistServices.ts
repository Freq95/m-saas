'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AppointmentService, DentistOption } from '../appointment-modal.types';

const FALLBACK_DENTIST_COLOR = '#2563EB';

interface UseAppointmentDentistServicesOptions {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  selectedCalendarId: string;
  currentUserId?: number;
  currentUserDbUserId?: string | null;
  initialDentistUserId?: number;
  initialDentistDisplayName?: string;
  selectedCalendarColor?: string | null;
  services: AppointmentService[];
}

function buildFallbackSelfDentist(options: {
  currentUserId?: number;
  currentUserDbUserId?: string | null;
  selectedCalendarColor?: string | null;
}): DentistOption | null {
  if (!options.currentUserId || !options.currentUserDbUserId) {
    return null;
  }

  return {
    userId: options.currentUserId,
    dbUserId: options.currentUserDbUserId,
    displayName: 'Profilul tau',
    dentistColor: options.selectedCalendarColor || FALLBACK_DENTIST_COLOR,
    providerId: null,
    isOwner: true,
    isCurrentUser: true,
  };
}

export function useAppointmentDentistServices({
  isOpen,
  mode,
  selectedCalendarId,
  currentUserId,
  currentUserDbUserId,
  initialDentistUserId,
  initialDentistDisplayName,
  selectedCalendarColor,
  services,
}: UseAppointmentDentistServicesOptions) {
  const [dentistOptions, setDentistOptions] = useState<DentistOption[]>([]);
  const [selectedDentistUserId, setSelectedDentistUserId] = useState('');
  const [loadingDentists, setLoadingDentists] = useState(false);
  const [dentistError, setDentistError] = useState('');
  const [externalServices, setExternalServices] = useState<AppointmentService[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [servicesError, setServicesError] = useState('');

  const fallbackSelfDentist = useMemo(
    () => buildFallbackSelfDentist({
      currentUserId,
      currentUserDbUserId,
      selectedCalendarColor,
    }),
    [currentUserDbUserId, currentUserId, selectedCalendarColor]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDentistOptions([]);
    setSelectedDentistUserId(initialDentistUserId ? String(initialDentistUserId) : '');
    setLoadingDentists(false);
    setDentistError('');
    setExternalServices([]);
    setLoadingServices(false);
    setServicesError('');
  }, [initialDentistUserId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selectedCalendarNumericId = Number.parseInt(selectedCalendarId, 10);
    if (!Number.isInteger(selectedCalendarNumericId) || selectedCalendarNumericId <= 0) {
      setDentistOptions(fallbackSelfDentist ? [fallbackSelfDentist] : []);
      setLoadingDentists(false);
      setDentistError('');
      return;
    }

    const controller = new AbortController();

    const loadDentists = async () => {
      try {
        setLoadingDentists(true);
        setDentistError('');

        const response = await fetch(`/api/calendars/${selectedCalendarNumericId}/dentists`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || 'Nu am putut incarca lista dentistilor.');
        }

        if (!controller.signal.aborted) {
          setDentistOptions(Array.isArray(result?.dentists) ? result.dentists : []);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setDentistOptions(fallbackSelfDentist ? [fallbackSelfDentist] : []);
        setDentistError(error instanceof Error ? error.message : 'Nu am putut incarca lista dentistilor.');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDentists(false);
        }
      }
    };

    void loadDentists();
    return () => controller.abort();
  }, [fallbackSelfDentist, isOpen, selectedCalendarId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (mode !== 'create' && initialDentistUserId) {
      setSelectedDentistUserId(String(initialDentistUserId));
      return;
    }

    if (dentistOptions.length === 0) {
      if (fallbackSelfDentist) {
        setSelectedDentistUserId(String(fallbackSelfDentist.userId));
      }
      return;
    }

    if (dentistOptions.some((option) => String(option.userId) === selectedDentistUserId)) {
      return;
    }

    const preferredDentist = dentistOptions.find((option) => option.isCurrentUser) || dentistOptions[0];
    setSelectedDentistUserId(preferredDentist ? String(preferredDentist.userId) : '');
  }, [
    dentistOptions,
    fallbackSelfDentist,
    initialDentistUserId,
    isOpen,
    mode,
    selectedDentistUserId,
  ]);

  const selectedDentist = useMemo(() => {
    const selectedId = Number.parseInt(selectedDentistUserId, 10);
    if (Number.isInteger(selectedId) && selectedId > 0) {
      return dentistOptions.find((option) => option.userId === selectedId) || null;
    }

    return initialDentistUserId && initialDentistDisplayName
      ? {
          userId: initialDentistUserId,
          dbUserId: currentUserDbUserId || '',
          displayName: initialDentistDisplayName,
          dentistColor: selectedCalendarColor || FALLBACK_DENTIST_COLOR,
          providerId: null,
          isOwner: false,
          isCurrentUser: initialDentistUserId === currentUserId,
        }
      : fallbackSelfDentist;
  }, [
    currentUserDbUserId,
    currentUserId,
    dentistOptions,
    fallbackSelfDentist,
    initialDentistDisplayName,
    initialDentistUserId,
    selectedCalendarColor,
    selectedDentistUserId,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!selectedDentist || selectedDentist.isCurrentUser) {
      setExternalServices([]);
      setLoadingServices(false);
      setServicesError('');
      return;
    }

    const selectedCalendarNumericId = Number.parseInt(selectedCalendarId, 10);
    if (!Number.isInteger(selectedCalendarNumericId) || selectedCalendarNumericId <= 0) {
      setExternalServices([]);
      setLoadingServices(false);
      setServicesError('');
      return;
    }

    const controller = new AbortController();

    const loadServices = async () => {
      try {
        setLoadingServices(true);
        setServicesError('');

        const params = new URLSearchParams({
          calendarId: String(selectedCalendarNumericId),
          dentistUserId: String(selectedDentist.userId),
        });
        const response = await fetch(`/api/services?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(result?.error || 'Nu am putut incarca serviciile pentru dentistul selectat.');
        }

        if (!controller.signal.aborted) {
          setExternalServices(Array.isArray(result?.services) ? result.services : []);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setExternalServices([]);
        setServicesError(
          error instanceof Error
            ? error.message
            : 'Nu am putut incarca serviciile pentru dentistul selectat.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingServices(false);
        }
      }
    };

    void loadServices();
    return () => controller.abort();
  }, [isOpen, selectedCalendarId, selectedDentist]);

  const effectiveServices = useMemo(
    () => (selectedDentist?.isCurrentUser || !selectedDentist ? services : externalServices),
    [externalServices, selectedDentist, services]
  );

  return {
    dentistOptions,
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
