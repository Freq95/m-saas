// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateAppointmentModal } from '@/app/calendar/components/modals/CreateAppointmentModal';

describe('CreateAppointmentModal ESC priority', () => {
  const selectedSlot = {
    start: new Date('2026-03-06T09:00:00.000Z'),
    end: new Date('2026-03-06T09:30:00.000Z'),
  };

  const baseProps = {
    isOpen: true,
    selectedSlot,
    services: [
      { id: 1, name: 'Consultatie', duration_minutes: 30, price: 120 },
      { id: 2, name: 'Detartraj', duration_minutes: 60, price: 300 },
    ],
    onSubmit: vi.fn(async () => undefined),
    onClose: vi.fn(),
  };

  it('closes inner picker before closing the modal itself on Escape', () => {
    const onClose = vi.fn();
    render(<CreateAppointmentModal {...baseProps} onClose={onClose} />);

    const serviceToggle = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-haspopup') === 'dialog' && /consultatie/i.test(button.textContent || ''));
    expect(serviceToggle).toBeTruthy();
    fireEvent.click(serviceToggle!);
    expect(screen.getByRole('dialog', { name: 'Selecteaza serviciul' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Selecteaza serviciul' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
