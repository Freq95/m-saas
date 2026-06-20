import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TreatmentPlanDoc } from '@/lib/server/treatment-plans';

type RenderOptions = {
  clientName: string;
  logoBuffer?: Buffer;
};

type ReactRuntime = typeof import('react');
type PdfRuntime = typeof import('@react-pdf/renderer');
type PdfStyles = ReturnType<PdfRuntime['StyleSheet']['create']>;

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(amount || 0);
  return `${formatted} ${currency}`;
}

function logoDataUri(buffer?: Buffer): string | null {
  if (!buffer || buffer.length === 0) return null;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function loadNodeReact(): ReactRuntime {
  const runtimeRequire = eval('require') as (id: string) => unknown;
  return runtimeRequire('react') as ReactRuntime;
}

// PT Serif — a transitional serif with full Romanian glyph coverage (ă â î ș ț),
// registered once per process. The built-in Times font silently drops those
// glyphs, so registering is required for correct Romanian rendering.
const FONT_FAMILY = 'PTSerif';
let fontState: 'pending' | 'ready' | 'failed' = 'pending';

function ensureFonts(renderer: PdfRuntime): string {
  if (fontState === 'ready') return FONT_FAMILY;
  if (fontState === 'failed') return 'Helvetica';
  try {
    const dir = join(process.cwd(), 'public', 'fonts', 'ptserif');
    const regular = join(dir, 'PTSerif-Regular.ttf');
    if (!existsSync(regular)) throw new Error('font files missing');
    renderer.Font.register({
      family: FONT_FAMILY,
      fonts: [
        { src: regular },
        { src: join(dir, 'PTSerif-Bold.ttf'), fontWeight: 'bold' },
        { src: join(dir, 'PTSerif-Italic.ttf'), fontStyle: 'italic' },
      ],
    });
    fontState = 'ready';
    return FONT_FAMILY;
  } catch {
    // Missing font files at runtime: degrade to a built-in font rather than
    // throwing (diacritics will be imperfect, but the PDF still renders).
    fontState = 'failed';
    return 'Helvetica';
  }
}

// Refined monochrome palette — ink, hairlines, muted text.
const INK = '#1a1a1a';
const HAIR = '#d4d4d4';
const MUTED = '#555555';

function createStyles(renderer: PdfRuntime, family: string): PdfStyles {
  return renderer.StyleSheet.create({
    page: {
      paddingHorizontal: 46,
      paddingTop: 44,
      paddingBottom: 70,
      fontFamily: family,
      fontSize: 10,
      color: INK,
      backgroundColor: '#ffffff',
    },
    // ── Brand (centered, editorial) ──
    brand: {
      alignItems: 'center',
      marginBottom: 6,
    },
    logo: {
      width: 40,
      height: 40,
      objectFit: 'contain',
      marginBottom: 8,
    },
    clinic: {
      fontSize: 25,
      fontWeight: 'bold',
      letterSpacing: 1.5,
      textAlign: 'center',
    },
    doctorLine: {
      fontSize: 9,
      letterSpacing: 2.4,
      color: MUTED,
      marginTop: 5,
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    doctorSpecialty: {
      fontSize: 8.5,
      letterSpacing: 1.8,
      color: MUTED,
      marginTop: 2,
      textAlign: 'center',
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      letterSpacing: 1,
      textAlign: 'center',
      marginTop: 18,
      textTransform: 'uppercase',
    },
    // ── Ornamental diamond divider ──
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      width: 150,
      marginTop: 9,
      marginBottom: 22,
    },
    dividerLine: { flex: 1, height: 0.8, backgroundColor: INK },
    diamond: {
      width: 5,
      height: 5,
      backgroundColor: INK,
      marginHorizontal: 6,
      transform: 'rotate(45deg)',
    },
    // ── Patient / date ──
    meta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 18,
      fontSize: 11,
    },
    metaItem: { flexDirection: 'row' },
    label: { fontWeight: 'bold', marginRight: 5 },
    // ── Table (black header, hairline body) ──
    table: {
      borderWidth: 1,
      borderColor: INK,
      marginBottom: 4,
    },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: INK,
    },
    row: {
      flexDirection: 'row',
      borderTopWidth: 0.6,
      borderTopColor: HAIR,
      minHeight: 30,
    },
    rowFirst: { borderTopWidth: 0 },
    th: {
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: 9,
      letterSpacing: 0.6,
      paddingVertical: 7,
      paddingHorizontal: 8,
      textTransform: 'uppercase',
    },
    td: {
      paddingVertical: 7,
      paddingHorizontal: 8,
      justifyContent: 'center',
    },
    cNo: { width: '11%', textAlign: 'center' },
    cProcedure: { width: '27%', fontWeight: 'bold' },
    cDetails: { width: '42%', color: MUTED },
    cCost: { width: '20%', textAlign: 'right', fontWeight: 'bold' },
    // ── Recapitulare (dotted leaders) ──
    recap: { marginTop: 22 },
    recapTitle: {
      fontWeight: 'bold',
      fontSize: 11,
      letterSpacing: 1.2,
      marginBottom: 9,
      textTransform: 'uppercase',
    },
    recapLine: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 6,
    },
    recapLeader: {
      flex: 1,
      borderBottomWidth: 0.8,
      borderBottomColor: '#c8c8c8',
      borderStyle: 'dotted',
      marginHorizontal: 6,
      marginBottom: 2.5,
    },
    recapAmount: { fontWeight: 'bold' },
    // ── Total bar ──
    totalBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1.4,
      borderColor: INK,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 22,
    },
    totalLabel: { fontSize: 14, fontWeight: 'bold', letterSpacing: 1 },
    totalValue: { fontSize: 18, fontWeight: 'bold', letterSpacing: 0.5 },
    // ── Signatures ──
    signedBy: {
      alignItems: 'center',
      marginTop: 22,
    },
    signedName: { fontSize: 12, fontWeight: 'bold' },
    signedSpecialty: {
      fontSize: 8,
      letterSpacing: 1.6,
      color: MUTED,
      marginTop: 2,
      textTransform: 'uppercase',
    },
    signatures: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 30,
    },
    signatureBox: {
      width: '44%',
      borderTopWidth: 0.8,
      borderTopColor: INK,
      paddingTop: 6,
    },
    signatureLabel: { fontSize: 9, fontWeight: 'bold' },
    signatureName: { fontSize: 9, color: MUTED, marginTop: 2 },
    // ── Footer ──
    footer: {
      position: 'absolute',
      left: 46,
      right: 46,
      bottom: 32,
      borderTopWidth: 0.5,
      borderTopColor: '#c8c8c8',
      paddingTop: 9,
      fontStyle: 'italic',
      fontSize: 8,
      color: MUTED,
      textAlign: 'center',
      lineHeight: 1.45,
    },
  });
}

function buildTreatmentPlanDocument(
  React: ReactRuntime,
  renderer: PdfRuntime,
  plan: TreatmentPlanDoc,
  { clientName, logoBuffer }: RenderOptions,
  fontFamily: string
): ReturnType<ReactRuntime['createElement']> {
  const { Document, Image, Page, Text, View } = renderer;
  const styles = createStyles(renderer, fontFamily);
  const logo = logoDataUri(logoBuffer);
  const h = React.createElement;

  // Ornamental hairline-with-diamond divider, reused under the title and
  // above the signature block.
  const divider = (key: string) => h(
    View,
    { key, style: styles.divider },
    h(View, { style: styles.dividerLine }),
    h(View, { style: styles.diamond }),
    h(View, { style: styles.dividerLine })
  );

  const brand = h(
    View,
    { style: styles.brand },
    logo ? h(Image, { src: logo, style: styles.logo }) : null,
    h(Text, { style: styles.clinic }, plan.clinic_name_snapshot),
    plan.doctor_subtitle_snapshot
      ? h(Text, { style: styles.doctorLine }, plan.doctor_subtitle_snapshot)
      : null,
    plan.doctor_specialty_snapshot
      ? h(Text, { style: styles.doctorSpecialty }, plan.doctor_specialty_snapshot)
      : null
  );

  const meta = h(
    View,
    { style: styles.meta },
    h(View, { style: styles.metaItem }, h(Text, { style: styles.label }, 'Pacient:'), h(Text, null, clientName)),
    h(View, { style: styles.metaItem }, h(Text, { style: styles.label }, 'Data:'), h(Text, null, plan.plan_date))
  );

  const tableRows = [
    h(
      View,
      { key: 'header', style: styles.headerRow },
      h(Text, { style: [styles.th, styles.cNo] }, 'Nr. crt.'),
      h(Text, { style: [styles.th, styles.cProcedure] }, 'Procedură'),
      h(Text, { style: [styles.th, styles.cDetails] }, 'Detalii'),
      h(Text, { style: [styles.th, styles.cCost] }, 'Cost')
    ),
    ...plan.items.map((item, index) => h(
      View,
      {
        key: `${item.procedure}-${index}`,
        style: index === 0 ? [styles.row, styles.rowFirst] : styles.row,
      },
      h(Text, { style: [styles.td, styles.cNo] }, String(index + 1)),
      h(Text, { style: [styles.td, styles.cProcedure] }, item.procedure),
      h(Text, { style: [styles.td, styles.cDetails] }, item.details || '—'),
      h(Text, { style: [styles.td, styles.cCost] }, formatMoney(item.line_total, plan.currency))
    )),
  ];

  const totalBar = h(
    View,
    { style: styles.totalBar },
    h(Text, { style: styles.totalLabel }, 'TOTAL GENERAL:'),
    h(Text, { style: styles.totalValue }, formatMoney(plan.total, plan.currency).toUpperCase())
  );

  const signedBy = h(
    View,
    { style: styles.signedBy },
    h(Text, { style: styles.signedName }, plan.doctor_name_snapshot),
    plan.doctor_specialty_snapshot
      ? h(Text, { style: styles.signedSpecialty }, plan.doctor_specialty_snapshot)
      : null
  );

  const signatures = h(
    View,
    { style: styles.signatures },
    h(
      View,
      { style: styles.signatureBox },
      h(Text, { style: styles.signatureLabel }, plan.signature_label_doctor_snapshot),
      h(Text, { style: styles.signatureName }, plan.doctor_name_snapshot)
    ),
    h(
      View,
      { style: styles.signatureBox },
      h(Text, { style: styles.signatureLabel }, plan.signature_label_patient_snapshot),
      h(Text, { style: styles.signatureName }, clientName)
    )
  );

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: styles.page },
      brand,
      h(Text, { style: styles.title }, 'Plan de tratament'),
      divider('d1'),
      meta,
      h(View, { style: styles.table }, ...tableRows),
      totalBar,
      divider('d2'),
      signedBy,
      signatures,
      h(Text, { style: styles.footer }, plan.disclaimer_snapshot)
    )
  );
}

export async function renderTreatmentPlanPdf(
  plan: TreatmentPlanDoc,
  options: RenderOptions
): Promise<Buffer> {
  const React = loadNodeReact();
  const renderer = await import('@react-pdf/renderer');
  const fontFamily = ensureFonts(renderer);
  const document = buildTreatmentPlanDocument(React, renderer, plan, options, fontFamily);
  return renderer.renderToBuffer(document);
}
