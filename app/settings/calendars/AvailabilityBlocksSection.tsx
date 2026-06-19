'use client';

import { useMemo, useState } from 'react';
import { addMonths, format } from 'date-fns';
import { ro } from 'date-fns/locale';
import {
  useAvailabilityBlocks,
  type AvailabilityBlock,
  type CalendarListItem,
} from '../../calendar/hooks';
import {
  AvailabilityBlockModal,
  type AvailabilityBlockFormData,
} from '../../calendar/components';
import styles from './page.module.css';
import Spinner from '@/components/Spinner';

interface AvailabilityBlocksSectionProps {
  calendars: CalendarListItem[];
  currentUserId: number;
  canManageAvailability: boolean;
  notify: {
    success: (message: string) => void;
    warning: (message: string) => void;
    error: (message: string) => void;
  };
}

function blockDateLabel(block: AvailabilityBlock) {
  const start = new Date(block.start_time);
  const end = new Date(block.end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  if (block.all_day) {
    return `${format(start, 'd MMM yyyy', { locale: ro })} · toata ziua`;
  }
  return `${format(start, 'd MMM yyyy, HH:mm', { locale: ro })} - ${format(end, 'HH:mm', { locale: ro })}`;
}

export function AvailabilityBlocksSection({
  calendars,
  currentUserId,
  canManageAvailability,
  notify,
}: AvailabilityBlocksSectionProps) {
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<AvailabilityBlock | null>(null);

  const calendarIds = useMemo(
    () => calendars.map((calendar) => calendar.id).filter((id): id is number => Number.isInteger(id)),
    [calendars]
  );

  const rangeStart = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date;
  }, []);
  const rangeEnd = useMemo(() => addMonths(new Date(), 6), []);
  const { blocks, loading, error, createBlock, updateBlock, deleteBlock, refetch } = useAvailabilityBlocks({
    currentDate: new Date(),
    viewType: 'month',
    rangeStartDate: rangeStart,
    rangeEndDate: rangeEnd,
    calendarIds,
  });

  const sortedBlocks = useMemo(
    () => blocks
      .filter((block) => block.user_id === currentUserId)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [blocks, currentUserId]
  );

  const openCreate = () => {
    if (!canManageAvailability) {
      notify.warning('Doar dentistul poate adauga indisponibilitati personale.');
      return;
    }
    setSelectedBlock(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openEdit = (block: AvailabilityBlock) => {
    setSelectedBlock(block);
    setModalMode('edit');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedBlock(null);
    setModalMode('create');
  };

  const submitBlock = async (formData: AvailabilityBlockFormData) => {
    const result = modalMode === 'edit' && typeof formData.id === 'number'
      ? await updateBlock(formData.id, {
          typeLabel: formData.typeLabel,
          reason: formData.reason,
          startTime: formData.startTime,
          endTime: formData.endTime,
          allDay: formData.allDay,
        })
      : await createBlock({
          typeLabel: formData.typeLabel,
          reason: formData.reason,
          startTime: formData.startTime,
          endTime: formData.endTime,
          allDay: formData.allDay,
        });

    if (!result.ok) {
      throw new Error(result.error || 'Nu am putut salva blocajul.');
    }
    await refetch();
    closeModal();
    if (result.warning) notify.warning(result.warning);
    notify.success(modalMode === 'edit' ? 'Indisponibilitate actualizata.' : 'Indisponibilitate adaugata.');
  };

  const removeBlock = async (block: AvailabilityBlock) => {
    const result = await deleteBlock(block.id);
    if (!result.ok) {
      throw new Error(result.error || 'Nu am putut sterge blocajul.');
    }
    await refetch();
    closeModal();
    notify.success('Indisponibilitate stearsa.');
  };

  if (!canManageAvailability) {
    return null;
  }

  const defaultStart = new Date();
  defaultStart.setHours(9, 0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60_000);

  return (
    <section className={styles.section}>
      <div className={styles.categoryHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Indisponibilitate</h3>
          <p className={styles.sectionCaption}>
            Blocaje fara pacient: cursuri, concedii, colaboratori sau cabinet inchis.
          </p>
        </div>
        <button type="button" className={styles.categoryAddButton} onClick={openCreate}>
          + Blocaj
        </button>
      </div>

      {error && <p className={styles.categoryError}>{error}</p>}

      <div className={styles.availabilityList}>
        {loading && sortedBlocks.length === 0 ? (
          <Spinner size={20} thickness={2} />
        ) : sortedBlocks.length === 0 ? (
          <p className={styles.categoryEmpty}>Nu exista blocaje pentru urmatoarele 6 luni.</p>
        ) : (
          sortedBlocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={styles.availabilityRow}
              onClick={() => openEdit(block)}
              data-tooltip={block.reason || block.type_label}
            >
              <span className={styles.availabilityRowMain}>
                <strong>{block.type_label}</strong>
                <small>{blockDateLabel(block)}</small>
              </span>
              {block.reason && <span className={styles.availabilityRowReason}>{block.reason}</span>}
            </button>
          ))
        )}
      </div>

      <AvailabilityBlockModal
        isOpen={modalOpen}
        mode={modalMode}
        block={selectedBlock}
        initialData={modalMode === 'create' ? {
          typeLabel: '',
          reason: '',
          startTime: defaultStart.toISOString(),
          endTime: defaultEnd.toISOString(),
          allDay: false,
        } : null}
        onClose={closeModal}
        onSubmit={submitBlock}
        onDelete={removeBlock}
      />
    </section>
  );
}
