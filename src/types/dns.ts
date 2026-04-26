/**
 * Hetzner Cloud API DNS types — Zones and RRSets.
 * Based on the Cloud API spec at /zones and /zones/{id_or_name}/rrsets.
 */

import type { HetznerAction } from '../clients/common.js';

// ── Zones ───────────────────────────────────────────────────────────────────

export interface DnsPrimaryNameserver {
  address: string;
  port?: number;
  tsig_key?: string;
  tsig_algorithm?: 'hmac-md5' | 'hmac-sha1' | 'hmac-sha256';
}

export interface DnsZoneProtection {
  delete: boolean;
}

export interface DnsAuthoritativeNameservers {
  assigned: string[];
  delegated: string[];
  delegation_last_check: string | null;
  delegation_status?: 'valid' | 'partially-valid' | 'invalid' | 'lame' | 'unregistered' | 'unknown';
}

export interface DnsZone {
  id: number;
  name: string;
  mode: 'primary' | 'secondary';
  created: string;
  primary_nameservers: DnsPrimaryNameserver[];
  labels: Record<string, string>;
  protection: DnsZoneProtection;
  ttl: number;
  status: 'ok' | 'updating' | 'error';
  record_count: number;
  authoritative_nameservers: DnsAuthoritativeNameservers;
  registrar: 'hetzner' | 'other' | 'unknown';
}

// ── RRSets ──────────────────────────────────────────────────────────────────

export type DnsRRSetType =
  | 'A'
  | 'AAAA'
  | 'CAA'
  | 'CNAME'
  | 'DS'
  | 'HINFO'
  | 'HTTPS'
  | 'MX'
  | 'NS'
  | 'PTR'
  | 'RP'
  | 'SOA'
  | 'SRV'
  | 'SVCB'
  | 'TLSA'
  | 'TXT';

export interface DnsRRSetRecord {
  value: string;
  comment?: string;
}

/** Record in update_records action where comment is required */
export interface DnsRRSetRecordUpdate {
  value: string;
  comment: string;
}

export interface DnsRRSetProtection {
  change: boolean;
}

export interface DnsRRSet {
  id: string;
  name: string;
  type: DnsRRSetType;
  ttl: number | null;
  labels: Record<string, string>;
  protection: DnsRRSetProtection;
  records: DnsRRSetRecord[];
  zone: number;
}

// ── Response Wrappers ───────────────────────────────────────────────────────

export interface DnsPaginationMeta {
  pagination: {
    page: number;
    per_page: number;
    previous_page: number | null;
    next_page: number | null;
    last_page: number | null;
    total_entries: number | null;
  };
}

export interface DnsZonesResponse {
  zones: DnsZone[];
  meta: DnsPaginationMeta;
}

export interface DnsZoneResponse {
  zone: DnsZone;
}

export interface DnsCreateZoneResponse {
  zone: DnsZone;
  action: HetznerAction;
}

export interface DnsActionResponse {
  action: HetznerAction;
}

export interface DnsZonefileResponse {
  zonefile: string;
}

export interface DnsRRSetsResponse {
  rrsets: DnsRRSet[];
  meta: DnsPaginationMeta;
}

export interface DnsRRSetResponse {
  rrset: DnsRRSet;
}
