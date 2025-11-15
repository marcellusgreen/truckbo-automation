import { isRefactorDebugEnabled, refactorDebugLog } from '../utils/refactorDebug';

export type FleetEventType =
  | 'fleet_data_changed'
  | 'vehicle_added'
  | 'vehicle_updated'
  | 'vehicle_deleted'
  | 'fleet_cleared'
  | 'document_processed'
  | 'document_added'
  | 'reconciler_updated'
  | 'cache_cleared'
  | 'storage_sync_required';

export interface FleetEvent {
  type: FleetEventType;
  timestamp: number;
  source: string;
  data?: unknown;
  vehicleVIN?: string;
  metadata?: Record<string, unknown>;
}

export type EventListener = (event: FleetEvent) => void;

interface FleetEventInspector {
  getEvents: () => FleetEvent[];
  clear: () => void;
  size: () => number;
  print: () => void;
}

declare global {
  interface Window {
    __FLEET_EVENT_LOG__?: FleetEventInspector;
  }
}

const EVENT_BUFFER_LIMIT = 200;
const eventBuffer: FleetEvent[] = [];

const snapshotEventData = (data: unknown): Record<string, unknown> | undefined => {
  if (data === null || data === undefined) {
    return undefined;
  }
  if (Array.isArray(data)) {
    return { type: 'array', length: data.length };
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data as Record<string, unknown>).slice(0, 5);
    return { type: 'object', keys };
  }
  return { type: typeof data, value: data };
};

const ensureEventInspector = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as Window;
  if (!win.__FLEET_EVENT_LOG__) {
    win.__FLEET_EVENT_LOG__ = {
      getEvents: () => [...eventBuffer],
      clear: () => {
        eventBuffer.length = 0;
      },
      size: () => eventBuffer.length,
      print: () => {
        if (typeof console !== 'undefined' && typeof console.table === 'function') {
          console.table(eventBuffer);
        } else if (typeof console !== 'undefined') {
          console.log('Fleet events', eventBuffer);
        }
      }
    };
  }
};

const trackEvent = (event: FleetEvent): void => {
  eventBuffer.push(event);
  if (eventBuffer.length > EVENT_BUFFER_LIMIT) {
    eventBuffer.shift();
  }
  ensureEventInspector();
};

class EventBus {
  private listeners: Map<FleetEventType, Set<EventListener>> = new Map();
  private globalListeners: Set<EventListener> = new Set();
  private eventHistory: FleetEvent[] = [];
  private maxHistorySize = 100;

  subscribe(eventType: FleetEventType, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  subscribeAll(listener: EventListener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  emit(
    eventType: FleetEventType,
    data?: unknown,
    options?: {
      source?: string;
      vehicleVIN?: string;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const event: FleetEvent = {
      type: eventType,
      timestamp: Date.now(),
      source: options?.source ?? 'unknown',
      data,
      vehicleVIN: options?.vehicleVIN,
      metadata: options?.metadata
    };

    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    if (isRefactorDebugEnabled()) {
      trackEvent(event);
      refactorDebugLog('EventBus', 'emit:' + eventType, {
        source: event.source,
        vehicleVIN: event.vehicleVIN,
        metadata: event.metadata,
        dataSnapshot: snapshotEventData(event.data)
      });
    }

    const specificListeners = this.listeners.get(eventType);
    if (specificListeners) {
      specificListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error('EventBus listener error for ' + eventType + ':', error);
        }
      });
    }

    this.globalListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('EventBus global listener error for ' + eventType + ':', error);
      }
    });
  }

  getEventHistory(count?: number): FleetEvent[] {
    return count ? this.eventHistory.slice(-count) : [...this.eventHistory];
  }

  clearHistory(): void {
    this.eventHistory = [];
  }

  getListenerCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      global: this.globalListeners.size
    };

    this.listeners.forEach((listeners, eventType) => {
      counts[eventType] = listeners.size;
    });

    return counts;
  }

  removeAllListeners(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }
}

export const eventBus = new EventBus();

export const FleetEvents = {
  vehicleAdded: (vehicleData: any, source: string = 'unknown') => {
    eventBus.emit('vehicle_added', vehicleData, {
      source,
      vehicleVIN: vehicleData?.vin,
      metadata: { vehicleId: vehicleData?.id }
    });
    eventBus.emit('fleet_data_changed', vehicleData, { source });
  },

  vehicleUpdated: (vehicleData: any, source: string = 'unknown') => {
    eventBus.emit('vehicle_updated', vehicleData, {
      source,
      vehicleVIN: vehicleData?.vin,
      metadata: { vehicleId: vehicleData?.id }
    });
    eventBus.emit('fleet_data_changed', vehicleData, { source });
  },

  vehicleDeleted: (vehicleVIN: string, source: string = 'unknown') => {
    eventBus.emit(
      'vehicle_deleted',
      { vin: vehicleVIN },
      {
        source,
        vehicleVIN,
        metadata: { action: 'delete' }
      }
    );
    eventBus.emit('fleet_data_changed', { deletedVIN: vehicleVIN }, { source });
  },

  fleetCleared: (source: string = 'unknown') => {
    eventBus.emit('fleet_cleared', null, { source });
    eventBus.emit('fleet_data_changed', { action: 'clear_all' }, { source });
  },

  documentProcessed: (documentData: any, vehicleVIN?: string, source: string = 'unknown') => {
    eventBus.emit('document_processed', documentData, {
      source,
      vehicleVIN,
      metadata: { documentType: documentData?.documentType }
    });
    eventBus.emit('fleet_data_changed', documentData, { source });
  },

  cacheCleared: (cacheType: string, source: string = 'unknown') => {
    eventBus.emit('cache_cleared', { cacheType }, { source });
  },

  storageSync: (syncData: any, source: string = 'unknown') => {
    eventBus.emit('storage_sync_required', syncData, { source });
  }
};

export const useEventBus = () => ({
  subscribe: eventBus.subscribe.bind(eventBus),
  subscribeAll: eventBus.subscribeAll.bind(eventBus),
  emit: eventBus.emit.bind(eventBus),
  getHistory: eventBus.getEventHistory.bind(eventBus),
  FleetEvents
});
