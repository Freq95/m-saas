'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import navStyles from '../dashboard/page.module.css';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  tags: string[];
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
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('last_activity_date');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(initialPagination);
  const skipInitialFetch = useRef(true);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchClients();
  }, [search, statusFilter, sourceFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, sourceFilter, sortBy, sortOrder]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        userId: '1',
        ...(search && { search }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(sourceFilter !== 'all' && { source: sourceFilter }),
        sortBy,
        sortOrder,
        page: page.toString(),
        limit: '20',
      });

      const response = await fetch(`/api/clients?${params}`);
      if (!response.ok) throw new Error('Failed to fetch clients');

      const result = await response.json();
      setClients(result.clients || []);
      setPagination(result.pagination || null);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Niciodată';
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'vip':
        return styles.badgeVip;
      case 'active':
        return styles.badgeActive;
      case 'lead':
        return styles.badgeLead;
      case 'inactive':
        return styles.badgeInactive;
      default:
        return styles.badgeDefault;
    }
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      email: 'Email',
      facebook: 'Facebook',
      form: 'Formular',
      'walk-in': 'Walk-in',
      conversation: 'Conversație',
      unknown: 'Necunoscut',
    };
    return labels[source] || source;
  };

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>Clienți</h1>
          <div className={styles.headerActions}>
            <a
              href="/api/clients/export?userId=1"
              download
              className={styles.exportButton}
            >
              📥 Export CSV
            </a>
            <Link href="/clients/new" className={styles.addButton}>
              + Adaugă Client
            </Link>
          </div>
        </div>

        <div className={styles.filters}>
          <input
            type="text"
            placeholder="Caută după nume, email sau telefon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">Toate statusurile</option>
            <option value="lead">Lead</option>
            <option value="active">Activ</option>
            <option value="inactive">Inactiv</option>
            <option value="vip">VIP</option>
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">Toate sursele</option>
            <option value="email">Email</option>
            <option value="facebook">Facebook</option>
            <option value="form">Formular</option>
            <option value="walk-in">Walk-in</option>
          </select>

          <select
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [col, order] = e.target.value.split('-');
              setSortBy(col);
              setSortOrder(order as 'ASC' | 'DESC');
            }}
            className={styles.filterSelect}
          >
            <option value="last_activity_date-DESC">Ultima activitate (recent)</option>
            <option value="last_activity_date-ASC">Ultima activitate (vechi)</option>
            <option value="last_appointment_date-DESC">Ultima vizită (recent)</option>
            <option value="last_appointment_date-ASC">Ultima vizită (vechi)</option>
            <option value="total_spent-DESC">Total cheltuit (mare)</option>
            <option value="total_spent-ASC">Total cheltuit (mic)</option>
            <option value="name-ASC">Nume (A-Z)</option>
            <option value="name-DESC">Nume (Z-A)</option>
          </select>
        </div>

        {loading ? (
          <div className={styles.tableContainer} style={{ padding: '1rem' }}>
            <div className="skeleton-stack">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="skeleton skeleton-line" style={{ height: '20px', width: '100%' }} />
              ))}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className={styles.empty}>
            <p>Nu există clienți.</p>
            <Link href="/clients/new" className={styles.addButton}>
              Adaugă primul client
            </Link>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nume</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Sursă</th>
                  <th>Total cheltuit</th>
                  <th>Programări</th>
                  <th>Ultima vizită</th>
                  <th>Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      <Link href={`/clients/${client.id}`} className={styles.clientLink}>
                        {client.name}
                      </Link>
                    </td>
                    <td>
                      <div className={styles.contact}>
                        {client.email && (
                          <span className={styles.email}>{client.email}</span>
                        )}
                        {client.phone && (
                          <span className={styles.phone}>{client.phone}</span>
                        )}
                        {!client.email && !client.phone && (
                          <span className={styles.noContact}>Fără contact</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${getStatusBadgeClass(client.status)}`}>
                        {client.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{getSourceLabel(client.source)}</td>
                    <td className={styles.amount}>{formatCurrency(client.total_spent)}</td>
                    <td>{client.total_appointments}</td>
                    <td>{formatDate(client.last_appointment_date)}</td>
                    <td>
                      <Link href={`/clients/${client.id}`} className={styles.viewButton}>
                        Vezi
                      </Link>
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
              ← Anterior
            </button>
            <span className={styles.paginationInfo}>
              Pagina {pagination.page} din {pagination.totalPages} ({pagination.total} total)
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= pagination.totalPages}
              className={styles.paginationButton}
            >
              Următor →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
