'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MobileClientsView from './MobileClientsView';
import { useIsMobile } from '@/lib/useIsMobile';
import { logger } from '@/lib/logger';
import styles from './page.module.css';
import navStyles from '../dashboard/page.module.css';
import PageLoading from '@/components/PageLoading';

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

interface ClientsPageClientProps {
  initialClients: Client[];
  initialPagination: PaginationInfo | null;
  dentistOptions?: Array<{ userId: number; name: string }>;
  initialDentistUserId?: number;
}

export default function ClientsPageClient({
  initialClients,
  initialPagination,
  dentistOptions = [],
  initialDentistUserId,
}: ClientsPageClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [consentFilter, setConsentFilter] = useState<'all' | 'consented' | 'not_consented' | 'withdrawn'>('all');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(initialPagination);
  const [hasFinishedInitialLoad, setHasFinishedInitialLoad] = useState(initialClients.length > 0);
  const [selectedDentistUserId, setSelectedDentistUserId] = useState<number | undefined>(initialDentistUserId);
  const skipInitialFetch = useRef(true);
  const showDentistSelector = dentistOptions.length > 0;

  const fetchClients = useCallback(async (
    currentSearch: string,
    currentSortBy: string,
    currentSortOrder: string,
    currentPage: number,
    currentConsentFilter: string,
    currentDentistUserId?: number,
  ) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(currentSearch && { search: currentSearch }),
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
        page: currentPage.toString(),
        limit: '20',
        consentFilter: currentConsentFilter,
        ...(currentDentistUserId ? { dentistUserId: String(currentDentistUserId) } : {}),
      });

      const response = await fetch(`/api/clients?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch clients');

      const result = await response.json();
      setClients(result.clients || []);
      setPagination(result.pagination || null);
    } catch (error) {
      logger.error('Clients page: failed to fetch clients', error instanceof Error ? error : new Error(String(error)), {
        search: currentSearch,
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
        page: currentPage,
        consentFilter: currentConsentFilter,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchClients(debouncedSearch, sortBy, sortOrder, page, consentFilter, selectedDentistUserId);
  }, [fetchClients, page, debouncedSearch, sortBy, sortOrder, consentFilter, selectedDentistUserId]);

  useEffect(() => {
    let lastRefreshAt = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 500) return;
      lastRefreshAt = now;
      fetchClients(debouncedSearch, sortBy, sortOrder, page, consentFilter, selectedDentistUserId);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchClients, debouncedSearch, sortBy, sortOrder, page, consentFilter, selectedDentistUserId]);

  useEffect(() => {
    if (!loading) {
      setHasFinishedInitialLoad(true);
    }
  }, [loading]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Niciodata';
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
    }).format(amount);
  };

  // ── Mobile branch ────────────────────────────────────────────────────────
  // Phones get a dedicated Google/Apple-style list (search + chip filters +
  // tappable rows + FAB). Desktop keeps the current table layout below.
  const isMobile = useIsMobile();
  const exportHref = `/api/clients/export${selectedDentistUserId ? `?dentistUserId=${selectedDentistUserId}` : ''}`;
  const openCreateClient = () => {
    const suffix = selectedDentistUserId ? `?dentistUserId=${selectedDentistUserId}` : '';
    router.push(`/clients/new${suffix}`);
  };

  if (isMobile) {
    return (
      <div className={navStyles.container}>
        <div className={`${styles.container} ${styles.mobileShell}`}>
          <MobileClientsView
            clients={clients}
            loading={loading}
            hasFinishedInitialLoad={hasFinishedInitialLoad}
            pagination={pagination}
            page={page}
            setPage={setPage}
            search={search}
            onSearchChange={(next) => {
              setSearch(next);
              if (page !== 1) setPage(1);
            }}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(col, order) => {
              setSortBy(col);
              setSortOrder(order);
              if (page !== 1) setPage(1);
            }}
            consentFilter={consentFilter}
            onConsentFilterChange={(next) => {
              setConsentFilter(next);
              if (page !== 1) setPage(1);
            }}
            dentistOptions={dentistOptions}
            selectedDentistUserId={selectedDentistUserId}
            onDentistChange={(next) => {
              setSelectedDentistUserId(next);
              if (page !== 1) setPage(1);
            }}
            showDentistSelector={showDentistSelector}
            exportHref={exportHref}
            onAddClient={openCreateClient}
          />
        </div>

      </div>
    );
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.filtersCard}>
          <div className={styles.filters}>
            {showDentistSelector && (
              <select
                aria-label="Alege dentistul"
                value={selectedDentistUserId ?? ''}
                onChange={(e) => {
                  setSelectedDentistUserId(Number(e.target.value));
                  if (page !== 1) setPage(1);
                }}
                className={styles.filterSelect}
              >
                {dentistOptions.map((dentist) => (
                  <option key={dentist.userId} value={dentist.userId}>
                    Pacientii lui {dentist.name}
                  </option>
                ))}
              </select>
            )}

            <input
              type="text"
              aria-label="Cauta dupa nume, email sau telefon"
              placeholder="Cauta dupa nume, email sau telefon"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (page !== 1) setPage(1);
              }}
              className={styles.searchInput}
            />

            <select
              aria-label="Sorteaza dupa"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [col, order] = e.target.value.split('-');
                setSortBy(col);
                setSortOrder(order as 'ASC' | 'DESC');
                if (page !== 1) setPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="name-ASC">Nume (A-Z)</option>
              <option value="name-DESC">Nume (Z-A)</option>
              <option value="last_activity_date-DESC">Ultima activitate (recent)</option>
              <option value="last_activity_date-ASC">Ultima activitate (vechi)</option>
              <option value="last_appointment_date-DESC">Ultima vizita (recent)</option>
              <option value="last_appointment_date-ASC">Ultima vizita (vechi)</option>
              <option value="total_spent-DESC">Total cheltuit (mare)</option>
              <option value="total_spent-ASC">Total cheltuit (mic)</option>
            </select>

            <select
              aria-label="Filtreaza dupa consimtamant GDPR"
              value={consentFilter}
              onChange={(e) => {
                setConsentFilter(e.target.value as typeof consentFilter);
                if (page !== 1) setPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="all">Toate (GDPR)</option>
              <option value="consented">Cu consimtamant</option>
              <option value="not_consented">Fara consimtamant</option>
              <option value="withdrawn">Consimtamant retras</option>
            </select>

            <a
              href={`/api/clients/export${selectedDentistUserId ? `?dentistUserId=${selectedDentistUserId}` : ''}`}
              download
              className={styles.exportButton}
            >
              Export CSV
            </a>
            <button
              type="button"
              onClick={openCreateClient}
              className={styles.addButton}
            >
              + Adauga pacient
            </button>
          </div>
        </div>

        {loading && !hasFinishedInitialLoad ? (
          <PageLoading />
        ) : clients.length === 0 ? (
          <div className={styles.empty}>
            <p>Nu exista pacienti inregistrati. Apasa 'Adauga primul pacient' pentru a adauga primul pacient.</p>
            <button
              type="button"
              onClick={openCreateClient}
              className={styles.addButton}
            >
              Adauga primul pacient
            </button>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nume</th>
                  <th>Contact</th>
                  <th>Total cheltuit</th>
                  <th>Programari</th>
                  <th>Ultima vizita</th>
                  <th>GDPR</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    className={styles.rowClickable}
                    onClick={() => router.push(`/clients/${client.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/clients/${client.id}`);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <span className={styles.clientName}>{client.name}</span>
                    </td>
                    <td>
                      <div className={styles.contact}>
                        {client.email && <span className={styles.email}>{client.email}</span>}
                        {client.phone && <span className={styles.phone}>{client.phone}</span>}
                        {!client.email && !client.phone && (
                          <span className={styles.noContact}>Fara contact</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={styles.amount}>{formatCurrency(client.total_spent)}</span>
                    </td>
                    <td>{client.total_appointments}</td>
                    <td>{formatDate(client.last_appointment_date)}</td>
                    <td
                      className={`${styles.gdprCell} ${client.consent_withdrawn ? styles.gdprCellWithdrawn : ''}`}
                      aria-label={
                        client.consent_given && !client.consent_withdrawn
                          ? 'Cu consimtamant GDPR'
                          : client.consent_withdrawn
                            ? 'Consimtamant GDPR retras'
                            : 'Fara consimtamant GDPR'
                      }
                      title={
                        client.consent_given && !client.consent_withdrawn
                          ? 'Cu consimtamant'
                          : client.consent_withdrawn
                            ? 'Consimtamant retras'
                            : 'Fara consimtamant'
                      }
                    >
                      {client.consent_given && !client.consent_withdrawn ? (
                        <span style={{ color: 'var(--color-success-text)', fontWeight: 500, fontSize: '0.8rem' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--color-danger-text)', fontWeight: 500, fontSize: '0.8rem' }}>✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className={styles.paginationButton}
            >
              Anterior
            </button>
            <span className={styles.paginationInfo}>
              Pagina {pagination.page} din {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className={styles.paginationButton}
            >
              Urmator
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
