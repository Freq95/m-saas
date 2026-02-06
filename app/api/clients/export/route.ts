import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// GET /api/clients/export - Export clients to CSV
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { userIdQuerySchema } = await import('@/lib/validation');
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const queryParams = {
      userId: searchParams.get('userId') || DEFAULT_USER_ID.toString(),
    };
    
    const validationResult = userIdQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }
    
    const { userId } = validationResult.data;

    // Get all clients for user
    const result = await db.query(
      `SELECT 
        id,
        name,
        email,
        phone,
        source,
        status,
        tags,
        total_spent,
        total_appointments,
        last_appointment_date,
        last_conversation_date,
        first_contact_date,
        created_at
       FROM clients
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );

    const clients = result.rows || [];

    // Convert to CSV
    const headers = [
      'ID',
      'Nume',
      'Email',
      'Telefon',
      'Sursă',
      'Status',
      'Tag-uri',
      'Total cheltuit (RON)',
      'Programări totale',
      'Ultima vizită',
      'Ultima conversație',
      'Prima contactare',
      'Data creării',
    ];

    const csvRows = [headers.join(',')];

    for (const client of clients) {
      const tags = typeof client.tags === 'string' 
        ? JSON.parse(client.tags || '[]') 
        : (client.tags || []);
      
      const row = [
        client.id,
        `"${(client.name || '').replace(/"/g, '""')}"`,
        client.email ? `"${client.email.replace(/"/g, '""')}"` : '',
        client.phone ? `"${client.phone.replace(/"/g, '""')}"` : '',
        client.source || '',
        client.status || '',
        `"${tags.join('; ').replace(/"/g, '""')}"`,
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

