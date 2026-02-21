'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ClientCreateModal from '@/components/ClientCreateModal';
import { logger } from '@/lib/logger';
import styles from './page.module.css';
import navStyles from '../dashboard/page.module.css';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
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
}

export default function ClientsPageClient({
  initialClients,
  initialPagination,
}: ClientsPageClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('last_activity_date');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(initialPagination);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hasFinishedInitialLoad, setHasFinishedInitialLoad] = useState(initialClients.length > 0);
  const skipInitialFetch = useRef(true);

  const fetchClients = useCallback(async (
    currentSearch: string,
    currentSortBy: string,
    currentSortOrder: string,
    currentPage: number,
  ) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        ...(currentSearch && { search: currentSearch }),
        sortBy: currentSortBy,
        sortOrder: currentSortOrder,
        page: currentPage.toString(),
        limit: '20',
      });

      const response = await fetch(`/api/clients?${params}`);
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
    fetchClients(debouncedSearch, sortBy, sortOrder, page);
  }, [fetchClients, page, debouncedSearch, sortBy, sortOrder]);

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

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>CRM</p>
            <h1>Clienti</h1>
          </div>
          <div className={styles.headerActions}>
            <a href="/api/clients/export" download className={styles.exportButton}>
              Export CSV
            </a>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className={styles.addButton}
            >
              Adauga client
            </button>
          </div>
        </header>

        <div className={styles.filtersCard}>
          <div className={styles.filters}>
            <input
              type="text"
              placeholder="Cauta dupa nume, email sau telefon"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (page !== 1) setPage(1);
              }}
              className={styles.searchInput}
            />

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [col, order] = e.target.value.split('-');
                setSortBy(col);
                setSortOrder(order as 'ASC' | 'DESC');
                if (page !== 1) setPage(1);
              }}
              className={styles.filterSelect}
            >
              <option value="last_activity_date-DESC">Ultima activitate (recent)</option>
              <option value="last_activity_date-ASC">Ultima activitate (vechi)</option>
              <option value="last_appointment_date-DESC">Ultima vizita (recent)</option>
              <option value="last_appointment_date-ASC">Ultima vizita (vechi)</option>
              <option value="total_spent-DESC">Total cheltuit (mare)</option>
              <option value="total_spent-ASC">Total cheltuit (mic)</option>
              <option value="name-ASC">Nume (A-Z)</option>
              <option value="name-DESC">Nume (Z-A)</option>
            </select>
          </div>
        </div>

        {loading && !hasFinishedInitialLoad ? (
          <div className={styles.tableContainer} style={{ padding: '1rem' }}>
            <div className="skeleton-stack">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="skeleton skeleton-line" style={{ height: '20px', width: '100%' }} />
              ))}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className={styles.empty}>
            <p>Nu exista clienti.</p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className={styles.addButton}
            >
              Adauga primul client
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

        <ClientCreateModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(client) => {
            setShowCreateModal(false);
            router.push(`/clients/${client.id}`);
          }}
        />
      </div>
    </div>
  );
}
