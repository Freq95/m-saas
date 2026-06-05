'use client';

import React from 'react';
import { format } from 'date-fns';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';
import { getAppointmentBlockStyle, getStatusConfig, normalizeStatus, resolveAppointmentColor } from '@/lib/calendar-color-policy';
import { useTheme } from '@/components/ThemeProvider';

interface AppointmentBlockProps {
  appointment: Appointment;
  style: React.CSSProperties;
  compact?: boolean;
  narrow?: boolean;
  phoneView?: boolean;
  viewerUserId: number | null;
  onClick: (appointment: Appointment) => void;
  onDragStart?: (appointment: Appointment) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  isHighlighted?: boolean;
  enableDragDrop?: boolean;
}

function getServiceNames(appointment: Appointment): string[] {
  if (Array.isArray(appointment.service_names) && appointment.service_names.length > 0) {
    return appointment.service_names.filter((name) => typeof name === 'string' && name.trim().length > 0);
  }
  return appointment.service_name ? [appointment.service_name] : [];
}

export const AppointmentBlock = React.memo<AppointmentBlockProps>(
  ({
    appointment,
    style,
    compact = false,
    narrow = false,
    phoneView = false,
    viewerUserId,
    onClick,
    onDragStart,
    onDragEnd,
    isDragging = false,
    isHighlighted = false,
    enableDragDrop = false,
  }) => {
    const { theme } = useTheme();
    const statusCfg = getStatusConfig(appointment.status);
    const isNoShow = normalizeStatus(appointment.status) === 'no-show';
    const resolvedColor = resolveAppointmentColor(appointment, viewerUserId);
    const blockStyle = getAppointmentBlockStyle(
      resolvedColor,
      theme,
      appointment.is_shared_calendar ? 'shared' : 'default'
    );
    const startDate = new Date(appointment.start_time);
    const endDate = new Date(appointment.end_time);
    const isPast = endDate.getTime() < Date.now();
    const startLabel = format(startDate, 'HH:mm');
    const endLabel = format(endDate, 'HH:mm');
    const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60_000;
    const canDrag = enableDragDrop && appointment.status === 'scheduled' && appointment.can_drag !== false;
    const nameFirst = compact || narrow;
    const serviceNames = getServiceNames(appointment);
    const serviceSummary = serviceNames.join(' + ');
    const ariaServiceSummary = serviceSummary || appointment.service_name || 'fara serviciu';
    const compactServiceSummary = serviceNames.length > 1
      ? `${serviceNames[0]} (+${serviceNames.length - 1})`
      : serviceNames[0] || '';
    const isPill = compact;
    const isWebShort = !phoneView && !isPill && durationMinutes <= 30;
    const isSingleLineSummary = isPill || isWebShort;
    const showInlineServices = nameFirst && serviceSummary && !isSingleLineSummary;
    const showPhoneStackedServices = !nameFirst && phoneView && serviceNames.length > 0;
    const showDesktopServiceLine = !nameFirst && !phoneView && !isWebShort && (serviceSummary || appointment.dentist_display_name);
    const showTime = !nameFirst && !isWebShort;

    const handleDragStart = (event: React.DragEvent) => {
      event.stopPropagation();
      onDragStart?.(appointment);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', appointment.id.toString());
    };

    const handleDragEnd = (event: React.DragEvent) => {
      event.stopPropagation();
      onDragEnd?.();
    };

    // No-show keeps near-full opacity so the red diagonal stripes remain
    // clearly visible. Default statusCfg.opacity for 'no-show' is 0.45,
    // which would wash the stripes out.
    const baseOpacity = isNoShow ? 0.92 : statusCfg.opacity;
    const baseStyle: React.CSSProperties = {
      ...style,
      opacity: isPast ? Math.min(baseOpacity, 0.78) : baseOpacity,
      borderLeft: `5px solid ${blockStyle.borderColor}`,
      color: blockStyle.textColor,
    };
    // For normal appointments use the `background` shorthand so it
    // overrides the .appointment CSS gradient with the dentist's flat
    // body color. For no-show we set background-color + background-image
    // longhand so the stripes paint on top of the body color (the
    // shorthand would reset background-image to none).
    const appointmentStyle: React.CSSProperties = isNoShow
      ? {
          ...baseStyle,
          backgroundColor: blockStyle.bodyColor,
          backgroundImage:
            'repeating-linear-gradient(' +
            '135deg,' +
            'color-mix(in srgb, var(--color-danger-text) 30%, transparent) 0,' +
            'color-mix(in srgb, var(--color-danger-text) 30%, transparent) 6px,' +
            'transparent 6px,' +
            'transparent 13px)',
        }
      : {
          ...baseStyle,
          background: blockStyle.bodyColor,
        };
    const containerStyle: React.CSSProperties = {
      ...appointmentStyle,
      ...(compact && { padding: '0.12rem 0.28rem' }),
      ...(isWebShort && { padding: '0.18rem 0.38rem' }),
    };

    return (
      <div
        className={[
          styles.appointment,
          nameFirst ? styles.appointmentNameFirst : '',
          compact ? styles.appointmentCompact : '',
          isPill ? styles.appointmentPill : '',
          isWebShort ? styles.appointmentWebShort : '',
          narrow ? styles.appointmentNarrow : '',
          isDragging ? styles.dragging : '',
          isHighlighted ? styles.appointmentHighlighted : '',
          isNoShow ? styles.appointmentNoShow : '',
        ].filter(Boolean).join(' ')}
        style={containerStyle}
        draggable={canDrag}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(event) => {
          event.stopPropagation();
          onClick(appointment);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(appointment);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Programare ${appointment.client_name}, ${ariaServiceSummary}`}
      >
        <div className={styles.appointmentHeader}>
          <div className={`${styles.appointmentTitle} ${statusCfg.strikethrough ? styles.appointmentStrike : ''}`}>
            <span className={isSingleLineSummary ? styles.appointmentPillName : styles.appointmentName}>
              {appointment.client_name}
            </span>
            {isSingleLineSummary && compactServiceSummary && (
              <span className={styles.appointmentPillService}>{compactServiceSummary}</span>
            )}
            {showInlineServices && (
              <span className={styles.appointmentServiceInline}>
                {phoneView ? compactServiceSummary : serviceSummary}
              </span>
            )}
            {showTime && (
              // suppressHydrationWarning: format() of an ISO timestamp resolves
              // in the renderer's local timezone. Server (UTC) and client
              // (Europe/Bucharest) render different HH:mm. Client wins.
              <span className={styles.appointmentTime} suppressHydrationWarning> - {startLabel}-{endLabel}</span>
            )}
          </div>
          {appointment.recurrence_group_id !== undefined && appointment.recurrence_group_id !== null && (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Programare recurenta"
              style={{ opacity: 0.7, flexShrink: 0 }}
            >
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          )}
          <span
            className={styles.statusDot}
            style={{ background: statusCfg.dot }}
            aria-label={statusCfg.label}
          />
        </div>
        {showPhoneStackedServices && (
          <div className={styles.appointmentService}>
            {serviceNames.map((name) => (
              <span key={name} className={styles.appointmentServiceLine}>{name}</span>
            ))}
          </div>
        )}
        {showDesktopServiceLine && (
          <div className={styles.appointmentService}>
            {serviceSummary}
            {serviceSummary && appointment.dentist_display_name ? ' - ' : ''}
            {appointment.dentist_display_name || ''}
          </div>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.appointment.id === next.appointment.id &&
    prev.appointment.status === next.appointment.status &&
    prev.appointment.client_name === next.appointment.client_name &&
    prev.appointment.service_name === next.appointment.service_name &&
    (prev.appointment.service_names || []).join('|') === (next.appointment.service_names || []).join('|') &&
    prev.appointment.dentist_display_name === next.appointment.dentist_display_name &&
    prev.appointment.dentist_color === next.appointment.dentist_color &&
    prev.appointment.start_time === next.appointment.start_time &&
    prev.appointment.end_time === next.appointment.end_time &&
    prev.appointment.category === next.appointment.category &&
    prev.appointment.category_color === next.appointment.category_color &&
    prev.appointment.color === next.appointment.color &&
    prev.appointment.color_mine === next.appointment.color_mine &&
    prev.appointment.color_others === next.appointment.color_others &&
    prev.appointment.is_default_calendar === next.appointment.is_default_calendar &&
    prev.appointment.is_shared_calendar === next.appointment.is_shared_calendar &&
    prev.appointment.recurrence_group_id === next.appointment.recurrence_group_id &&
    prev.appointment.dentist_id === next.appointment.dentist_id &&
    prev.appointment.can_drag === next.appointment.can_drag &&
    prev.viewerUserId === next.viewerUserId &&
    prev.style.top === next.style.top &&
    prev.style.left === next.style.left &&
    prev.style.width === next.style.width &&
    prev.style.height === next.style.height &&
    prev.compact === next.compact &&
    prev.narrow === next.narrow &&
    prev.phoneView === next.phoneView &&
    prev.isDragging === next.isDragging &&
    prev.isHighlighted === next.isHighlighted &&
    prev.enableDragDrop === next.enableDragDrop &&
    prev.onClick === next.onClick &&
    prev.onDragStart === next.onDragStart &&
    prev.onDragEnd === next.onDragEnd
);

AppointmentBlock.displayName = 'AppointmentBlock';
