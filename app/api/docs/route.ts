import { NextResponse } from 'next/server';

/**
 * OpenAPI/Swagger API Documentation
 * GET /api/docs - Returns minimal maintained OpenAPI 3.0 specification.
 * Note: Advanced scheduling/experimental routes are intentionally excluded.
 */
export async function GET() {
  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: 'm-saas API',
      version: '1.0.0',
      description:
        'Minimal maintained API surface for core CRM flows (clients, appointments, services, conversations, dashboard).',
    },
    'x-docs-scope': 'minimal-maintained-surface',
    servers: [
      {
        url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
        description: 'API Server',
      },
    ],
    paths: {
      '/api/clients': {
        get: {
          summary: 'Get clients list',
          parameters: [
            { name: 'userId', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'lead', 'active', 'inactive', 'vip'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Success' },
          },
        },
        post: {
          summary: 'Create a new client',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    source: { type: 'string', enum: ['email', 'facebook', 'form', 'walk-in', 'unknown'] },
                    status: { type: 'string', enum: ['lead', 'active', 'inactive', 'vip'] },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Client created' },
            '400': { description: 'Invalid input' },
          },
        },
      },
      '/api/clients/{id}': {
        get: {
          summary: 'Get client details',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: {
            '200': { description: 'Success' },
            '404': { description: 'Client not found' },
          },
        },
        patch: {
          summary: 'Update client',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    status: { type: 'string', enum: ['lead', 'active', 'inactive', 'vip'] },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '404': { description: 'Client not found' },
          },
        },
      },
      '/api/appointments': {
        get: {
          summary: 'Get appointments',
          parameters: [
            { name: 'userId', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['scheduled', 'completed', 'cancelled', 'no-show'] } },
          ],
          responses: {
            '200': { description: 'Success' },
          },
        },
        post: {
          summary: 'Create appointment',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['serviceId', 'clientName', 'startTime'],
                  properties: {
                    serviceId: { type: 'integer' },
                    clientName: { type: 'string' },
                    clientEmail: { type: 'string', format: 'email' },
                    clientPhone: { type: 'string' },
                    startTime: { type: 'string', format: 'date-time' },
                    notes: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Appointment created' },
            '400': { description: 'Invalid input' },
          },
        },
      },
      '/api/services': {
        get: {
          summary: 'Get services',
          parameters: [{ name: 'userId', in: 'query', schema: { type: 'integer', default: 1 } }],
          responses: {
            '200': { description: 'Success' },
          },
        },
        post: {
          summary: 'Create service',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'durationMinutes'],
                  properties: {
                    name: { type: 'string' },
                    durationMinutes: { type: 'integer' },
                    price: { type: 'number' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Service created' },
            '400': { description: 'Invalid input' },
          },
        },
      },
      '/api/conversations': {
        get: {
          summary: 'Get conversations',
          parameters: [
            { name: 'userId', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'open', 'closed', 'pending'] } },
          ],
          responses: {
            '200': { description: 'Success' },
          },
        },
      },
      '/api/dashboard': {
        get: {
          summary: 'Get dashboard statistics',
          parameters: [
            { name: 'userId', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'days', in: 'query', schema: { type: 'integer', default: 7 } },
          ],
          responses: {
            '200': { description: 'Success' },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            source: { type: 'string' },
            status: { type: 'string' },
            total_spent: { type: 'number' },
            total_appointments: { type: 'integer' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

