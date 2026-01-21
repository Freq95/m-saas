import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/services/[id] - Get a single service
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const serviceId = parseInt(params.id);

    const result = await db.query(
      `SELECT * FROM services WHERE id = $1`,
      [serviceId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ service: result.rows[0] });
  } catch (error: any) {
    console.error('Error fetching service:', error);
    return NextResponse.json(
      { error: 'Failed to fetch service', details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/services/[id] - Update a service
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const serviceId = parseInt(params.id);
    const body = await request.json();

    const { name, durationMinutes, price, description } = body;

    const updates: string[] = [];
    const updateParams: any[] = [];

    if (name !== undefined) {
      updates.push(`name = $${updateParams.length + 1}`);
      updateParams.push(name);
    }

    if (durationMinutes !== undefined) {
      updates.push(`duration_minutes = $${updateParams.length + 1}`);
      updateParams.push(durationMinutes);
    }

    if (price !== undefined) {
      updates.push(`price = $${updateParams.length + 1}`);
      updateParams.push(price);
    }

    if (description !== undefined) {
      updates.push(`description = $${updateParams.length + 1}`);
      updateParams.push(description);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updateParams.push(serviceId);

    await db.query(
      `UPDATE services SET ${updates.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    // Reload service
    const result = await db.query(
      `SELECT * FROM services WHERE id = $1`,
      [serviceId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ service: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating service:', error);
    return NextResponse.json(
      { error: 'Failed to update service', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/services/[id] - Delete a service
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const serviceId = parseInt(params.id);

    // Check if service is used in any appointments
    const appointmentsResult = await db.query(
      `SELECT COUNT(*) as count FROM appointments WHERE service_id = $1`,
      [serviceId]
    );

    const appointmentCount = parseInt(appointmentsResult.rows[0]?.count || '0');
    if (appointmentCount > 0) {
      return NextResponse.json(
        { 
          error: `Cannot delete service. It is used in ${appointmentCount} appointment(s).`,
          appointmentCount 
        },
        { status: 400 }
      );
    }

    await db.query(
      `DELETE FROM services WHERE id = $1`,
      [serviceId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting service:', error);
    return NextResponse.json(
      { error: 'Failed to delete service', details: error.message },
      { status: 500 }
    );
  }
}

