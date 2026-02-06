# m-saas API Documentation

## Base URL
```
http://localhost:3000/api
```

## Authentication
Currently, the API uses a default `userId` parameter. In production, this should be replaced with proper authentication (JWT tokens or session-based auth).

## Rate Limiting
- **Read operations**: 100 requests per 15 minutes
- **Write operations**: 20 requests per 15 minutes
- Rate limit headers are included in responses:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in current window
  - `X-RateLimit-Reset`: Timestamp when the limit resets

## Error Responses
All errors follow a consistent format:
```json
{
  "error": "Error message",
  "details": "Additional details (only in development)"
}
```

## Endpoints

### Clients

#### GET /api/clients
Get list of clients with filtering and pagination.

**Query Parameters:**
- `userId` (integer, default: 1)
- `search` (string) - Search by name, email, or phone
- `status` (string) - Filter by status: `all`, `lead`, `active`, `inactive`, `vip`
- `source` (string) - Filter by source: `all`, `email`, `facebook`, `form`, `walk-in`, `unknown`
- `sortBy` (string) - Sort field: `name`, `email`, `total_spent`, `total_appointments`, `last_appointment_date`, `last_conversation_date`, `last_activity_date`, `created_at`
- `sortOrder` (string) - `ASC` or `DESC`
- `page` (integer, default: 1)
- `limit` (integer, default: 20)

**Response:**
```json
{
  "clients": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### POST /api/clients
Create a new client.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+40123456789",
  "source": "form",
  "status": "lead",
  "tags": ["new"],
  "notes": "Initial contact"
}
```

#### GET /api/clients/{id}
Get client details with appointments and conversations.

#### PATCH /api/clients/{id}
Update client information.

#### DELETE /api/clients/{id}
Soft delete client (sets status to 'deleted').

#### GET /api/clients/{id}/stats
Get detailed statistics for a client.

#### GET /api/clients/{id}/notes
Get notes for a client.

#### POST /api/clients/{id}/notes
Create a note for a client.

**Request Body:**
```json
{
  "userId": 1,
  "content": "Note content"
}
```

#### GET /api/clients/{id}/files
Get files for a client.

#### POST /api/clients/{id}/files
Upload a file for a client.

**Form Data:**
- `file` (File) - Required, max 10MB
- `description` (string) - Optional

#### GET /api/clients/export
Export clients to CSV.

### Appointments

#### GET /api/appointments
Get appointments with filtering.

**Query Parameters:**
- `userId` (integer)
- `startDate` (ISO datetime)
- `endDate` (ISO datetime)
- `status` (string) - `scheduled`, `completed`, `cancelled`, `no-show`

#### POST /api/appointments
Create a new appointment.

**Request Body:**
```json
{
  "serviceId": 1,
  "clientName": "John Doe",
  "clientEmail": "john@example.com",
  "clientPhone": "+40123456789",
  "startTime": "2024-01-15T10:00:00Z",
  "notes": "Optional notes"
}
```

### Services

#### GET /api/services
Get all services for a user.

#### POST /api/services
Create a new service.

#### PATCH /api/services/{id}
Update a service.

#### DELETE /api/services/{id}
Delete a service.

### Conversations

#### GET /api/conversations
Get all conversations.

#### POST /api/conversations
Create a new conversation.

#### GET /api/conversations/{id}
Get conversation with messages.

#### PATCH /api/conversations/{id}
Update conversation.

#### POST /api/conversations/{id}/messages
Send a message in a conversation.

#### GET /api/conversations/{id}/suggest-response
Get AI-suggested response for a conversation.

### Dashboard

#### GET /api/dashboard
Get dashboard statistics.

**Query Parameters:**
- `userId` (integer, default: 1)
- `days` (integer, default: 7) - Number of days for statistics

**Response:**
```json
{
  "messagesPerDay": [...],
  "appointmentsPerDay": [...],
  "noShowRate": 0.15,
  "estimatedRevenue": 5000,
  "topClients": [...],
  "newClients": [...],
  "inactiveClients": [...]
}
```

### Calendar

#### GET /api/calendar/slots
Get available time slots.

**Query Parameters:**
- `userId` (integer)
- `date` (ISO datetime) - Get slots for specific date
- `suggested` (boolean) - Get suggested slots for next few days
- `serviceId` (integer) - Service duration for slot calculation

### Tasks

#### GET /api/tasks
Get tasks.

#### POST /api/tasks
Create a task.

#### GET /api/tasks/{id}
Get a task.

#### PATCH /api/tasks/{id}
Update a task.

#### DELETE /api/tasks/{id}
Delete a task.

### Reminders

#### GET /api/reminders
Get reminders.

#### POST /api/reminders
Create a reminder.

#### GET /api/reminders/{id}
Get a reminder.

#### PATCH /api/reminders/{id}
Update a reminder.

#### DELETE /api/reminders/{id}
Delete a reminder.

### Webhooks

#### POST /api/webhooks/form
Webhook for form submissions.

#### POST /api/webhooks/facebook
Webhook for Facebook Page messages.

#### POST /api/webhooks/email
Webhook for receiving emails.

### Yahoo Mail

#### POST /api/yahoo/sync
Sync Yahoo Mail inbox.

#### GET /api/yahoo/sync
Test Yahoo Mail connection.

#### POST /api/yahoo/send
Send email via Yahoo SMTP.

### API Documentation

#### GET /api/docs
Get OpenAPI 3.0 specification.

## OpenAPI Specification
Access the full OpenAPI specification at `/api/docs` or view it in Swagger UI.

## Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `404` - Not Found
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

