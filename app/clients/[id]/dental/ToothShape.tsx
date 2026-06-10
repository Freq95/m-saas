'use client';

import { memo } from 'react';
import {
  FDI_DECIDUOUS_SET,
  ISSUE_COLOR,
  isUpper,
  type IssueType,
  type Surface,
  type ToothStatus,
} from '@/lib/dental/constants';

type SurfaceFill = Partial<Record<Surface, IssueType>>;

interface ToothShapeProps {
  fdi: number;
  status: ToothStatus;
  /** Map of surface -> issue type used to fill that surface. */
  surfaceFills: SurfaceFill;
  /** Renders the dedicated cervical arc — independent of surface selection. */
  hasGingivitis: boolean;
  /** Renders the dedicated sub-cervical band — independent of surface selection. */
  hasPeriodontitis: boolean;
  selected: boolean;
  /** True when at least one issue is active on this tooth (drives the whole-tooth glow). */
  hasIssues: boolean;
  primaryIssueColor?: string;
  onSelect: (fdi: number) => void;
}

type ToothAnatomy = {
  path: string;
  /** Uniform scale applied to source coords. */
  scale: number;
  /** Source x that anchors at internal x=32. */
  xCenter: number;
  /** Source y of the crown-root junction; anchors at internal y=64 (the gum line). */
  crownBaseY: number;
  /**
   * Surface fills as d-strings in source coords, hand-shaped to follow each
   * tooth's crown contour. Convention:
   *  - L: incisal/occlusal tip lens (chewing edge / cusp area)
   *  - O: middle saddle along the central fossa
   *  - B: horizontal lens at the cervical (gum) end
   *  - M: crescent along the mesial (source-left) proximal edge
   *  - D: crescent along the distal (source-right) proximal edge
   */
  surfacePaths: Record<Surface, string>;
  /**
   * Cervical arc indicating gingivitis — a crescent sitting on the crown just
   * coronal to the gingival margin (source y slightly less than crownBaseY).
   */
  gingivitisPath: string;
  /**
   * Sub-cervical band indicating periodontitis — sits immediately incisal to
   * the gingivitis arc, still on the crown.
   */
  periodontitisPath: string;
  /** Crown-cap overlay path in source coords (for status='crown'). */
  crownCap: string;
  /** Implant fixture in source coords (replaces root for status='implant'). */
  implant: { x: number; y: number; w: number; h: number; lines: number[] };
};

// ---------------------------------------------------------------------------
// INCISORS — FDI 11, 12, 21, 22, 31, 32, 41, 42  (good_incisiv.svg)
// Source viewBox 121x499, path bbox x:25-101, y:29-484.
// Crown spans y:29-170 (tip at 29, cervical at 170), root y:170-484.
// ---------------------------------------------------------------------------
const INCISOR_PATH =
  'M39 29 C31 29 25 35 25 44 L25 143 ' +
  'C25 167 32 184 34 205 C35 215 31 219 31 229 ' +
  'C31 247 34 269 38 292 C43 325 47 358 48 393 ' +
  'C49 429 48 466 47 484 C47 491 54 493 58 487 ' +
  'C73 464 82 422 86 381 C91 330 93 286 95 242 ' +
  'C98 184 101 127 101 47 C101 36 95 29 85 29 L70 29 ' +
  'C67 29 65 31 63 33 C60 36 56 36 53 33 C50 31 46 29 42 29 Z';

const INCISOR_ANATOMY: ToothAnatomy = {
  path: INCISOR_PATH,
  scale: 0.16,
  xCenter: 63,
  crownBaseY: 170,
  surfacePaths: {
    L: 'M40 42 C50 32 76 32 86 42 C76 50 50 50 40 42 Z',
    O: 'M35 90 C46 76 80 76 91 90 C85 102 41 102 35 90 Z',
    B: 'M33 150 C45 138 81 138 93 150 C85 162 41 162 33 150 Z',
    M: 'M28 60 C22 90 22 130 28 158 C34 156 36 152 36 144 C32 120 32 80 34 64 C34 60 32 58 28 60 Z',
    D: 'M98 60 C104 90 104 130 98 158 C92 156 90 152 90 144 C94 120 94 80 92 64 C92 60 94 58 98 60 Z',
  },
  gingivitisPath: 'M26 108 C50 130 76 130 100 108 L100 148 C76 170 50 170 26 148 Z',
  periodontitisPath: 'M26 148 C50 170 76 170 100 148 L100 180 C76 208 50 208 26 180 Z',
  crownCap: 'M30 36 C45 30 80 30 95 36 L92 64 C77 54 47 54 33 64 Z',
  implant: { x: 53, y: 178, w: 20, h: 240, lines: [210, 250, 290, 330, 370, 410] },
};

// ---------------------------------------------------------------------------
// CANINES — FDI 13, 23, 33, 43  (good_canin.svg)
// Source viewBox 210x650, path bbox x:63-204, y:39-629.
// Crown spans y:39-235, root y:235-629.
// ---------------------------------------------------------------------------
const CANINE_PATH =
  'M86 94 C93 88 105 83 116 76 C126 70 135 39 151 39 ' +
  'C164 39 174 71 184 80 C193 88 201 91 203 100 ' +
  'C205 110 204 158 204 199 C204 223 203 245 202 263 ' +
  'C201 280 199 293 197 302 C195 312 191 318 190 324 ' +
  'C188 334 191 350 192 366 C194 391 193 424 191 458 ' +
  'C188 503 181 548 174 583 C169 610 158 628 147 629 ' +
  'C134 630 126 613 126 588 C126 557 126 537 121 514 ' +
  'C116 489 109 467 103 438 C95 399 89 361 82 326 ' +
  'C80 316 74 308 73 298 C72 288 77 281 78 270 ' +
  'C80 251 75 228 71 205 C66 174 63 142 64 112 ' +
  'C65 104 77 100 86 94 Z';

const CANINE_ANATOMY: ToothAnatomy = {
  path: CANINE_PATH,
  scale: 0.18,
  xCenter: 133,
  crownBaseY: 235,
  surfacePaths: {
    // Cusp is offset toward the source-right (peak around x=151).
    L: 'M115 55 C130 42 165 42 180 55 C165 66 130 66 115 55 Z',
    O: 'M78 130 C100 115 180 115 198 130 C180 145 95 145 78 130 Z',
    B: 'M75 215 C97 200 180 200 198 215 C178 228 95 228 75 215 Z',
    M: 'M70 110 C64 145 64 195 75 225 C84 222 88 216 88 208 C82 175 82 135 84 112 C84 106 76 106 70 110 Z',
    D: 'M198 110 C204 145 204 195 192 225 C184 222 180 216 180 208 C186 175 186 135 184 112 C184 106 192 106 198 110 Z',
  },
  gingivitisPath: 'M72 168 C100 200 170 200 196 168 L196 215 C170 235 100 235 72 215 Z',
  periodontitisPath: 'M72 215 C100 235 170 235 196 215 L196 252 C170 285 100 285 72 252 Z',
  crownCap: 'M80 55 C110 42 165 42 195 55 L190 95 C160 80 110 80 80 95 Z',
  implant: { x: 122, y: 245, w: 22, h: 320, lines: [285, 330, 375, 420, 465, 510, 555] },
};

// ---------------------------------------------------------------------------
// PREMOLARS — FDI 14, 15, 24, 25, 34, 35, 44, 45 (molar_clean_lightblue.svg)
// Source viewBox 140x314, path bbox x:21-114, y:15-312.
// Crown spans y:15-135, root y:135-312.
// ---------------------------------------------------------------------------
const PREMOLAR_PATH =
  'M36 20 C43 20 50 18 56 15 C62 11 69 11 75 15 ' +
  'C82 19 89 20 98 20 C107 20 113 26 114 36 L114 93 ' +
  'C114 105 113 117 110 126 C108 133 105 138 105 145 ' +
  'C105 154 109 164 109 178 C109 199 103 219 97 239 ' +
  'C89 264 76 286 58 304 C51 311 39 312 33 305 ' +
  'C29 300 32 292 36 285 C42 273 49 260 48 248 ' +
  'C46 235 39 221 34 206 C27 187 23 168 22 150 ' +
  'C22 142 27 137 28 130 C29 121 24 112 23 101 ' +
  'C21 83 21 59 22 37 C23 27 28 20 36 20 Z';

const PREMOLAR_ANATOMY: ToothAnatomy = {
  path: PREMOLAR_PATH,
  scale: 0.25,
  xCenter: 67.5,
  crownBaseY: 135,
  surfacePaths: {
    L: 'M30 30 C50 18 88 18 108 30 C95 42 45 42 30 30 Z',
    O: 'M26 70 C45 56 92 56 112 70 C100 86 40 86 26 70 Z',
    B: 'M24 115 C42 104 95 104 110 115 C95 130 40 130 24 115 Z',
    M: 'M22 32 C16 60 16 110 26 130 C32 128 34 122 34 116 C28 90 28 50 30 34 C30 28 26 28 22 32 Z',
    D: 'M114 32 C120 60 120 110 110 130 C104 128 102 122 102 116 C108 90 108 50 106 34 C106 28 110 28 114 32 Z',
  },
  gingivitisPath: 'M26 85 C48 105 92 105 110 85 L110 118 C92 135 48 135 26 118 Z',
  periodontitisPath: 'M26 118 C48 135 92 135 110 118 L110 150 C92 168 48 168 26 150 Z',
  crownCap: 'M28 22 C50 16 90 16 110 22 L106 50 C84 40 50 40 28 50 Z',
  implant: { x: 56, y: 142, w: 22, h: 140, lines: [165, 190, 215, 240, 265] },
};

// ---------------------------------------------------------------------------
// UPPER MOLARS — FDI 16, 17, 18, 26, 27, 28 (molar_3_3_clean_lightblue.svg)
// Three-rooted upper molar. Source viewBox 212x291, path bbox x:22-195, y:17-279.
// Crown spans y:17-140, three root projections descend to y:279.
// ---------------------------------------------------------------------------
const UPPER_MOLAR_PATH =
  'M42 24 C50 18 56 20 68 21 C83 22 96 24 112 28 ' +
  'C120 21 128 17 139 18 C151 19 163 19 174 23 ' +
  'C188 28 192 43 193 61 C195 81 192 101 185 116 ' +
  'C181 125 174 132 170 139 ' +
  'C174 150 180 166 182 185 C185 210 184 236 188 260 ' +
  'C190 271 184 279 175 278 C165 277 160 266 158 252 ' +
  'C154 223 151 203 145 177 ' +
  'C140 204 134 231 124 253 C118 266 111 274 101 274 ' +
  'C91 274 86 264 83 250 C78 224 75 202 69 176 ' +
  'C64 205 61 231 56 252 C53 266 48 277 38 276 ' +
  'C28 275 24 267 26 255 C31 226 29 202 30 178 ' +
  'C31 161 32 148 36 137 ' +
  'C31 129 26 121 25 111 C23 102 29 98 28 89 ' +
  'C26 79 22 72 22 60 C22 44 31 32 42 24 Z';

const UPPER_MOLAR_ANATOMY: ToothAnatomy = {
  path: UPPER_MOLAR_PATH,
  scale: 0.22,
  xCenter: 108,
  crownBaseY: 140,
  surfacePaths: {
    L: 'M40 35 C80 22 155 22 185 35 C155 50 75 50 40 35 Z',
    O: 'M32 75 C72 60 152 60 188 75 C168 92 60 92 32 75 Z',
    B: 'M28 122 C72 110 152 110 188 122 C168 136 60 136 28 122 Z',
    M: 'M30 35 C20 70 20 115 34 140 C46 138 50 132 50 124 C40 90 40 50 44 38 C44 32 36 32 30 35 Z',
    D: 'M186 35 C196 70 196 115 182 140 C170 138 166 132 166 124 C176 90 176 50 172 38 C172 32 180 32 186 35 Z',
  },
  gingivitisPath: 'M30 88 C75 110 150 110 190 88 L190 120 C150 140 75 140 30 120 Z',
  periodontitisPath: 'M30 120 C75 140 150 140 190 120 L190 150 C150 172 75 172 30 150 Z',
  crownCap: 'M32 28 C70 18 145 18 185 28 L180 60 C140 45 75 45 35 60 Z',
  implant: { x: 96, y: 146, w: 24, h: 120, lines: [170, 196, 222, 248] },
};

// ---------------------------------------------------------------------------
// LOWER MOLARS — FDI 36, 37, 38, 46, 47, 48 (clean_tooth.svg)
// Source viewBox 92x108, path bbox x:14-72, y:7-100.
// ---------------------------------------------------------------------------
const LOWER_MOLAR_PATH =
  'M57.4 7.4 C53.6 10.1 49.3 10.2 45.3 10.0 ' +
  'C41.6 9.8 39.0 11.5 37.1 14.2 ' +
  'C33.9 13.0 31.2 11.5 27.8 11.5 ' +
  'H20.2 C16.6 11.5 14.4 13.8 14.4 17.2 ' +
  'V28.8 C14.4 34.2 18.7 39.4 21.5 43.5 ' +
  'C22.1 53.1 22.0 62.8 23.1 72.3 ' +
  'C24.2 82.7 29.3 94.1 35.0 98.0 ' +
  'C38.2 100.2 41.5 98.4 42.0 94.3 ' +
  'C42.8 87.2 42.6 77.6 44.0 70.4 ' +
  'C47.4 74.9 50.1 81.2 52.2 87.2 ' +
  'C54.1 92.7 57.0 100.0 61.2 97.1 ' +
  'C66.6 93.3 68.1 84.9 68.2 78.2 ' +
  'C68.5 66.9 67.7 54.8 66.8 43.6 ' +
  'C70.2 38.6 71.8 31.0 70.8 24.5 ' +
  'C69.7 16.8 65.0 8.1 57.4 7.4 Z';

const LOWER_MOLAR_ANATOMY: ToothAnatomy = {
  path: LOWER_MOLAR_PATH,
  scale: 0.68,
  xCenter: 43,
  crownBaseY: 43,
  surfacePaths: {
    L: 'M22 13 C34 7 54 7 64 13 C54 19 32 19 22 13 Z',
    O: 'M18 24 C32 18 56 18 70 24 C58 32 30 32 18 24 Z',
    B: 'M16 36 C30 28 58 28 72 36 C58 43 30 43 16 36 Z',
    M: 'M16 12 C12 20 12 32 18 41 C22 40 24 37 24 35 C20 28 20 18 22 14 C22 12 18 11 16 12 Z',
    D: 'M70 12 C74 20 74 32 68 41 C64 40 62 37 62 35 C66 28 66 18 64 14 C64 12 68 11 70 12 Z',
  },
  gingivitisPath: 'M16 26 C30 31 56 31 70 26 L70 38 C56 43 30 43 16 38 Z',
  periodontitisPath: 'M16 38 C30 43 56 43 70 38 L70 48 C56 56 30 56 16 48 Z',
  crownCap: 'M14 8 C26 5 60 5 72 8 L70 24 C58 19 28 19 14 24 Z',
  implant: { x: 36, y: 50, w: 14, h: 48, lines: [58, 66, 74, 82, 90] },
};

function getAnatomy(fdi: number): ToothAnatomy {
  const position = fdi % 10;
  const isDeciduous = FDI_DECIDUOUS_SET.has(fdi);
  if (position <= 2) return INCISOR_ANATOMY;
  if (position === 3) return CANINE_ANATOMY;
  // Deciduous teeth have NO premolars — positions 4 and 5 are first and second
  // deciduous molars. Fall through to the molar template instead.
  if (position <= 5 && !isDeciduous) return PREMOLAR_ANATOMY;
  return isUpper(fdi) ? UPPER_MOLAR_ANATOMY : LOWER_MOLAR_ANATOMY;
}

// Maps the source path into the existing internal 0..64 x 0..128 box.
// Source (xCenter, crownBaseY) anchors at internal (32, 64) so the cervical
// line lines up with the gum band regardless of which tooth class is used.
function toothTransform(fdi: number, anatomy: ToothAnatomy): string {
  const s = anatomy.scale;
  const tx = 32 - s * anatomy.xCenter;
  if (isUpper(fdi)) {
    const ty = 64 + s * anatomy.crownBaseY;
    return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s} ${-s})`;
  }
  const ty = 64 - s * anatomy.crownBaseY;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s} ${s})`;
}

function ToothShape({
  fdi,
  status,
  surfaceFills,
  hasGingivitis,
  hasPeriodontitis,
  selected,
  hasIssues,
  primaryIssueColor,
  onSelect,
}: ToothShapeProps) {
  const isMissing = status === 'missing';
  const isImplant = status === 'implant';
  const isCrown = status === 'crown';
  const isRootCanal = status === 'root_canal';
  const isBridge = status === 'bridge';
  const clipId = `tooth-crown-clip-${fdi}`;
  const anatomy = getAnatomy(fdi);
  const transform = toothTransform(fdi, anatomy);
  const quadrant = Math.floor(fdi / 10);
  const mirrorSide = quadrant === 1 || quadrant === 4;

  const baseFill = isMissing ? 'transparent' : 'url(#dental-clean-tooth-fill)';
  const strokeColor = selected
    ? 'var(--color-accent)'
    : hasIssues
      ? (primaryIssueColor ?? 'var(--dental-tooth-stroke)')
      : 'url(#dental-clean-tooth-stroke)';
  const strokeWidth = selected ? 1.6 : hasIssues ? 1.3 : 0.95;
  const opacity = isMissing ? 0.32 : 1;
  const dashed = isMissing ? '3,3' : undefined;

  return (
    <g
      data-fdi={fdi}
      transform="translate(-32 -64) scale(0.96 1)"
      style={{ cursor: 'pointer' }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(fdi);
      }}
    >
      {selected && (
        <rect
          x={5}
          y={2}
          width={54}
          height={124}
          rx={19}
          fill="none"
          stroke="var(--color-accent)"
          strokeOpacity={0.55}
          strokeWidth={1}
          strokeDasharray="4,3"
        />
      )}

      <g transform={mirrorSide ? 'translate(64 0) scale(-1 1)' : undefined}>
        <g transform={transform}>
          <defs>
            <clipPath id={clipId}>
              <path d={anatomy.path} />
            </clipPath>
          </defs>

          {isImplant && !isMissing ? (
            <g opacity={opacity}>
              <rect
                x={anatomy.implant.x}
                y={anatomy.implant.y}
                width={anatomy.implant.w}
                height={anatomy.implant.h}
                rx={3}
                fill="var(--dental-implant-solid)"
                stroke="var(--dental-implant-stroke)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {anatomy.implant.lines.map((y) => (
                <line
                  key={y}
                  x1={anatomy.implant.x}
                  y1={y}
                  x2={anatomy.implant.x + anatomy.implant.w}
                  y2={y}
                  stroke="var(--dental-implant-thread)"
                  strokeWidth={0.9}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : (
            <>
              <path d={anatomy.path} fill={baseFill} opacity={opacity} />

              {!isMissing && (
                <g clipPath={`url(#${clipId})`}>
                  {(Object.entries(surfaceFills) as Array<[Surface, IssueType]>).map(
                    ([surface, issue]) => (
                      <path
                        key={surface}
                        d={anatomy.surfacePaths[surface]}
                        fill={ISSUE_COLOR[issue]}
                        fillOpacity={0.42}
                      />
                    ),
                  )}
                  {hasPeriodontitis && (
                    <path
                      d={anatomy.periodontitisPath}
                      fill={ISSUE_COLOR.periodontitis}
                      fillOpacity={0.55}
                    />
                  )}
                  {hasGingivitis && (
                    <path
                      d={anatomy.gingivitisPath}
                      fill={ISSUE_COLOR.gingivitis}
                      fillOpacity={0.55}
                    />
                  )}
                </g>
              )}

              {isCrown && !isMissing && (
                <path
                  d={anatomy.crownCap}
                  fill="var(--dental-crown-fill)"
                  stroke="var(--dental-crown-stroke)"
                  strokeWidth={0.8}
                  vectorEffect="non-scaling-stroke"
                  clipPath={`url(#${clipId})`}
                />
              )}

              {isRootCanal && !isMissing && (
                <line
                  x1={anatomy.xCenter}
                  y1={anatomy.crownBaseY + 6}
                  x2={anatomy.xCenter}
                  y2={anatomy.implant.y + anatomy.implant.h - 10}
                  stroke="var(--dental-rootcanal-stroke)"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.82}
                />
              )}

              {isBridge && !isMissing && (
                <rect
                  x={anatomy.xCenter - 36}
                  y={anatomy.crownBaseY - 18}
                  width={72}
                  height={11}
                  rx={2.4}
                  fill="var(--dental-bridge-fill)"
                  stroke="var(--dental-bridge-stroke)"
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                  clipPath={`url(#${clipId})`}
                />
              )}

              <path
                d={anatomy.path}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={dashed}
                opacity={opacity}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </g>
      </g>
    </g>
  );
}

export default memo(ToothShape);
