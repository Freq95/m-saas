import styles from './Spinner.module.css';

interface SpinnerProps {
  /** Diameter in pixels. Defaults to 28px (Twitter/X style). */
  size?: number;
  /** Stroke thickness. Defaults to 2.5px. */
  thickness?: number;
  /** Optional inline label for screen readers. Defaults to "Se incarca". */
  label?: string;
  /** Center the spinner inside a full-height container. Defaults to true. */
  centered?: boolean;
}

export default function Spinner({
  size = 28,
  thickness = 2.5,
  label = 'Se încarcă',
  centered = true,
}: SpinnerProps) {
  const inner = (
    <span
      className={styles.spinner}
      style={{
        width: size,
        height: size,
        borderWidth: thickness,
      }}
      role="status"
      aria-label={label}
    />
  );

  if (!centered) return inner;

  return <div className={styles.center}>{inner}</div>;
}
