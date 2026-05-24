'use client';

import styles from './NumberStepper.module.css';

interface NumberStepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Visible label for the input — read by screen readers via aria-label. */
  ariaLabel?: string;
  id?: string;
  onChange: (value: number) => void;
  /** Optional className applied to the outer wrapper for layout overrides. */
  className?: string;
}

/**
 * Mobile-friendly numeric stepper. The +/− buttons are 44×44px each (Apple
 * HIG minimum touch target) and clamp the value at min/max. The input in the
 * middle stays editable so users can type a value directly when the keyboard
 * is faster than tapping.
 *
 * Used across the appointment modal (recurrence count, recurrence interval)
 * and anywhere else the user picks a small integer. Identical UX on desktop
 * and phone — no responsive breakpoint logic, just larger-than-default
 * buttons that work for both pointer and touch input.
 */
export default function NumberStepper({
  value,
  min = 1,
  max = 52,
  step = 1,
  disabled = false,
  ariaLabel,
  id,
  onChange,
  className,
}: NumberStepperProps) {
  const clamp = (n: number): number => Math.max(min, Math.min(max, n));

  const dec = () => {
    if (disabled) return;
    onChange(clamp(value - step));
  };

  const inc = () => {
    if (disabled) return;
    onChange(clamp(value + step));
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === '') {
      // Allow temporary empty state during typing — commit on blur.
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const parsed = Number.parseInt(raw, 10);
    onChange(Number.isFinite(parsed) ? clamp(parsed) : min);
  };

  return (
    <div className={`${styles.stepper} ${className || ''}`}>
      <button
        type="button"
        className={styles.stepperButton}
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label={ariaLabel ? `${ariaLabel}: scade` : 'Scade'}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className={styles.stepperInput}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={handleInput}
        onBlur={handleBlur}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className={styles.stepperButton}
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label={ariaLabel ? `${ariaLabel}: creste` : 'Creste'}
      >
        +
      </button>
    </div>
  );
}
