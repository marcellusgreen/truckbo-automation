import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fleetStorageAdapter,
  type FleetVehicleInput,
  type FleetAdapterResult
} from '../services/fleetStorageAdapter';
import {
  centralizedFleetDataService,
  type UnifiedVehicleData,
  type FleetStats
} from '../services/centralizedFleetDataService';
import type { VehicleRecord } from '../services/persistentFleetStorage';
import { isFleetHookEnabled } from '../utils/featureFlags';
import { isRefactorDebugEnabled, refactorDebugLog } from '../utils/refactorDebug';

export type FleetStatusFilter = 'all' | 'active' | 'inactive' | 'compliant' | 'non_compliant';

export interface UseFleetStateOptions {
  autoRefresh?: boolean;
}

export interface FleetStateHook {
  vehicles: UnifiedVehicleData[];
  isLoading: boolean;
  error: string | null;
  stats: FleetStats;
  refresh: () => Promise<{ success: boolean; error?: string }>;
  addVehicles: (payload: FleetVehicleInput[]) => Promise<FleetAdapterResult>;
  updateVehicle: (id: string, updates: Partial<VehicleRecord>) => Promise<VehicleRecord>;
  clearFleet: () => Promise<FleetAdapterResult>;
  search: (term: string) => UnifiedVehicleData[];
  filterByStatus: (status: FleetStatusFilter) => UnifiedVehicleData[];
}

const logHookEvent = (event: string, details?: Record<string, unknown>): void => {
  if (isRefactorDebugEnabled()) {
    refactorDebugLog('useFleetState', event, details);
  }
};

const defaultStats: FleetStats = {
  total: 0,
  active: 0,
  inactive: 0,
  compliant: 0,
  nonCompliant: 0,
  expiringDocuments: 0,
  averageComplianceScore: 0
};

export const useFleetState = (options: UseFleetStateOptions = {}): FleetStateHook => {
  const [vehicles, setVehicles] = useState<UnifiedVehicleData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const hookEnabled = isFleetHookEnabled();
  const hookEnabledRef = useRef(hookEnabled);
  hookEnabledRef.current = hookEnabled;

  const autoRefresh = options.autoRefresh !== false;

  const loadFleet = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const hookActive = hookEnabledRef.current;
    setIsLoading(true);
    try {
      logHookEvent('refresh:start');
      await fleetStorageAdapter.initialize();
      const data = await fleetStorageAdapter.getFleet();
      setVehicles(data);
      setError(null);
      logHookEvent('refresh:success', { count: data.length, hookEnabled: hookActive });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown fleet adapter error';
      setError(message);
      logHookEvent('refresh:error', { message });
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      const result = await loadFleet();
      if (!result.success && !cancelled) {
        logHookEvent('bootstrap:failed', { error: result.error });
      }
    };

    bootstrap();

    if (!hookEnabledRef.current) {
      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = centralizedFleetDataService.subscribe((event) => {
      if (cancelled) {
        return;
      }

      if (event === 'data_changed') {
        const nextVehicles = centralizedFleetDataService.getVehicles();
        setVehicles(nextVehicles);
        logHookEvent('subscription:data_changed', { count: nextVehicles.length });
      }

      if (event === 'loading_changed') {
        setIsLoading(centralizedFleetDataService.isLoadingData());
      }

      if (event === 'error') {
        setError('Centralized fleet data service reported an error');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [autoRefresh, loadFleet]);

  const refresh = useCallback(async () => loadFleet(), [loadFleet]);

  const addVehicles = useCallback(async (payload: FleetVehicleInput[]) => {
    const result = await fleetStorageAdapter.addVehicles(payload);
    if (result.success) {
      await refresh();
    }
    return result;
  }, [refresh]);

  const updateVehicle = useCallback(async (id: string, updates: Partial<VehicleRecord>) => {
    const updated = await fleetStorageAdapter.updateVehicle(id, updates);
    await refresh();
    return updated;
  }, [refresh]);

  const clearFleet = useCallback(async () => {
    const result = await fleetStorageAdapter.clearFleet();
    if (result.success) {
      await refresh();
    }
    return result;
  }, [refresh]);

  const stats = useMemo<FleetStats>(() => {
    if (hookEnabledRef.current) {
      return centralizedFleetDataService.getFleetStats();
    }

    if (vehicles.length === 0) {
      return defaultStats;
    }

    const active = vehicles.filter((v) => v.status === 'active').length;
    const inactive = vehicles.filter((v) => v.status === 'inactive').length;
    const compliant = vehicles.filter((v) => (v.complianceScore ?? 0) >= 80).length;
    const nonCompliant = vehicles.filter((v) => (v.complianceScore ?? 0) < 80).length;
    const expiringDocuments = vehicles.filter((v) => v.reconciledData?.hasExpiringSoonDocuments).length;
    const totalComplianceScore = vehicles.reduce((sum, v) => sum + (v.complianceScore ?? 0), 0);
    const averageComplianceScore = vehicles.length > 0 ? Math.round(totalComplianceScore / vehicles.length) : 0;

    return {
      total: vehicles.length,
      active,
      inactive,
      compliant,
      nonCompliant,
      expiringDocuments,
      averageComplianceScore
    };
  }, [vehicles]);

  const search = useCallback((term: string) => {
    const query = term.trim();
    if (!query) {
      return vehicles;
    }

    if (hookEnabledRef.current) {
      return centralizedFleetDataService.searchVehicles(query);
    }

    const lower = query.toLowerCase();
    return vehicles.filter((vehicle) =>
      vehicle.vin.toLowerCase().includes(lower) ||
      vehicle.make.toLowerCase().includes(lower) ||
      vehicle.model.toLowerCase().includes(lower) ||
      vehicle.licensePlate.toLowerCase().includes(lower) ||
      vehicle.truckNumber.toLowerCase().includes(lower)
    );
  }, [vehicles]);

  const filterByStatus = useCallback((status: FleetStatusFilter) => {
    if (status === 'all') {
      return vehicles;
    }

    if (hookEnabledRef.current) {
      return centralizedFleetDataService.filterVehicles(status);
    }

    if (status === 'active' || status === 'inactive') {
      return vehicles.filter((vehicle) => vehicle.status === status);
    }

    if (status === 'compliant') {
      return vehicles.filter((vehicle) => (vehicle.complianceScore ?? 0) >= 80);
    }

    if (status === 'non_compliant') {
      return vehicles.filter((vehicle) => (vehicle.complianceScore ?? 0) < 80);
    }

    return vehicles;
  }, [vehicles]);

  return {
    vehicles,
    isLoading,
    error,
    stats,
    refresh,
    addVehicles,
    updateVehicle,
    clearFleet,
    search,
    filterByStatus
  };
};
