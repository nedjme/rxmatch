import { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'prescription.uploaded'
  | 'prescription.committed'
  | 'prescription_item.confirmed'
  | 'prescription_item.overridden'
  | 'catalogue.imported'
  | 'catalogue_item.created'
  | 'catalogue_item.updated'
  | 'catalogue_item.deleted'
  | 'member.invited'
  | 'member.role_changed'
  | 'member.removed'
  | 'org.settings_updated';

export type AuditEntityType =
  | 'prescription'
  | 'prescription_item'
  | 'catalogue_item'
  | 'catalogue_import'
  | 'organization'
  | 'member';

/**
 * Inserts an audit event. Must be called with a service-role Supabase client
 * (server-side only) because the authenticated role has no INSERT on audit_events.
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  payload: Record<string, unknown> = {},
  ipAddress?: string,
): Promise<void> {
  const { error } = await supabase.from('audit_events').insert({
    org_id: orgId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    payload,
    ip_address: ipAddress ?? null,
  });

  if (error) {
    // Non-fatal: log to console but do not throw so the main operation succeeds.
    console.error('[audit] Failed to log event:', action, error.message);
  }
}
