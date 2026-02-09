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
    await onCreate(formData);
    setFormData({
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      serviceId: services[0]?.id.toString() || '',
      notes: '',
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
