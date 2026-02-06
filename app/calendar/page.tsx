'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format, startOfWeek, addDays, addWeeks, subWeeks, addMonths, subMonths, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './page.module.css';

interface Appointment {
  id: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string;
}

interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

export default function CalendarPage() {
  const [viewType, setViewType] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    serviceId: '',
    notes: '',
  });
  const [editFormData, setEditFormData] = useState({
    startTime: '',
    endTime: '',
    status: '',
    notes: '',
  });

  useEffect(() => {
    fetchAppointments();
    fetchServices();
  }, [currentDate, viewType]);

  const fetchAppointments = async () => {
    try {
      let startDate: Date;
      let endDate: Date;
      
      if (viewType === 'week') {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        startDate = weekStart;
        endDate = addDays(weekStart, 6);
      } else {
        const monthStart = startOfMonth(currentDate);
        startDate = monthStart;
        endDate = endOfMonth(currentDate);
      }
      
      const response = await fetch(
        `/api/appointments?userId=1&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      const result = await response.json();
      setAppointments(result.appointments || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/services?userId=1');
      const result = await response.json();
      setServices(result.services);
      if (result.services.length > 0) {
        setFormData(prev => ({ ...prev, serviceId: result.services[0].id.toString() }));
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const createAppointment = async () => {
    if (!selectedSlot || !formData.clientName || !formData.serviceId) {
      alert('Completează toate câmpurile obligatorii (nume client și serviciu)');
      return;
    }

    // Recalculate end time based on selected service duration
    const selectedService = services.find(s => s.id.toString() === formData.serviceId);
    const durationMinutes = selectedService?.duration_minutes || 60;
    const calculatedEndTime = new Date(selectedSlot.start);
    calculatedEndTime.setMinutes(calculatedEndTime.getMinutes() + durationMinutes);

    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
          serviceId: parseInt(formData.serviceId),
          clientName: formData.clientName,
          clientEmail: formData.clientEmail,
          clientPhone: formData.clientPhone,
          startTime: selectedSlot.start.toISOString(),
          endTime: calculatedEndTime.toISOString(),
          notes: formData.notes,
        }),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setSelectedSlot(null);
        setFormData({
          clientName: '',
          clientEmail: '',
          clientPhone: '',
          serviceId: services[0]?.id.toString() || '',
          notes: '',
        });
        fetchAppointments();
      } else {
        const errorData = await response.json();
        alert(`Eroare: ${errorData.error || 'Nu s-a putut crea programarea'}`);
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      alert('Eroare la crearea programării. Verifică consola pentru detalii.');
    }
  };

  const handleEditAppointment = async () => {
    if (!selectedAppointment) return;
    
    // Fetch full appointment details including notes
    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}`);
      const result = await response.json();
      const fullAppointment = result.appointment;
      
      const startDate = new Date(fullAppointment.start_time);
      const endDate = new Date(fullAppointment.end_time);
      
      // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
      const formatForInput = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      setEditFormData({
        startTime: formatForInput(startDate),
        endTime: formatForInput(endDate),
        status: fullAppointment.status || 'scheduled',
        notes: fullAppointment.notes || '',
      });
      
      setShowPreviewModal(false);
      setShowEditModal(true);
    } catch (error) {
      console.error('Error fetching appointment details:', error);
      // Fallback to basic data
      const startDate = new Date(selectedAppointment.start_time);
      const endDate = new Date(selectedAppointment.end_time);
      
      const formatForInput = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
      };
      
      setEditFormData({
        startTime: formatForInput(startDate),
        endTime: formatForInput(endDate),
        status: selectedAppointment.status,
        notes: selectedAppointment.notes || '',
      });
      
      setShowPreviewModal(false);
      setShowEditModal(true);
    }
  };

  const updateAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: new Date(editFormData.startTime).toISOString(),
          endTime: new Date(editFormData.endTime).toISOString(),
          status: editFormData.status,
          notes: editFormData.notes,
        }),
      });

      if (response.ok) {
        setShowEditModal(false);
        setSelectedAppointment(null);
        setEditFormData({ startTime: '', endTime: '', status: '', notes: '' });
        fetchAppointments();
      } else {
        const errorData = await response.json();
        alert(`Eroare: ${errorData.error || 'Nu s-a putut actualiza programarea'}`);
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Eroare la actualizarea programării.');
    }
  };

  const deleteAppointment = async () => {
    if (!selectedAppointment) return;
    
    if (!confirm('Sigur vrei să ștergi această programare?')) return;

    try {
      const response = await fetch(`/api/appointments/${selectedAppointment.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setShowPreviewModal(false);
        setSelectedAppointment(null);
        fetchAppointments();
      } else {
        const errorData = await response.json();
        alert(`Eroare: ${errorData.error || 'Nu s-a putut șterge programarea'}`);
      }
    } catch (error) {
      console.error('Error deleting appointment:', error);
      alert('Eroare la ștergerea programării.');
    }
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM

  // Month view calculations
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const monthStartWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
  // Get the end of the week that contains the last day of the month
  const lastDayOfMonthWeek = startOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthEndWeek = addDays(lastDayOfMonthWeek, 6); // End of that week
  const monthDays = eachDayOfInterval({ start: monthStartWeek, end: monthEndWeek });
  
  const getAppointmentsForDayInMonth = (day: Date) => {
    return appointments.filter(apt => isSameDay(new Date(apt.start_time), day));
  };

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter(apt => isSameDay(new Date(apt.start_time), day));
  };

  // Group overlapping appointments and calculate their positions using lane assignment
  const calculateAppointmentPositions = (dayAppointments: Appointment[]) => {
    if (dayAppointments.length === 0) return [];

    // Convert to dates and sort by start time
    const aptsWithDates = dayAppointments.map(apt => ({
      ...apt,
      start: new Date(apt.start_time),
      end: new Date(apt.end_time),
      original: apt,
    })).sort((a, b) => {
      // Sort by start time, then by end time
      if (a.start.getTime() !== b.start.getTime()) {
        return a.start.getTime() - b.start.getTime();
      }
      return a.end.getTime() - b.end.getTime();
    });

    // Find all overlapping appointment groups
    const groups: Array<typeof aptsWithDates> = [];
    const processed = new Set<number>();

    aptsWithDates.forEach(apt => {
      if (processed.has(apt.id)) return;

      // Find all appointments that overlap with this one (directly or transitively)
      const group: typeof aptsWithDates = [];
      const toProcess = [apt];
      processed.add(apt.id);

      while (toProcess.length > 0) {
        const current = toProcess.pop()!;
        group.push(current);

        // Find all appointments that overlap with current
        aptsWithDates.forEach(other => {
          if (processed.has(other.id)) return;
          
          // Check if appointments overlap
          if (current.start < other.end && current.end > other.start) {
            toProcess.push(other);
            processed.add(other.id);
          }
        });
      }

      if (group.length > 0) {
        groups.push(group);
      }
    });

    // Calculate positions using lane assignment
    const positions: Array<{ apt: Appointment; left: number; width: number }> = [];

    groups.forEach(group => {
      // Assign lanes to appointments in this group
      const lanes: Array<Array<typeof aptsWithDates[0]>> = [];
      
      group.forEach(apt => {
        // Find the leftmost lane that doesn't conflict
        let assignedLane = -1;
        
        for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
          const lane = lanes[laneIndex];
          // Check if this appointment can fit in this lane
          const conflicts = lane.some(laneApt => {
            return apt.start < laneApt.end && apt.end > laneApt.start;
          });
          
          if (!conflicts) {
            assignedLane = laneIndex;
            break;
          }
        }
        
        // If no lane found, create a new one
        if (assignedLane === -1) {
          assignedLane = lanes.length;
          lanes.push([]);
        }
        
        lanes[assignedLane].push(apt);
      });

      // Calculate positions based on lanes
      const totalLanes = lanes.length;
      
      group.forEach(apt => {
        // Find which lane this appointment is in
        const laneIndex = lanes.findIndex(lane => 
          lane.some(laneApt => laneApt.id === apt.id)
        );
        
        if (laneIndex !== -1) {
          // Calculate width accounting for margins (4px total per appointment: 2px on each side)
          // We use calc to subtract margins from width
          const widthPercent = 100 / totalLanes;
          const leftPercent = laneIndex * widthPercent;
          
          positions.push({
            apt: apt.original,
            left: leftPercent,
            width: widthPercent,
          });
        }
      });
    });

    return positions;
  };

  const handleSlotClick = (day: Date, hour?: number) => {
    const slotStart = new Date(day);
    if (hour !== undefined) {
      slotStart.setHours(hour, 0, 0, 0);
    } else {
      // For month view, default to 9 AM
      slotStart.setHours(9, 0, 0, 0);
    }
    
    // Get service duration from selected service or default to 60 minutes
    const selectedService = services.find(s => s.id.toString() === formData.serviceId);
    const durationMinutes = selectedService?.duration_minutes || 60;
    
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    setSelectedDate(day);
    setSelectedSlot({ start: slotStart, end: slotEnd });
    setShowCreateModal(true);
  };

  const handleDayClick = (day: Date) => {
    handleSlotClick(day);
  };

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <Link href="/">
          <h1 className={styles.logo}>OpsGenie</h1>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/inbox">Inbox</Link>
          <Link href="/calendar" className={styles.active}>Calendar</Link>
          <Link href="/clients">Clienți</Link>
          <Link href="/settings/email">Setări</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.calendarHeader}>
          <div className={styles.headerControls}>
            <button 
              onClick={() => viewType === 'week' 
                ? setCurrentDate(subWeeks(currentDate, 1))
                : setCurrentDate(subMonths(currentDate, 1))
              }
            >
              ←
            </button>
            <h2>
              {viewType === 'week' 
                ? `${format(weekStart, "d MMMM", { locale: ro })} - ${format(addDays(weekStart, 6), "d MMMM yyyy", { locale: ro })}`
                : (() => {
                    const monthYear = format(currentDate, "MMMM yyyy", { locale: ro });
                    return monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
                  })()
              }
            </h2>
            <button 
              onClick={() => viewType === 'week'
                ? setCurrentDate(addWeeks(currentDate, 1))
                : setCurrentDate(addMonths(currentDate, 1))
              }
            >
              →
            </button>
            <button onClick={() => setCurrentDate(new Date())} className={styles.todayButton}>
              Astăzi
            </button>
            <div className={styles.viewSwitcher}>
              <button
                type="button"
                onClick={() => {
                  console.log('Setting view to week');
                  setViewType('week');
                }}
                className={viewType === 'week' ? styles.viewActive : styles.viewButton}
              >
                Săptămână
              </button>
              <button
                type="button"
                onClick={() => {
                  console.log('Setting view to month');
                  setViewType('month');
                }}
                className={viewType === 'month' ? styles.viewActive : styles.viewButton}
              >
                Lună
              </button>
            </div>
          </div>
        </div>

        {viewType === 'week' ? (
          <div className={styles.calendar} key="week-view">
            <div className={styles.timeColumn}>
              {hours.map(hour => (
                <div key={hour} className={styles.timeSlot}>
                  {hour}:00
                </div>
              ))}
            </div>

            {weekDays.map(day => {
            const dayAppointments = getAppointmentsForDay(day);
            const appointmentPositions = calculateAppointmentPositions(dayAppointments);
            
            // Calculate the day's start and end times (8 AM to 7 PM)
            const dayStart = new Date(day);
            dayStart.setHours(8, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(19, 0, 0, 0);
            const dayDuration = dayEnd.getTime() - dayStart.getTime();

            return (
              <div key={day.toISOString()} className={styles.dayColumn}>
                <div className={styles.dayHeader}>
                  <div className={styles.dayName}>{format(day, 'EEEE', { locale: ro })}</div>
                  <div className={styles.dayNumber}>{format(day, 'd')}</div>
                </div>
                <div className={styles.daySlots}>
                  {hours.map(hour => (
                    <div
                      key={hour}
                      className={styles.slot}
                      onClick={() => handleSlotClick(day, hour)}
                    />
                  ))}
                  {/* Render appointments at day level */}
                  {appointmentPositions.map(({ apt, left, width }) => {
                    const aptStart = new Date(apt.start_time);
                    const aptEnd = new Date(apt.end_time);
                    const aptStartTime = aptStart.getTime();
                    const aptEndTime = aptEnd.getTime();
                    
                    // Calculate top position relative to day start (8 AM)
                    const topOffset = aptStartTime - dayStart.getTime();
                    const topPercent = (topOffset / dayDuration) * 100;
                    
                    // Calculate height
                    const aptDuration = aptEndTime - aptStartTime;
                    const heightPercent = (aptDuration / dayDuration) * 100;

                    return (
                      <div
                        key={apt.id}
                        className={`${styles.appointment} ${styles[apt.status]}`}
                        style={{
                          top: `${topPercent}%`,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: `${heightPercent}%`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppointment(apt);
                          setShowPreviewModal(true);
                        }}
                      >
                        <div className={styles.appointmentTitle}>{apt.client_name}</div>
                        <div className={styles.appointmentService}>{apt.service_name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
        ) : (
          <div className={styles.monthCalendar} key="month-view">
            <div className={styles.monthWeekDays}>
              {['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'].map(day => (
                <div key={day} className={styles.monthWeekDay}>
                  {day}
                </div>
              ))}
            </div>
            <div className={styles.monthGrid}>
              {monthDays.map(day => {
                const dayAppointments = getAppointmentsForDayInMonth(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div
                    key={day.toISOString()}
                    className={`${styles.monthDay} ${!isCurrentMonth ? styles.monthDayOther : ''} ${isToday ? styles.monthDayToday : ''}`}
                    onClick={() => handleDayClick(day)}
                  >
                    <div className={styles.monthDayNumber}>
                      {format(day, 'd')}
                    </div>
                    <div className={styles.monthDayAppointments}>
                      {dayAppointments.slice(0, 3).map(apt => (
                        <div
                          key={apt.id}
                          className={`${styles.monthAppointment} ${styles[apt.status]}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAppointment(apt);
                            setShowPreviewModal(true);
                          }}
                          title={`${apt.client_name} - ${apt.service_name}`}
                        >
                          {format(new Date(apt.start_time), 'HH:mm', { locale: ro })} - {apt.client_name}
                        </div>
                      ))}
                      {dayAppointments.length > 3 && (
                        <div className={styles.monthAppointmentMore}>
                          +{dayAppointments.length - 3} mai multe
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Preview Modal - Apple-inspired design */}
      {showPreviewModal && selectedAppointment && (
        <div 
          className={styles.modalOverlay} 
          onClick={() => {
            setShowPreviewModal(false);
            setSelectedAppointment(null);
          }}
        >
          <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <div>
                <h2 className={styles.previewTitle}>{selectedAppointment.client_name}</h2>
                <p className={styles.previewSubtitle}>{selectedAppointment.service_name}</p>
              </div>
              <button 
                className={styles.closeButton}
                onClick={() => {
                  setShowPreviewModal(false);
                  setSelectedAppointment(null);
                }}
              >
                ×
              </button>
            </div>

            <div className={styles.previewContent}>
              <div className={styles.previewSection}>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>📅 Data și ora</span>
                  <span className={styles.previewValue}>
                    {format(new Date(selectedAppointment.start_time), "EEEE, d MMMM yyyy 'la' HH:mm", { locale: ro })} - {format(new Date(selectedAppointment.end_time), 'HH:mm', { locale: ro })}
                  </span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>📧 Email</span>
                  <span className={styles.previewValue}>{selectedAppointment.client_email || 'N/A'}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>📞 Telefon</span>
                  <span className={styles.previewValue}>{selectedAppointment.client_phone || 'N/A'}</span>
                </div>
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>📝 Status</span>
                  <span className={`${styles.statusBadge} ${styles[selectedAppointment.status]}`}>
                    {selectedAppointment.status}
                  </span>
                </div>
                {selectedAppointment.notes && (
                  <div className={styles.previewRow}>
                    <span className={styles.previewLabel}>📄 Note</span>
                    <span className={styles.previewValue}>{selectedAppointment.notes}</span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.previewActions}>
              <button 
                className={styles.editButton}
                onClick={handleEditAppointment}
              >
                Editează
              </button>
              <button 
                className={styles.deleteButton}
                onClick={deleteAppointment}
              >
                Șterge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAppointment && (
        <div 
          className={styles.modalOverlay} 
          onClick={() => {
            setShowEditModal(false);
            setSelectedAppointment(null);
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Editează programare</h3>
            <div className={styles.modalContent}>
              <div className={styles.modalField}>
                <label>Data și ora început *</label>
                <input
                  type="datetime-local"
                  value={editFormData.startTime}
                  onChange={(e) => setEditFormData({ ...editFormData, startTime: e.target.value })}
                  required
                />
              </div>

              <div className={styles.modalField}>
                <label>Data și ora sfârșit *</label>
                <input
                  type="datetime-local"
                  value={editFormData.endTime}
                  onChange={(e) => setEditFormData({ ...editFormData, endTime: e.target.value })}
                  required
                />
              </div>

              <div className={styles.modalField}>
                <label>Status *</label>
                <select
                  value={editFormData.status}
                  onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
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
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedAppointment(null);
                }} 
                className={styles.cancelButton}
              >
                Anulează
              </button>
              <button onClick={updateAppointment} className={styles.saveButton}>
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && selectedSlot && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Crează programare</h3>
            <div className={styles.modalContent}>
              <div className={styles.modalField}>
                <label>Dată și oră</label>
                <div>
                  {format(selectedSlot.start, "EEEE, d MMMM yyyy 'la' HH:mm", { locale: ro })}
                  {formData.serviceId && (() => {
                    const selectedService = services.find(s => s.id.toString() === formData.serviceId);
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
                  {services.map(service => (
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
              <button onClick={() => setShowCreateModal(false)} className={styles.cancelButton}>
                Anulează
              </button>
              <button onClick={createAppointment} className={styles.saveButton}>
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

