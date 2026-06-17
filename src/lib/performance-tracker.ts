/**
 * Système de suivi des performances et de caching
 * Optimise les opérations répétitives et surveille les métriques de performance
 */

export interface PerformanceMetric {
  id: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time To Live in milliseconds
}

export class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];
  private activeOperations = new Map<string, PerformanceMetric>();

  /**
   * Démarre le suivi d'une opération
   */
  startOperation(
    operation: string,
    metadata?: Record<string, unknown>
  ): string {
    const id = `${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const metric: PerformanceMetric = {
      id,
      operation,
      startTime: performance.now(),
      success: false,
      metadata,
    };

    this.activeOperations.set(id, metric);
    return id;
  }

  /**
   * Termine le suivi d'une opération
   */
  endOperation(id: string, success: boolean = true): PerformanceMetric | null {
    const metric = this.activeOperations.get(id);
    if (!metric) return null;

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = success;

    this.metrics.push(metric);
    this.activeOperations.delete(id);

    return metric;
  }

  /**
   * Obtient les métriques récentes
   */
  getRecentMetrics(minutes: number = 5): PerformanceMetric[] {
    const cutoff = performance.now() - minutes * 60 * 1000;
    return this.metrics.filter((m) => (m.startTime ?? 0) > cutoff);
  }

  /**
   * Obtient un instantané de toutes les métriques enregistrées
   */
  getMetricsSnapshot(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Obtient un instantané des opérations toujours en cours
   */
  getActiveOperationsSnapshot(): PerformanceMetric[] {
    return Array.from(this.activeOperations.values()).map((metric) => ({
      ...metric,
    }));
  }

  /**
   * Obtient les statistiques de performance
   */
  getPerformanceStats(): {
    totalOperations: number;
    averageDuration: number;
    successRate: number;
    operationsByType: Record<
      string,
      { count: number; avgDuration: number; successRate: number }
    >;
  } {
    const recent = this.getRecentMetrics();

    const totalOperations = recent.length;
    const totalDuration = recent.reduce((sum, m) => sum + (m.duration || 0), 0);
    const averageDuration =
      totalOperations > 0 ? totalDuration / totalOperations : 0;

    const successfulOps = recent.filter((m) => m.success).length;
    const successRate =
      totalOperations > 0 ? successfulOps / totalOperations : 0;

    const operationsByType: Record<
      string,
      {
        count: number;
        totalDuration: number;
        successful: number;
        avgDuration: number;
        successRate: number;
      }
    > = {};
    recent.forEach((metric) => {
      if (!operationsByType[metric.operation]) {
        operationsByType[metric.operation] = {
          count: 0,
          totalDuration: 0,
          successful: 0,
          avgDuration: 0,
          successRate: 0,
        };
      }

      operationsByType[metric.operation].count++;
      operationsByType[metric.operation].totalDuration += metric.duration || 0;
      if (metric.success) {
        operationsByType[metric.operation].successful++;
      }
    });

    // Calculate averages and success rates
    Object.keys(operationsByType).forEach((op) => {
      const stats = operationsByType[op];
      stats.avgDuration =
        stats.count > 0 ? stats.totalDuration / stats.count : 0;
      stats.successRate = stats.count > 0 ? stats.successful / stats.count : 0;
    });

    return {
      totalOperations,
      averageDuration,
      successRate,
      operationsByType,
    };
  }

  /**
   * Log les métriques actuelles
   */
  logMetrics(): void {
    const stats = this.getPerformanceStats();
    console.log('📊 Performance Metrics:', stats);

    // Log warnings for slow operations
    Object.entries(stats.operationsByType).forEach(([op, stats]) => {
      if (stats.avgDuration > 1000) {
        console.warn(
          `⚠️ Slow operation detected: ${op} (${stats.avgDuration.toFixed(2)}ms avg)`
        );
      }
    });
  }
}

export class AnalysisCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize = 100; // Maximum entries
  private defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL

  /**
   * Génère une clé de cache pour les paramètres d'analyse
   */
  private generateCacheKey(
    file: File,
    options?: Record<string, unknown>
  ): string {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    const optionsKey = options ? JSON.stringify(options) : '';
    return `${fileKey}-${optionsKey}`;
  }

  /**
   * Met en cache un résultat d'analyse
   */
  set<T>(
    file: File,
    data: T,
    options?: Record<string, unknown>,
    ttl?: number
  ): void {
    const key = this.generateCacheKey(file, options);

    // Clean up old entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Récupère un résultat du cache
   */
  get<T>(file: File, options?: Record<string, unknown>): T | null {
    const key = this.generateCacheKey(file, options);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Vérifie si un résultat est en cache
   */
  has(file: File, options?: Record<string, unknown>): boolean {
    const key = this.generateCacheKey(file, options);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Nettoie les entrées expirées
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        toDelete.push(key);
      }
    }

    toDelete.forEach((key) => this.cache.delete(key));
  }

  /**
   * Vide complètement le cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Obtient les statistiques du cache
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entriesByAge: { recent: number; old: number; expired: number };
  } {
    const now = Date.now();
    let hits = 0;
    let totalRequests = 0;
    let recent = 0;
    let old = 0;
    let expired = 0;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age < 60000) {
        // Less than 1 minute
        recent++;
      } else if (age < entry.ttl) {
        old++;
      } else {
        expired++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalRequests > 0 ? hits / totalRequests : 0,
      entriesByAge: { recent, old, expired },
    };
  }
}

// Instance globale du tracker de performance
export const performanceTracker = new PerformanceTracker();

// Instance globale du cache d'analyse
export const analysisCache = new AnalysisCache();
