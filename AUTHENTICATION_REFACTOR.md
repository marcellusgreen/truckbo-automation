# Authentication System Refactor - Client-Server Architecture

## Problem Solved

The frontend React application was crashing with `Uncaught TypeError: s.readFileSync is not a function` because the `authService.ts` file was directly importing and using Node.js libraries (`bcrypt` and `pg`) that cannot run in a browser environment.

## Solution Overview

The code has been refactored to implement a proper client-server authentication architecture:

- **Frontend (`src/services/authService.ts`)**: Now only handles client-side operations and makes API calls
- **Backend**: New authentication endpoints handle all sensitive operations (password hashing, database queries)

## Changes Made

### 1. Frontend Refactor (`src/services/authService.ts`)

**Removed:**
- All Node.js imports (`bcrypt`, `pg`)
- Direct database operations
- Password hashing logic
- Rate limiting implementation
- User/company storage methods

**Updated Methods:**
- `login()`: Now makes a POST request to `/api/auth/login`
- `registerCompany()`: Now makes a POST request to `/api/auth/register`
- `initializeDemo()`: Now makes a POST request to `/api/auth/initialize-demo`

**Retained:**
- Session management (localStorage-based)
- Client-side token storage
- Permission checking
- UI state management

### 2. Backend Implementation

**New Files Created:**

#### Server Routes (`server/routes/auth.js`)
- `/api/auth/login` - User authentication
- `/api/auth/register` - Company registration  
- `/api/auth/initialize-demo` - Demo data setup

#### Vercel API Routes (for serverless deployment)
- `api/auth/login.js` - Serverless login endpoint
- `api/auth/register.js` - Serverless registration endpoint
- `api/auth/initialize-demo.js` - Serverless demo initialization

#### Updated Dependencies (`package.json`)
- Added `bcrypt` for secure password hashing
- Added `jsonwebtoken` for JWT token generation
- Added type definitions for new packages

### 3. Security Features Implemented

- **Password Hashing**: Uses bcrypt with salt rounds of 12
- **JWT Tokens**: Secure session tokens with 2-hour expiration
- **SQL Injection Protection**: Uses parameterized queries
- **CORS Configuration**: Proper cross-origin request handling
- **Input Validation**: Server-side validation of all inputs
- **Error Handling**: Secure error messages that don't leak sensitive info

## API Endpoints

### POST `/api/auth/login`
**Request:**
```json
{
  "email": "admin@company.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "user": { /* user object */ },
  "company": { /* company object */ },
  "token": "jwt_token_here",
  "expiresAt": "2024-01-01T12:00:00Z",
  "refreshToken": "refresh_token_here"
}
```

### POST `/api/auth/register`
**Request:**
```json
{
  "companyName": "New Company",
  "contactEmail": "admin@newcompany.com",
  "contactPhone": "555-0123",
  "dotNumber": "DOT123456",
  "mcNumber": "MC-123456",
  "address": {
    "street": "123 Main St",
    "city": "City",
    "state": "TX",
    "zipCode": "12345"
  },
  "adminUser": {
    "firstName": "John",
    "lastName": "Doe", 
    "email": "admin@newcompany.com",
    "password": "SecurePassword123!"
  },
  "subscription": {
    "plan": "professional"
  }
}
```

### POST `/api/auth/initialize-demo`
Initializes demo data for development/testing. No request body required.

## Environment Variables Required

Add these to your `.env` file:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/truckbo

# JWT Secret (make this long and random in production)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# Server Port
SERVER_PORT=3004
```

## Testing the System

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
Make sure PostgreSQL is running and the database schema is created:
```bash
npm run db:setup
```

### 3. Start the Server
```bash
npm run server
```

### 4. Run Authentication Test
```bash
node test-auth.js
```

### 5. Test in Browser
The frontend will now make API calls to the backend instead of crashing on Node.js imports.

## Demo Accounts

After running the demo initialization, these accounts are available:

| Email | Password | Company | Role |
|-------|----------|---------|------|
| admin@sunbelttrucking.com | TruckBo2025! | Sunbelt Trucking LLC | admin |
| manager@sunbelttrucking.com | TruckBo2025! | Sunbelt Trucking LLC | manager |
| admin@lonestarlogistics.com | TruckBo2025! | Lone Star Logistics | admin |

## Deployment Considerations

### Local Development
- Use `server/routes/auth.js` endpoints
- Start server with `npm run server`

### Vercel Production
- Uses `api/auth/*.js` serverless functions
- Automatically handles routing
- Requires `DATABASE_URL` and `JWT_SECRET` environment variables

## Security Best Practices Implemented

1. **Passwords**: Never stored in plain text, always hashed with bcrypt
2. **JWTs**: Include user/company info but no sensitive data
3. **Database**: Uses connection pooling and parameterized queries
4. **Errors**: Generic error messages to prevent information leakage
5. **CORS**: Properly configured for cross-origin requests
6. **Validation**: Both client-side and server-side input validation

## Migration Notes

- **Existing Users**: Demo data will be preserved if database already exists
- **Session Management**: Sessions are still stored in localStorage client-side
- **API Compatibility**: Frontend methods maintain the same interface
- **Error Handling**: Improved error messages and user feedback

The system now follows proper separation of concerns with the frontend handling UI state and the backend managing authentication, authorization, and data persistence securely.