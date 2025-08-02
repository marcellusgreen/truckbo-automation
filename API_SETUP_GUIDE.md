# TruckBo API Setup Guide

This guide explains how to obtain and configure real API keys for full compliance data access.

## Current Status: Web Scraping Fallbacks

Your TruckBo application is currently using **web scraping and public data sources** as fallbacks when API keys aren't available:

- ✅ **FMCSA DOT Data**: Uses SAFER web scraping (no API key required)
- ✅ **Insurance Info**: Uses state minimum requirements and basic verification
- ✅ **VIN Decoding**: Uses free NHTSA VIN decoder
- ⚠️ **CARB Emissions**: Uses mock data (requires CARB API key)
- ⚠️ **State Registration**: Uses mock data (requires state DMV API keys)

## How to Get Full API Access

### 1. FMCSA API Key (Recommended but Optional)

**Current Status**: Web scraping works well, but official API is more reliable.

**How to Get**:
1. Visit: https://mobile.fmcsa.dot.gov/developer
2. Register for a developer account
3. Request API access for SAFER Web Services
4. **Common Issues**: FMCSA API registration can be unreliable
5. **Alternative**: Continue using web scraping (already implemented)

**To Configure**:
```bash
# Add to environment variables
REACT_APP_FMCSA_API_KEY=your_actual_key_here
```

### 2. CARB API Key (California Emissions)

**Current Status**: Using mock data

**How to Get**:
1. Visit: https://ww2.arb.ca.gov/applications/api-access
2. Request access to TRUCRS API
3. Complete CARB data sharing agreement
4. Obtain API credentials

**To Configure**:
```bash
REACT_APP_CARB_API_KEY=your_carb_key_here
```

### 3. State DMV APIs

**Current Status**: Using mock data

**California DMV**:
1. Visit: https://www.dmv.ca.gov/portal/vehicle-industry-services/
2. Apply for third-party data access
3. Complete background check and bonding requirements

**Other States**: Each state has different requirements and APIs.

**To Configure**:
```bash
REACT_APP_CA_DMV_API_KEY=your_ca_dmv_key
REACT_APP_TX_DMV_API_KEY=your_tx_dmv_key
# ... additional states as needed
```

### 4. Insurance Verification APIs

**Verisk Analytics**:
1. Contact Verisk for commercial vehicle data access
2. Requires business verification and insurance industry connection
3. Pricing typically starts at $500/month

**To Configure**:
```bash
REACT_APP_VERISK_API_KEY=your_verisk_key
```

## Quick Setup (Easiest First Steps)

### Option 1: Start with FMCSA Only
Since FMCSA is the most important for DOT compliance:

1. Try to get FMCSA API key from: https://mobile.fmcsa.dot.gov/developer
2. If that fails, continue using web scraping (already working)

### Option 2: Use FMCSA Data Files (No API Required)
Download bulk data from FMCSA:

1. Visit: https://catalog.data.gov/dataset/motor-carrier-registrations-census-files
2. Download daily CSV files
3. Import into your database
4. Use for offline lookups

## Configuration File Setup

Create a `.env` file in your project root:

```bash
# TruckBo API Configuration
# Copy this file to .env and add your actual API keys

# FMCSA SAFER API (optional - web scraping works as fallback)
REACT_APP_FMCSA_API_KEY=demo-key

# CARB Emissions APIs (California)
REACT_APP_CARB_API_KEY=demo-key

# State DMV APIs
REACT_APP_CA_DMV_API_KEY=demo-key
REACT_APP_TX_DMV_API_KEY=demo-key
REACT_APP_NY_DMV_API_KEY=demo-key
REACT_APP_FL_DMV_API_KEY=demo-key

# Insurance Verification
REACT_APP_VERISK_API_KEY=demo-key

# Development Settings
REACT_APP_USE_MOCK_DATA=false
REACT_APP_DEBUG_API_CALLS=true
```

## Testing Your Setup

After adding API keys, test each service:

```bash
# Start your development server
npm start

# Check browser console for API status messages:
# ✅ "Using official FMCSA API"
# ✅ "Using CARB TRUCRS API" 
# ⚠️ "Using SAFER web scraping for DOT: 12345"
# ⚠️ "Using simple insurance checker"
```

## Cost Estimates

| Service | Cost | Data Quality | Required? |
|---------|------|--------------|-----------|
| FMCSA API | Free* | High | No (web scraping works) |
| CARB APIs | $200-500/month | High | For CA compliance only |
| State DMV APIs | $100-300/month each | High | For specific states |
| Verisk Insurance | $500+/month | High | No (basic checking works) |

*FMCSA API is free but has rate limits and availability issues

## Current Recommendation

**For immediate use**: Continue with current setup (web scraping + fallbacks)
**For production**: Add FMCSA API key if possible, others as needed

The application is designed to gracefully handle missing API keys and provide useful compliance information regardless of API availability.

## Troubleshooting

### FMCSA Registration Issues
If the FMCSA developer portal gives you errors:
1. Try different browsers
2. Contact FMCSA IT support: fmcsa.it.helpdesk@dot.gov
3. Continue using web scraping (already implemented)

### API Rate Limits
All APIs have rate limits. The app includes:
- Automatic retry logic
- Caching to reduce API calls
- Rate limiting to stay within bounds

### CORS Issues in Development
If you get CORS errors:
1. Add API domains to your CORS proxy
2. Use browser extensions to disable CORS for development
3. Set up a backend proxy server

## Support

For technical issues with TruckBo API integration:
1. Check browser console for detailed error messages
2. Verify API keys are correctly set in environment variables
3. Test API endpoints directly using curl or Postman

The application is designed to work well even without all API keys configured.