'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './treatment-plans.module.css';

export type Service = { id: number; name: string; price: number | null };

/** Lower-case + strip diacritics so "consultaţie" matches "cons". */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type Props = {
  value: string;
  services: Service[];
  disabled?: boolean;
  /** A catalog service was chosen from the list. */
  onPick: (service: Service) => void;
  /** Free-text procedure typed by the user (not in the catalog). */
  onText: (text: string) => void;
};

/**
 * Single-select searchable service combobox — mirrors the appointment modal's
 * ServiceSection picker (same styles + behaviour), scoped to one plan row.
 */
export default function ServicePicker({ value, services, disabled, onPick, onText }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the input in sync when the parent value changes (e.g. service picked
  // elsewhere, row reordered).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    const sorted = [...services].sort((a, b) =>
      normalize(a.name).localeCompare(normalize(b.name), 'ro')
    );
    const q = normalize(query);
    if (!q) return sorted;
    return sorted.filter((s) => normalize(s.name).includes(q));
  }, [services, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (service: Service) => {
    onPick(service);
    setQuery(service.name);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && matches[active]) {
        event.preventDefault();
        choose(matches[active]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  };

  return (
    <div ref={wrapRef} className={styles.serviceComboWrapper}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        className={styles.cellInput}
        value={query}
        placeholder="Caută serviciu sau scrie liber…"
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          onText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && !disabled && (
        <ul ref={listRef} className={styles.serviceComboMenu} role="listbox">
          {matches.length === 0 ? (
            <li className={styles.serviceComboEmpty}>Niciun serviciu găsit</li>
          ) : (
            matches.map((service, idx) => (
              <li
                key={service.id}
                role="option"
                aria-selected={idx === active}
                className={`${styles.serviceComboOption} ${idx === active ? styles.serviceComboOptionActive : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(service);
                }}
                onMouseEnter={() => setActive(idx)}
              >
                <span className={styles.serviceComboOptionName}>{service.name}</span>
                {typeof service.price === 'number' && service.price > 0 && (
                  <span className={styles.serviceComboOptionMeta}>{service.price} lei</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
