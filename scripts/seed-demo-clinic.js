/**
 * seed-demo-clinic.js — build a polished, presentation-ready demo clinic.
 *
 *   node scripts/seed-demo-clinic.js            # (re)seed — idempotent, clean slate each run
 *   node scripts/seed-demo-clinic.js --cleanup  # remove the demo clinic + ALL its data
 *
 * One isolated tenant ("Cabinet Stomatologic Demo") with four roles, a real
 * Romanian dental service menu, ~14 patients with computed stats, appointments
 * spread across past / today / upcoming (so the calendar + dashboard look alive),
 * and rich odontograms on four patients. Fully isolated — nothing outside this
 * tenant is touched, and --cleanup removes everything.
 *
 * Accounts (password 11111111):
 *   owner@test.com         Dr. Andrei Pop      (owner)
 *   doctor@test.com        Dr. Maria Ionescu   (dentist)
 *   asistent@test.com      Elena Dumitru       (asistent → Dr. Maria)
 *   receptionist@test.com  Ana Marin           (receptionist)
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const DEFAULT_DB_NAME = 'm-saas';
const CLEANUP = process.argv.includes('--cleanup');

const TENANT_NAME = 'Cabinet Stomatologic Demo';
const TENANT_SLUG = 'demo-clinic';
const PASSWORD = '11111111';
const BCRYPT_COST = 12;

// Collections that carry a tenant_id and get purged on reseed/cleanup.
const TENANT_SCOPED = [
  'clients', 'appointments', 'services', 'calendars', 'calendar_shares',
  'appointment_categories', 'tooth_states', 'tooth_events', 'surgery_groups',
  'bridge_groups', 'treatment_plans', 'treatment_plan_settings',
  'conversations', 'messages', 'reminders', 'blocked_times',
  'notifications', 'client_notes', 'contact_notes', 'client_files', 'contact_files',
];

// ── Categories (mirror ensureDefaultAppointmentCategories) ───────────────────
const CATEGORY_DEFS = [
  { key: 'consultatie', label: 'Consultatie', color: '#7dd3fc', position: 0 },
  { key: 'tratament',   label: 'Tratament',   color: '#6ee7b7', position: 1 },
  { key: 'control',     label: 'Control',     color: '#c4b5fd', position: 2 },
  { key: 'urgenta',     label: 'Urgenta',     color: '#fdba74', position: 3 },
  { key: 'altele',      label: 'Altele',      color: '#cbd5e1', position: 4 },
];

// ── Service menu (name, minutes, price lei, default category key) ────────────
const SERVICES = [
  { name: 'Consultație', duration_minutes: 20, price: 100, cat: 'consultatie' },
  { name: 'Control periodic', duration_minutes: 20, price: 80, cat: 'control' },
  { name: 'Detartraj + periaj + air flow', duration_minutes: 30, price: 250, cat: 'tratament' },
  { name: 'Obturație fizionomică (plombă)', duration_minutes: 45, price: 300, cat: 'tratament' },
  { name: 'Tratament endodontic (canal)', duration_minutes: 60, price: 450, cat: 'tratament' },
  { name: 'Extracție simplă', duration_minutes: 30, price: 200, cat: 'tratament' },
  { name: 'Extracție chirurgicală', duration_minutes: 60, price: 500, cat: 'urgenta' },
  { name: 'Coroană ceramică', duration_minutes: 60, price: 1200, cat: 'tratament' },
  { name: 'Implant dentar', duration_minutes: 90, price: 3000, cat: 'tratament' },
  { name: 'Punte ceramică', duration_minutes: 90, price: 3500, cat: 'tratament' },
  { name: 'Albire profesională', duration_minutes: 60, price: 1000, cat: 'tratament' },
  { name: 'Radiografie dentară', duration_minutes: 15, price: 50, cat: 'altele' },
  { name: 'Urgență — durere acută', duration_minutes: 30, price: 200, cat: 'urgenta' },
];

// ── Patients. owner = Dr. Andrei, doctor = Dr. Maria. Each carries an
//    appointment plan (service name, day offset from today, hour, status). ────
const CLIENTS = [
  { key: 'andreea', name: 'Andreea Popescu', phone: '+40721000101', email: 'andreea.popescu@example.com', dentist: 'doctor', consent: true, appts: [
    { svc: 'Consultație', day: -16, hour: 10, status: 'completed' },
    { svc: 'Obturație fizionomică (plombă)', day: -9, hour: 11, status: 'completed' },
    { svc: 'Control periodic', day: 7, hour: 9, status: 'scheduled' },
  ] },
  { key: 'mihai', name: 'Mihai Ionescu', phone: '+40721000102', email: 'mihai.ionescu@example.com', dentist: 'doctor', consent: true, appts: [
    { svc: 'Consultație', day: -22, hour: 12, status: 'completed' },
    { svc: 'Implant dentar', day: -8, hour: 14, status: 'completed' },
    { svc: 'Control periodic', day: 0, hour: 11, minute: 30, status: 'scheduled' },
  ] },
  { key: 'elena', name: 'Elena Constantinescu', phone: '+40721000103', email: null, dentist: 'doctor', consent: false, appts: [
    { svc: 'Detartraj + periaj + air flow', day: -5, hour: 9, status: 'completed' },
    { svc: 'Albire profesională', day: 3, hour: 15, status: 'scheduled' },
  ] },
  { key: 'george', name: 'George Dumitrescu', phone: '+40721000104', email: 'george.d@example.com', dentist: 'doctor', consent: true, appts: [
    { svc: 'Urgență — durere acută', day: -2, hour: 16, status: 'completed' },
    { svc: 'Tratament endodontic (canal)', day: 0, hour: 9, status: 'scheduled' },
  ] },
  { key: 'ioana', name: 'Ioana Marin', phone: '+40721000105', email: 'ioana.marin@example.com', dentist: 'doctor', consent: true, appts: [
    { svc: 'Consultație', day: -12, hour: 13, status: 'no-show' },
    { svc: 'Consultație', day: 0, hour: 14, status: 'scheduled' },
  ] },
  { key: 'stefan', name: 'Ștefan Radu', phone: '+40721000106', email: null, dentist: 'doctor', consent: false, appts: [
    { svc: 'Coroană ceramică', day: -6, hour: 10, status: 'completed' },
    { svc: 'Control periodic', day: 10, hour: 12, status: 'scheduled' },
  ] },
  { key: 'gabriela', name: 'Gabriela Stan', phone: '+40721000107', email: 'gabi.stan@example.com', dentist: 'doctor', consent: true, appts: [
    { svc: 'Detartraj + periaj + air flow', day: -1, hour: 15, status: 'cancelled' },
    { svc: 'Detartraj + periaj + air flow', day: 2, hour: 11, status: 'scheduled' },
  ] },
  { key: 'vlad', name: 'Vlad Niculae', phone: '+40721000108', email: null, dentist: 'doctor', is_minor: true, guardian: 'Cornel Niculae', consent: true, appts: [
    { svc: 'Consultație', day: -4, hour: 16, status: 'completed' },
    { svc: 'Control periodic', day: 5, hour: 16, status: 'scheduled' },
  ] },
  { key: 'cristina', name: 'Cristina Munteanu', phone: '+40721000109', email: 'cristina.m@example.com', dentist: 'owner', consent: true, appts: [
    { svc: 'Consultație', day: -18, hour: 9, status: 'completed' },
    { svc: 'Extracție chirurgicală', day: -7, hour: 13, status: 'completed' },
    { svc: 'Control periodic', day: 0, hour: 15, minute: 30, status: 'scheduled' },
  ] },
  { key: 'alexandru', name: 'Alexandru Georgescu', phone: '+40721000110', email: 'alex.g@example.com', dentist: 'owner', consent: true, appts: [
    { svc: 'Consultație', day: -20, hour: 11, status: 'completed' },
    { svc: 'Punte ceramică', day: -10, hour: 10, status: 'completed' },
    { svc: 'Control periodic', day: 12, hour: 14, status: 'scheduled' },
  ] },
  { key: 'mariat', name: 'Maria Tudor', phone: '+40721000111', email: null, dentist: 'owner', consent: false, appts: [
    { svc: 'Albire profesională', day: -3, hour: 14, status: 'completed' },
    { svc: 'Consultație', day: 0, hour: 16, minute: 30, status: 'scheduled' },
  ] },
  { key: 'bogdan', name: 'Bogdan Florea', phone: '+40721000112', email: 'bogdan.f@example.com', dentist: 'owner', consent: true, appts: [
    { svc: 'Radiografie dentară', day: -11, hour: 12, status: 'completed' },
    { svc: 'Obturație fizionomică (plombă)', day: 4, hour: 9, status: 'scheduled' },
  ] },
  { key: 'raluca', name: 'Raluca Dobre', phone: '+40721000113', email: null, dentist: 'owner', is_minor: true, guardian: 'Sorin Dobre', consent: true, appts: [
    { svc: 'Consultație', day: -1, hour: 10, status: 'no-show' },
    { svc: 'Control periodic', day: 6, hour: 10, status: 'scheduled' },
  ] },
  { key: 'daniel', name: 'Daniel Stoica', phone: '+40721000114', email: 'daniel.stoica@example.com', dentist: 'owner', consent: true, appts: [
    { svc: 'Tratament endodontic (canal)', day: -8, hour: 13, status: 'completed' },
    { svc: 'Coroană ceramică', day: 8, hour: 11, status: 'scheduled' },
  ] },
];

// ── Odontogram seeds (per patient). status events + per-tooth issues + groups.
const DENTAL = {
  andreea: {
    issues: [
      { fdi: 16, issue_type: 'caries', surfaces: ['O'], severity: 'moderate', notes: 'Carie ocluzală.' },
      { fdi: 24, issue_type: 'caries', surfaces: [], severity: 'mild' },
      { fdi: 11, issue_type: 'gingivitis', surfaces: [] },
    ],
  },
  mihai: {
    statuses: [{ fdi: 36, status: 'implant' }, { fdi: 46, status: 'crown' }],
    issues: [
      { fdi: 36, issue_type: 'implantation', surfaces: [], notes: 'Implant pozat.', metadata: { implant_manufacturer: 'Nobel', implant_model: 'Replace', implant_sizes: '4.3mm × 10mm' } },
    ],
  },
  cristina: {
    issues: [
      { fdi: 31, issue_type: 'periodontitis', surfaces: [], severity: 'moderate' },
      { fdi: 41, issue_type: 'periodontitis', surfaces: [], severity: 'mild' },
    ],
    surgery: [{ tooth_fdis: [26, 27], comment: 'Extracție molari 26, 27 — vindecare bună.' }],
  },
  alexandru: {
    statuses: [{ fdi: 14, status: 'crown' }, { fdi: 16, status: 'crown' }],
    issues: [{ fdi: 21, issue_type: 'caries', surfaces: ['M', 'D'], severity: 'moderate' }],
    bridges: [{ tooth_fdis: [14, 15, 16], comment: 'Punte ceramică 14–16.' }],
  },
};

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try { const d = new URL(uri).pathname.replace(/^\//, ''); if (d) return d; } catch { /* ignore */ }
  return DEFAULT_DB_NAME;
}

// Sequential id allocator — reads max(id) once per collection, then increments.
function makeIdAllocator(db) {
  const cache = new Map();
  return async (collection) => {
    if (!cache.has(collection)) {
      const latest = await db.collection(collection).find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
      cache.set(collection, ((latest && latest.id) || 0));
    }
    const next = cache.get(collection) + 1;
    cache.set(collection, next);
    return next;
  };
}

// Appointment instant that DISPLAYS as hour:minute Europe/Bucharest wall-clock
// time on "today + dayOffset". densa renders times in the viewer's local TZ, and
// the demo is presented in Romania (EEST = UTC+3 in June), so the stored UTC
// instant is the Bucharest wall time minus 3h. Machine-TZ-independent.
const BUCHAREST_OFFSET_HOURS = 3; // EEST (summer); demo is anchored to June 2026
function at(dayOffset, hour, minute = 0) {
  const buNow = new Date(Date.now() + BUCHAREST_OFFSET_HOURS * 3600 * 1000);
  return new Date(Date.UTC(
    buNow.getUTCFullYear(), buNow.getUTCMonth(), buNow.getUTCDate() + dayOffset,
    hour - BUCHAREST_OFFSET_HOURS, minute, 0, 0
  ));
}

const OWNER_PERMS = { can_view: true, can_create: true, can_edit_own: true, can_edit_all: true, can_delete_own: true, can_delete_all: true };

async function purgeTenant(db, tenantId) {
  for (const coll of TENANT_SCOPED) {
    await db.collection(coll).deleteMany({ tenant_id: tenantId });
  }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));
  const nextId = makeIdAllocator(db);

  try {
    const existing = await db.collection('tenants').findOne({ slug: TENANT_SLUG });

    if (CLEANUP) {
      if (!existing) { console.log('No demo clinic found — nothing to clean.'); return; }
      await purgeTenant(db, existing._id);
      await db.collection('users').deleteMany({ tenant_id: existing._id });
      await db.collection('team_members').deleteMany({ tenant_id: existing._id });
      await db.collection('tenants').deleteOne({ _id: existing._id });
      console.log(`✓ Demo clinic "${TENANT_NAME}" and all its data removed.`);
      return;
    }

    const now = new Date().toISOString();

    // ── Tenant ──
    let tenantId;
    if (existing) {
      tenantId = existing._id;
      await purgeTenant(db, tenantId);
      await db.collection('users').deleteMany({ tenant_id: tenantId });
      await db.collection('team_members').deleteMany({ tenant_id: tenantId });
      await db.collection('tenants').updateOne({ _id: tenantId }, { $set: { name: TENANT_NAME, status: 'active', plan: 'pro', max_seats: 10, updated_at: now } });
    } else {
      tenantId = new ObjectId();
      await db.collection('tenants').insertOne({
        _id: tenantId, name: TENANT_NAME, slug: TENANT_SLUG, owner_id: null,
        plan: 'pro', max_seats: 10, status: 'active',
        settings: { timezone: 'Europe/Bucharest', currency: 'RON', working_hours: {} },
        created_at: now, updated_at: now,
      });
    }

    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);

    // ── Users + memberships ──
    async function makeUser(email, name, role, color, assignedIds) {
      const numericId = await nextId('users');
      const _id = new ObjectId();
      await db.collection('users').insertOne({
        _id, id: numericId, email, password_hash: passwordHash, name, role,
        tenant_id: tenantId, status: 'active', session_version: 0, color: color || null,
        created_at: now, updated_at: now,
      });
      const member = {
        tenant_id: tenantId, user_id: _id, email, role, status: 'active',
        accepted_at: now, invited_at: now, created_at: now, updated_at: now,
      };
      if (assignedIds) member.assigned_dentist_user_ids = assignedIds;
      await db.collection('team_members').insertOne(member);
      return { _id, id: numericId, name, email, role, color };
    }

    const owner = await makeUser('owner@test.com', 'Dr. Andrei Pop', 'owner', 'blue');
    const doctor = await makeUser('doctor@test.com', 'Dr. Maria Ionescu', 'dentist', 'pink');
    await makeUser('asistent@test.com', 'Elena Dumitru', 'asistent', null, [doctor.id]);
    await makeUser('receptionist@test.com', 'Ana Marin', 'receptionist', null);
    await db.collection('tenants').updateOne({ _id: tenantId }, { $set: { owner_id: owner._id } });

    const dentists = { owner, doctor };

    // ── Default calendars (one per dentist) ──
    async function makeCalendar(d, colorId) {
      const id = await nextId('calendars');
      await db.collection('calendars').insertOne({
        _id: id, id, tenant_id: tenantId, owner_user_id: d.id, owner_db_user_id: d._id,
        name: 'Calendarul meu', color_mine: colorId, color_others: '#64748B',
        is_default: true, is_active: true, created_at: now, updated_at: now,
      });
      return id;
    }
    const ownerCalId = await makeCalendar(owner, 'blue');
    const doctorCalId = await makeCalendar(doctor, 'pink');
    const calByDentist = { owner: ownerCalId, doctor: doctorCalId };

    // ── Two-way accepted shares so owner & doctor each see both calendars ──
    async function shareCalendar(calId, fromD, toD, recipientColor) {
      const id = await nextId('calendar_shares');
      await db.collection('calendar_shares').insertOne({
        _id: new ObjectId(), id, calendar_id: calId, tenant_id: tenantId,
        shared_with_user_id: toD._id, shared_with_email: toD.email,
        shared_by_user_id: fromD._id, shared_by_name: fromD.name,
        dentist_display_name: toD.name, dentist_color: recipientColor,
        permissions: OWNER_PERMS, status: 'accepted',
        created_at: now, updated_at: now, accepted_at: now,
      });
    }
    await shareCalendar(doctorCalId, doctor, owner, 'blue');
    await shareCalendar(ownerCalId, owner, doctor, 'pink');

    // ── Categories (per dentist) ──
    const catByDentist = {};
    for (const key of ['owner', 'doctor']) {
      const d = dentists[key];
      const map = {};
      for (const c of CATEGORY_DEFS) {
        const id = await nextId('appointment_categories');
        await db.collection('appointment_categories').insertOne({
          _id: id, id, tenant_id: tenantId, user_id: d.id, key: c.key,
          label: c.label, color: c.color, position: c.position, created_at: now, updated_at: now,
        });
        map[c.key] = { id, label: c.label, color: c.color };
      }
      catByDentist[key] = map;
    }

    // ── Services (per dentist — same menu) ──
    const svcByDentist = {};
    for (const key of ['owner', 'doctor']) {
      const d = dentists[key];
      const map = {};
      for (const s of SERVICES) {
        const id = await nextId('services');
        await db.collection('services').insertOne({
          _id: id, id, tenant_id: tenantId, user_id: d.id, name: s.name,
          duration_minutes: s.duration_minutes, price: s.price, description: null,
          created_at: now, updated_at: now,
        });
        map[s.name] = { id, ...s };
      }
      svcByDentist[key] = map;
    }

    // ── Clients + appointments ──
    let apptCount = 0;
    for (const c of CLIENTS) {
      const d = dentists[c.dentist];
      const clientId = await nextId('clients');
      await db.collection('clients').insertOne({
        _id: clientId, id: clientId, tenant_id: tenantId, user_id: d.id,
        name: c.name, email: c.email || null, phone: c.phone, notes: null,
        consent_given: !!c.consent, consent_date: c.consent ? now : null,
        consent_method: c.consent ? 'verbal' : null,
        is_minor: !!c.is_minor, parent_guardian_name: c.guardian || null,
        total_spent: 0, total_appointments: 0, last_appointment_date: null,
        last_conversation_date: null, first_contact_date: now, last_activity_date: now,
        created_at: now, updated_at: now,
      });
      c._clientId = clientId;
      c._dentist = d;

      const clientAppts = [];
      for (const a of c.appts) {
        const svc = svcByDentist[c.dentist][a.svc];
        if (!svc) throw new Error(`Unknown service "${a.svc}" for ${c.name}`);
        const cat = catByDentist[c.dentist][svc.cat];
        const start = at(a.day, a.hour, a.minute || 0);
        const end = new Date(start.getTime() + svc.duration_minutes * 60000);
        const id = await nextId('appointments');
        const doc = {
          _id: id, id, tenant_id: tenantId, user_id: d.id, calendar_id: calByDentist[c.dentist],
          created_by_user_id: d._id,
          service_owner_user_id: d.id, service_owner_tenant_id: tenantId,
          dentist_db_user_id: d._id, dentist_id: d.id,
          conversation_id: null,
          service_ids: [svc.id], service_names_snapshot: [svc.name], prices_at_time: [svc.price],
          service_id: svc.id, service_name: svc.name,
          client_id: clientId, client_name: c.name, client_email: c.email || null, client_phone: c.phone,
          start_time: start.toISOString(), end_time: end.toISOString(),
          status: a.status,
          category: cat.label ? svc.cat : null, category_label: cat.label, category_color: cat.color,
          color: null, notes: null,
          price_at_time: svc.price > 0 ? svc.price : null,
          reminder_sent: a.day < 0,
          created_at: now, updated_at: now,
        };
        await db.collection('appointments').insertOne(doc);
        clientAppts.push(doc);
        apptCount++;
      }

      // ── Client stats (mirror updateClientStats) ──
      const completed = clientAppts.filter((a) => a.status === 'completed');
      const totalSpent = completed.reduce((s, a) => s + (a.price_at_time || 0), 0);
      const totalAppointments = clientAppts.filter((a) => ['scheduled', 'completed'].includes(a.status)).length;
      const lastAppointmentDate = completed.map((a) => a.start_time).sort().reverse()[0] || null;
      const nowIso = new Date().toISOString();
      const nextScheduledDate = clientAppts
        .filter((a) => a.status === 'scheduled' && a.start_time >= nowIso)
        .map((a) => a.start_time).sort()[0] || null;
      const lastActivityDate = [lastAppointmentDate, nextScheduledDate, now].filter(Boolean).sort().reverse()[0];
      await db.collection('clients').updateOne({ _id: clientId }, { $set: {
        total_spent: totalSpent, total_appointments: totalAppointments,
        last_appointment_date: lastAppointmentDate, next_scheduled_date: nextScheduledDate,
        last_activity_date: lastActivityDate, updated_at: nowIso,
      } });
    }

    // ── Dental (odontograms) ──
    const clientByKey = Object.fromEntries(CLIENTS.map((c) => [c.key, c]));
    let toothEventCount = 0;
    for (const [key, plan] of Object.entries(DENTAL)) {
      const c = clientByKey[key];
      if (!c) continue;
      const d = c._dentist;
      const scope = { tenant_id: tenantId, user_id: d.id, client_id: c._clientId };
      const statusByFdi = new Map((plan.statuses || []).map((s) => [s.fdi, s.status]));
      const issuesByFdi = new Map();

      for (const iss of (plan.issues || [])) {
        const eventId = await nextId('tooth_events');
        const occurredAt = at(-6, 12).toISOString();
        await db.collection('tooth_events').insertOne({
          _id: eventId, id: eventId, ...scope, tooth_fdi: iss.fdi,
          surfaces: iss.surfaces || [], issue_type: iss.issue_type, action: 'diagnosed',
          severity: iss.severity, doctor_user_id: d.id, doctor_name_snapshot: d.name,
          occurred_at: occurredAt, notes: iss.notes, metadata: iss.metadata,
          created_at: occurredAt,
        });
        toothEventCount++;
        if (!issuesByFdi.has(iss.fdi)) issuesByFdi.set(iss.fdi, []);
        issuesByFdi.get(iss.fdi).push({
          issue_type: iss.issue_type, surfaces: iss.surfaces || [], severity: iss.severity, last_event_id: eventId,
        });
      }

      const allFdis = new Set([...statusByFdi.keys(), ...issuesByFdi.keys()]);
      for (const fdi of allFdis) {
        const stateId = await nextId('tooth_states');
        await db.collection('tooth_states').insertOne({
          _id: stateId, id: stateId, ...scope, tooth_fdi: fdi,
          status: statusByFdi.get(fdi) || 'present',
          current_issues: issuesByFdi.get(fdi) || [],
          last_manipulation_at: at(-6, 12).toISOString(),
          created_at: now, updated_at: now,
        });
      }

      for (const g of (plan.surgery || [])) {
        const id = await nextId('surgery_groups');
        await db.collection('surgery_groups').insertOne({
          _id: id, id, ...scope, tooth_fdis: g.tooth_fdis, comment: g.comment,
          doctor_user_id: d.id, doctor_name_snapshot: d.name, created_at: now, updated_at: now,
        });
      }
      for (const g of (plan.bridges || [])) {
        const id = await nextId('bridge_groups');
        await db.collection('bridge_groups').insertOne({
          _id: id, id, ...scope, tooth_fdis: g.tooth_fdis, comment: g.comment,
          doctor_user_id: d.id, doctor_name_snapshot: d.name, created_at: now, updated_at: now,
        });
      }
    }

    console.log(`\n${'='.repeat(66)}`);
    console.log(`✓ Demo clinic ready: "${TENANT_NAME}"  [${tenantId}]`);
    console.log(`  ${CLIENTS.length} patients · ${apptCount} appointments · ${toothEventCount} dental events`);
    console.log(`  Password (all accounts): ${PASSWORD}`);
    console.log(`${'-'.repeat(66)}`);
    console.log('  owner@test.com         Dr. Andrei Pop      (owner)');
    console.log('  doctor@test.com        Dr. Maria Ionescu   (dentist)');
    console.log('  asistent@test.com      Elena Dumitru       (asistent → Dr. Maria)');
    console.log('  receptionist@test.com  Ana Marin           (receptionist)');
    console.log(`${'='.repeat(66)}`);
    console.log('  Re-run anytime (clean slate). Remove with --cleanup.');
  } finally {
    await client.close();
  }
}

run().catch((e) => { console.error('seed-demo-clinic failed:', e); process.exit(1); });
