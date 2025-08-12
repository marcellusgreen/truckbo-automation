# 🚀 TruckBo Fleet Management - Vercel Deployment Guide

## 📋 **Pre-Deployment Checklist**

- [ ] Neon PostgreSQL database created
- [ ] Claude API key available
- [ ] Vercel account created
- [ ] GitHub repository ready

## 🗃️ **Step 1: Set Up Neon PostgreSQL Database**

### 1.1 Create Neon Account
1. Go to https://neon.tech
2. Sign up for a free account
3. Create a new project: `truckbo-fleet-management`

### 1.2 Get Connection String
After creating the project, copy the connection string:
```
postgresql://username:password@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### 1.3 Initialize Database Schema
```bash
# Update your .env with the Neon connection string
DATABASE_URL=postgresql://username:password@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require

# Run database setup
npm run db:setup
```

## 🚀 **Step 2: Deploy to Vercel**

### 2.1 Deploy from GitHub
1. Push your code to GitHub
2. Go to https://vercel.com
3. Click "New Project" 
4. Import your GitHub repository
5. Vercel will auto-detect the configuration

### 2.2 Configure Environment Variables
In Vercel dashboard, go to **Settings > Environment Variables** and add:

#### Required Variables:
```
ANTHROPIC_API_KEY = sk-ant-api03-your-claude-api-key
DATABASE_URL = postgresql://username:password@ep-example.us-east-1.aws.neon.tech/neondb?sslmode=require
NODE_ENV = production
```

#### Optional Variables:
```
VITE_AWS_ACCESS_KEY_ID = your-aws-access-key
VITE_AWS_SECRET_ACCESS_KEY = your-aws-secret-key
VITE_AWS_REGION = us-east-2
VITE_S3_BUCKET_NAME = truckbo-documents
```

### 2.3 Trigger Deployment
1. Click "Deploy" or push to your GitHub repo
2. Vercel will automatically build and deploy
3. You'll get a URL like: `https://truckbo-fleet-management.vercel.app`

## ✅ **Step 3: Verify Deployment**

### 3.1 Check Health Endpoints
Visit these URLs to verify everything is working:

1. **Frontend:** `https://your-app.vercel.app`
2. **API Health:** `https://your-app.vercel.app/api/pdf-process` (should return JSON status)

### 3.2 Test PDF Processing
1. Go to **Fleet Onboarding > AI Document Processing**
2. Upload a PDF file
3. Should see successful processing with vehicle data extraction

### 3.3 Test Data Persistence
1. Add some vehicles through the interface
2. Refresh the page
3. Data should persist (stored in PostgreSQL)

## 🔧 **Step 4: Configure Custom Domain (Optional)**

### 4.1 Add Custom Domain
In Vercel dashboard:
1. Go to **Settings > Domains**
2. Add your custom domain (e.g., `fleetmanager.yourdomain.com`)
3. Configure DNS records as shown

### 4.2 Update Environment Variables
If using custom domain, update:
```
VITE_API_URL = https://fleetmanager.yourdomain.com/api
```

## 🛠️ **Troubleshooting**

### Database Connection Issues
```bash
# Test connection locally first
npm run db:setup

# Check Neon dashboard for connection details
# Ensure SSL is enabled (?sslmode=require)
```

### API Route Issues
- Check Vercel function logs in dashboard
- Verify ANTHROPIC_API_KEY is set correctly
- Check function timeout (max 30s on free plan)

### Build Issues
```bash
# Test build locally first
npm run build

# Check for TypeScript errors
npm run lint
```

### Environment Variable Issues
- Variables starting with `VITE_` are available in frontend
- Regular variables (like `ANTHROPIC_API_KEY`) are server-only
- Redeploy after changing environment variables

## 📈 **Performance & Scaling**

### Vercel Limits (Free Plan)
- **Function Timeout:** 10 seconds (upgrade to Pro for 60s)
- **Function Memory:** 1024MB
- **Bandwidth:** 100GB/month
- **Deployments:** Unlimited

### Neon Limits (Free Plan)  
- **Storage:** 512MB
- **Compute:** 1 compute unit
- **Connections:** Shared pool

### Upgrading
- **Vercel Pro:** $20/month - Longer function timeouts, more bandwidth
- **Neon Pro:** $19/month - More storage, dedicated compute

## 🔐 **Security Best Practices**

1. **API Keys:** Never commit API keys to git
2. **Environment Variables:** Use Vercel's secure storage
3. **HTTPS:** Automatically enabled on Vercel
4. **CORS:** Already configured in `api/pdf-process.js`
5. **PostgreSQL:** SSL enabled by default on Neon

## 📊 **Monitoring**

### Vercel Analytics
- Function invocations
- Error rates
- Performance metrics

### Neon Dashboard
- Database size
- Query performance
- Connection usage

## 🚀 **Going Live Checklist**

- [ ] Database schema deployed to Neon
- [ ] All environment variables configured in Vercel
- [ ] API endpoints responding correctly
- [ ] PDF processing working
- [ ] Data persistence confirmed
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Error monitoring set up

## 🎯 **Post-Deployment**

Your TruckBo fleet management system is now live with:

✅ **Professional PostgreSQL database** (Neon)
✅ **Serverless PDF processing** (Claude Vision API)
✅ **Global CDN deployment** (Vercel)
✅ **Automatic SSL certificates**
✅ **Scalable infrastructure**

**Live URL:** `https://your-app-name.vercel.app`

Your fleet management system is now production-ready and can handle:
- Multiple simultaneous users
- Large PDF document processing
- Persistent data storage
- Professional uptime and performance