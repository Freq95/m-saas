'use client';

import { useState, useEffect } from 'react';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface EditAppointmentModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onUpdate: (data: { startTime: string; endTime: string; status: string; notes: string }) => Promise<void>;
}

export function EditAppointmentModal({
  isOpen,
  appointment,
  onClose,
  onUpdate,
}: EditAppointmentModalProps) {
  const [formData, setFormData] = useState({
    startTime: '',
    endTime: '',
    status: '',
    notes: '',
  });

  useEffect(() => {
    if (appointment) {
      const formatForInput = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };

      setFormData({
        startTime: formatForInput(new Date(appointment.start_time)),
        endTime: formatForInput(new Date(appointment.end_time)),
        status: appointment.status,
        notes: appointment.notes || '',
      });
    }
  }, [appointment]);

  if (!isOpen || !appointment) return null;

  const handleSubmit = async () => {
    await onUpdate(formData);
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Editare programare"
      >
        <h3>Editeaza programare</h3>
        <div className={styles.modalContent}>
          <div className={styles.modalField}>
            <label>Data si ora inceput *</label>
            <input
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalField}>
            <label>Data si ora sfarsit *</label>
            <input
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalField}>
            <label>Status *</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              required
            >
              <option value="scheduled">Programat</option>
              <option value="completed">Finalizat</option>
              <option value="cancelled">Anulat</option>
              <option value="no-show">Nu s-a prezentat</option>
            </select>
          </div>

          <div className={styles.modalField}>
            <label>Note</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        <div className={styles.modalActions}>
          <button onClick={onClose} className={styles.cancelButton}>
            Anuleaza
          </button>
          <button onClick={handleSubmit} className={styles.saveButton}>
            Salveaza
          </button>
        </div>
      </div>
    </div>
  );
}
