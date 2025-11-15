import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VehicleRecord } from './services/persistentFleetStorage';
import { downloadSampleCSV } from './utils';
import { 
  ParsedVIN, 
  ComplianceTask, 
  ComplianceStats,
  OnboardingMethod, 
  OnboardingPageProps,
  DashboardPageProps
} from './types';
import { AddVehicleModal } from './components/AddVehicleModal';
import { BulkUploadModal } from './components/BulkUploadModal';
import { DocumentUploadModal } from './components/DocumentUploadModal';
import { MultiBatchDocumentUploadModal } from './components/MultiBatchDocumentUploadModal';
import { TestRunnerModal } from './components/TestRunnerModal';
import { MinimalisticVehicleCard } from './components/MinimalisticVehicleCard';
import { DriverManagementPage } from './components/DriverManagementPage';
import { ReportingDashboard } from './components/ReportingDashboard';
import { NotificationSystem, ErrorBoundary } from './components/NotificationSystem';
import { AuthWrapper } from './components/AuthComponents';
import { authService } from './services/authService';
import { ExtractedVehicleData } from './services/documentProcessor';
import { comprehensiveComplianceService } from './services/comprehensiveComplianceApi';
import { documentDownloadService } from './services/documentDownloadService';
import { reconcilerAPI } from './services/reconcilerAPI';
import { safeVehicleData } from './utils/safeDataAccess';
import { centralizedFleetDataService, useFleetData, UnifiedVehicleData } from './services/centralizedFleetDataService';
import { fleetStorageAdapter, type FleetVehicleInput } from './services/fleetStorageAdapter';
import { useFleetState, type FleetStatusFilter } from './hooks/useFleetState';
import { useOnboardingFlow } from './hooks/useOnboardingFlow';
import { isFleetHookEnabled } from './utils/featureFlags';
import { createDatabaseService } from './services/databaseService';
import { logger } from './services/logger';

// Types and interfaces are now imported from ./types

type FleetStatusViewFilter = FleetStatusFilter | 'maintenance' | 'expires_soon' | 'review_needed';

// Utility functions are now imported from ./utils

// Enhanced Onboarding Component with API Integration
import { BulkFileUpload, ManualDataEntry, DataSourceIndicator } from './components/DataInputComponents';
import { ComprehensiveComplianceDashboard } from './components/ComprehensiveComplianceDashboard';
import ErrorHandlingTestPage from './pages/ErrorHandlingTestPage';

// OnboardingPageProps and OnboardingMethod are now imported from ./types

type ComplianceWarningLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ComplianceItemStatus = 'current' | 'expires_soon' | 'expired' | 'missing';

interface ComplianceAlertItem {
  vehicleId: string;
  vin: string;
  licensePlate: string;
  truckNumber: string;
  make: string;
  model: string;
  year: number;
  status: 'active' | 'inactive' | 'maintenance';
  complianceType: 'registration' | 'insurance' | 'inspection' | 'emissions';
  currentStatus: ComplianceItemStatus;
  expirationDate?: string;
  daysUntilExpiration?: number;
  issuer?: string;
  policyNumber?: string;
  certificateNumber?: string;
  lastChecked: string;
  nextCheckDue?: string;
  warningLevel: ComplianceWarningLevel;
}

const complianceTypeLabels: Record<ComplianceAlertItem['complianceType'], string> = {
  registration: 'Registration',
  insurance: 'Insurance',
  inspection: 'Inspection',
  emissions: 'Emissions'
};

const warningLevelPriorityMap: Record<ComplianceWarningLevel, ComplianceTask['priority']> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  none: 'low'
};

const mapComplianceItemToTask = (item: ComplianceAlertItem): ComplianceTask | null => {
  if (item.currentStatus === 'current') {
    return null;
  }

  let daysUntilDue: number | null =
    typeof item.daysUntilExpiration === 'number' && Number.isFinite(item.daysUntilExpiration)
      ? item.daysUntilExpiration
      : null;

  const candidateDate = item.expirationDate || item.nextCheckDue;
  let dueDateIso = '';
  if (!daysUntilDue && candidateDate) {
    const parsed = new Date(candidateDate);
    if (!Number.isNaN(parsed.getTime())) {
      daysUntilDue = Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      dueDateIso = parsed.toISOString();
    }
  } else if (candidateDate) {
    const parsed = new Date(candidateDate);
    if (!Number.isNaN(parsed.getTime())) {
      dueDateIso = parsed.toISOString();
    }
  }

  let status: ComplianceTask['status'];
  if (item.currentStatus === 'expired' || (daysUntilDue != null && daysUntilDue < 0)) {
    status = 'overdue';
  } else if (item.currentStatus === 'expires_soon' || item.currentStatus === 'missing') {
    status = 'pending';
  } else {
    status = 'in_progress';
  }

  const normalizedDays = typeof daysUntilDue === 'number' && Number.isFinite(daysUntilDue) ? daysUntilDue : 0;
  const priority = warningLevelPriorityMap[item.warningLevel] ?? 'medium';
  const label = complianceTypeLabels[item.complianceType] ?? 'Compliance';
  const vehicleName =
    [item.make, item.model].filter(Boolean).join(' ').trim() || item.licensePlate || 'Unknown Vehicle';

  return {
    id: `${item.vehicleId || item.vin}-${item.complianceType}`,
    vehicleId: item.vehicleId || item.vin,
    vehicleVin: item.vin || 'UNKNOWN',
    vehicleName,
    title: `${label} ${status === 'overdue' ? 'Expired' : 'Action Required'}`,
    description: `Review ${label.toLowerCase()} records for ${vehicleName}.`,
    category: item.complianceType,
    priority,
    status,
    dueDate: dueDateIso,
    daysUntilDue: normalizedDays,
    assignedTo: 'Compliance Team',
    estimatedCost: undefined,
    jurisdiction: item.issuer || 'N/A',
    documentationRequired: true,
    requiredDocuments: [label],
    uploadedDocuments: [],
    filingUrl: undefined,
    createdDate: item.lastChecked || new Date().toISOString(),
    updatedDate: item.lastChecked || new Date().toISOString(),
    completedDate: undefined
  };
};

const computeComplianceStats = (tasks: ComplianceTask[]): ComplianceStats => {
  return tasks.reduce<ComplianceStats>(
    (acc, task) => {
      acc.total += 1;
      switch (task.status) {
        case 'pending':
          acc.pending += 1;
          break;
        case 'in_progress':
          acc.inProgress += 1;
          break;
        case 'completed':
          acc.completed += 1;
          break;
        case 'overdue':
          acc.overdue += 1;
          break;
        default:
          break;
      }

      if (task.priority === 'critical') {
        acc.critical += 1;
      }
      if (task.priority === 'high') {
        acc.high += 1;
      }

      return acc;
    },
    {
      total: 0,
      pending: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      critical: 0,
      high: 0
    }
  );
};

type AppPage =
  | 'dashboard'
  | 'onboarding'
  | 'fleet'
  | 'drivers'
  | 'compliance'
  | 'comprehensive-compliance'
  | 'reports'
  | 'error-testing';

type NavIconProps = React.SVGProps<SVGSVGElement>;

interface NavItem {
  id: AppPage;
  label: string;
  description: string;
  icon: React.ComponentType<NavIconProps>;
}

const iconBaseClass = 'h-5 w-5';
const withIconClass = (className?: string) => (className ? `${iconBaseClass} ${className}` : iconBaseClass);

const IconDashboard = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <rect x="3.5" y="3.5" width="8" height="8" rx="2" strokeWidth="1.4" />
    <rect x="13.5" y="3.5" width="7" height="5.5" rx="1.8" strokeWidth="1.4" />
    <rect x="3.5" y="13.5" width="8" height="7" rx="1.8" strokeWidth="1.4" />
    <rect x="13.5" y="10.5" width="7" height="10" rx="1.8" strokeWidth="1.4" />
  </svg>
);

const IconOnboarding = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <path d="M4.5 11 12 4.5 19.5 11" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 4.5v15" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M7 15.5h10" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const IconFleet = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <path d="M4 17.5h16" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M6.5 7l3.2 4.3 3.6-4.8 4.7 6"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="7" cy="19.5" r="1.2" strokeWidth="1.3" />
    <circle cx="17" cy="19.5" r="1.2" strokeWidth="1.3" />
  </svg>
);

const IconDrivers = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <circle cx="12" cy="8.8" r="3.4" strokeWidth="1.4" />
    <path
      d="M5.5 19.5c1.4-3.1 4.1-5 6.5-5s5.1 1.9 6.5 5"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconCompliance = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <path
      d="M12 3.5 19 6v5.3c0 5-3 7.7-7 9.4-4-1.7-7-4.5-7-9.4V6z"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M9.5 12.3 11.7 14.5 15.8 9.7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconRealtime = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <circle cx="12" cy="12" r="8" strokeWidth="1.4" />
    <circle cx="12" cy="12" r="4.3" strokeWidth="1.4" opacity="0.6" />
    <path d="M12 7v5l3 2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconReports = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <path d="M6 18V8.5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10.5 18V5.5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M15 18V10.5" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19.5 18V12" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconLab = ({ className, ...props }: NavIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={withIconClass(className)} {...props}>
    <path d="M9 4.5h6" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M10 4.5V12L5.8 19.5h12.4L14 12V4.5" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 16h9" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
  </svg>
);

const useComplianceData = () => {
  const [tasks, setTasks] = useState<ComplianceTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const databaseRef = useRef<ReturnType<typeof createDatabaseService> | null>(null);

  const fetchCompliance = useCallback(async () => {
    setLoading(true);
    try {
      if (!databaseRef.current) {
        databaseRef.current = createDatabaseService();
      }

      const response = await databaseRef.current.getActiveAlertsByOrganization();
      const responseData = (response as any)?.data ?? response;
      const items = Array.isArray(responseData) ? (responseData as ComplianceAlertItem[]) : [];
      const mapped = items
        .map(mapComplianceItemToTask)
        .filter((task): task is ComplianceTask => Boolean(task));

      setTasks(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCompliance();
  }, [fetchCompliance]);

  const stats = useMemo(() => computeComplianceStats(tasks), [tasks]);

  const updateTaskStatus = useCallback((taskId: string, newStatus: ComplianceTask['status']) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: newStatus,
              documentationRequired: newStatus !== 'completed',
              updatedDate: new Date().toISOString(),
              completedDate: newStatus === 'completed' ? new Date().toISOString() : task.completedDate
            }
          : task
      )
    );
  }, []);

  return {
    tasks,
    stats,
    loading,
    error,
    refresh: fetchCompliance,
    updateTaskStatus
  };
};

const OnboardingPage: React.FC<OnboardingPageProps> = ({ setCurrentPage }) => {
  const {
    step,
    onboardingMethod,
    uploadedFile,
    isProcessing,
    parsedVINs,
    enhancedVehicleData,
    processingProgress,
    processingStatus,
    error,
    manualEntryData,
    isDocumentUploadOpen,
    jobSnapshots,
    setOnboardingMethod,
    setError,
    goToStep,
    handleFileUpload,
    startVinProcessing,
    handleBulkFileUpload,
    handleManualEntrySubmit,
    handleEditVehicle,
    prepareManualEntryFromVin,
    handleDocumentProcessingComplete,
    openDocumentUploadModal,
    closeDocumentUploadModal,
    completeOnboarding,
    resetOnboarding,
    cancelManualEntry
  } = useOnboardingFlow();

  const readyVehicles = enhancedVehicleData.filter((vehicle) => vehicle.make && vehicle.model && vehicle.year);
  const pendingVehicles = enhancedVehicleData.length - readyVehicles.length;
  const parsedVinCount = parsedVINs.length;

  const steps = [
    { id: 1, title: 'Source', detail: 'Select ingest channel' },
    { id: 2, title: 'Normalize', detail: 'Parse VINs & OCR docs' },
    { id: 3, title: 'Review', detail: 'Inspect enriched data' },
    { id: 4, title: 'Sync', detail: 'Push to fleet + compliance' },
    { id: 5, title: 'Manual', detail: 'Resolve any gaps' }
  ];

  const methodOptions: Array<{
    value: OnboardingMethod;
    title: string;
    description: string;
    badge: string;
    actionLabel: string;
    action?: () => void;
  }> = [
    {
      value: 'document_processing',
      title: 'AI Document Intake',
      description: 'Drop registrations, insurance packets, inspections, or driver folders. We OCR, cross-check, and enrich.',
      badge: 'OCR + reconcile',
      actionLabel: 'Launch intake',
      action: openDocumentUploadModal
    },
    {
      value: 'bulk_upload',
      title: 'CSV / XLSX Upload',
      description: 'High-volume VIN manifests with structured metadata. Template enforced for zero-miss imports.',
      badge: 'Template ready',
      actionLabel: 'Download template',
      action: downloadSampleCSV
    },
    {
      value: 'manual_entry',
      title: 'Manual Entry',
      description: 'Guided UI for edge cases or rapid single vehicle additions using pre-built templates.',
      badge: 'Precision edit',
      actionLabel: 'Launch form',
      action: () => goToStep(5)
    }
  ];

  const renderVehicleCard = (vehicle: typeof enhancedVehicleData[number]) => (
    <div key={`${vehicle.vin}-${vehicle.truckNumber}`} className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg text-white">{vehicle.truckNumber || vehicle.vin}</p>
          <p className="text-sm text-white/60">{vehicle.year} / {vehicle.make} / {vehicle.model}</p>
          <p className="text-xs text-white/50">VIN: <span className="font-mono">{vehicle.vin}</span></p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleEditVehicle(vehicle.vin)}
            className="data-chip bg-white/10 text-white/80"
          >
            Edit
          </button>
          <button
            onClick={() => prepareManualEntryFromVin(vehicle.vin)}
            className="data-chip bg-white/5 text-white/60"
          >
            Manual
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="text-xs text-white/60 space-y-1">
          <p>Plate: {vehicle.licensePlate || 'Pending'}</p>
          <p>DOT: {vehicle.dotNumber || '--'}</p>
          <p>Compliance tasks: {vehicle.complianceTasks ?? 0}</p>
        </div>
        <DataSourceIndicator data={vehicle} />
      </div>
    </div>
  );

  return (
    <div className="space-y-10">
      <section className="neo-panel grid gap-8 p-8 text-white lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.5em] text-white/60">Fleet ingest</p>
          <h2 className="font-display text-3xl md:text-4xl">Precision Onboarding Console</h2>
          <p className="text-sm text-white/70">
            Normalize VIN manifests, OCR document archives, and ship enriched fleet data directly into TruckBo's centralized brain.
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-white/70">
            <span className="data-chip">Step {step} of 5</span>
            <span className="data-chip">{jobSnapshots.length} document batches</span>
            <span className="data-chip">{parsedVinCount} VINs parsed</span>
          </div>
        </div>
        <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5/10 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-white/60">Vehicles captured</p>
          <p className="font-display text-5xl">{enhancedVehicleData.length}</p>
          <p className="text-sm text-white/60">{readyVehicles.length} ready � {pendingVehicles} pending data</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setCurrentPage('fleet')}
              className="pressable rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.4em] text-white"
            >
              View Fleet
            </button>
            <button
              onClick={() => setCurrentPage('compliance')}
              className="pressable rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.4em] text-white/80"
            >
              Compliance
            </button>
          </div>
        </div>
      </section>

      <section className="neo-panel p-6">
        <div className="flex flex-wrap gap-4">
          {steps.map((entry) => {
            const isActive = step === entry.id;
            const isComplete = step > entry.id;
            return (
              <button
                key={entry.id}
                onClick={() => goToStep(entry.id)}
                className={`flex-1 min-w-[140px] rounded-2xl border px-4 py-3 text-left ${
                  isActive ? 'border-white/40 bg-white/10' : isComplete ? 'border-white/20 bg-white/5 text-white/70' : 'border-white/10 text-white/50'
                }`}
              >
                <p className="text-xs uppercase tracking-[0.3em]">{`0${entry.id}`}</p>
                <p className="font-display text-lg text-white">{entry.title}</p>
                <p className="text-xs text-white/60">{entry.detail}</p>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <section className="neo-panel border border-red-500/30 bg-red-950/40 p-6 text-red-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-lg">Processing issue</p>
              <p className="text-sm text-red-100/80">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="data-chip border-red-400/40 text-red-100">
              Dismiss
            </button>
          </div>
        </section>
      )}

      {jobSnapshots.length > 0 && (
        <section className="neo-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Document jobs</p>
              <h3 className="font-display text-2xl text-white">AI intake timeline</h3>
            </div>
            <span className="data-chip text-white/60">{jobSnapshots.length} batches</span>
          </div>
          <div className="space-y-4">
            {jobSnapshots.map((job) => (
              <div key={job.jobId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white/70">
                <div>
                  <p className="font-display text-base text-white">{job.originalFilename || job.jobId}</p>
                  <p className="text-xs text-white/50">Updated {job.updatedAt ? new Date(job.updatedAt).toLocaleString() : '�'}</p>
                </div>
                <div className="flex gap-3 text-xs text-white/60">
                  <span className="data-chip">Status: {job.status}</span>
                  {job.databaseDocumentId && <span className="data-chip">Doc #{job.databaseDocumentId}</span>}
                  {job.databaseError && <span className="data-chip text-red-200">{job.databaseError}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="neo-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Ingest options</p>
              <h3 className="font-display text-2xl text-white">Select data source</h3>
            </div>
            <span className="data-chip text-white/60">Current: {onboardingMethod}</span>
          </div>
          <div className="space-y-4">
            {methodOptions.map((option) => {
              const isActive = onboardingMethod === option.value;
              return (
                <div key={option.value} className={`rounded-2xl border p-4 ${isActive ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg text-white">{option.title}</p>
                      <p className="text-sm text-white/70">{option.description}</p>
                    </div>
                    <span className="data-chip text-white/60">{option.badge}</span>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => setOnboardingMethod(option.value)}
                      className={`rounded-xl border px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                        isActive ? 'border-white/40 bg-white/10 text-white' : 'border-white/20 text-white/70'
                      }`}
                    >
                      {isActive ? 'Selected' : 'Use method'}
                    </button>
                    <button
                      onClick={option.action}
                      className="rounded-xl border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
                    >
                      {option.actionLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="neo-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Workspace</p>
              <h3 className="font-display text-2xl text-white">Drop VIN manifest</h3>
            </div>
            <span className="data-chip text-white/60">CSV/TXT</span>
          </div>
          <label className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            isProcessing ? 'border-emerald-400/50 bg-emerald-900/20 opacity-80' : 'border-white/15 hover:border-white/40'
          }`}>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
            <p className="font-display text-lg text-white">{uploadedFile ? uploadedFile.name : 'Drag & drop VIN manifests'}</p>
            <p className="text-sm text-white/60">.csv or .txt � max 5MB</p>
            {uploadedFile && (
              <button
                onClick={startVinProcessing}
                type="button"
                className="mt-4 rounded-2xl border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
              >
                Start processing
              </button>
            )}
          </label>
          {onboardingMethod === 'bulk_upload' && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <BulkFileUpload onDataProcessed={handleBulkFileUpload} onError={(message) => setError(message)} />
            </div>
          )}
          {onboardingMethod === 'document_processing' && (
            <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-white/70">
              <p>Need to upload document packets instead? Launch the AI intake below.</p>
              <button
                onClick={openDocumentUploadModal}
                className="mt-3 rounded-xl border border-white/30 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
              >
                Start AI intake
              </button>
            </div>
          )}
        </article>
      </section>

      {(isProcessing || parsedVinCount > 0) && (
        <section className="neo-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Processing</p>
              <h3 className="font-display text-2xl text-white">VIN normalization</h3>
            </div>
            <span className="data-chip text-white/60">{processingStatus || 'Idle'}</span>
          </div>
          <div className="mt-6 h-3 rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${processingProgress}%` }} />
          </div>
          <p className="mt-3 text-sm text-white/60">{parsedVinCount} VINs parsed</p>
        </section>
      )}

      {enhancedVehicleData.length > 0 && (
        <section className="neo-panel p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Review & approve</p>
              <h3 className="font-display text-2xl text-white">Enriched vehicles</h3>
            </div>
            <div className="flex gap-3 text-xs text-white/70">
              <span className="data-chip">Ready: {readyVehicles.length}</span>
              <span className="data-chip">Pending: {pendingVehicles}</span>
            </div>
          </div>
          <div className="grid gap-4">
            {enhancedVehicleData.map((vehicle) => renderVehicleCard(vehicle))}
          </div>
          <div className="flex flex-wrap gap-4 pt-4">
            <button
              onClick={completeOnboarding}
              disabled={readyVehicles.length === 0}
              className="pressable rounded-2xl border border-emerald-400/40 bg-emerald-600/30 px-6 py-3 font-display text-sm uppercase tracking-[0.4em] text-white disabled:opacity-40"
            >
              Commit {readyVehicles.length} vehicles
            </button>
            <button
              onClick={resetOnboarding}
              className="rounded-2xl border border-white/15 px-6 py-3 text-xs uppercase tracking-[0.4em] text-white/70"
            >
              Reset workflow
            </button>
          </div>
        </section>
      )}

      {manualEntryData && step === 5 && (
        <section className="neo-panel p-6">
          <ManualDataEntry
            template={manualEntryData.template}
            existingData={manualEntryData.existingData}
            onDataSubmitted={handleManualEntrySubmit}
            onCancel={cancelManualEntry}
          />
        </section>
      )}

      <DocumentUploadModal
        isOpen={isDocumentUploadOpen}
        onClose={closeDocumentUploadModal}
        onDocumentsProcessed={handleDocumentProcessingComplete}
      />
    </div>
  );
};


// Fleet Management Component
const FleetPage: React.FC = () => {
  const {
    vehicles: fleetVehicles,
    isLoading,
    error: fleetError,
    refresh: refreshFleetState,
    addVehicles: addFleetVehicles,
    updateVehicle: updateFleetVehicle
  } = useFleetState({ autoRefresh: true });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<FleetStatusViewFilter>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isDocumentUploadOpen, setIsDocumentUploadOpen] = useState(false);
  const [isMultiBatchUploadOpen, setIsMultiBatchUploadOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);

  const handleVehicleAdded = (_newVehicle: VehicleRecord) => {
    void refreshFleetState();
  };

  const handleVehiclesAdded = (_newVehicles: VehicleRecord[]) => {
    void refreshFleetState();
  };

  const handleDocumentsProcessed = async (extractedData: ExtractedVehicleData[]) => {
    logger.info('Processing extracted document data in fleet page', {
      component: 'FleetPage',
      layer: 'frontend',
      extractedCount: extractedData.length
    });

    const vehiclesToAdd = extractedData.map(data => safeVehicleData(data));

    try {
      const result = await addFleetVehicles(vehiclesToAdd as FleetVehicleInput[]);

      if (result.success && result.processed > 0) {
        await Promise.all(
          extractedData.map(async (vehicleData) => {
            if (!vehicleData.vin) {
              return;
            }

            try {
              await reconcilerAPI.addDocument(vehicleData, {
                fileName: 'fleet_upload_' + vehicleData.vin + '_' + Date.now(),
                source: 'fleet_document_upload',
                uploadDate: new Date().toISOString()
              });
            } catch (error) {
              logger.warn('Failed to sync vehicle with reconciler', {
                component: 'FleetPage',
                layer: 'frontend',
                vin: vehicleData.vin
              }, error instanceof Error ? error : undefined);
            }
          })
        );

        try {
          reconcilerAPI.clearCache();
          await refreshFleetState();
        } catch (error) {
          logger.error('Failed to refresh fleet state after document ingestion', {
            component: 'FleetPage',
            layer: 'frontend'
          }, error instanceof Error ? error : undefined);
          window.location.reload();
        }
      } else {
        logger.warn('No vehicles were processed from extracted data', {
          component: 'FleetPage',
          layer: 'frontend',
          errors: result.errors
        });
      }
    } catch (error) {
      logger.error('Failed to persist extracted vehicles', {
        component: 'FleetPage',
        layer: 'frontend'
      }, error instanceof Error ? error : undefined);
    }
  };

  const handleMultiBatchDocumentsReconciled = async (vehicleCount: number) => {
    logger.info('Processing multi-batch document reconciliation', {
      component: 'FleetPage',
      layer: 'frontend',
      vehicleCount
    });

    try {
      reconcilerAPI.clearCache();
      await refreshFleetState();
      setSearchTerm(prev => prev);
    } catch (error) {
      logger.error('Failed to refresh fleet state after multi-batch reconciliation', {
        component: 'FleetPage',
        layer: 'frontend'
      }, error instanceof Error ? error : undefined);
      window.location.reload();
    }
  };

  // Function to fetch real compliance data for a vehicle (PRODUCTION MODE)
  const fetchRealComplianceData = async (vehicle: UnifiedVehicleData) => {
    try {
      
      // PRODUCTION MODE: Call the real comprehensive compliance service
      const realApiData = await comprehensiveComplianceService.getUnifiedComplianceData(
        vehicle.vin, 
        vehicle.dotNumber
      );


      // Transform the comprehensive API response to our compliance format
      const complianceData = {
        dotInspection: {
          status: getDOTComplianceStatus(realApiData.fmcsaData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.fmcsaData?.safetyRatingDate || ''),
          lastInspectionDate: realApiData.fmcsaData?.safetyRatingDate || '',
          inspectionType: 'DOT Safety Rating',
          safetyRating: realApiData.fmcsaData?.safetyRating || 'Unknown',
          violations: realApiData.inspectionRecords?.length || 0
        },
        registration: {
          status: getRegistrationStatus(realApiData.registrationData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.registrationData?.expirationDate || ''),
          registrationState: realApiData.registrationData?.state || 'Unknown',
          registrationNumber: realApiData.registrationData?.registrationNumber || vehicle.licensePlate,
          isValid: realApiData.registrationData?.isValid || false
        },
        insurance: {
          status: getInsuranceStatus(realApiData.insuranceData),
          daysUntilExpiry: calculateDaysUntilExpiry(realApiData.insuranceData?.expirationDate || ''),
          carrier: realApiData.insuranceData?.carrier || 'Unknown',
          policyNumber: realApiData.insuranceData?.policyNumber || '',
          isActive: realApiData.insuranceData?.isActive || false,
          coverageAmount: realApiData.insuranceData?.coverageTypes?.liability || 0
        },
        ifta: {
          status: 'compliant' as const, // IFTA data would need separate API
          daysUntilExpiry: 90, // Placeholder - would come from IFTA-specific API
          quarterDue: getNextIFTAQuarter(),
          jurisdiction: realApiData.registrationData?.state || 'CA'
        },
        // Store additional metadata
        apiMetadata: {
          lastUpdated: new Date().toISOString(),
          dataSource: 'real_api',
          complianceScore: realApiData.complianceScore || 0,
          vin: realApiData.vin
        }
      };

      // Update the vehicle in persistent storage with real data
      await updateFleetVehicle(vehicle.id, { 
        complianceData: complianceData,
        lastUpdated: new Date().toISOString()
      });
      
      // Reload vehicles to show updated data
      await refreshFleetState();
      
      return complianceData;
    } catch (error) {
      
      // Return blank/no data when API fails - no fallback to mock data
      const noDataResponse = {
        dotInspection: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          lastInspectionDate: '',
          inspectionType: 'No Data Available',
          safetyRating: 'No Data',
          violations: null,
          error: 'API unavailable'
        },
        registration: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          registrationState: 'No Data',
          registrationNumber: 'No Data',
          isValid: null,
          error: 'API unavailable'
        },
        insurance: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          carrier: 'No Data Available',
          policyNumber: 'No Data',
          isActive: null,
          coverageAmount: null,
          error: 'API unavailable'
        },
        ifta: {
          status: 'warning' as const,
          daysUntilExpiry: null,
          quarterDue: 'No Data',
          jurisdiction: 'No Data',
          error: 'API unavailable'
        },
        apiMetadata: {
          lastUpdated: new Date().toISOString(),
          dataSource: 'api_error',
          error: error instanceof Error ? error.message : String(error)
        }
      };

      return noDataResponse;
    }
  };

  // Helper functions for API data processing
  const getDOTComplianceStatus = (fmcsaData: { safetyRating?: string } | null) => {
    if (!fmcsaData) return 'warning' as const;
    if (fmcsaData.safetyRating === 'Satisfactory') return 'compliant' as const;
    if (fmcsaData.safetyRating === 'Conditional') return 'warning' as const;
    if (fmcsaData.safetyRating === 'Unsatisfactory') return 'expired' as const;
    return 'warning' as const;
  };

  const getRegistrationStatus = (regData: { isValid?: boolean; expirationDate?: string } | null) => {
    if (!regData) return 'warning' as const;
    if (regData.isValid) {
      const daysUntil = calculateDaysUntilExpiry(regData.expirationDate || '');
      if (daysUntil < 0) return 'expired' as const;
      if (daysUntil < 30) return 'warning' as const;
      return 'compliant' as const;
    }
    return 'expired' as const;
  };

  const getInsuranceStatus = (insData: { isActive?: boolean; expirationDate?: string } | null) => {
    if (!insData) return 'warning' as const;
    if (insData.isActive) {
      const daysUntil = calculateDaysUntilExpiry(insData.expirationDate || '');
      if (daysUntil < 0) return 'expired' as const;
      if (daysUntil < 30) return 'warning' as const;
      return 'compliant' as const;
    }
    return 'expired' as const;
  };

  const calculateDaysUntilExpiry = (dateString: string) => {
    if (!dateString) return 365; // Default to 1 year if no date
    const expiryDate = new Date(dateString);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNextIFTAQuarter = () => {
    const now = new Date();
    const currentQuarter = Math.floor((now.getMonth() + 3) / 3);
    const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
    const nextYear = currentQuarter === 4 ? now.getFullYear() + 1 : now.getFullYear();
    return `Q${nextQuarter} ${nextYear}`;
  };

  // Get compliance data - real API data, extracted document data, or show blanks
  const getComplianceData = (vehicle: UnifiedVehicleData) => {

    // Check if vehicle has real compliance data stored (highest priority)
    if (vehicle.complianceData) {
      return {
        ...vehicle.complianceData,
        isRealData: vehicle.complianceData.apiMetadata?.dataSource === 'real_api',
        dataSource: vehicle.complianceData.apiMetadata?.dataSource || 'unknown',
        lastUpdated: vehicle.complianceData.apiMetadata?.lastUpdated
      };
    }

    // Check if vehicle has extracted document data (medium priority)
    const hasDocumentData = vehicle.registrationExpirationDate || vehicle.insuranceCarrier || vehicle.policyNumber;
    if (hasDocumentData) {
      const calculateDaysUntilExpiry = (dateStr?: string) => {
        if (!dateStr) return null;
        try {
          const expiry = new Date(dateStr.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$1-$2'));
          const today = new Date();
          const diffTime = expiry.getTime() - today.getTime();
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch {
          return null;
        }
      };

      const getStatusFromDays = (days: number | null) => {
        if (days === null) return 'warning' as const;
        if (days < 0) return 'critical' as const;
        if (days < 30) return 'warning' as const;
        return 'compliant' as const;
      };

      const regDays = calculateDaysUntilExpiry(vehicle.registrationExpirationDate);
      const insDays = calculateDaysUntilExpiry(vehicle.insuranceExpirationDate);

      return {
        dotInspection: { 
          status: 'warning' as const, 
          daysUntilExpiry: null,
          lastInspectionDate: '',
          inspectionType: 'Not Synced',
          safetyRating: '—',
          violations: null
        },
        registration: { 
          status: getStatusFromDays(regDays),
          daysUntilExpiry: regDays,
          registrationState: vehicle.registrationState || '—',
          registrationNumber: vehicle.registrationNumber || '—',
          isValid: regDays !== null && regDays > 0
        },
        insurance: { 
          status: getStatusFromDays(insDays),
          daysUntilExpiry: insDays,
          carrier: vehicle.insuranceCarrier || '—',
          policyNumber: vehicle.policyNumber || '—',
          isActive: insDays !== null && insDays > 0,
          coverageAmount: vehicle.coverageAmount || null
        },
        ifta: { 
          status: 'warning' as const, 
          daysUntilExpiry: null,
          quarterDue: '—',
          jurisdiction: vehicle.registrationState || '—'
        },
        isRealData: false,
        dataSource: 'document_processing',
        lastUpdated: vehicle.lastUpdated
      };
    }

    // NO DATA - Show blanks until data is available
    return {
      dotInspection: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        lastInspectionDate: '',
        inspectionType: 'Not Synced',
        safetyRating: '—',
        violations: null
      },
      registration: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        registrationState: '—',
        registrationNumber: '—',
        isValid: null
      },
      insurance: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        carrier: '—',
        policyNumber: '—',
        isActive: null,
        coverageAmount: null
      },
      ifta: { 
        status: 'warning' as const, 
        daysUntilExpiry: null,
        quarterDue: '—',
        jurisdiction: '—'
      },
      isRealData: false,
      dataSource: 'not_synced',
      lastUpdated: null
    };
  };

  // Use centralized service for filtering - much simpler and consistent!
  const allFilteredVehicles = fleetVehicles.filter(vehicle => {
    // Apply search filter
    const lowerSearchTerm = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === '' ||
      vehicle.vin.toLowerCase().includes(lowerSearchTerm) ||
      vehicle.make.toLowerCase().includes(lowerSearchTerm) ||
      vehicle.model.toLowerCase().includes(lowerSearchTerm) ||
      vehicle.licensePlate.toLowerCase().includes(lowerSearchTerm) ||
      vehicle.truckNumber?.toLowerCase().includes(lowerSearchTerm) ||
      // Smart search: if user types just a number, search truck numbers
      (searchTerm.match(/^\d+$/) && vehicle.truckNumber?.includes(`#${searchTerm.padStart(3, '0')}`)) ||
      // Also match "#47" format
      (searchTerm.startsWith('#') && vehicle.truckNumber?.toLowerCase().includes(lowerSearchTerm));
    
    // Apply status filter using unified compliance data
    let matchesStatus = statusFilter === 'all';
    if (!matchesStatus) {
      switch (statusFilter) {
        case 'compliant':
          matchesStatus = (vehicle.complianceScore || 0) >= 80;
          break;
        case 'non_compliant':
          matchesStatus = (vehicle.complianceScore || 0) < 80;
          break;
        case 'expires_soon':
          matchesStatus = vehicle.reconciledData?.hasExpiringSoonDocuments || false;
          break;
        case 'review_needed':
          matchesStatus = (vehicle.conflictFlags?.length || 0) > 0;
          break;
        default:
          matchesStatus = vehicle.status === statusFilter;
      }
    }
    
    return matchesSearch && matchesStatus;
  });
  

  // Use centralized service for consistent stats
  const stats = {
    total: fleetVehicles.length,
    active: fleetVehicles.filter(v => v.status === 'active').length,
    inactive: fleetVehicles.filter(v => v.status === 'inactive').length,
    complianceWarnings: fleetVehicles.filter(v => (v.complianceScore || 0) < 80 && (v.complianceScore || 0) >= 60).length,
    complianceExpired: fleetVehicles.filter(v => (v.complianceScore || 0) < 60).length
  };

  // Convert vehicle data to enhanced card format
  const mapVehicleToCardFormat = (vehicle: UnifiedVehicleData) => {
    const compliance = getComplianceData(vehicle);

    const normalizeStatus = (status: unknown): 'compliant' | 'warning' | 'expired' => {
      if (status === 'expired' || status === 'critical') {
        return 'expired';
      }
      if (status === 'warning') {
        return 'warning';
      }
      return 'compliant';
    };

    const toComplianceItem = (item: any) => {
      const expiry =
        item?.expiryDate ??
        item?.expirationDate ??
        item?.registrationExpirationDate ??
        item?.insuranceExpirationDate ??
        null;

      return {
        status: normalizeStatus(item?.status),
        expiryDate: expiry ?? undefined,
        daysUntilExpiry: typeof item?.daysUntilExpiry === 'number' ? item.daysUntilExpiry : 0
      };
    };

    const registrationItem = toComplianceItem(compliance.registration ?? {});
    const insuranceItem = toComplianceItem(compliance.insurance ?? {});
    const dotInspectionItem = toComplianceItem(compliance.dotInspection ?? {});
    const iftaItem = toComplianceItem(compliance.ifta ?? {});

    const complianceItems = [registrationItem, insuranceItem, dotInspectionItem, iftaItem];

    const compliantCount = complianceItems.filter((item) => item.status === 'compliant').length;
    const warningCount = complianceItems.filter((item) => item.status === 'warning').length;

    const totalScore =
      complianceItems.length > 0
        ? (compliantCount * 100 + warningCount * 70) / complianceItems.length
        : 0;

    const overallStatus: 'compliant' | 'warning' | 'expired' =
      totalScore >= 90 ? 'compliant' : totalScore >= 50 ? 'warning' : 'expired';

    const parsedYear =
      typeof vehicle.year === 'number'
        ? vehicle.year
        : Number(vehicle.year) || new Date().getFullYear();

    return {
      vehicle: {
        id: vehicle.id,
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: parsedYear,
        licensePlate: vehicle.licensePlate || 'UNKNOWN',
        truckNumber: vehicle.truckNumber,
        status: (vehicle.status ?? 'active') as 'active' | 'inactive' | 'maintenance',
        dotNumber: vehicle.dotNumber,
        dateAdded: vehicle.dateAdded ?? new Date().toISOString()
      },
      compliance: {
        registration: registrationItem,
        insurance: insuranceItem,
        dotInspection: dotInspectionItem,
        ifta: iftaItem,
        overall: {
          score: Math.round(totalScore),
          status: overallStatus
        }
      }
    };
  };

  // Helper functions for compliance status (will be used in Phase 3)
  // const getComplianceStatusColor = (item: ComplianceItem) => {
  //   switch (item.status) {
  //     case 'compliant': return 'text-emerald-800 bg-gradient-to-r from-emerald-100 to-green-100 border-emerald-300';
  //     case 'warning': return 'text-amber-800 bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300';
  //     case 'expired': return 'text-red-800 bg-gradient-to-r from-red-100 to-rose-100 border-red-300';
  //     default: return 'text-slate-700 bg-gradient-to-r from-slate-100 to-gray-100 border-slate-300';
  //   }
  // };

  // const getComplianceIcon = (item: ComplianceItem) => {
  //   const daysUntil = item.daysUntilExpiry;
  //   switch (item.status) {
  //     case 'compliant': return daysUntil > 90 ? '🟢' : daysUntil > 30 ? '🟡' : '🟠';
  //     case 'warning': return '⚠️';
  //     case 'expired': return '🔴';
  //     default: return '⚪';
  //   }
  // };

  return (
    <div className="space-y-10">
      {/* Fleet Command Header */}
      <section className="neo-panel p-8 text-white">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-white/60">Fleet operations</p>
            <h2 className="font-display text-3xl md:text-4xl">Vehicle command lattice</h2>
            <p className="text-sm text-white/60">Live roster of tractors, compliance posture, and ingest signals.</p>
          </div>
          <div className="grid gap-3 text-right">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/60">Total units</p>
              <p className="font-display text-4xl">{stats.total}</p>
            </div>
            <div className="flex gap-3 text-xs justify-end text-white/70">
              <span className="data-chip text-emerald-200">Active {stats.active}</span>
              <span className="data-chip text-orange-200">Idle {stats.inactive}</span>
            </div>
          </div>
        </div>
      </section>

      {fleetError && (
        <section className="neo-panel border border-red-400/40 bg-red-900/30 p-4 text-sm text-red-100">
          {fleetError}
        </section>
      )}

      {isLoading && (
        <section className="neo-panel border border-cyan-400/30 bg-cyan-900/20 p-4 text-sm text-cyan-100">
          Loading fleet data...
        </section>
      )}

      {/* Fleet Stats */}
      <section className="neo-panel p-6 text-white">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Total</p>
            <p className="font-display text-3xl">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Active</p>
            <p className="font-display text-3xl text-emerald-100">{stats.active}</p>
          </div>
          <div className="rounded-2xl border border-slate-400/30 bg-slate-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Idle</p>
            <p className="font-display text-3xl text-white/80">{stats.inactive}</p>
          </div>
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-red-200">Issues</p>
            <p className="font-display text-3xl text-red-100">{stats.complianceWarnings + stats.complianceExpired}</p>
          </div>
        </div>
      </section>

      <section className="neo-panel p-6 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <input
            type="text"
            placeholder="Search vehicles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 placeholder-white/40 focus:border-white/40"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'maintenance')}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="flex overflow-hidden rounded-2xl border border-white/10">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                  viewMode === 'cards' ? 'bg-white/10 text-white' : 'text-white/60'
                }`}
              >
                Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                  viewMode === 'table' ? 'bg-white/10 text-white' : 'text-white/60'
                }`}
              >
                Table
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="neo-panel p-6 space-y-4 text-white">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setIsAddModalOpen(true)} className="pressable rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em]">
            + Add Vehicle
          </button>
          <button onClick={() => setIsBulkUploadOpen(true)} className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/80">
            Bulk Upload
          </button>
          <button onClick={() => setIsDocumentUploadOpen(true)} className="rounded-2xl border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-emerald-100">
            Upload Documents
          </button>
          <button onClick={() => setIsMultiBatchUploadOpen(true)} className="rounded-2xl border border-purple-400/40 bg-purple-500/20 px-4 py-2 text-xs uppercase tracking-[0.3em] text-purple-100">
            Multi-Batch
          </button>
          <button onClick={() => setIsTestRunnerOpen(true)} className="rounded-2xl border border-yellow-400/40 bg-yellow-500/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-yellow-100">
            Test Runner
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => documentDownloadService.downloadComplianceSummary(fleetVehicles)}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
          >
            Download Report
          </button>
          <button
            onClick={async () => {
              for (const unifiedVehicle of fleetVehicles) {
                await fetchRealComplianceData(unifiedVehicle);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
          >
            Sync All
          </button>
          <button
            onClick={async () => {
              if (window.confirm('Clear all fleet data? This cannot be undone.')) {
                try {
                  const result = await centralizedFleetDataService.clearAllFleetData();
                  if (result.success) {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }
                } catch (error) {
                  void refreshFleetState();
                }
              }
            }}
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-red-100"
          >
            Clear Fleet
          </button>
        </div>
      </section>


      {/* Vehicle Display - Cards or Table */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {allFilteredVehicles.map((vehicle) => {
            const cardData = mapVehicleToCardFormat(vehicle);

            return (
              <MinimalisticVehicleCard
                key={vehicle.id}
                vehicle={cardData.vehicle}
                compliance={cardData.compliance}
                onViewDetails={() => {
                }}
                onScheduleService={() => {
                }}
                onEditVehicle={() => {
                }}
              />
            );
          })}
        </div>
      ) : (
        <div className="neo-panel overflow-x-auto p-0">
          <table className="w-full text-sm text-white/80">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Truck</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Vehicle</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">VIN</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">License</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Status</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">DOT</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Registration</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Insurance</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">IFTA</th>
                <th className="px-3 py-3 text-center text-xs uppercase tracking-[0.3em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allFilteredVehicles.map((vehicle) => {
                const compliance = getComplianceData(vehicle);
                return (
                <tr key={vehicle.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.truckNumber ? 
                      vehicle.truckNumber.replace('Truck #', '#') : 
                      `#${vehicle.vin?.slice(-3) || '???'}`
                    }
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </td>
                  <td className="px-3 py-3 text-center text-sm font-mono" title={vehicle.vin}>
                    {vehicle.vin}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {vehicle.licensePlate}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      vehicle.status === 'active' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.dotInspection.daysUntilExpiry !== null ? `${compliance.dotInspection.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm" title={`Registration expires: ${vehicle.registrationExpirationDate || 'Not available'}`}>
                    {vehicle.registrationExpirationDate || '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm" title={`Insurance expires: ${vehicle.insuranceExpirationDate || 'Not available'}`}>
                    {vehicle.insuranceExpirationDate || '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    {compliance.ifta.daysUntilExpiry !== null ? `${compliance.ifta.daysUntilExpiry}d` : '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-sm">
                    <div className="flex justify-center space-x-1">
                      <button className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded">
                        View
                      </button>
                      <button className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded">
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {allFilteredVehicles.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🚛</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles found</h3>
          <p className="text-gray-500">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Get started by adding vehicles individually or use bulk upload for multiple vehicles'
            }
          </p>
        </div>
      )}

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onVehicleAdded={handleVehicleAdded}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onVehiclesAdded={handleVehiclesAdded}
      />

      {/* Document Upload Modal */}
      <DocumentUploadModal
        isOpen={isDocumentUploadOpen}
        onClose={() => {
          setIsDocumentUploadOpen(false);
          // Use setTimeout to ensure the modal has fully closed before refreshing
          setTimeout(async () => {
            try {
              await centralizedFleetDataService.initializeData();
            } catch (error) {
              window.location.reload(); // Fallback: reload the page
            }
          }, 100);
        }}
        onDocumentsProcessed={handleDocumentsProcessed}
      />

      {/* Multi-Batch Document Upload Modal */}
      <MultiBatchDocumentUploadModal
        isOpen={isMultiBatchUploadOpen}
        onClose={() => setIsMultiBatchUploadOpen(false)}
        onDocumentsReconciled={handleMultiBatchDocumentsReconciled}
      />

      {/* Test Runner Modal */}
      <TestRunnerModal
        isOpen={isTestRunnerOpen}
        onClose={() => setIsTestRunnerOpen(false)}
      />
    </div>
  );
};

// Compliance Dashboard Component
const CompliancePage: React.FC = () => {
  const {
    tasks,
    stats,
    loading: complianceLoading,
    error: complianceError,
    refresh: refreshCompliance,
    updateTaskStatus
  } = useComplianceData();
  const [selectedTask, setSelectedTask] = useState<ComplianceTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed' | 'overdue'>('all');
  const [filterPriority, setFilterPriority] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.vehicleVin.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.vehicleName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || task.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || task.priority === filterPriority;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, searchTerm, filterStatus, filterPriority]);

  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((task) => task.id === selectedTask.id);
      if (updated) {
        setSelectedTask(updated);
      }
    }
  }, [tasks, selectedTask]);

  const priorityTone: Record<ComplianceTask['priority'], string> = {
    critical: 'border-red-400/40 bg-red-500/20 text-red-100',
    high: 'border-orange-400/40 bg-orange-500/20 text-orange-100',
    medium: 'border-amber-300/40 bg-amber-300/10 text-amber-100',
    low: 'border-white/10 bg-white/5 text-white/70'
  };

  const statusTone: Record<ComplianceTask['status'], string> = {
    pending: 'text-orange-200',
    in_progress: 'text-cyan-200',
    completed: 'text-emerald-200',
    overdue: 'text-red-200'
  };

  const handleStatusUpdate = (taskId: string, newStatus: ComplianceTask['status']) => {
    updateTaskStatus(taskId, newStatus);
  };

  return (
    <div className="space-y-10">
      <section className="neo-panel p-8 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-white/60">Compliance intelligence</p>
            <h2 className="font-display text-3xl">Live obligations board</h2>
            <p className="text-sm text-white/60">Task load, deadlines, and accountability in one live console.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => refreshCompliance()} className="pressable rounded-2xl border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.4em]">
              Refresh
            </button>
          </div>
        </div>
        {complianceError && <p className="mt-4 text-sm text-red-200">{complianceError}</p>}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Total</p>
            <p className="font-display text-3xl">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-orange-200">Pending</p>
            <p className="font-display text-3xl">{stats.pending}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Completed</p>
            <p className="font-display text-3xl">{stats.completed}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5/10 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-red-200">Overdue</p>
            <p className="font-display text-3xl">{stats.overdue}</p>
          </div>
        </div>
      </section>

      <section className="neo-panel p-6 space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <input
            type="text"
            placeholder="Search tasks by vehicle, VIN, or keyword"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-white/80 placeholder-white/40 focus:border-white/40"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            >
              <option value="all">All status</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as typeof filterPriority)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
            >
              <option value="all">All priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="neo-panel p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Tasks</p>
              <h3 className="font-display text-2xl text-white">{filteredTasks.length} active</h3>
            </div>
            {complianceLoading && <span className="data-chip text-white/60">Loading...</span>}
          </div>
          <div className="space-y-4">
            {filteredTasks.length === 0 && (
              <p className="text-sm text-white/60">No tasks match your filters.</p>
            )}
            {filteredTasks.map((task) => {
              const isActive = selectedTask?.id === task.id;
              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left ${
                    isActive ? 'border-white/40 bg-white/10 shadow-lg' : 'border-white/10 bg-black/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-lg text-white">{task.title}</p>
                      <p className="text-sm text-white/60">{task.vehicleName} � {task.vehicleVin}</p>
                    </div>
                    <span className={`data-chip ${priorityTone[task.priority]}`}>{task.priority}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/60">
                    <span className={statusTone[task.status]}>Status: {task.status}</span>
                    <span>{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </article>

        <article className="neo-panel p-6 space-y-4">
          {selectedTask ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-white/50">Details</p>
                  <h3 className="font-display text-2xl text-white">{selectedTask.title}</h3>
                  <p className="text-sm text-white/60">{selectedTask.vehicleName} � {selectedTask.vehicleVin}</p>
                </div>
                <span className={`data-chip ${priorityTone[selectedTask.priority]}`}>{selectedTask.priority}</span>
              </div>
              <p className="text-sm text-white/70">{selectedTask.description}</p>
              <div className="grid gap-3 text-sm text-white/70">
                <p><span className="text-white/40">Due:</span> {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleString() : 'TBD'}</p>
                <p><span className="text-white/40">Jurisdiction:</span> {selectedTask.jurisdiction || '�'}</p>
                <p><span className="text-white/40">Assigned:</span> {selectedTask.assignedTo || 'Unassigned'}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.35em] text-white/50">Required documents</p>
                <div className="flex flex-wrap gap-2">
                  {(selectedTask.requiredDocuments ?? ['Primary proof']).map((doc) => (
                    <span key={doc} className="data-chip border-white/20 text-white/70">{doc}</span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {selectedTask.status !== 'completed' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedTask.id, 'completed')}
                    className="pressable rounded-2xl border border-emerald-400/40 bg-emerald-600/30 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
                  >
                    Mark complete
                  </button>
                )}
                {selectedTask.status !== 'in_progress' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedTask.id, 'in_progress')}
                    className="rounded-2xl border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
                  >
                    In progress
                  </button>
                )}
                {selectedTask.status !== 'pending' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedTask.id, 'pending')}
                    className="rounded-2xl border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-white/60">
              <p>Select a task to view contextual details.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
};


// Modern Dashboard Component  
// DashboardPageProps is now imported from ./types

const DashboardPage: React.FC<DashboardPageProps> = ({ setCurrentPage }) => {
  // Use centralized service for consistent dashboard data
  const dashboardFleetData = useFleetData();
  const fleetHookEnabled = isFleetHookEnabled();
  const { stats: hookFleetStats } = useFleetState({ autoRefresh: true });
  const { stats: complianceStats, tasks: complianceTasks } = useComplianceData();
  const [fleetStats, setFleetStats] = useState(() => dashboardFleetData.getFleetStats());

  useEffect(() => {
    if (fleetHookEnabled) {
      return;
    }

    const unsubscribeCentralized = dashboardFleetData.subscribe((event: 'data_changed' | 'loading_changed' | 'error') => {
      if (event === 'data_changed') {
        setFleetStats(dashboardFleetData.getFleetStats());
      }
    });

    setFleetStats(dashboardFleetData.getFleetStats());

    return () => {
      unsubscribeCentralized();
    };
  }, [dashboardFleetData, fleetHookEnabled]);

  useEffect(() => {
    if (!fleetHookEnabled) {
      return;
    }

    setFleetStats((prev) => {
      const next = hookFleetStats;
      if (
        prev.total === next.total &&
        prev.active === next.active &&
        prev.inactive === next.inactive &&
        prev.compliant === next.compliant &&
        prev.nonCompliant === next.nonCompliant &&
        prev.expiringDocuments === next.expiringDocuments &&
        prev.averageComplianceScore === next.averageComplianceScore
      ) {
        return prev;
      }
      return next;
    });
  }, [fleetHookEnabled, hookFleetStats]);

  const displayedFleetStats = fleetHookEnabled ? hookFleetStats : fleetStats;
  const activeRatio = displayedFleetStats.total > 0 ? Math.round((displayedFleetStats.active / displayedFleetStats.total) * 100) : 0;
  const readinessScore = Math.max(0, Math.min(100, 100 - (complianceStats.overdue ?? 0) * 6));
  const complianceCoverage = displayedFleetStats.total > 0
    ? Math.max(0, Math.min(100, Math.round(((displayedFleetStats.total - (complianceStats.overdue ?? 0)) / displayedFleetStats.total) * 100)))
    : 0;
  const expiringDocuments = displayedFleetStats.expiringDocuments ?? 0;

  const priorityWeight: Record<ComplianceTask['priority'], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };

  const complianceHighlights = complianceTasks
    .slice()
    .sort((a, b) => (priorityWeight[b.priority] ?? 0) - (priorityWeight[a.priority] ?? 0))
    .slice(0, 4);

  const timelineSource = complianceTasks.length > 0
    ? complianceTasks
    : [
        {
          id: 'seed-1',
          title: 'Awaiting import',
          vehicleName: 'Upload VIN manifest',
          updatedDate: new Date().toISOString(),
          priority: 'medium',
          status: 'pending'
        } as ComplianceTask,
        {
          id: 'seed-2',
          title: 'Activate AI intake',
          vehicleName: 'Document pipeline',
          updatedDate: new Date().toISOString(),
          priority: 'high',
          status: 'in_progress'
        } as ComplianceTask
      ];

  const timelineEvents = timelineSource.slice(0, 5).map((task, index) => {
    const date = task.updatedDate || task.createdDate;
    const formatted = date && !Number.isNaN(new Date(date).getTime())
      ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Now';
    return {
      id: `${task.id}-${index}`,
      title: task.title,
      detail: task.vehicleName,
      time: formatted,
      tone: task.priority
    };
  });

  const quickActions = [
    {
      title: 'Document intake',
      description: 'AI-normalize insurance & inspection stacks',
      badge: 'OCR + reconcile',
      target: 'onboarding' as AppPage
    },
    {
      title: 'Compliance queue',
      description: 'Prioritize overdue + critical assets',
      badge: '7 alerts',
      target: 'compliance' as AppPage
    },
    {
      title: 'Driver matrix',
      description: 'Audit CDL & medical expirations',
      badge: 'Live roster',
      target: 'drivers' as AppPage
    }
  ];

  const formatDueWindow = (task: ComplianceTask) => {
    if (typeof task.daysUntilDue === 'number') {
      if (task.daysUntilDue < 0) {
        return `Overdue by ${Math.abs(task.daysUntilDue)}d`;
      }
      if (task.daysUntilDue === 0) {
        return 'Due today';
      }
      return `Due in ${task.daysUntilDue}d`;
    }
    if (task.dueDate) {
      const diff = Math.ceil((new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (!Number.isNaN(diff)) {
        return diff < 0 ? `Overdue by ${Math.abs(diff)}d` : `Due in ${diff}d`;
      }
    }
    return 'Schedule TBD';
  };

  const readinessArc = {
    background: `conic-gradient(var(--accent-electric) ${readinessScore * 3.6}deg, rgba(255,255,255,0.08) ${readinessScore * 3.6}deg)`
  } as React.CSSProperties;

  return (
    <div className="space-y-10">
      <section className="neo-panel grid gap-8 p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-white/50">
            <span className="status-pulse h-2.5 w-2.5 rounded-full bg-[var(--accent-electric)]" />
            Mission ready
          </div>
          <div>
            <h1 className="font-display text-4xl text-white md:text-5xl">Logistics Command Deck</h1>
            <p className="mt-3 text-base text-white/60">
              Live telemetry across fleet health, compliance pressure, and operational readiness in one canvas.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Fleet units', value: displayedFleetStats.total },
              { label: 'Active coverage', value: `${activeRatio}%` },
              { label: 'Compliance coverage', value: `${complianceCoverage}%` }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">{item.label}</p>
                <p className="mt-2 font-display text-3xl text-white">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Expiring documents</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="font-display text-4xl text-white">{expiringDocuments}</p>
                <span className="data-chip text-white/60">Next 30 days</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/20 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Overdue alerts</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="font-display text-4xl text-white">{complianceStats.overdue}</p>
                <span className="data-chip text-white/60">Critical focus</span>
              </div>
            </div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-cyan-900/40 to-slate-900/30 p-8 text-center">
          <div className="mx-auto h-48 w-48 rounded-full border border-white/10 bg-black/40 p-3">
            <div className="relative h-full w-full rounded-full border border-white/10">
              <div className="absolute inset-3 rounded-full" style={readinessArc}>
                <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-black/80">
                  <p className="text-xs uppercase tracking-[0.4em] text-white/40">Readiness</p>
                  <p className="font-display text-4xl text-white">{readinessScore}</p>
                  <p className="text-xs text-white/50">system score</p>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-white/70">
            Real-time signal from compliance backlog, active vehicles, and document velocity.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-white/60">
            <span className="data-chip">{displayedFleetStats.active} active</span>
            <span className="data-chip">{displayedFleetStats.inactive} idle</span>
            <span className="data-chip">{complianceStats.critical} critical</span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="neo-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Fleet health snapshot</p>
              <h3 className="font-display text-2xl text-white">Operational pulse</h3>
            </div>
            <span className="data-chip text-white/60">Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Active units</p>
              <p className="font-display text-3xl text-white">{displayedFleetStats.active}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Idle / maintenance</p>
              <p className="font-display text-3xl text-white">{displayedFleetStats.inactive}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Expiring docs</p>
              <p className="font-display text-3xl text-white">{expiringDocuments}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">Overdue</p>
              <p className="font-display text-3xl text-white">{complianceStats.overdue}</p>
            </div>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Compliance stability</span>
                <span>{100 - readinessScore}% load</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: `${Math.max(15, 100 - readinessScore)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Fleet utilization</span>
                <span>{activeRatio}%</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-400" style={{ width: `${activeRatio}%` }} />
              </div>
            </div>
          </div>
        </article>

        <article className="neo-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Command shortcuts</p>
              <h3 className="font-display text-2xl text-white">Workflow stack</h3>
            </div>
            <span className="data-chip text-white/60">Actionable</span>
          </div>
          <div className="mt-6 space-y-4">
            {quickActions.map((action) => (
              <button
                key={action.title}
                onClick={() => setCurrentPage(action.target)}
                className="pressable w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-left transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg text-white">{action.title}</p>
                    <p className="text-sm text-white/60">{action.description}</p>
                  </div>
                  <span className="data-chip text-white/60">{action.badge}</span>
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="neo-panel grid-stripe p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Live compliance queue</p>
              <h3 className="font-display text-2xl text-white">Critical focus</h3>
            </div>
            <button
              onClick={() => setCurrentPage('compliance')}
              className="text-sm text-[var(--accent-electric)] underline-offset-4 hover:underline"
            >
              View board
            </button>
          </div>
          <div className="mt-6 space-y-4">
            {complianceHighlights.length === 0 && (
              <p className="text-sm text-white/60">No compliance alerts yet � feed is awaiting data.</p>
            )}
            {complianceHighlights.map((task) => (
              <div key={task.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg text-white">{task.vehicleName}</p>
                    <p className="text-sm text-white/60">{task.title}</p>
                  </div>
                  <span className="data-chip uppercase tracking-[0.3em] text-white/70">{task.priority}</span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-white/60">
                  <span className="font-mono text-white/70">{task.vehicleVin}</span>
                  <span>{formatDueWindow(task)}</span>
                </div>
                <div className="mt-3 bruteline pt-3 text-xs text-white/50">Status: {task.status}</div>
              </div>
            ))}
          </div>
        </article>

        <article className="neo-panel p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">Telemetry timeline</p>
              <h3 className="font-display text-2xl text-white">Activity lane</h3>
            </div>
            <span className="data-chip text-white/60">Live</span>
          </div>
          <div className="mt-6 space-y-5">
            {timelineEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-4">
                <div className="pt-1">
                  <span className="block h-3 w-3 rounded-full bg-[var(--accent-lava)]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-base text-white">{event.title}</p>
                    <span className="text-xs text-white/50">{event.time}</span>
                  </div>
                  <p className="text-sm text-white/60">{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};



// Main App Component
function AppContent() {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const { stats: headerComplianceStats } = useComplianceData();

  // Initialize storage system with PostgreSQL migration on app startup
  useEffect(() => {
    const initializeStorageSystem = async () => {
      try {
        logger.info('Initializing fleet storage adapter', { component: 'AppContent', layer: 'frontend' });
        await fleetStorageAdapter.initialize();
        logger.info('Fleet storage adapter initialized successfully', { component: 'AppContent', layer: 'frontend' });
      } catch (error) {
        logger.warn(
          'Fleet storage adapter initialization failed; continuing with fallback mode',
          { component: 'AppContent', layer: 'frontend' },
          error instanceof Error ? error : undefined
        );
        // Still allow the app to continue with localStorage fallback
      }
    };

    initializeStorageSystem();
  }, []);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Command Deck', description: 'Live ops + telemetry', icon: IconDashboard },
    { id: 'onboarding', label: 'Fleet Ingest', description: 'Uploads, OCR & VIN parsing', icon: IconOnboarding },
    { id: 'fleet', label: 'Asset Graph', description: 'Vehicles & lifecycle control', icon: IconFleet },
    { id: 'drivers', label: 'Driver Matrix', description: 'Med cards & renewals', icon: IconDrivers },
    { id: 'compliance', label: 'Compliance Tasks', description: 'Tasks & attestations', icon: IconCompliance },
    {
      id: 'comprehensive-compliance',
      label: 'Live Compliance',
      description: 'Signal-grade monitoring',
      icon: IconRealtime
    },
    { id: 'reports', label: 'Intelligence', description: 'Reports & exports', icon: IconReports },
    { id: 'error-testing', label: 'Resilience Lab', description: 'Chaos & recovery drills', icon: IconLab }
  ];

  const pageDescriptions: Record<AppPage, string> = {
    dashboard: 'A unified operational pulse across vehicles, compliance load, and real-time readiness.',
    onboarding: 'Pipe in VIN sheets, AI document batches, or manual records with guided oversight.',
    fleet: 'Searchable, filterable control over every asset, lifecycle state, and document trail.',
    drivers: 'Monitor medical certificates, CDL renewals, and driver compliance status in one grid.',
    compliance: 'Triage tasks with contextual documents, SLA timers, and accountable owners.',
    'comprehensive-compliance': 'Realtime alerting with streaming checks from our compliance intelligence.',
    reports: 'Produce audit-ready exports and deep-dive analytics for operations and leadership.',
    'error-testing': 'Run chaos experiments to validate error handling, fallbacks, and system resilience.'
  };

  const actionMap: Record<AppPage, { label: string; target?: AppPage }> = {
    dashboard: { label: 'Add Vehicles Batch', target: 'onboarding' },
    onboarding: { label: 'Review Fleet State', target: 'fleet' },
    fleet: { label: 'Upload Compliance Docs', target: 'onboarding' },
    drivers: { label: 'Open Compliance Tasks', target: 'compliance' },
    compliance: { label: 'Launch Live Compliance', target: 'comprehensive-compliance' },
    'comprehensive-compliance': { label: 'Log Critical Task', target: 'compliance' },
    reports: { label: 'Generate Report Pack', target: 'reports' },
    'error-testing': { label: 'Trigger Chaos Suite', target: 'error-testing' }
  };

  const headerAction = actionMap[currentPage] ?? actionMap.dashboard;
  const fleetStatsSnapshot = centralizedFleetDataService.getFleetStats();
  const user = authService.getCurrentUser();
  const company = authService.getCurrentCompany();
  const currentNavItem = navItems.find((item) => item.id === currentPage);

  const quickTelemetry = [
    { label: 'Active units', value: fleetStatsSnapshot.active ?? 0 },
    { label: 'Expiring docs', value: fleetStatsSnapshot.expiringDocuments ?? 0 },
    { label: 'Overdue tasks', value: headerComplianceStats.overdue ?? 0 }
  ];

  const handlePrimaryAction = () => {
    if (headerAction.target && headerAction.target !== currentPage) {
      setCurrentPage(headerAction.target);
    }
  };

  return (
    <div className="command-shell min-h-screen text-[var(--text-primary)]">
      <div className="relative grid min-h-screen lg:grid-cols-[320px_1fr]">
        <aside className="hidden lg:flex flex-col border-r border-white/5 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-black/80">
          <div className="px-8 pt-10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.5em] text-white/40">TruckBo</p>
                <h1 className="font-display text-2xl text-white">Command Surface</h1>
                <p className="mt-2 text-sm text-white/50">Industrial intelligence for fleets</p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 text-lg font-semibold text-white/80">
                TB
              </div>
            </div>
          </div>

          <div className="px-8 mt-10 space-y-4">
            {user && (
              <div className="neo-panel border border-white/10 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 font-display text-lg text-white">
                    {`${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}` || 'TB'}
                  </div>
                  <div>
                    <p className="font-display text-sm tracking-wide text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/50">{user.role}</p>
                  </div>
                </div>
                {company?.name && (
                  <p className="mt-4 text-xs uppercase tracking-[0.4em] text-white/30">{company.name}</p>
                )}
                <button
                  onClick={() => authService.logout()}
                  className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Logout
                </button>
              </div>
            )}

            <div className="neo-panel border border-white/10 p-5">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
                <span>Total Fleet</span>
                <span className="font-display text-xl text-white">{fleetStatsSnapshot.total}</span>
              </div>
              <div className="mt-4 space-y-2 text-sm text-white/60">
                <div className="flex items-center justify-between">
                  <span>Active</span>
                  <span className="font-display text-white">{fleetStatsSnapshot.active}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Inactive</span>
                  <span className="font-display text-white/70">{fleetStatsSnapshot.inactive}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Expiring docs</span>
                  <span className="font-display text-white">{fleetStatsSnapshot.expiringDocuments}</span>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-white/10 p-3 text-xs text-white/60">
                <p className="font-mono">Live Telemetry</p>
                <p className="mt-1 text-white/40">{fleetStatsSnapshot.total > 0 ? 'signal-linked' : 'awaiting ingest'}</p>
              </div>
            </div>
          </div>

          <nav className="mt-10 flex-1 space-y-2 overflow-y-auto px-6 pb-6">
            {navItems.map((item) => {
              const ItemIcon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentPage(item.id)}
                  className={`pressable flex w-full items-center gap-4 rounded-2xl border px-4 py-4 text-left transition ${
                    isActive ? 'border-white/30 bg-white/10 shadow-lg' : 'border-white/5 bg-white/0 hover:border-white/15'
                  }`}
                >
                  <div
                    className={`grid h-11 w-11 place-items-center rounded-2xl ${
                      isActive ? 'bg-white/15 text-white' : 'bg-white/5 text-white/70'
                    }`}
                  >
                    <ItemIcon />
                  </div>
                  <div>
                    <p className="font-display text-sm tracking-wide text-white">{item.label}</p>
                    <p className="text-xs text-white/50">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="px-8 pb-10 text-xs text-white/50">
            <div className="flex items-center gap-3">
              <span className="status-pulse h-2.5 w-2.5 rounded-full bg-[var(--accent-electric)]" />
              <span>{fleetStatsSnapshot.total > 0 ? 'Systems online' : 'Awaiting data sync'}</span>
            </div>
            <p className="mt-3 text-white/40">Last sync {new Date().toLocaleTimeString()}</p>
          </div>
        </aside>

        <div className="flex flex-col backdrop-blur-xl">
          <header className="border-b border-white/5 bg-black/30 px-6 py-6 lg:px-12">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.35em] text-white/50">
                  {currentNavItem?.label ?? 'Command Deck'}
                </p>
                <h2 className="font-display text-3xl text-white md:text-4xl">
                  {currentNavItem?.label ?? 'Command Deck'}
                </h2>
                <p className="max-w-2xl text-sm text-white/60">{pageDescriptions[currentPage]}</p>
              </div>

              <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                <div className="flex gap-4">
                  {quickTelemetry.map((metric) => (
                    <div key={metric.label} className="text-right">
                      <p className="text-xs uppercase tracking-[0.3em] text-white/50">{metric.label}</p>
                      <p className="font-display text-2xl text-white">{metric.value}</p>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handlePrimaryAction}
                  className="pressable rounded-2xl border border-white/10 bg-gradient-to-r from-emerald-500/80 via-cyan-500/70 to-indigo-500/70 px-6 py-3 font-display text-sm uppercase tracking-[0.4em] text-white shadow-xl shadow-cyan-500/20"
                >
                  {headerAction.label}
                </button>
              </div>
            </div>
            <div className="mt-6 lg:hidden overflow-x-auto">
              <div className="flex min-w-max gap-3 pb-2">
                {navItems.map((item) => {
                  const ItemIcon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentPage(item.id)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
                        isActive ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-white/60'
                      }`}
                    >
                      <ItemIcon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-8 sm:px-6 lg:px-12">
            <div className="mx-auto w-full max-w-7xl space-y-10">
              {currentPage === 'dashboard' && <DashboardPage setCurrentPage={setCurrentPage} />}
              {currentPage === 'onboarding' && <OnboardingPage setCurrentPage={setCurrentPage} />}
              {currentPage === 'fleet' && <FleetPage />}
              {currentPage === 'drivers' && <DriverManagementPage />}
              {currentPage === 'error-testing' && <ErrorHandlingTestPage />}
              {currentPage === 'compliance' && <CompliancePage />}
              {currentPage === 'comprehensive-compliance' && (
                <div className="neo-panel p-0">
                  <ComprehensiveComplianceDashboard
                    vehicles={centralizedFleetDataService.getVehicles().map((v) => ({
                      id: v.id,
                      vin: v.vin,
                      make: v.make,
                      model: v.model,
                      year: v.year,
                      dotNumber: v.dotNumber
                    }))}
                  />
                </div>
              )}
              {currentPage === 'reports' && (
                <>
                  <ReportingDashboard />
                  <section className="neo-panel grid place-items-center gap-6 px-10 py-12 text-center">
                    <div className="orbit relative">
                      <div className="grid h-28 w-28 place-items-center rounded-full bg-white/10 text-3xl text-white">
                        <IconReports className="h-10 w-10" />
                      </div>
                    </div>
                    <div>
                      <h2 className="font-display text-3xl text-white">Advanced Reports</h2>
                      <p className="mt-4 text-white/70">
                        We are finalizing a cinematic reporting studio with export packs, filters, and anomaly narratives.
                      </p>
                    </div>
                    <button className="pressable rounded-2xl border border-white/20 bg-white/10 px-8 py-3 font-display text-sm uppercase tracking-[0.4em] text-white">
                      Request Early Access
                    </button>
                  </section>
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
// Main App with Error Boundary and Notifications
function App() {
  return (
    <ErrorBoundary>
      <AuthWrapper>
        <AppContent />
      </AuthWrapper>
      <NotificationSystem />
    </ErrorBoundary>
  );
}

export default App;










































