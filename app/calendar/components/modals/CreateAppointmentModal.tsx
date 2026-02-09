'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';

interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

interface CreateAppointmentModalProps {
  isOpen: boolean;
  selectedSlot: { start: Date; end: Date } | null;
  services: Service[];
  onClose: () => void;
  onCreate: (data: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    notes: string;
    isRecurring?: boolean;
    recurrence?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endType: 'date' | 'count';
      endDate?: string;
      count?: number;
    };
  }) => Promise<void>;
}

export function CreateAppointmentModal({
  isOpen,
  selectedSlot,
  services,
  onClose,
  onCreate,
}: CreateAppointmentModalProps) {
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    serviceId: services[0]?.id ? services[0].id.toString() : '',
    notes: '',
  });

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState({
    frequency: 'weekly' as 'daily' | 'weekly' | 'monthly',
    interval: 1,
    endType: 'count' as 'date' | 'count',
    endDate: '',
    count: 4,
  });

  useEffect(() => {
    if (services.length > 0 && !formData.serviceId) {
      setFormData((prev) => ({ ...prev, serviceId: services[0].id.toString() }));
    }
  }, [services, formData.serviceId]);

  if (!isOpen || !selectedSlot) return null;

  const handleSubmit = async () => {
    if (!formData.clientName || !formData.serviceId) {
      return;
    }

    const appointmentData = {
      ...formData,
      isRecurring,
      ...(isRecurring && { recurrence }),
    };

    await onCreate(appointmentData);

    // Reset form
    setFormData({
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      serviceId: services[0]?.id.toString() || '',
      notes: '',
    });
    setIsRecurring(false);
    setRecurrence({
      frequency: 'weekly',
      interval: 1,
      endType: 'count',
      endDate: '',
      count: 4,
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${styles.createSheet}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Creare programare"
      >
        <h3>Creeaza programare</h3>
        <div className={styles.modalContent}>
          <div className={styles.modalField}>
            <label>Data si ora</label>
            <div>
              {format(selectedSlot.start, "EEEE, d MMMM yyyy 'la' HH:mm", { locale: ro })}
              {formData.serviceId &&
                (() => {
                  const selectedService = services.find((s) => s.id.toString() === formData.serviceId);
                  const durationMinutes = selectedService?.duration_minutes || 60;
                  const endTime = new Date(selectedSlot.start);
                  endTime.setMinutes(endTime.getMinutes() + durationMinutes);
                  return ` - ${format(endTime, 'HH:mm', { locale: ro })}`;
                })()}
            </div>
          </div>

          <div className={styles.modalField}>
            <label>Nume client *</label>
            <input
              type="text"
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
              required
            />
          </div>

          <div className={styles.modalField}>
            <label>Email</label>
            <input
              type="email"
              value={formData.clientEmail}
              onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
            />
          </div>

          <div className={styles.modalField}>
            <label>Telefon</label>
            <input
              type="tel"
              value={formData.clientPhone}
              onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
            />
          </div>

          <div className={styles.modalField}>
            <label>Serviciu *</label>
            <select
              value={formData.serviceId}
              onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
              required
            >
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} ({service.duration_minutes} min) - {service.price} lei
                </option>
              ))}
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

          <div className={styles.modalField}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span>Programare recurenta</span>
            </label>
          </div>

          {isRecurring && (
            <div className={styles.recurringOptions}>
              <div className={styles.modalField}>
                <label>Frecventa</label>
                <select
                  value={recurrence.frequency}
                  onChange={(e) => setRecurrence({ ...recurrence, frequency: e.target.value as any })}
                >
                  <option value="daily">Zilnic</option>
                  <option value="weekly">Saptamanal</option>
                  <option value="monthly">Lunar</option>
                </select>
              </div>

              <div className={styles.modalField}>
                <label>
                  Interval (la fiecare{' '}
                  {recurrence.frequency === 'daily'
                    ? 'zile'
                    : recurrence.frequency === 'weekly'
                    ? 'saptamani'
                    : 'luni'}
                  )
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={recurrence.interval}
                  onChange={(e) => setRecurrence({ ...recurrence, interval: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className={styles.modalField}>
                <label>Sfarsit</label>
                <select
                  value={recurrence.endType}
                  onChange={(e) => setRecurrence({ ...recurrence, endType: e.target.value as any })}
                >
                  <option value="count">Dupa un numar de repetari</option>
                  <option value="date">La o data specifica</option>
                </select>
              </div>

              {recurrence.endType === 'count' && (
                <div className={styles.modalField}>
                  <label>Numar de repetari</label>
                  <input
                    type="number"
                    min="2"
                    max="52"
                    value={recurrence.count}
                    onChange={(e) => setRecurrence({ ...recurrence, count: parseInt(e.target.value) || 2 })}
                  />
                </div>
              )}

              {recurrence.endType === 'date' && (
                <div className={styles.modalField}>
                  <label>Data de sfarsit</label>
                  <input
                    type="date"
                    value={recurrence.endDate}
                    onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                    min={format(selectedSlot.start, 'yyyy-MM-dd')}
                  />
                </div>
              )}
            </div>
          )}
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
