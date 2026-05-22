'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Drawer } from 'vaul';
import m from './MobileClientsView.module.css';
import { gdprStateOf, GDPR_COLOR, GDPR_FULL_LABEL } from '@/lib/client-gdpr';

// Public shape — kept loose because the parent already validates server payloads.
interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
  consent_given?: boolean;
  consent_withdrawn?: boolean;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortKey =
  | 'name-ASC' | 'name-DESC'
  | 'last_activity_date-DESC' | 'last_activity_date-ASC'
  | 'last_appointment_date-DESC' | 'last_appointment_date-ASC'
  | 'total_spent-DESC' | 'total_spent-ASC';

type ConsentFilter = 'all' | 'consented' | 'not_consented' | 'withdrawn';

const SORT_OPTIONS: Array<{ value: SortKey; label: string; shortLabel: string }> = [
  { value: 'name-ASC',                   label: 'Nume (A → Z)',             shortLabel: 'Nume A-Z' },
  { value: 'name-DESC',                  label: 'Nume (Z → A)',             shortLabel: 'Nume Z-A' },
  { value: 'last_activity_date-DESC',    label: 'Activitate — recente',     shortLabel: 'Activitate ↓' },
  { value: 'last_activity_date-ASC',     label: 'Activitate — vechi',       shortLabel: 'Activitate ↑' },
  { value: 'last_appointment_date-DESC', label: 'Ultima vizita — recenta',  shortLabel: 'Vizita ↓' },
  { value: 'last_appointment_date-ASC',  label: 'Ultima vizita — veche',    shortLabel: 'Vizita ↑' },
  { value: 'total_spent-DESC',           label: 'Total cheltuit — mare',    shortLabel: 'Suma ↓' },
  { value: 'total_spent-ASC',            label: 'Total cheltuit — mic',     shortLabel: 'Suma ↑' },
];

const CONSENT_OPTIONS: Array<{ value: ConsentFilter; label: string; shortLabel: string }> = [
  { value: 'all',           label: 'Toti pacientii',            shortLabel: 'GDPR: Toti' },
  { value: 'consented',     label: 'Cu consimtamant GDPR',      shortLabel: 'GDPR: ✓' },
  { value: 'not_consented', label: 'Fara consimtamant GDPR',    shortLabel: 'GDPR: ?' },
  { value: 'withdrawn',     label: 'Consimtamant retras',       shortLabel: 'GDPR: ✗' },
];

// Initials from a name. Falls back to '?' for empty strings.
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// GDPR state → avatar color / aria-label imported from the shared utility so
// the same visual language is used here AND on the patient profile page.

interface MobileClientsViewProps {
  clients: Client[];
  loading: boolean;
  hasFinishedInitialLoad: boolean;
  pagination: PaginationInfo | null;
  page: number;
  setPage: (next: number) => void;

  search: string;
  onSearchChange: (next: string) => void;

  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onSortChange: (sortBy: string, order: 'ASC' | 'DESC') => void;

  consentFilter: ConsentFilter;
  onConsentFilterChange: (next: ConsentFilter) => void;

  dentistOptions: Array<{ userId: number; name: string }>;
  selectedDentistUserId: number | undefined;
  onDentistChange: (next: number) => void;
  showDentistSelector: boolean;

  exportHref: string;
  onAddClient: () => void;
}

type ActiveSheet = 'sort' | 'consent' | 'dentist' | null;

export default function MobileClientsView(props: MobileClientsViewProps) {
  const {
    clients, loading, hasFinishedInitialLoad, pagination, page, setPage,
    search, onSearchChange,
    sortBy, sortOrder, onSortChange,
    consentFilter, onConsentFilterChange,
    dentistOptions, selectedDentistUserId, onDentistChange, showDentistSelector,
    exportHref, onAddClient,
  } = props;

  const router = useRouter();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll while the patients list is mounted — the list scrolls
  // internally and we don't want the body bouncing on iOS overscroll.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, []);

  const sortValue: SortKey = `${sortBy}-${sortOrder}` as SortKey;
  const currentSort = SORT_OPTIONS.find((o) => o.value === sortValue) ?? SORT_OPTIONS[0];
  const currentConsent = CONSENT_OPTIONS.find((o) => o.value === consentFilter) ?? CONSENT_OPTIONS[0];
  const currentDentist = useMemo(
    () => dentistOptions.find((d) => d.userId === selectedDentistUserId) ?? null,
    [dentistOptions, selectedDentistUserId]
  );

  const closeSheets = () => setActiveSheet(null);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={m.shell}>
      {/* ── Top bar: search + overflow ── */}
      <div className={m.topBar}>
        <div className={m.searchBox}>
          <SearchIcon className={m.searchIcon} />
          <input
            type="search"
            className={m.searchInput}
            placeholder="Cauta pacient..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Cauta dupa nume, email sau telefon"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              className={m.searchClear}
              onClick={() => onSearchChange('')}
              aria-label="Sterge cautarea"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          className={m.overflowBtn}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Mai multe optiuni"
          aria-expanded={menuOpen}
        >
          <OverflowIcon />
        </button>
      </div>

      {/* ── Filter chip strip ── */}
      <div className={m.chipStrip} role="tablist" aria-label="Filtre">
        <button
          type="button"
          className={`${m.chip} ${sortValue !== 'name-ASC' ? m.chipActive : ''}`}
          onClick={() => setActiveSheet('sort')}
        >
          {currentSort.shortLabel}
          <CaretDown className={m.chipCaret} />
        </button>
        <button
          type="button"
          className={`${m.chip} ${consentFilter !== 'all' ? m.chipActive : ''}`}
          onClick={() => setActiveSheet('consent')}
        >
          {currentConsent.shortLabel}
          <CaretDown className={m.chipCaret} />
        </button>
        {showDentistSelector && currentDentist && (
          <button
            type="button"
            className={`${m.chip} ${m.chipActive}`}
            onClick={() => setActiveSheet('dentist')}
          >
            Dr. {currentDentist.name.split(' ')[0]}
            <CaretDown className={m.chipCaret} />
          </button>
        )}
      </div>

      {/* ── Result count ── */}
      {pagination && (
        <div className={m.countStrip}>
          {pagination.total} {pagination.total === 1 ? 'pacient' : 'pacienti'}
          {search ? ` pentru "${search}"` : ''}
        </div>
      )}

      {/* ── Scrollable list ── */}
      <div className={m.list}>
        {loading && !hasFinishedInitialLoad ? (
          <div className={m.loadingSkeletons}>
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className={m.skeletonRow}>
                <div className={`skeleton ${m.skeletonAvatar}`} />
                <div className={m.skeletonLines}>
                  <div className="skeleton skeleton-line" style={{ width: '55%', height: '14px' }} />
                  <div className="skeleton skeleton-line" style={{ width: '40%', height: '12px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <div className={m.empty}>
            <div className={m.emptyTitle}>
              {search ? 'Nu am gasit pacienti' : 'Niciun pacient inca'}
            </div>
            <div className={m.emptyHint}>
              {search
                ? 'Incearca un alt nume, email sau telefon.'
                : 'Apasa butonul "+" pentru a adauga primul pacient.'}
            </div>
          </div>
        ) : (
          <>
            {clients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onClick={() => router.push(`/clients/${client.id}`)}
              />
            ))}

            {pagination && pagination.totalPages > 1 && (
              <div className={m.paginationBar}>
                <button
                  type="button"
                  className={m.pagBtn}
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  ← Anterior
                </button>
                <span className={m.pagInfo}>
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  className={m.pagBtn}
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Urmator →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Floating action button ── */}
      <button
        type="button"
        className={m.fab}
        onClick={onAddClient}
        aria-label="Adauga pacient"
      >
        <PlusIcon />
      </button>

      {/* ── Overflow menu ── */}
      {menuOpen && (
        <>
          <div className={m.menuOverlay} onClick={closeMenu} aria-hidden="true" />
          <div className={m.menu} role="menu">
            <a
              href={exportHref}
              download
              className={m.menuItem}
              role="menuitem"
              onClick={closeMenu}
            >
              <DownloadIcon className={m.menuItemIcon} />
              <span>Export CSV</span>
            </a>
          </div>
        </>
      )}

      {/* ── Bottom sheets for sort / filter changes ── */}
      {activeSheet === 'sort' && (
        <OptionSheet
          title="Sorteaza dupa"
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selectedValue={sortValue}
          onSelect={(value) => {
            const [col, order] = value.split('-');
            onSortChange(col, order as 'ASC' | 'DESC');
            closeSheets();
          }}
          onClose={closeSheets}
        />
      )}
      {activeSheet === 'consent' && (
        <OptionSheet
          title="Filtru GDPR"
          options={CONSENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selectedValue={consentFilter}
          onSelect={(value) => {
            onConsentFilterChange(value as ConsentFilter);
            closeSheets();
          }}
          onClose={closeSheets}
        />
      )}
      {activeSheet === 'dentist' && (
        <OptionSheet
          title="Alege medicul"
          options={dentistOptions.map((d) => ({
            value: String(d.userId),
            label: `Pacientii lui ${d.name}`,
          }))}
          selectedValue={String(selectedDentistUserId ?? '')}
          onSelect={(value) => {
            onDentistChange(Number(value));
            closeSheets();
          }}
          onClose={closeSheets}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */

function ClientRow({ client, onClick }: { client: Client; onClick: () => void }) {
  const gdpr = gdprStateOf(client);
  const color = GDPR_COLOR[gdpr];
  const appointments = client.total_appointments ?? 0;

  return (
    <button
      type="button"
      className={m.row}
      onClick={onClick}
    >
      <span
        className={m.avatar}
        style={{
          background: `color-mix(in srgb, ${color} 22%, transparent)`,
          color,
          border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        }}
        aria-label={GDPR_FULL_LABEL[gdpr]}
        title={GDPR_FULL_LABEL[gdpr]}
      >
        {initialsOf(client.name)}
      </span>
      <div className={m.rowMain}>
        <div className={m.rowName}>{client.name || 'Fara nume'}</div>
        {client.phone ? (
          <a
            href={`tel:${client.phone.replace(/\s+/g, '')}`}
            className={m.rowPhone}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Suna ${client.name} la ${client.phone}`}
          >
            <PhoneIcon className={m.rowPhoneIcon} />
            <span>{client.phone}</span>
          </a>
        ) : client.email ? (
          // Fallback when no phone: keep contact visible by surfacing email
          // (tappable to compose). Otherwise the row tells the user nothing
          // about how to reach this patient.
          <a
            href={`mailto:${client.email}`}
            className={m.rowPhone}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Trimite email lui ${client.name} la ${client.email}`}
          >
            <MailIcon className={m.rowPhoneIcon} />
            <span>{client.email}</span>
          </a>
        ) : (
          <span className={m.rowPhoneEmpty}>Fara contact</span>
        )}
      </div>
      {appointments > 0 ? (
        <div className={m.rowCount} aria-label={`${appointments} programari`}>
          <CalendarMiniIcon className={m.rowCountIcon} />
          <span>{appointments}</span>
        </div>
      ) : (
        // Keeps the grid stable when a patient has no appointments yet.
        <span className={m.rowCountEmpty} aria-hidden="true" />
      )}
    </button>
  );
}

/* ── Option bottom sheet ──────────────────────────────────── */

function OptionSheet({
  title, options, selectedValue, onSelect, onClose,
}: {
  title: string;
  options: Array<{ value: string; label: string }>;
  selectedValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      direction="bottom"
      handleOnly
      closeThreshold={0.28}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={m.sheetOverlay} />
        <Drawer.Content
          className={m.sheet}
          aria-label={title}
        >
          <Drawer.Handle className={m.sheetHandle} />
          <Drawer.Title className={m.sheetTitle}>{title}</Drawer.Title>
          <div className={m.sheetList}>
            {options.map((opt) => {
              const isActive = opt.value === selectedValue;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`${m.sheetOption} ${isActive ? m.sheetOptionActive : ''}`}
                  onClick={() => onSelect(opt.value)}
                  role="menuitemradio"
                  aria-checked={isActive}
                >
                  <span>{opt.label}</span>
                  <CheckIcon className={m.sheetOptionCheck} />
                </button>
              );
            })}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Inline icons (stroke style, 18-20px) ─────────────────── */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function OverflowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function CaretDown({ className }: { className?: string }) {
  return (
    <svg className={className} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CalendarMiniIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
