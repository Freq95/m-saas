// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsTabs from '@/app/settings/SettingsTabs';

vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'owner' } } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: vi.fn(),
  }),
}));

describe('SettingsTabs', () => {
  beforeEach(() => {
    window.localStorage.clear();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('marks a clicked tab active immediately', () => {
    render(<SettingsTabs activeTab="services" />);

    const emailTab = screen.getByRole('link', { name: 'Email' });
    fireEvent.pointerDown(emailTab);
    expect(emailTab).toHaveAttribute('aria-current', 'page');
  });

  it('reconciles optimistic state when the routed active tab changes', () => {
    const { rerender } = render(<SettingsTabs activeTab="services" />);

    fireEvent.pointerDown(screen.getByRole('link', { name: 'Email' }));
    rerender(<SettingsTabs activeTab="calendars" />);

    expect(screen.getByRole('link', { name: 'Calendare' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Email' })).not.toHaveAttribute('aria-current');
  });
});
