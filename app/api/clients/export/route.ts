import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/clients/export - Export clients to CSV
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDbOrThrow();
    const { userId, tenantId } = await getAuthUser();

    const clients = await db
      .collection('clients')
      .find({ user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } })
      .sort({ name: 1 })
      .toArray();

    const headers = [
      'ID',
      'Nume',
      'Email',
      'Telefon',
      'Total cheltuit (RON)',
      'Programari totale',
      'Ultima vizita',
      'Ultima conversatie',
      'Prima contactare',
      'Data crearii',
    ];

    const csvRows = [headers.join(',')];

    for (const client of clients) {
      const row = [
        client.id,
        `"${(client.name || '').replace(/"/g, '""')}"`,
        client.email ? `"${client.email.replace(/"/g, '""')}"` : '',
        client.phone ? `"${client.phone.replace(/"/g, '""')}"` : '',
        (client.total_spent || 0).toFixed(2),
        client.total_appointments || 0,
        client.last_appointment_date
          ? new Date(client.last_appointment_date).toLocaleDateString('ro-RO')
          : '',
        client.last_conversation_date
          ? new Date(client.last_conversation_date).toLocaleDateString('ro-RO')
          : '',
        client.first_contact_date
          ? new Date(client.first_contact_date).toLocaleDateString('ro-RO')
          : '',
        client.created_at
          ? new Date(client.created_at).toLocaleDateString('ro-RO')
          : '',
      ];
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');
    const csvWithBOM = '\uFEFF' + csv; // Add BOM for Excel compatibility

    return new NextResponse(csvWithBOM, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="clienti_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to export clients');
  }
}
