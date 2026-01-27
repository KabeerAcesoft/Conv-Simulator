import { Injectable, Logger } from '@nestjs/common';

import { CacheService } from '../../Controllers/Cache/cache.service';

export interface AuditEvent {
  eventType: string;
  action: string;
  resource: string;
  resourceId?: string;
  userId?: string;
  accountId?: string;
  ip?: string;
  userAgent?: string;
  traceId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  success: boolean;
  error?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Log a security event
   */
  async logSecurityEvent(
    action: string,
    details: Partial<AuditEvent>,
    success = true,
    error?: string,
  ): Promise<void> {
    const event: AuditEvent = {
      eventType: 'SECURITY',
      action,
      resource: details.resource || 'unknown',
      resourceId: details.resourceId,
      userId: details.userId,
      accountId: details.accountId,
      ip: details.ip,
      userAgent: details.userAgent,
      traceId: details.traceId,
      timestamp: new Date().toISOString(),
      metadata: details.metadata,
      success,
      error,
    };

    await this.writeAuditLog(event);
  }

  /**
   * Log a data access event
   */
  async logDataAccess(
    action: 'CREATE' | 'DELETE' | 'READ' | 'UPDATE',
    resource: string,
    details: Partial<AuditEvent>,
    success = true,
    error?: string,
  ): Promise<void> {
    const event: AuditEvent = {
      eventType: 'DATA_ACCESS',
      action,
      resource,
      resourceId: details.resourceId,
      userId: details.userId,
      accountId: details.accountId,
      ip: details.ip,
      userAgent: details.userAgent,
      traceId: details.traceId,
      timestamp: new Date().toISOString(),
      metadata: details.metadata,
      success,
      error,
    };

    await this.writeAuditLog(event);
  }

  /**
   * Log a business operation event
   */
  async logBusinessOperation(
    action: string,
    resource: string,
    details: Partial<AuditEvent>,
    success = true,
    error?: string,
  ): Promise<void> {
    const event: AuditEvent = {
      eventType: 'BUSINESS_OPERATION',
      action,
      resource,
      resourceId: details.resourceId,
      userId: details.userId,
      accountId: details.accountId,
      ip: details.ip,
      userAgent: details.userAgent,
      traceId: details.traceId,
      timestamp: new Date().toISOString(),
      metadata: details.metadata,
      success,
      error,
    };

    await this.writeAuditLog(event);
  }

  /**
   * Log a system event
   */
  async logSystemEvent(
    action: string,
    details: Partial<AuditEvent>,
    success = true,
    error?: string,
  ): Promise<void> {
    const event: AuditEvent = {
      eventType: 'SYSTEM',
      action,
      resource: details.resource || 'system',
      resourceId: details.resourceId,
      userId: details.userId,
      accountId: details.accountId,
      ip: details.ip,
      userAgent: details.userAgent,
      traceId: details.traceId,
      timestamp: new Date().toISOString(),
      metadata: details.metadata,
      success,
      error,
    };

    await this.writeAuditLog(event);
  }

  /**
   * Get recent audit logs for an account
   */
  async getAuditLogs(
    accountId: string,
    limit = 100,
    eventType?: string,
  ): Promise<AuditEvent[]> {
    try {
      const cacheKey = `audit_logs_${accountId}`;
      const logs = (await this.cacheService.get<AuditEvent[]>(cacheKey)) || [];

      let filteredLogs = logs;

      if (eventType) {
        filteredLogs = logs.filter((log) => log.eventType === eventType);
      }

      const sortedLogs = [...filteredLogs];

      sortedLogs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      return sortedLogs.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs', error);

      return [];
    }
  }

  /**
   * Search audit logs
   */
  async searchAuditLogs(
    filters: {
      accountId?: string;
      action?: string;
      eventType?: string;
      fromDate?: string;
      resource?: string;
      toDate?: string;
      userId?: string;
    },
    limit = 100,
  ): Promise<AuditEvent[]> {
    try {
      // In a production system, this would query a dedicated audit log database
      // For now, we'll search through cached logs
      const allLogs: AuditEvent[] = [];

      // This is a simplified implementation - in production you'd want
      // a proper audit log storage system like Elasticsearch
      if (filters.accountId) {
        const cacheKey = `audit_logs_${filters.accountId}`;

        const logs =
          (await this.cacheService.get<AuditEvent[]>(cacheKey)) || [];

        allLogs.push(...logs);
      }

      const filteredLogs = allLogs.filter((log) => {
        if (filters.userId && log.userId !== filters.userId) return false;

        if (filters.eventType && log.eventType !== filters.eventType)
          return false;

        if (filters.action && log.action !== filters.action) return false;

        if (filters.resource && log.resource !== filters.resource) return false;

        if (filters.fromDate && log.timestamp < filters.fromDate) return false;

        if (filters.toDate && log.timestamp > filters.toDate) return false;

        return true;
      });

      const sortedLogs = [...filteredLogs];

      sortedLogs.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

      return sortedLogs.slice(0, limit);
    } catch (error) {
      this.logger.error('Failed to search audit logs', error);

      return [];
    }
  }

  private async writeAuditLog(event: AuditEvent): Promise<void> {
    try {
      // Log to structured logger
      this.logger.log({
        message: 'Audit Event',
        ...event,
      });

      // Store in cache for recent access (keeping last 1000 events per account)
      if (event.accountId) {
        const cacheKey = `audit_logs_${event.accountId}`;

        const existingLogs =
          (await this.cacheService.get<AuditEvent[]>(cacheKey)) || [];

        existingLogs.unshift(event);

        // Keep only last 1000 events
        if (existingLogs.length > 1000) {
          existingLogs.splice(1000);
        }

        await this.cacheService.set(cacheKey, existingLogs, 86400000); // 24 hours
      }

      // In production, you should also write to a dedicated audit log storage
      // like a database, Elasticsearch, or cloud audit service
    } catch (error) {
      this.logger.error('Failed to write audit log', error);
      // Audit logging failures should not break the main operation
    }
  }
}
