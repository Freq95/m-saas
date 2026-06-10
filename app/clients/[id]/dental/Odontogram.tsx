'use client';

import { memo, useMemo } from 'react';
import ToothShape from './ToothShape';
import {
  FDI_DECIDUOUS_LOWER_ARCH_DISPLAY,
  FDI_DECIDUOUS_UPPER_ARCH_DISPLAY,
  FDI_LOWER_ARCH_DISPLAY,
  FDI_UPPER_ARCH_DISPLAY,
  ISSUE_COLOR,
  ISSUE_LABEL_RO,
  ISSUE_TYPES,
  isUpper,
  type Dentition,
  type IssueType,
  type Surface,
} from '@/lib/dental/constants';
import type { ToothStateDoc } from '@/lib/server/dental';
import type { SurgeryGroupDoc } from '@/lib/server/surgery';
import type { BridgeGroupDoc } from '@/lib/server/bridges';
import styles from './Odontogram.module.css';

interface OdontogramProps {
  toothStates: ToothStateDoc[];
  selectedFdi: number | null;
  onSelectTooth: (fdi: number) => void;
  surgeryGroups?: SurgeryGroupDoc[];
  /** When true, clicking a tooth toggles it in the surgery selection instead of selecting it normally. */
  surgeryMode?: boolean;
  /** FDIs currently included in the surgery selection (visualized as gray gum + brighter outline). */
  surgerySelection?: number[];
  /** Click handler used while surgery selection mode is active. */
  onToothToggleInSurgery?: (fdi: number) => void;
  /** Optional click handler for an existing surgery group annotation (e.g. open detail/delete). */
  onSurgeryGroupClick?: (groupId: number) => void;
  bridgeGroups?: BridgeGroupDoc[];
  /** When true, clicking a tooth toggles it in the bridge selection instead of selecting it normally. */
  bridgeMode?: boolean;
  /** FDIs currently included in the bridge selection. */
  bridgeSelection?: number[];
  /** Click handler used while bridge selection mode is active. */
  onToothToggleInBridge?: (fdi: number) => void;
  /** Optional click handler for an existing bridge group annotation (e.g. open detail/delete). */
  onBridgeGroupClick?: (groupId: number) => void;
  /** Which dentition to render. Defaults to 'permanent' (FDI 11–48). */
  dentition?: Dentition;
  /**
   * Show the small quadrant overview arches on the left. Defaults to true to
   * preserve existing call sites; the redesigned DentalTab passes false and the
   * viewBox crops to recenter the detailed chart across the full width.
   */
  showMiniArch?: boolean;
}

type ToothPosition = { fdi: number; x: number; y: number; labelY: number };
type MiniToothPosition = { fdi: number; x: number; y: number; angle: number; width: number; height: number };

const VIEW_WIDTH = 980;
const VIEW_HEIGHT = 390;
const DETAIL_START_X = 270;
const DETAIL_CENTER_X = 587;
const MINI_CENTER_X = 112;
const MINI_CENTER_Y = 194;
const MINI_RX = 72;
const MINI_RY = 145;

function toothSpacing(fdi: number): number {
  const position = fdi % 10;
  if (position <= 2) return 31;
  if (position === 3) return 35;
  if (position <= 5) return 40;
  return 44;
}

function buildRowLayout(
  arch: readonly number[],
  y: number,
  labelY: number,
  midlineIndex: number = 8
): ToothPosition[] {
  // Total width = sum of spacings + midline gap. Compute first so we can center.
  let totalWidth = 0;
  for (let i = 0; i < arch.length; i++) {
    totalWidth += toothSpacing(arch[i]);
    if (i === midlineIndex) totalWidth += 16;
  }
  let cursor = DETAIL_CENTER_X - totalWidth / 2;

  return arch.map((fdi, index) => {
    const spacing = toothSpacing(fdi);
    if (index === midlineIndex) cursor += 16;
    const position = { fdi, x: cursor + spacing / 2, y, labelY };
    cursor += spacing;
    return position;
  });
}

function miniSize(fdi: number) {
  const position = fdi % 10;
  if (position <= 2) return { width: 10, height: 20 };
  if (position === 3) return { width: 11, height: 23 };
  if (position <= 5) return { width: 13, height: 22 };
  return { width: 16, height: 20 };
}

function buildMiniLayout(dentition: Dentition = 'permanent'): MiniToothPosition[] {
  const upperArch = dentition === 'deciduous' ? FDI_DECIDUOUS_UPPER_ARCH_DISPLAY : FDI_UPPER_ARCH_DISPLAY;
  const lowerArch = dentition === 'deciduous' ? FDI_DECIDUOUS_LOWER_ARCH_DISPLAY : FDI_LOWER_ARCH_DISPLAY;

  const upper = upperArch.map((fdi, index) => {
    const t = index / (upperArch.length - 1);
    const angle = 220 + t * 100;
    const radians = (angle * Math.PI) / 180;
    const size = miniSize(fdi);
    return {
      fdi,
      x: MINI_CENTER_X + Math.cos(radians) * MINI_RX,
      y: MINI_CENTER_Y + Math.sin(radians) * MINI_RY,
      angle: angle + 90,
      ...size,
    };
  });

  const lower = lowerArch.map((fdi, index) => {
    const t = index / (lowerArch.length - 1);
    const angle = 40 + t * 100;
    const radians = (angle * Math.PI) / 180;
    const size = miniSize(fdi);
    return {
      fdi,
      x: MINI_CENTER_X + Math.cos(radians) * MINI_RX,
      y: MINI_CENTER_Y + Math.sin(radians) * MINI_RY,
      angle: angle + 90,
      ...size,
    };
  });

  return [...upper, ...lower];
}

function collectSurfaceFills(state?: ToothStateDoc) {
  const surfaceFills: Partial<Record<Surface, IssueType>> = {};
  let primaryIssue: IssueType | undefined;
  let hasGingivitis = false;
  let hasPeriodontitis = false;

  if (state?.current_issues?.length) {
    for (const issue of state.current_issues) {
      if (!primaryIssue) primaryIssue = issue.issue_type;
      // Gingivitis and periodontitis use dedicated fixed-position shapes,
      // not the M/D/B/L/O surface model. Skip them here.
      if (issue.issue_type === 'gingivitis') {
        hasGingivitis = true;
        continue;
      }
      if (issue.issue_type === 'periodontitis') {
        hasPeriodontitis = true;
        continue;
      }
      if (issue.surfaces.length === 0) {
        for (const surface of ['B', 'O', 'L', 'M', 'D'] as Surface[]) {
          if (!surfaceFills[surface]) surfaceFills[surface] = issue.issue_type;
        }
      } else {
        for (const surface of issue.surfaces) {
          if (!surfaceFills[surface]) surfaceFills[surface] = issue.issue_type;
        }
      }
    }
  }

  return { surfaceFills, primaryIssue, hasGingivitis, hasPeriodontitis };
}

// Approximate y bounds of the pink gum bands (in the SVG viewBox coord system).
// Used to derive the gray surgery overlay so it lands on the same band.
const UPPER_GUM_Y_TOP = 82;
const UPPER_GUM_Y_BOTTOM = 130;
const LOWER_GUM_Y_TOP = 262;
const LOWER_GUM_Y_BOTTOM = 322;
const SURGERY_OVERLAY_PADDING_X = 6;

function Odontogram({
  toothStates,
  selectedFdi,
  onSelectTooth,
  surgeryGroups = [],
  surgeryMode = false,
  surgerySelection = [],
  onToothToggleInSurgery,
  onSurgeryGroupClick,
  bridgeGroups = [],
  bridgeMode = false,
  bridgeSelection = [],
  onToothToggleInBridge,
  onBridgeGroupClick,
  dentition = 'permanent',
  showMiniArch = true,
}: OdontogramProps) {
  const upperArch = dentition === 'deciduous' ? FDI_DECIDUOUS_UPPER_ARCH_DISPLAY : FDI_UPPER_ARCH_DISPLAY;
  const lowerArch = dentition === 'deciduous' ? FDI_DECIDUOUS_LOWER_ARCH_DISPLAY : FDI_LOWER_ARCH_DISPLAY;
  // Midline sits between the central incisors: index 8 for permanent (16 teeth),
  // index 5 for deciduous (10 teeth).
  const midlineIndex = dentition === 'deciduous' ? 5 : 8;

  // FDI labels sit on the OUTER side of each arch — above the maxillary teeth
  // and below the mandibular teeth — so each number unambiguously belongs to
  // its own arch. (Previously both rows landed stacked in the central gap,
  // making the mandibular numbers read as if they labelled the upper teeth.)
  const upperPositions = useMemo(
    () => buildRowLayout(upperArch, 126, 66, midlineIndex),
    [upperArch, midlineIndex]
  );
  const lowerPositions = useMemo(
    () => buildRowLayout(lowerArch, 268, 346, midlineIndex),
    [lowerArch, midlineIndex]
  );
  const miniPositions = useMemo(() => buildMiniLayout(dentition), [dentition]);

  const stateByFdi = useMemo(() => {
    const map = new Map<number, ToothStateDoc>();
    for (const state of toothStates) {
      map.set(state.tooth_fdi, state);
    }
    return map;
  }, [toothStates]);

  // Lookup: fdi -> screen x. Used to derive surgery overlay extents.
  const fdiToX = useMemo(() => {
    const map = new Map<number, number>();
    for (const pos of upperPositions) map.set(pos.fdi, pos.x);
    for (const pos of lowerPositions) map.set(pos.fdi, pos.x);
    return map;
  }, [upperPositions, lowerPositions]);

  const surgerySelectionSet = useMemo(() => new Set(surgerySelection), [surgerySelection]);
  const bridgeSelectionSet = useMemo(() => new Set(bridgeSelection), [bridgeSelection]);

  // Split each surgery group by jaw — a single group may span both, but the
  // visual annotation (gray gum + comment) renders separately per jaw.
  type RenderedSurgery = {
    groupId: number;
    jaw: 'upper' | 'lower';
    xMin: number;
    xMax: number;
    comment: string;
  };

  const renderedSurgeries = useMemo<RenderedSurgery[]>(() => {
    const out: RenderedSurgery[] = [];
    for (const group of surgeryGroups) {
      const upperFdis = group.tooth_fdis.filter(isUpper);
      const lowerFdis = group.tooth_fdis.filter((f) => !isUpper(f));
      for (const [jaw, fdis] of [
        ['upper', upperFdis] as const,
        ['lower', lowerFdis] as const,
      ]) {
        if (fdis.length === 0) continue;
        const xs = fdis.map((f) => fdiToX.get(f)).filter((x): x is number => x !== undefined);
        if (xs.length === 0) continue;
        const halfSpacing = Math.max(...fdis.map((f) => toothSpacing(f))) / 2;
        out.push({
          groupId: group.id,
          jaw,
          xMin: Math.min(...xs) - halfSpacing - SURGERY_OVERLAY_PADDING_X,
          xMax: Math.max(...xs) + halfSpacing + SURGERY_OVERLAY_PADDING_X,
          comment: group.comment,
        });
      }
    }
    return out;
  }, [surgeryGroups, fdiToX]);

  // Bridge geometry — one rendered arc per (group, jaw). A single group may
  // span both jaws but we draw separate arcs per arch.
  type RenderedBridge = {
    groupId: number;
    jaw: 'upper' | 'lower';
    xMin: number;
    xMax: number;
    comment: string;
  };

  const renderedBridges = useMemo<RenderedBridge[]>(() => {
    const out: RenderedBridge[] = [];
    for (const group of bridgeGroups) {
      const upperFdis = group.tooth_fdis.filter(isUpper);
      const lowerFdis = group.tooth_fdis.filter((f) => !isUpper(f));
      for (const [jaw, fdis] of [
        ['upper', upperFdis] as const,
        ['lower', lowerFdis] as const,
      ]) {
        if (fdis.length === 0) continue;
        const xs = fdis.map((f) => fdiToX.get(f)).filter((x): x is number => x !== undefined);
        if (xs.length === 0) continue;
        out.push({
          groupId: group.id,
          jaw,
          xMin: Math.min(...xs),
          xMax: Math.max(...xs),
          comment: group.comment,
        });
      }
    }
    return out;
  }, [bridgeGroups, fdiToX]);

  const handleToothClick = (fdi: number) => {
    if (bridgeMode) {
      onToothToggleInBridge?.(fdi);
    } else if (surgeryMode) {
      onToothToggleInSurgery?.(fdi);
    } else {
      onSelectTooth(fdi);
    }
  };

  const renderBridgeOverlay = (b: RenderedBridge) => {
    // "Above teeth on screen" — both arches sit above their respective tooth row.
    // Upper arch row y = 126; lower arch row y = 268. Arc spans from xMin to xMax
    // with an upward curve, plus small vertical ticks at each end marking abutments.
    const rowY = b.jaw === 'upper' ? 126 : 268;
    const archY = rowY - 36; // 36px above the tooth row
    const peakY = archY - 14;
    const midX = (b.xMin + b.xMax) / 2;
    const arcPath = `M ${b.xMin} ${archY} Q ${midX} ${peakY} ${b.xMax} ${archY}`;
    return (
      <g
        key={`bridge-${b.groupId}-${b.jaw}`}
        onClick={(e) => {
          e.stopPropagation();
          onBridgeGroupClick?.(b.groupId);
        }}
        style={onBridgeGroupClick ? { cursor: 'pointer' } : undefined}
      >
        <path d={arcPath} className={styles.bridgeArc} />
        <line x1={b.xMin} y1={archY - 4} x2={b.xMin} y2={archY + 10} className={styles.bridgeAbutment} />
        <line x1={b.xMax} y1={archY - 4} x2={b.xMax} y2={archY + 10} className={styles.bridgeAbutment} />
        {b.comment && (
          <text x={midX} y={peakY - 4} textAnchor="middle" className={styles.bridgeComment}>
            {b.comment}
          </text>
        )}
      </g>
    );
  };

  const renderSurgeryOverlay = (s: RenderedSurgery) => {
    const yTop = s.jaw === 'upper' ? UPPER_GUM_Y_TOP : LOWER_GUM_Y_TOP;
    const yBot = s.jaw === 'upper' ? UPPER_GUM_Y_BOTTOM : LOWER_GUM_Y_BOTTOM;
    const width = s.xMax - s.xMin;
    const height = yBot - yTop;
    // Comment text sits above the upper jaw / below the lower jaw, outside
    // the gum band so it doesn't fight with the teeth.
    const textY = s.jaw === 'upper' ? yTop - 8 : yBot + 16;
    const textAnchorX = (s.xMin + s.xMax) / 2;
    return (
      <g
        key={`surgery-${s.groupId}-${s.jaw}`}
        onClick={(e) => {
          e.stopPropagation();
          onSurgeryGroupClick?.(s.groupId);
        }}
        style={onSurgeryGroupClick ? { cursor: 'pointer' } : undefined}
      >
        <rect
          x={s.xMin}
          y={yTop}
          width={width}
          height={height}
          rx={14}
          className={styles.surgeryGumOverlay}
        />
        <text
          x={textAnchorX}
          y={textY}
          textAnchor="middle"
          className={styles.surgeryCommentText}
        >
          {s.comment}
        </text>
      </g>
    );
  };

  const renderDetailedTooth = (pos: ToothPosition) => {
    const state = stateByFdi.get(pos.fdi);
    const { surfaceFills, primaryIssue, hasGingivitis, hasPeriodontitis } =
      collectSurfaceFills(state);
    const inSurgerySelection = surgerySelectionSet.has(pos.fdi);
    const inBridgeSelection = bridgeSelectionSet.has(pos.fdi);

    return (
      <g key={pos.fdi}>
        <g transform={`translate(${pos.x} ${pos.y})`}>
          <ToothShape
            fdi={pos.fdi}
            status={state?.status ?? 'present'}
            surfaceFills={surfaceFills}
            hasGingivitis={hasGingivitis}
            hasPeriodontitis={hasPeriodontitis}
            selected={selectedFdi === pos.fdi || inSurgerySelection || inBridgeSelection}
            hasIssues={!!state?.current_issues?.length}
            primaryIssueColor={primaryIssue ? ISSUE_COLOR[primaryIssue] : undefined}
            onSelect={handleToothClick}
          />
        </g>
        <text
          x={pos.x}
          y={pos.labelY}
          textAnchor="middle"
          className={`${styles.fdiLabel} ${selectedFdi === pos.fdi ? styles.fdiLabelActive : ''}`}
        >
          {pos.fdi}
        </text>
      </g>
    );
  };

  const renderMiniTooth = (pos: MiniToothPosition) => {
    const state = stateByFdi.get(pos.fdi);
    const { primaryIssue } = collectSurfaceFills(state);
    const isSelected = selectedFdi === pos.fdi;
    const isMissing = state?.status === 'missing';
    const isImplant = state?.status === 'implant';
    const fill = primaryIssue
      ? ISSUE_COLOR[primaryIssue]
      : isImplant
        ? 'var(--dental-implant-stroke)'
        : 'var(--dental-mini-tooth-fill)';

    return (
      <g
        key={`mini-${pos.fdi}`}
        transform={`translate(${pos.x} ${pos.y}) rotate(${pos.angle})`}
        className={styles.miniTooth}
        onClick={(event) => {
          event.stopPropagation();
          onSelectTooth(pos.fdi);
        }}
      >
        {isSelected && (
          <rect
            x={-pos.width / 2 - 3}
            y={-pos.height / 2 - 3}
            width={pos.width + 6}
            height={pos.height + 6}
            rx={6}
            className={styles.miniSelectedHalo}
          />
        )}
        <rect
          x={-pos.width / 2}
          y={-pos.height / 2}
          width={pos.width}
          height={pos.height}
          rx={pos.width / 2}
          fill={fill}
          fillOpacity={primaryIssue || isImplant ? 0.56 : 1}
          stroke={isSelected ? 'var(--color-accent)' : 'var(--dental-tooth-stroke)'}
          strokeWidth={isSelected ? 1.4 : 0.7}
          strokeDasharray={isMissing ? '2,2' : undefined}
          opacity={isMissing ? 0.3 : 1}
        />
        {isImplant && !isMissing && (
          <line
            x1={-pos.width / 2 + 2}
            y1={0}
            x2={pos.width / 2 - 2}
            y2={0}
            stroke="var(--dental-implant-stroke)"
            strokeWidth={0.7}
          />
        )}
      </g>
    );
  };

  // When the mini overview is hidden, crop the left region so the detailed
  // arches sit centered across the full card width (detailed content lives
  // roughly x∈[212, 980]).
  const viewBox = showMiniArch
    ? `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`
    : `212 0 ${VIEW_WIDTH - 212} ${VIEW_HEIGHT}`;

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={viewBox}
        className={styles.svg}
        role="img"
        aria-label="Schema dentara"
      >
        <defs>
          <linearGradient id="dental-clean-tooth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fbff" />
            <stop offset="55%" stopColor="#f0edf8" />
            <stop offset="100%" stopColor="#f8f5ff" />
          </linearGradient>
          <linearGradient id="dental-clean-tooth-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9db8cf" />
            <stop offset="100%" stopColor="#c2aad8" />
          </linearGradient>
        </defs>
        {showMiniArch && (
          <g className={styles.miniArch}>
            <ellipse cx={MINI_CENTER_X} cy={MINI_CENTER_Y} rx={MINI_RX + 17} ry={MINI_RY + 16} className={styles.miniArchGuide} />
            <text x={MINI_CENTER_X} y={MINI_CENTER_Y - 20} textAnchor="middle" className={styles.miniArchLabel}>
              MAXILAR
            </text>
            <text x={MINI_CENTER_X} y={MINI_CENTER_Y + 28} textAnchor="middle" className={styles.miniArchLabel}>
              MANDIBULA
            </text>
            {miniPositions.map(renderMiniTooth)}
          </g>
        )}

        <path
          d="M244 84 C320 76 420 80 510 84 C600 88 700 86 790 82 C870 80 920 78 946 86 L946 128 C900 124 800 122 700 124 C600 126 500 126 400 124 C320 122 280 124 244 130 Z"
          className={styles.gumBand}
        />
        <path
          d="M244 266 C320 262 420 264 510 266 C600 268 700 266 790 264 C870 262 920 260 946 266 L946 314 C900 322 800 318 700 314 C600 312 500 312 400 314 C320 318 280 320 244 322 Z"
          className={styles.gumBand}
        />
        <line x1={DETAIL_CENTER_X} y1={36} x2={DETAIL_CENTER_X} y2={VIEW_HEIGHT - 36} className={styles.midline} />

        <text x={DETAIL_CENTER_X} y={30} textAnchor="middle" className={styles.archLabel}>
          MAXILAR
        </text>
        <text x={DETAIL_CENTER_X} y={VIEW_HEIGHT - 18} textAnchor="middle" className={styles.archLabel}>
          MANDIBULA
        </text>

        {renderedSurgeries.map(renderSurgeryOverlay)}

        {upperPositions.map(renderDetailedTooth)}
        {lowerPositions.map(renderDetailedTooth)}

        {/* Bridge arcs rendered last so they sit visually above the teeth. */}
        {renderedBridges.map(renderBridgeOverlay)}
      </svg>

      <ul className={styles.legend}>
        {ISSUE_TYPES.map((type) => (
          <li key={type} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: ISSUE_COLOR[type] }} />
            <span className={styles.legendLabel}>{ISSUE_LABEL_RO[type]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(Odontogram);
