// Centralized Event Bus for Fleet Data Synchronization
// Ensures all storage systems and UI components stay in sync

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
  data?: any;
  vehicleVIN?: string;
  metadata?: Record<string, any>;
}

export type EventListener = (event: FleetEvent) => void;

class EventBus {
  private listeners: Map<FleetEventType, Set<EventListener>> = new Map();
  private globalListeners: Set<EventListener> = new Set();
  private eventHistory: FleetEvent[] = [];
  private maxHistorySize = 100;

  /**
   * Subscribe to specific event types
   */
  subscribe(eventType: FleetEventType, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events (global listener)
   */
  subscribeAll(listener: EventListener): () => void {
    this.globalListeners.add(listener);
    
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  emit(eventType: FleetEventType, data?: any, options?: {
    source?: string;
    vehicleVIN?: string;
    metadata?: Record<string, any>;
  }): void {
    const event: FleetEvent = {
      type: eventType,
      timestamp: Date.now(),
      source: options?.source || 'unknown',
      data,
      vehicleVIN: options?.vehicleVIN,
      metadata: options?.metadata
    };

    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Log event for debugging
    console.log(`🔔 EventBus: ${eventType}`, {
      source: event.source,
      vehicleVIN: event.vehicleVIN,
      data: event.data
    });

    // Notify specific event listeners
    const specificListeners = this.listeners.get(eventType);
    if (specificListeners) {
      specificListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`EventBus: Error in listener for ${eventType}:`, error);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error(`EventBus: Error in global listener for ${eventType}:`, error);
      }
    });
  }

  /**
   * Get recent event history (for debugging)
   */
  getEventHistory(count?: number): FleetEvent[] {
    return count ? this.eventHistory.slice(-count) : [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get listener counts (for debugging)
   */
  getListenerCounts(): Record<string, number> {
    const counts: Record<string, number> = {
      global: this.globalListeners.size
    };
    
    this.listeners.forEach((listeners, eventType) => {
      counts[eventType] = listeners.size;
    });
    
    return counts;
  }

  /**
   * Remove all listeners (for cleanup)
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Helper functions for common events
export const FleetEvents = {
  vehicleAdded: (vehicleData: any, source: string = 'unknown') => {
    eventBus.emit('vehicle_added', vehicleData, { 
      source, 
      vehicleVIN: vehicleData.vin,
      metadata: { vehicleId: vehicleData.id }
    });
    eventBus.emit('fleet_data_changed', vehicleData, { source });
  },

  vehicleUpdated: (vehicleData: any, source: string = 'unknown') => {
    eventBus.emit('vehicle_updated', vehicleData, { 
      source, 
      vehicleVIN: vehicleData.vin,
      metadata: { vehicleId: vehicleData.id }
    });
    eventBus.emit('fleet_data_changed', vehicleData, { source });
  },

  vehicleDeleted: (vehicleVIN: string, source: string = 'unknown') => {
    eventBus.emit('vehicle_deleted', { vin: vehicleVIN }, { 
      source, 
      vehicleVIN,
      metadata: { action: 'delete' }
    });
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
      metadata: { documentType: documentData.documentType }
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

// React hook for using event bus in components
export const useEventBus = () => {
  return {
    subscribe: eventBus.subscribe.bind(eventBus),
    subscribeAll: eventBus.subscribeAll.bind(eventBus),
    emit: eventBus.emit.bind(eventBus),
    getHistory: eventBus.getEventHistory.bind(eventBus),
    FleetEvents
  };
};