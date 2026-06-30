# Lucky Marketplace — Backend

## Prerequisites

- Node.js v18+
- PostgreSQL 15+
- npm

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and update:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/multi_vendor"
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
```

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE multi_vendor;"
```

### 4. Push schema to database

```bash
npm run db:push
```

### 5. (Optional) Restore from backup

```bash
pg_restore -U postgres -d multi_vendor db/database_backup.dump
```

### 6. Seed sample data

```bash
npm run db:seed
```

### 7. Generate Prisma client

```bash
npm run db:generate
```

### 8. Start the server

```bash
npm run dev
```

API runs at **http://localhost:5000**

Health check: **http://localhost:5000/api/health**

## Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push Drizzle schema to database |
| `npm run db:pull` | Pull database schema → Drizzle schema files |
| `npm run db:generate` | Generate Drizzle migrations from schema changes |
| `npm run db:seed` | Seed sample data |
| `npm run db:seed:employee` | Seed employee data |
| `npm run db:seed:investor` | Seed investor data |
| `npm run db:studio` | Open Drizzle Studio (GUI at localhost:4983) |
| `npm run db:drop` | Drop all database tables |

## Drizzle Workflow

### When you change the schema (add/update tables):

1. Update `db/schema/index.ts`
2. Run `npm run db:generate` — creates migration SQL in `db/drizzle/`
3. Run `npm run db:push` — applies changes to the database

### To update schema from an existing database:

```bash
npm run db:pull
```

### To browse data visually:

```bash
npm run db:studio
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Sign access tokens |
| `JWT_REFRESH_SECRET` | Sign refresh tokens |
| `JWT_EXPIRES_IN` | Access token expiry (default 7d) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry (default 30d) |
| `RAZORPAY_KEY_ID` | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature verification |
| `API_PORT` | Server port (default 5000) |
| `FRONTEND_URL` | CORS origin |
| `UPLOAD_DIR` | File upload folder |
| `MAX_FILE_SIZE` | Max upload size in bytes |
| `NODE_ENV` | development / production |

## Test Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@yopmail.com | admin123 |
| Vendor | vendor@yopmail.com | vendor123 |
| Client | client@yopmail.com | client123 |
| Employee | employee@yopmail.com | employee123 |
| Investor | investor@yopmail.com | investor123 |
# lucky-backend
