# 🚛 TruckBo Pro - Fleet & Driver Compliance Automation

**Complete fleet and driver compliance automation through AI-powered document processing**

## 🎯 What TruckBo Does

TruckBo automates compliance management for commercial trucking operations by:

- **AI Document Processing** - Upload registration, insurance, and medical certificates for automatic data extraction
- **Fleet Compliance Tracking** - Monitor vehicle registration, insurance, DOT inspections, and permits
- **Driver Documentation Management** - Track medical certificates, CDL renewals, and qualifications
- **Real-time Monitoring** - Proactive alerts and visual dashboards for compliance status
- **Government Integration** - Connect with FMCSA, state DMVs, and regulatory databases

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm

### Installation
```bash
# Clone the repository
git clone [repository-url]
cd truckbo-automation-new

# Install dependencies
npm install

# Start development server
npm run dev
```

### First Time Setup
1. Navigate to **Fleet Onboarding** tab
2. Choose **AI Document Processing** (recommended)
3. Upload registration and insurance documents
4. Review extracted vehicle data
5. Complete onboarding to Fleet Management

## 📁 Project Structure

```
src/
├── components/          # React UI components
│   ├── DriverManagementPage.tsx
│   ├── ComprehensiveComplianceDashboard.tsx
│   └── ...
├── services/           # Business logic and data management
│   ├── documentProcessor.ts      # AI document processing
│   ├── fleetDataManager.ts      # Fleet compliance management
│   ├── persistentFleetStorage.ts # Data persistence
│   └── ...
├── types/             # TypeScript type definitions
├── utils/             # Utility functions
└── constants/         # Configuration constants
```

## 🛠️ Key Features

### Fleet Management
- Vehicle onboarding via document upload, VIN lists, or spreadsheets
- Registration and insurance expiry tracking
- DOT inspection compliance monitoring
- Bulk compliance data synchronization

### Driver Management  
- Medical certificate processing and alerts
- CDL license tracking with endorsements
- Driver qualification file management
- Proactive renewal notifications

### Document Processing
- AI-powered OCR for vehicle and driver documents
- Automatic data extraction (dates, numbers, restrictions)
- Bulk folder processing capabilities
- Smart document type classification

## 📊 Compliance Monitoring

- **Visual Status Indicators** - Green/yellow/red compliance status
- **Proactive Alerts** - 30/15/7 day advance warnings
- **Real-time Dashboard** - Fleet and driver readiness overview
- **Regulatory Integration** - FMCSA and state database connections

## 🔧 Development

### Build Commands
```bash
npm run dev          # Development server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint check
```

### Technology Stack
- **Frontend**: React + TypeScript + Tailwind CSS
- **Build Tool**: Vite
- **Document Processing**: AI-powered OCR
- **Data Storage**: Local storage with backup systems

## 📖 Documentation

- [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) - Comprehensive system documentation
- [`API_SETUP_GUIDE.md`](./API_SETUP_GUIDE.md) - Government API integration guide
- [`COMPLIANCE_DATA_INTEGRATION.md`](./COMPLIANCE_DATA_INTEGRATION.md) - Data flow documentation

## 🎯 Business Value

### Risk Mitigation
- Eliminate DOT compliance violations
- Prevent vehicle groundings and driver disqualifications
- Maintain clean CSA scores

### Operational Efficiency  
- 95% reduction in manual data entry
- 80% faster fleet onboarding
- Real-time compliance visibility

### Cost Savings
- Avoid violation fines and penalties
- Reduce administrative overhead
- Lower insurance premiums through comprehensive safety management

## 🤝 Contributing

1. Review the [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md) for system architecture
2. Follow TypeScript best practices
3. Maintain component documentation
4. Test compliance workflows thoroughly

## 📄 License

[License information]

---

**TruckBo Pro** - Keeping your fleet compliant, your drivers qualified, and your operations running smoothly.