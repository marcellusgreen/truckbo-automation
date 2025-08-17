# 🗃️ Neon PostgreSQL Setup Guide

## Step 1: Create Neon Account & Database

1. **Go to Neon Console**
   - Visit: https://neon.tech
   - Sign up for a free account (no credit card required)
   - Create a new project

2. **Create Database**
   - Project name: `truckbo-fleet-management`
   - Region: Choose closest to your users
   - PostgreSQL version: 15+ (recommended)

3. **Get Connection Details**
   After creating the project, you'll see connection details like:
   ```
   Host: ep-example-123456.us-east-1.aws.neon.tech
   Database: neondb
   Username: your-username
   Password: your-password
   ```

## Step 2: Update Environment Variables

Copy your Neon connection string and update your `.env` file:

```bash
# Replace with your actual Neon connection string
DATABASE_URL=postgresql://your-username:your-password@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require

# Keep existing variables
VITE_ANTHROPIC_API_KEY=your-claude-api-key
VITE_AWS_ACCESS_KEY_ID=your-aws-key
VITE_AWS_SECRET_ACCESS_KEY=your-aws-secret
```

## Step 3: Initialize Database Schema

Run this command to create all the tables:

```bash
npm run db:setup
```

This will:
- ✅ Create all tables (vehicles, drivers, documents, compliance_alerts, etc.)
- ✅ Set up indexes for performance
- ✅ Create views for dashboard queries
- ✅ Insert sample data

## Step 4: Test Connection

```bash
# Test the connection
npm run dev:full
```

You should see:
```
✅ PostgreSQL database connected successfully
🔄 Initializing storage system with PostgreSQL migration...
✅ Storage system initialized successfully
```

## 🎯 Neon Benefits

- **Free Tier**: 512MB storage, 1 database
- **Serverless**: Automatically scales up/down
- **Branching**: Git-like database branches
- **Fast**: Low-latency connections
- **Secure**: SSL by default

## 🔧 Troubleshooting

### Connection Issues
- Ensure SSL is enabled (`?sslmode=require`)
- Check firewall/network restrictions
- Verify username/password

### Schema Issues
```bash
# Reset database (careful - deletes all data!)
npm run db:setup

# Check connection
psql "postgresql://your-connection-string"
```

### Migration Issues
- Check browser console for migration logs
- Verify localStorage data exists before migration
- Check PostgreSQL logs in Neon dashboard

## 🚀 Production Ready

Once connected, your system will:
- ✅ Automatically migrate localStorage data to Neon
- ✅ Handle multiple users with organization scoping
- ✅ Persist data permanently (no more lost data!)
- ✅ Scale with your fleet growth