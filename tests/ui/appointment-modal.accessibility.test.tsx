// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentModal } from '@/app/calendar/components/modals/AppointmentModal/AppointmentModal';
import { appointmentFormReducer, buildInitialState } from '@/app/calendar/components/modals/AppointmentModal/reducer';
import { ClientSection } from '@/app/calendar/components/modals/AppointmentModal/sections/ClientSection';
import type { ClientSuggestion } from '@/app/calendar/components/modals/AppointmentModal/types';

const { mockUseClientSuggestions, mockUseDentistServices } = vi.hoisted(() => ({
  mockUseClientSuggestions: vi.fn(),
  mockUseDentistServices: vi.fn(),
}));

vi.mock('@/app/calendar/components/modals/AppointmentModal/useClientSuggestions', () => ({
  useClientSuggestions: mockUseClientSuggestions,
}));

vi.mock('@/app/calendar/components/modals/AppointmentModal/useDentistServices', () => ({
  useDentistServices: mockUseDentistServices,
}));

const suggestionList: ClientSuggestion[] = [
  { id: 1, name: 'Ana Popescu', email: 'ana@example.com', phone: '0700 000 001' },
  { id: 2, name: 'Anca Popescu', email: 'anca@example.com', phone: '0700 000 002' },
];

function ClientSectionHarness(props?: {
  initialName?: string;
  initialSelectedClientId?: number | null;
}) {
  const [clientName, setClientName] = useState(props?.initialName ?? 'Ana');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(
    props?.initialSelectedClientId ?? null
  );

  return (
    <ClientSection
      isOpen
      clientName={clientName}
      clientEmail={clientEmail}
      clientPhone={clientPhone}
      notes={notes}
      selectedClientId={selectedClientId}
      onNameChange={setClientName}
      onFieldChange={(field, value) => {
        if (field === 'clientEmail') setClientEmail(value);
        if (field === 'clientPhone') setClientPhone(value);
        if (field === 'notes') setNotes(value);
      }}
      onApplySuggestion={(suggestion) => {
        setSelectedClientId(suggestion.id);
        setClientName(suggestion.name);
        setClientEmail(suggestion.email || '');
        setClientPhone(suggestion.phone || '');
      }}
      onClearLink={() => setSelectedClientId(null)}
      disabled={false}
      readOnly={false}
    />
  );
}

describe('ClientSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    mockUseDentistServices.mockImplementation(({ ownServices }: { ownServices: unknown[] }) => ({
      dentists: [],
      selectedDentist: null,
      selectedDentistUserId: '',
      setSelectedDentistUserId: vi.fn(),
      loadingDentists: false,
      dentistError: null,
      effectiveServices: ownServices,
      loadingServices: false,
      servicesError: null,
    }));
  });

  it('supports keyboard navigation and selection in the autocomplete dropdown', () => {
    mockUseClientSuggestions.mockImplementation(({ query }: { query: string }) => ({
      suggestions: query.trim().length >= 2 ? suggestionList : [],
      loading: false,
      error: null,
      resolvedQuery: query.trim(),
      hasExactNameMatch: false,
      exactMatch: null,
    }));

    render(<ClientSectionHarness initialName="Ana" />);

    const input = screen.getByLabelText('Nume client *');
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Client existent:/)).toBeInTheDocument();
  });

  it('loads recent patients on focus with an empty query', () => {
    mockUseClientSuggestions.mockImplementation(({ query }: { query: string }) => ({
      suggestions: query.trim() === '' ? suggestionList : [],
      loading: false,
      error: null,
      resolvedQuery: query.trim(),
      hasExactNameMatch: false,
      exactMatch: null,
    }));

    render(<ClientSectionHarness initialName="" />);

    const input = screen.getByLabelText('Nume client *');
    fireEvent.focus(input);

    expect(mockUseClientSuggestions).toHaveBeenLastCalledWith(expect.objectContaining({
      isOpen: true,
      query: '',
    }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Ana Popescu')).toBeInTheDocument();
  });

  it('re-focuses the input and reopens suggestions after clearing a linked client', () => {
    mockUseClientSuggestions.mockImplementation(({ query }: { query: string }) => ({
      suggestions: query.trim().length >= 2 ? suggestionList : [],
      loading: false,
      error: null,
      resolvedQuery: query.trim(),
      hasExactNameMatch: false,
      exactMatch: null,
    }));

    render(
      <ClientSectionHarness initialName="Ana Popescu" initialSelectedClientId={1} />
    );

    fireEvent.click(screen.getByLabelText('Deconecteaza clientul existent'));

    const input = screen.getByLabelText('Nume client *');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('hides the new-client badge while the next query is still resolving', () => {
    mockUseClientSuggestions.mockImplementation(({ query }: { query: string }) => {
      const trimmed = query.trim();
      if (trimmed === 'Ana') {
        return {
          suggestions: [],
          loading: false,
          error: null,
          resolvedQuery: 'Ana',
          hasExactNameMatch: false,
          exactMatch: null,
        };
      }

      return {
        suggestions: [],
        loading: true,
        error: null,
        resolvedQuery: '',
        hasExactNameMatch: false,
        exactMatch: null,
      };
    });

    render(<ClientSectionHarness initialName="Ana" />);

    expect(screen.getByText('Client nou — va fi creat la salvare')).toBeInTheDocument();

    const input = screen.getByLabelText('Nume client *');
    fireEvent.change(input, { target: { value: 'Anamaria' } });

    expect(screen.queryByText('Client nou — va fi creat la salvare')).not.toBeInTheDocument();
  });
});

describe('appointmentFormReducer', () => {
  it('clears stale patient linkage when the calendar changes', () => {
    const state = buildInitialState({
      initialData: {
        calendarId: 1,
        clientId: 42,
        clientName: 'Ana Popescu',
        clientEmail: 'ana@example.com',
        clientPhone: '0700 000 001',
        dentistUserId: 7,
        serviceId: '3',
        startTime: '2026-04-10T09:00:00.000Z',
        endTime: '2026-04-10T09:30:00.000Z',
        notes: '',
      },
    });

    const next = appointmentFormReducer(state, { type: 'SET_CALENDAR', calendarId: '2' });

    expect(next.calendarId).toBe('2');
    expect(next.dentistUserId).toBe('');
    expect(next.serviceId).toBe('');
    expect(next.clientName).toBe('');
    expect(next.clientEmail).toBe('');
    expect(next.clientPhone).toBe('');
    expect(next.selectedClientId).toBeNull();
    expect(next.forceNewClient).toBe(false);
  });

  it('clears stale service and patient linkage when the dentist changes', () => {
    const state = buildInitialState({
      initialData: {
        calendarId: 1,
        clientId: 42,
        clientName: 'Ana Popescu',
        clientEmail: 'ana@example.com',
        clientPhone: '0700 000 001',
        dentistUserId: 7,
        serviceId: '3',
        startTime: '2026-04-10T09:00:00.000Z',
        endTime: '2026-04-10T09:30:00.000Z',
        notes: '',
      },
    });

    const next = appointmentFormReducer(state, { type: 'SET_DENTIST', dentistUserId: '8' });

    expect(next.calendarId).toBe('1');
    expect(next.dentistUserId).toBe('8');
    expect(next.serviceId).toBe('');
    expect(next.clientName).toBe('');
    expect(next.clientEmail).toBe('');
    expect(next.clientPhone).toBe('');
    expect(next.selectedClientId).toBeNull();
    expect(next.forceNewClient).toBe(false);
  });
});

describe('AppointmentModal', () => {
  const selectedSlot = {
    start: new Date('2026-03-06T09:00:00.000Z'),
    end: new Date('2026-03-06T09:30:00.000Z'),
  };
  const baseServices = [
    { id: 1, name: 'Consultatie', duration_minutes: 30, price: 120 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDentistServices.mockImplementation(({ ownServices }: { ownServices: unknown[] }) => ({
      dentists: [],
      selectedDentist: null,
      selectedDentistUserId: '',
      setSelectedDentistUserId: vi.fn(),
      loadingDentists: false,
      dentistError: null,
      effectiveServices: ownServices,
      loadingServices: false,
      servicesError: null,
    }));
  });

  it('closes the dropdown before closing the modal on Escape', () => {
    const onClose = vi.fn();
    mockUseClientSuggestions.mockImplementation(({ query }: { query: string }) => ({
      suggestions: query.trim().length >= 2 ? suggestionList : [],
      loading: false,
      error: null,
      resolvedQuery: query.trim(),
      hasExactNameMatch: false,
      exactMatch: null,
    }));

    render(
      <AppointmentModal
        isOpen
        mode="create"
        selectedSlot={selectedSlot}
        services={baseServices}
        calendarOptions={[{ id: 1, name: 'Cabinet 1', color: '#000', isOwn: true }]}
        activeCalendarId={1}
        initialData={{
          clientName: 'Ana',
          serviceId: '1',
          startTime: selectedSlot.start.toISOString(),
          endTime: selectedSlot.end.toISOString(),
        }}
        onClose={onClose}
        onSubmit={vi.fn(async () => undefined)}
      />
    );

    const input = screen.getByLabelText('Nume client *');
    fireEvent.focus(input);

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the no-calendar message and disables submit when no writable calendars exist', () => {
    mockUseClientSuggestions.mockReturnValue({
      suggestions: [],
      loading: false,
      error: null,
      resolvedQuery: '',
      hasExactNameMatch: false,
      exactMatch: null,
    });

    render(
      <AppointmentModal
        isOpen
        mode="create"
        selectedSlot={selectedSlot}
        services={baseServices}
        calendarOptions={[]}
        initialData={{
          clientName: 'Maria Ionescu',
          serviceId: '1',
          startTime: selectedSlot.start.toISOString(),
          endTime: selectedSlot.end.toISOString(),
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );

    expect(
      screen.getAllByText('Nu exista calendare disponibile pentru creare.')[0]
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salveaza' })).toBeDisabled();
  });

  it('scopes patient suggestions to the selected calendar', () => {
    mockUseClientSuggestions.mockReturnValue({
      suggestions: [],
      loading: false,
      error: null,
      resolvedQuery: '',
      hasExactNameMatch: false,
      exactMatch: null,
    });

    render(
      <AppointmentModal
        isOpen
        mode="create"
        selectedSlot={selectedSlot}
        services={baseServices}
        calendarOptions={[
          { id: 1, name: 'Calendarul meu', color: '#000', isOwn: true },
          { id: 2, name: 'Calendar partajat', color: '#111', isOwn: false },
        ]}
        activeCalendarId={1}
        initialData={{
          calendarId: 1,
          clientName: 'Ana',
          serviceId: '1',
          startTime: selectedSlot.start.toISOString(),
          endTime: selectedSlot.end.toISOString(),
        }}
        onClose={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
      />
    );

    expect(mockUseClientSuggestions).toHaveBeenLastCalledWith(expect.objectContaining({
      calendarId: 1,
      query: 'Ana',
    }));

    fireEvent.change(screen.getByLabelText('Calendar *'), { target: { value: '2' } });

    expect(mockUseClientSuggestions).toHaveBeenLastCalledWith(expect.objectContaining({
      calendarId: 2,
      query: '',
    }));
    expect(screen.getByLabelText('Nume client *')).toHaveValue('');
  });
});
