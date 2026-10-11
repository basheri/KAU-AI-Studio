export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      ai_requests: {
        Row: {
          created_at: string;
          error: string | null;
          feature: string;
          id: string;
          input_tokens: number;
          model: string;
          outcome: string | null;
          outcome_at: string | null;
          output_tokens: number;
          project_id: string | null;
          provider: string;
          status: string;
          target_ref: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          feature: string;
          id?: string;
          input_tokens?: number;
          model: string;
          outcome?: string | null;
          outcome_at?: string | null;
          output_tokens?: number;
          project_id?: string | null;
          provider: string;
          status: string;
          target_ref?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          feature?: string;
          id?: string;
          input_tokens?: number;
          model?: string;
          outcome?: string | null;
          outcome_at?: string | null;
          output_tokens?: number;
          project_id?: string | null;
          provider?: string;
          status?: string;
          target_ref?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_requests_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      export_records: {
        Row: {
          artifact_version_id: string;
          byte_size: number;
          created_at: string;
          created_by: string;
          file_name: string;
          format: Database["public"]["Enums"]["export_format"];
          id: string;
          lang: string;
          official: boolean;
          project_id: string;
          sha256: string;
          target_key: string;
          version_state: Database["public"]["Enums"]["artifact_state"];
        };
        Insert: {
          artifact_version_id: string;
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          file_name?: string;
          format?: Database["public"]["Enums"]["export_format"];
          id?: string;
          lang?: string;
          official?: boolean;
          project_id?: string;
          sha256?: string;
          target_key?: string;
          version_state?: Database["public"]["Enums"]["artifact_state"];
        };
        Update: {
          artifact_version_id?: string;
          byte_size?: number;
          created_at?: string;
          created_by?: string;
          file_name?: string;
          format?: Database["public"]["Enums"]["export_format"];
          id?: string;
          lang?: string;
          official?: boolean;
          project_id?: string;
          sha256?: string;
          target_key?: string;
          version_state?: Database["public"]["Enums"]["artifact_state"];
        };
        Relationships: [];
      };
      glossary_terms: {
        Row: {
          domain: string;
          id: string;
          note: string;
          term_ar: string;
          term_en: string;
          updated_at: string;
          updated_by: string;
        };
        Insert: {
          domain?: string;
          id?: string;
          note?: string;
          term_ar: string;
          term_en: string;
          updated_at?: string;
          updated_by: string;
        };
        Update: {
          domain?: string;
          id?: string;
          note?: string;
          term_ar?: string;
          term_en?: string;
          updated_at?: string;
          updated_by?: string;
        };
        Relationships: [];
      };
      arch_elements: {
        Row: {
          artifact_version_id: string;
          code: string;
          details: Json;
          element_type: Database["public"]["Enums"]["arch_element_type"];
          id: string;
          label_ar: string;
          label_en: string;
          parent_id: string | null;
          position: number;
          project_id: string;
        };
        Insert: {
          artifact_version_id: string;
          code?: string;
          details?: Json;
          element_type: Database["public"]["Enums"]["arch_element_type"];
          id?: string;
          label_ar?: string;
          label_en?: string;
          parent_id?: string | null;
          position: number;
          project_id: string;
        };
        Update: {
          artifact_version_id?: string;
          code?: string;
          details?: Json;
          element_type?: Database["public"]["Enums"]["arch_element_type"];
          id?: string;
          label_ar?: string;
          label_en?: string;
          parent_id?: string | null;
          position?: number;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "arch_elements_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arch_elements_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "arch_elements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arch_elements_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      arch_mappings: {
        Row: {
          artifact_version_id: string;
          from_id: string;
          id: string;
          project_id: string;
          to_id: string;
        };
        Insert: {
          artifact_version_id: string;
          from_id: string;
          id?: string;
          project_id: string;
          to_id: string;
        };
        Update: {
          artifact_version_id?: string;
          from_id?: string;
          id?: string;
          project_id?: string;
          to_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "arch_mappings_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arch_mappings_from_id_fkey";
            columns: ["from_id"];
            isOneToOne: false;
            referencedRelation: "arch_elements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arch_mappings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "arch_mappings_to_id_fkey";
            columns: ["to_id"];
            isOneToOne: false;
            referencedRelation: "arch_elements";
            referencedColumns: ["id"];
          },
        ];
      };
      artifact_versions: {
        Row: {
          artifact_id: string;
          change_summary: string | null;
          content: string;
          created_at: string;
          created_by: string;
          id: string;
          parent_version_id: string | null;
          project_id: string;
          state: Database["public"]["Enums"]["artifact_state"];
          updated_at: string;
          version_number: number;
        };
        Insert: {
          artifact_id: string;
          change_summary?: string | null;
          content?: string;
          created_at?: string;
          created_by: string;
          id?: string;
          parent_version_id?: string | null;
          project_id: string;
          state?: Database["public"]["Enums"]["artifact_state"];
          updated_at?: string;
          version_number: number;
        };
        Update: {
          artifact_id?: string;
          change_summary?: string | null;
          content?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          parent_version_id?: string | null;
          project_id?: string;
          state?: Database["public"]["Enums"]["artifact_state"];
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey";
            columns: ["artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artifact_versions_parent_version_id_fkey";
            columns: ["parent_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artifact_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      artifacts: {
        Row: {
          created_at: string;
          created_by: string;
          current_stage_id: string | null;
          id: string;
          kind: string;
          project_id: string;
          structured: boolean;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          current_stage_id?: string | null;
          id?: string;
          kind: string;
          project_id: string;
          structured?: boolean;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          current_stage_id?: string | null;
          id?: string;
          kind?: string;
          project_id?: string;
          structured?: boolean;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artifacts_current_stage_id_fkey";
            columns: ["current_stage_id"];
            isOneToOne: false;
            referencedRelation: "workflow_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "artifacts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: Json;
          id: number;
          project_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          project_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: never;
          project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_finding_events: {
        Row: {
          actor_id: string;
          actor_role: Database["public"]["Enums"]["project_role"];
          comment: string | null;
          created_at: string;
          details: Json;
          finding_id: string;
          from_status: Database["public"]["Enums"]["finding_status"] | null;
          id: string;
          kind: string;
          project_id: string;
          to_status: Database["public"]["Enums"]["finding_status"] | null;
        };
        Insert: {
          actor_id: string;
          actor_role: Database["public"]["Enums"]["project_role"];
          comment?: string | null;
          created_at?: string;
          details?: Json;
          finding_id: string;
          from_status?: Database["public"]["Enums"]["finding_status"] | null;
          id?: string;
          kind: string;
          project_id: string;
          to_status?: Database["public"]["Enums"]["finding_status"] | null;
        };
        Update: {
          actor_id?: string;
          actor_role?: Database["public"]["Enums"]["project_role"];
          comment?: string | null;
          created_at?: string;
          details?: Json;
          finding_id?: string;
          from_status?: Database["public"]["Enums"]["finding_status"] | null;
          id?: string;
          kind?: string;
          project_id?: string;
          to_status?: Database["public"]["Enums"]["finding_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_finding_events_finding_id_fkey";
            columns: ["finding_id"];
            isOneToOne: false;
            referencedRelation: "compliance_findings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_finding_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_findings: {
        Row: {
          assignee_id: string | null;
          check_type: Database["public"]["Enums"]["rule_check_type"];
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
          due_on: string | null;
          evidence: Json;
          exception_id: string | null;
          expected: string | null;
          id: string;
          observed: string | null;
          outcome: string;
          project_id: string;
          rationale: string;
          resolution_note: string | null;
          rule_code: string;
          rule_id: string;
          rule_snapshot: Json;
          rule_version: number;
          run_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
          status: Database["public"]["Enums"]["finding_status"];
          target_artifact_id: string;
          target_path: string;
          target_version_id: string;
          updated_at: string;
          verified_run_id: string | null;
        };
        Insert: {
          assignee_id?: string | null;
          check_type: Database["public"]["Enums"]["rule_check_type"];
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          due_on?: string | null;
          evidence: Json;
          exception_id?: string | null;
          expected?: string | null;
          id?: string;
          observed?: string | null;
          outcome: string;
          project_id: string;
          rationale: string;
          resolution_note?: string | null;
          rule_code: string;
          rule_id: string;
          rule_snapshot: Json;
          rule_version: number;
          run_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
          status?: Database["public"]["Enums"]["finding_status"];
          target_artifact_id: string;
          target_path: string;
          target_version_id: string;
          updated_at?: string;
          verified_run_id?: string | null;
        };
        Update: {
          assignee_id?: string | null;
          check_type?: Database["public"]["Enums"]["rule_check_type"];
          closed_at?: string | null;
          closed_by?: string | null;
          created_at?: string;
          due_on?: string | null;
          evidence?: Json;
          exception_id?: string | null;
          expected?: string | null;
          id?: string;
          observed?: string | null;
          outcome?: string;
          project_id?: string;
          rationale?: string;
          resolution_note?: string | null;
          rule_code?: string;
          rule_id?: string;
          rule_snapshot?: Json;
          rule_version?: number;
          run_id?: string;
          severity?: Database["public"]["Enums"]["rule_severity"];
          status?: Database["public"]["Enums"]["finding_status"];
          target_artifact_id?: string;
          target_path?: string;
          target_version_id?: string;
          updated_at?: string;
          verified_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_findings_exception_id_fkey";
            columns: ["exception_id"];
            isOneToOne: false;
            referencedRelation: "documented_exceptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_findings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_findings_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_findings_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "compliance_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_findings_verified_run_id_fkey";
            columns: ["verified_run_id"];
            isOneToOne: false;
            referencedRelation: "compliance_runs";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_rule_evidence: {
        Row: {
          id: string;
          locator: string;
          page: string;
          project_id: string;
          rule_id: string;
          section: string;
          source_id: string;
        };
        Insert: {
          id?: string;
          locator?: string;
          page?: string;
          project_id: string;
          rule_id: string;
          section?: string;
          source_id: string;
        };
        Update: {
          id?: string;
          locator?: string;
          page?: string;
          project_id?: string;
          rule_id?: string;
          section?: string;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_rule_evidence_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_rule_evidence_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_rule_evidence_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_rule_evidence_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources_current";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_rules: {
        Row: {
          activated_at: string | null;
          activated_by: string | null;
          applicability: Json;
          check_spec: Json | null;
          check_type: Database["public"]["Enums"]["rule_check_type"];
          created_at: string;
          created_by: string;
          effective_from: string;
          effective_to: string | null;
          guidance_ar: string;
          guidance_en: string;
          id: string;
          owner_name: string;
          parent_id: string | null;
          project_id: string;
          remediation_ar: string;
          remediation_en: string;
          rule_code: string;
          ruleset_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
          statement_ar: string;
          statement_en: string;
          status: Database["public"]["Enums"]["compliance_rule_status"];
          status_comment: string | null;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          activated_at?: string | null;
          activated_by?: string | null;
          applicability?: Json;
          check_spec?: Json | null;
          check_type: Database["public"]["Enums"]["rule_check_type"];
          created_at?: string;
          created_by: string;
          effective_from?: string;
          effective_to?: string | null;
          guidance_ar?: string;
          guidance_en?: string;
          id?: string;
          owner_name?: string;
          parent_id?: string | null;
          project_id: string;
          remediation_ar?: string;
          remediation_en?: string;
          rule_code: string;
          ruleset_id: string;
          severity: Database["public"]["Enums"]["rule_severity"];
          statement_ar?: string;
          statement_en?: string;
          status?: Database["public"]["Enums"]["compliance_rule_status"];
          status_comment?: string | null;
          updated_at?: string;
          version_number?: number;
        };
        Update: {
          activated_at?: string | null;
          activated_by?: string | null;
          applicability?: Json;
          check_spec?: Json | null;
          check_type?: Database["public"]["Enums"]["rule_check_type"];
          created_at?: string;
          created_by?: string;
          effective_from?: string;
          effective_to?: string | null;
          guidance_ar?: string;
          guidance_en?: string;
          id?: string;
          owner_name?: string;
          parent_id?: string | null;
          project_id?: string;
          remediation_ar?: string;
          remediation_en?: string;
          rule_code?: string;
          ruleset_id?: string;
          severity?: Database["public"]["Enums"]["rule_severity"];
          statement_ar?: string;
          statement_en?: string;
          status?: Database["public"]["Enums"]["compliance_rule_status"];
          status_comment?: string | null;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_rules_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_rules_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_rules_ruleset_id_fkey";
            columns: ["ruleset_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rulesets";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_rulesets: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          revision: number;
          title_ar: string;
          title_en: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          revision?: number;
          title_ar?: string;
          title_en?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          project_id?: string;
          revision?: number;
          title_ar?: string;
          title_en?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_rulesets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_runs: {
        Row: {
          as_of: string;
          context: Json;
          created_at: string;
          created_by: string;
          id: string;
          project_id: string;
          ruleset_id: string;
          ruleset_revision: number;
          snapshot: Json;
          summary: Json;
          target_artifact_id: string;
          target_kind: string;
          target_version_id: string;
        };
        Insert: {
          as_of: string;
          context: Json;
          created_at?: string;
          created_by: string;
          id?: string;
          project_id: string;
          ruleset_id: string;
          ruleset_revision: number;
          snapshot: Json;
          summary: Json;
          target_artifact_id: string;
          target_kind: string;
          target_version_id: string;
        };
        Update: {
          as_of?: string;
          context?: Json;
          created_at?: string;
          created_by?: string;
          id?: string;
          project_id?: string;
          ruleset_id?: string;
          ruleset_revision?: number;
          snapshot?: Json;
          summary?: Json;
          target_artifact_id?: string;
          target_kind?: string;
          target_version_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_runs_ruleset_id_fkey";
            columns: ["ruleset_id"];
            isOneToOne: false;
            referencedRelation: "compliance_rulesets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_runs_target_artifact_id_fkey";
            columns: ["target_artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_runs_target_version_id_fkey";
            columns: ["target_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_sources: {
        Row: {
          checksum: string | null;
          checksum_verified: boolean | null;
          checksum_verified_at: string | null;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_comment: string | null;
          description_ar: string;
          description_en: string;
          document_type: string;
          effective_on: string | null;
          evidence_notes: string;
          expires_on: string | null;
          id: string;
          issuing_authority: string;
          lineage_id: string;
          official_identifier: string;
          official_version: string;
          owner_name: string;
          parent_id: string | null;
          project_id: string;
          published_on: string | null;
          scope: string;
          source_file_id: string | null;
          source_url: string | null;
          status: Database["public"]["Enums"]["compliance_source_status"];
          title_ar: string;
          title_en: string;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          checksum?: string | null;
          checksum_verified?: boolean | null;
          checksum_verified_at?: string | null;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          description_ar?: string;
          description_en?: string;
          document_type: string;
          effective_on?: string | null;
          evidence_notes?: string;
          expires_on?: string | null;
          id?: string;
          issuing_authority: string;
          lineage_id: string;
          official_identifier: string;
          official_version?: string;
          owner_name?: string;
          parent_id?: string | null;
          project_id: string;
          published_on?: string | null;
          scope?: string;
          source_file_id?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["compliance_source_status"];
          title_ar?: string;
          title_en?: string;
          updated_at?: string;
          version_number?: number;
        };
        Update: {
          checksum?: string | null;
          checksum_verified?: boolean | null;
          checksum_verified_at?: string | null;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          description_ar?: string;
          description_en?: string;
          document_type?: string;
          effective_on?: string | null;
          evidence_notes?: string;
          expires_on?: string | null;
          id?: string;
          issuing_authority?: string;
          lineage_id?: string;
          official_identifier?: string;
          official_version?: string;
          owner_name?: string;
          parent_id?: string | null;
          project_id?: string;
          published_on?: string | null;
          scope?: string;
          source_file_id?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["compliance_source_status"];
          title_ar?: string;
          title_en?: string;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_sources_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources_current";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_source_file_id_fkey";
            columns: ["source_file_id"];
            isOneToOne: false;
            referencedRelation: "source_files";
            referencedColumns: ["id"];
          },
        ];
      };
      content_blocks: {
        Row: {
          artifact_version_id: string;
          block_type: Database["public"]["Enums"]["course_block_type"];
          id: string;
          lang: string | null;
          lesson_id: string;
          payload: Json;
          position: number;
          project_id: string;
        };
        Insert: {
          artifact_version_id: string;
          block_type: Database["public"]["Enums"]["course_block_type"];
          id?: string;
          lang?: string | null;
          lesson_id: string;
          payload: Json;
          position: number;
          project_id: string;
        };
        Update: {
          artifact_version_id?: string;
          block_type?: Database["public"]["Enums"]["course_block_type"];
          id?: string;
          lang?: string | null;
          lesson_id?: string;
          payload?: Json;
          position?: number;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_blocks_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_blocks_lesson_id_fkey";
            columns: ["lesson_id"];
            isOneToOne: false;
            referencedRelation: "course_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_blocks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      course_contents: {
        Row: {
          architecture_version_id: string;
          artifact_id: string;
          artifact_version_id: string;
          course_code: string;
          course_element_id: string;
          created_at: string;
          lang: string | null;
          project_id: string;
          title_ar: string;
          title_en: string;
        };
        Insert: {
          architecture_version_id: string;
          artifact_id: string;
          artifact_version_id: string;
          course_code: string;
          course_element_id: string;
          created_at?: string;
          lang?: string | null;
          project_id: string;
          title_ar?: string;
          title_en?: string;
        };
        Update: {
          architecture_version_id?: string;
          artifact_id?: string;
          artifact_version_id?: string;
          course_code?: string;
          course_element_id?: string;
          created_at?: string;
          lang?: string | null;
          project_id?: string;
          title_ar?: string;
          title_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_contents_architecture_version_id_fkey";
            columns: ["architecture_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_contents_artifact_id_fkey";
            columns: ["artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_contents_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: true;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_contents_course_element_id_fkey";
            columns: ["course_element_id"];
            isOneToOne: false;
            referencedRelation: "arch_elements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_contents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      course_nodes: {
        Row: {
          artifact_version_id: string;
          id: string;
          lang: string | null;
          node_type: string;
          parent_id: string | null;
          position: number;
          project_id: string;
          title_ar: string;
          title_en: string;
        };
        Insert: {
          artifact_version_id: string;
          id?: string;
          lang?: string | null;
          node_type: string;
          parent_id?: string | null;
          position: number;
          project_id: string;
          title_ar?: string;
          title_en?: string;
        };
        Update: {
          artifact_version_id?: string;
          id?: string;
          lang?: string | null;
          node_type?: string;
          parent_id?: string | null;
          position?: number;
          project_id?: string;
          title_ar?: string;
          title_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: "course_nodes_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_nodes_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "course_nodes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "course_nodes_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      documented_exceptions: {
        Row: {
          artifact_id: string | null;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_comment: string | null;
          id: string;
          justification: string;
          project_id: string;
          reference: string;
          status: Database["public"]["Enums"]["exception_status"];
          title: string;
        };
        Insert: {
          artifact_id?: string | null;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          id?: string;
          justification: string;
          project_id: string;
          reference: string;
          status?: Database["public"]["Enums"]["exception_status"];
          title: string;
        };
        Update: {
          artifact_id?: string | null;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          id?: string;
          justification?: string;
          project_id?: string;
          reference?: string;
          status?: Database["public"]["Enums"]["exception_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documented_exceptions_artifact_id_fkey";
            columns: ["artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documented_exceptions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      media_assets: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          kind: string;
          project_id: string;
          rights_note: string;
          source_url: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          kind: string;
          project_id: string;
          rights_note?: string;
          source_url?: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          kind?: string;
          project_id?: string;
          rights_note?: string;
          source_url?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          granted_at: string;
          note: string | null;
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          note?: string | null;
          user_id: string;
        };
        Update: {
          granted_at?: string;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      program_architectures: {
        Row: {
          artifact_id: string;
          artifact_version_id: string;
          brief_version_id: string;
          created_at: string;
          project_id: string;
        };
        Insert: {
          artifact_id: string;
          artifact_version_id: string;
          brief_version_id: string;
          created_at?: string;
          project_id: string;
        };
        Update: {
          artifact_id?: string;
          artifact_version_id?: string;
          brief_version_id?: string;
          created_at?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_architectures_artifact_id_fkey";
            columns: ["artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_architectures_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: true;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_architectures_brief_version_id_fkey";
            columns: ["brief_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_architectures_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      program_briefs: {
        Row: {
          artifact_id: string;
          artifact_version_id: string;
          assumptions_confirmed_at: string | null;
          assumptions_confirmed_by: string | null;
          category: Database["public"]["Enums"]["program_category"];
          created_at: string;
          fields: Json;
          intake_mode: Database["public"]["Enums"]["intake_mode"];
          project_id: string;
          source_file_id: string | null;
          source_snapshot_id: string | null;
          updated_at: string;
        };
        Insert: {
          artifact_id: string;
          artifact_version_id: string;
          assumptions_confirmed_at?: string | null;
          assumptions_confirmed_by?: string | null;
          category: Database["public"]["Enums"]["program_category"];
          created_at?: string;
          fields: Json;
          intake_mode: Database["public"]["Enums"]["intake_mode"];
          project_id: string;
          source_file_id?: string | null;
          source_snapshot_id?: string | null;
          updated_at?: string;
        };
        Update: {
          artifact_id?: string;
          artifact_version_id?: string;
          assumptions_confirmed_at?: string | null;
          assumptions_confirmed_by?: string | null;
          category?: Database["public"]["Enums"]["program_category"];
          created_at?: string;
          fields?: Json;
          intake_mode?: Database["public"]["Enums"]["intake_mode"];
          project_id?: string;
          source_file_id?: string | null;
          source_snapshot_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_briefs_artifact_id_fkey";
            columns: ["artifact_id"];
            isOneToOne: false;
            referencedRelation: "artifacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_briefs_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: true;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_briefs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_briefs_source_file_id_fkey";
            columns: ["source_file_id"];
            isOneToOne: false;
            referencedRelation: "source_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_briefs_source_snapshot_id_fkey";
            columns: ["source_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "program_source_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      program_source_snapshots: {
        Row: {
          created_at: string;
          id: string;
          imported_by: string;
          project_id: string;
          snapshot: Json;
          source_label: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          imported_by: string;
          project_id: string;
          snapshot: Json;
          source_label: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          imported_by?: string;
          project_id?: string;
          snapshot?: Json;
          source_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_source_snapshots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_comments: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          project_id: string;
        };
        Insert: {
          author_id?: string;
          body: string;
          created_at?: string;
          id?: string;
          project_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_comments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_exports: {
        Row: {
          created_at: string;
          export_format: string;
          file_name: string | null;
          id: string;
          project_id: string;
          requested_by: string;
          status: string;
          storage_path: string | null;
        };
        Insert: {
          created_at?: string;
          export_format: string;
          file_name?: string | null;
          id?: string;
          project_id: string;
          requested_by?: string;
          status?: string;
          storage_path?: string | null;
        };
        Update: {
          created_at?: string;
          export_format?: string;
          file_name?: string | null;
          id?: string;
          project_id?: string;
          requested_by?: string;
          status?: string;
          storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_exports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_files: {
        Row: {
          created_at: string;
          file_name: string;
          id: string;
          mime_type: string | null;
          project_id: string;
          size_bytes: number | null;
          storage_path: string | null;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          id?: string;
          mime_type?: string | null;
          project_id: string;
          size_bytes?: number | null;
          storage_path?: string | null;
          uploaded_by?: string;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          id?: string;
          mime_type?: string | null;
          project_id?: string;
          size_bytes?: number | null;
          storage_path?: string | null;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_invitations: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          invited_by: string;
          project_id: string;
          responded_at: string | null;
          role: Database["public"]["Enums"]["project_role"];
          status: Database["public"]["Enums"]["invitation_status"];
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          invited_by: string;
          project_id: string;
          responded_at?: string | null;
          role: Database["public"]["Enums"]["project_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          invited_by?: string;
          project_id?: string;
          responded_at?: string | null;
          role?: Database["public"]["Enums"]["project_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
        };
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          added_by: string | null;
          created_at: string;
          project_id: string;
          role: Database["public"]["Enums"]["project_role"];
          user_id: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          project_id: string;
          role: Database["public"]["Enums"]["project_role"];
          user_id: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          project_id?: string;
          role?: Database["public"]["Enums"]["project_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_settings: {
        Row: {
          default_locale: string;
          project_id: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          default_locale?: string;
          project_id: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          default_locale?: string;
          project_id?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_settings_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          created_at: string;
          created_by: string;
          description: string | null;
          id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          description?: string | null;
          id?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          description?: string | null;
          id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_assignments: {
        Row: {
          assigned_by: string;
          assignee_id: string;
          created_at: string;
          id: string;
          project_id: string;
          review_request_id: string;
        };
        Insert: {
          assigned_by: string;
          assignee_id: string;
          created_at?: string;
          id?: string;
          project_id: string;
          review_request_id: string;
        };
        Update: {
          assigned_by?: string;
          assignee_id?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          review_request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_assignments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_assignments_review_request_id_fkey";
            columns: ["review_request_id"];
            isOneToOne: false;
            referencedRelation: "review_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      review_comment_mentions: {
        Row: {
          comment_id: string;
          project_id: string;
          user_id: string;
        };
        Insert: {
          comment_id: string;
          project_id: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          project_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_comment_mentions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "review_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comment_mentions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      review_comments: {
        Row: {
          artifact_version_id: string;
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          parent_id: string | null;
          project_id: string;
        };
        Insert: {
          artifact_version_id: string;
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          project_id: string;
        };
        Update: {
          artifact_version_id?: string;
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_comments_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "review_comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_comments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      review_decisions: {
        Row: {
          actor_id: string;
          actor_role: Database["public"]["Enums"]["project_role"];
          artifact_version_id: string;
          comment: string | null;
          decided_at: string;
          decision: Database["public"]["Enums"]["review_decision_kind"];
          exception_id: string | null;
          id: string;
          project_id: string;
          review_request_id: string;
          stage_id: string;
        };
        Insert: {
          actor_id: string;
          actor_role: Database["public"]["Enums"]["project_role"];
          artifact_version_id: string;
          comment?: string | null;
          decided_at?: string;
          decision: Database["public"]["Enums"]["review_decision_kind"];
          exception_id?: string | null;
          id?: string;
          project_id: string;
          review_request_id: string;
          stage_id: string;
        };
        Update: {
          actor_id?: string;
          actor_role?: Database["public"]["Enums"]["project_role"];
          artifact_version_id?: string;
          comment?: string | null;
          decided_at?: string;
          decision?: Database["public"]["Enums"]["review_decision_kind"];
          exception_id?: string | null;
          id?: string;
          project_id?: string;
          review_request_id?: string;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "review_decisions_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_decisions_exception_id_fkey";
            columns: ["exception_id"];
            isOneToOne: false;
            referencedRelation: "documented_exceptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_decisions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_decisions_review_request_id_fkey";
            columns: ["review_request_id"];
            isOneToOne: false;
            referencedRelation: "review_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_decisions_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "workflow_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      review_requests: {
        Row: {
          artifact_version_id: string;
          closed_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          project_id: string;
          requested_by: string;
          stage_id: string;
          status: Database["public"]["Enums"]["review_request_status"];
        };
        Insert: {
          artifact_version_id: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          project_id: string;
          requested_by: string;
          stage_id: string;
          status?: Database["public"]["Enums"]["review_request_status"];
        };
        Update: {
          artifact_version_id?: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          project_id?: string;
          requested_by?: string;
          stage_id?: string;
          status?: Database["public"]["Enums"]["review_request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "review_requests_artifact_version_id_fkey";
            columns: ["artifact_version_id"];
            isOneToOne: false;
            referencedRelation: "artifact_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_requests_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "review_requests_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "workflow_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      source_files: {
        Row: {
          created_at: string;
          extracted_at: string | null;
          extracted_fields: Json;
          extracted_text: string | null;
          extraction_error: string | null;
          extraction_method: string;
          extraction_request_id: string | null;
          extraction_status: string;
          file_name: string;
          id: string;
          mime_type: string;
          project_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          extracted_at?: string | null;
          extracted_fields?: Json;
          extracted_text?: string | null;
          extraction_error?: string | null;
          extraction_method?: string;
          extraction_request_id?: string | null;
          extraction_status?: string;
          file_name: string;
          id?: string;
          mime_type: string;
          project_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          extracted_at?: string | null;
          extracted_fields?: Json;
          extracted_text?: string | null;
          extraction_error?: string | null;
          extraction_method?: string;
          extraction_request_id?: string | null;
          extraction_status?: string;
          file_name?: string;
          id?: string;
          mime_type?: string;
          project_id?: string;
          size_bytes?: number;
          storage_path?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_files_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_stages: {
        Row: {
          approver_roles: Database["public"]["Enums"]["project_role"][];
          created_at: string;
          id: string;
          is_active: boolean;
          name_ar: string;
          name_en: string;
          position: number;
          project_id: string;
          stage_key: string;
        };
        Insert: {
          approver_roles: Database["public"]["Enums"]["project_role"][];
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_ar: string;
          name_en: string;
          position: number;
          project_id: string;
          stage_key: string;
        };
        Update: {
          approver_roles?: Database["public"]["Enums"]["project_role"][];
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name_ar?: string;
          name_en?: string;
          position?: number;
          project_id?: string;
          stage_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_stages_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      compliance_sources_current: {
        Row: {
          authorizes_rules: boolean | null;
          checksum: string | null;
          checksum_verified: boolean | null;
          checksum_verified_at: string | null;
          created_at: string | null;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_comment: string | null;
          description_ar: string | null;
          description_en: string | null;
          document_type: string | null;
          effective_on: string | null;
          effective_status: Database["public"]["Enums"]["compliance_source_status"] | null;
          evidence_notes: string | null;
          expires_on: string | null;
          id: string | null;
          issuing_authority: string | null;
          lineage_id: string | null;
          official_identifier: string | null;
          official_version: string | null;
          owner_name: string | null;
          parent_id: string | null;
          project_id: string | null;
          published_on: string | null;
          scope: string | null;
          source_file_id: string | null;
          source_url: string | null;
          status: Database["public"]["Enums"]["compliance_source_status"] | null;
          title_ar: string | null;
          title_en: string | null;
          updated_at: string | null;
          version_number: number | null;
        };
        Insert: {
          authorizes_rules?: never;
          checksum?: string | null;
          checksum_verified?: boolean | null;
          checksum_verified_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          document_type?: string | null;
          effective_on?: string | null;
          effective_status?: never;
          evidence_notes?: string | null;
          expires_on?: string | null;
          id?: string | null;
          issuing_authority?: string | null;
          lineage_id?: string | null;
          official_identifier?: string | null;
          official_version?: string | null;
          owner_name?: string | null;
          parent_id?: string | null;
          project_id?: string | null;
          published_on?: string | null;
          scope?: string | null;
          source_file_id?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["compliance_source_status"] | null;
          title_ar?: string | null;
          title_en?: string | null;
          updated_at?: string | null;
          version_number?: number | null;
        };
        Update: {
          authorizes_rules?: never;
          checksum?: string | null;
          checksum_verified?: boolean | null;
          checksum_verified_at?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_comment?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          document_type?: string | null;
          effective_on?: string | null;
          effective_status?: never;
          evidence_notes?: string | null;
          expires_on?: string | null;
          id?: string | null;
          issuing_authority?: string | null;
          lineage_id?: string | null;
          official_identifier?: string | null;
          official_version?: string | null;
          owner_name?: string | null;
          parent_id?: string | null;
          project_id?: string | null;
          published_on?: string | null;
          scope?: string | null;
          source_file_id?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["compliance_source_status"] | null;
          title_ar?: string | null;
          title_en?: string | null;
          updated_at?: string | null;
          version_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_sources_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "compliance_sources_current";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_sources_source_file_id_fkey";
            columns: ["source_file_id"];
            isOneToOne: false;
            referencedRelation: "source_files";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      my_work: {
        Args: never;
        Returns: {
          artifact_id: string | null;
          created_at: string;
          detail: string | null;
          due_on: string | null;
          kind: string;
          project_id: string;
          project_title: string;
          ref_id: string;
          title: string;
        }[];
      };
      project_journey: { Args: { _project_id: string }; Returns: Json };
      review_readiness: { Args: { _version_id: string }; Returns: Json };
      export_options: {
        Args: { _format: Database["public"]["Enums"]["export_format"]; _version_id: string };
        Returns: Json;
      };
      record_export: {
        Args: {
          _byte_size: number;
          _file_name: string;
          _format: Database["public"]["Enums"]["export_format"];
          _id: string;
          _lang: string;
          _official: boolean;
          _sha256: string;
          _target_key: string;
          _user_id: string;
          _version_id: string;
        };
        Returns: string;
      };
      accept_ai_brief_field: {
        Args: { _key: string; _version_id: string };
        Returns: undefined;
      };
      ai_authorize: {
        Args: { _actor: string; _project_id: string };
        Returns: Json;
      };
      delete_glossary_term: { Args: { _id: string }; Returns: undefined };
      record_ai_brief_output: {
        Args: {
          _actor: string;
          _fields: Json;
          _mode: string;
          _request_id: string;
          _version_id: string;
        };
        Returns: string[];
      };
      record_ai_outcome: {
        Args: { _outcome: string; _request_id: string };
        Returns: undefined;
      };
      record_ai_request: {
        Args: {
          _actor: string;
          _error: string;
          _feature: string;
          _input_tokens: number;
          _model: string;
          _output_tokens: number;
          _project_id: string;
          _provider: string;
          _status: string;
          _target_ref: string;
        };
        Returns: string;
      };
      save_glossary_term: {
        Args: {
          _domain?: string;
          _id: string;
          _note?: string;
          _term_ar: string;
          _term_en: string;
        };
        Returns: string;
      };
      accept_invitation: { Args: { _invitation_id: string }; Returns: string };
      add_review_comment: {
        Args: {
          _body: string;
          _mentions?: string[];
          _parent_id?: string;
          _version_id: string;
        };
        Returns: string;
      };
      admin_list_projects: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          member_count: number;
          title: string;
        }[];
      };
      alignment_defects: {
        Args: { _version_id: string };
        Returns: {
          code: string;
          defect: string;
          element_id: string;
        }[];
      };
      approved_embed_hosts: { Args: never; Returns: string[] };
      archive_artifact: { Args: { _artifact_id: string }; Returns: undefined };
      assign_finding: {
        Args: { _assignee: string; _due: string; _finding_id: string };
        Returns: undefined;
      };
      assign_reviewer: {
        Args: { _assignee: string; _request_id: string };
        Returns: string;
      };
      brief_apply_manual: {
        Args: { _current: Json; _input: Json };
        Returns: Json;
      };
      brief_blank: { Args: never; Returns: Json };
      brief_field_keys: { Args: never; Returns: string[] };
      brief_set_value: {
        Args: {
          _fields: Json;
          _key: string;
          _prov: string;
          _ref: string;
          _value: string;
        };
        Returns: Json;
      };
      check_architecture_alignment: {
        Args: { _version_id: string };
        Returns: {
          code: string;
          defect: string;
          element_id: string;
        }[];
      };
      check_course_content: {
        Args: { _version_id: string };
        Returns: {
          block_id: string;
          defect: string;
          node_id: string;
          severity: string;
        }[];
      };
      comment_finding: {
        Args: { _body: string; _finding_id: string };
        Returns: undefined;
      };
      compliance_check_target: { Args: { _spec: Json }; Returns: string };
      compliance_evaluate_check: {
        Args: { _spec: Json; _version_id: string };
        Returns: Record<string, unknown>;
      };
      compliance_readiness: { Args: { _version_id: string }; Returns: Json };
      compliance_source_input: {
        Args: { _project_id: string; f: Json };
        Returns: {
          checksum: string | null;
          checksum_verified: boolean | null;
          checksum_verified_at: string | null;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_comment: string | null;
          description_ar: string;
          description_en: string;
          document_type: string;
          effective_on: string | null;
          evidence_notes: string;
          expires_on: string | null;
          id: string;
          issuing_authority: string;
          lineage_id: string;
          official_identifier: string;
          official_version: string;
          owner_name: string;
          parent_id: string | null;
          project_id: string;
          published_on: string | null;
          scope: string;
          source_file_id: string | null;
          source_url: string | null;
          status: Database["public"]["Enums"]["compliance_source_status"];
          title_ar: string;
          title_en: string;
          updated_at: string;
          version_number: number;
        };
        SetofOptions: {
          from: "*";
          to: "compliance_sources";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      compliance_validate_applicability: { Args: { _a: Json }; Returns: Json };
      compliance_validate_check: {
        Args: {
          _spec: Json;
          _type: Database["public"]["Enums"]["rule_check_type"];
        };
        Returns: Json;
      };
      confirm_brief_assumptions: {
        Args: { _version_id: string };
        Returns: undefined;
      };
      course_content_defects: {
        Args: { _version_id: string };
        Returns: {
          block_id: string;
          defect: string;
          node_id: string;
          severity: string;
        }[];
      };
      create_artifact: {
        Args: {
          _content?: string;
          _kind: string;
          _project_id: string;
          _title: string;
        };
        Returns: string;
      };
      create_course_content: {
        Args: { _architecture_version_id: string; _course_element_id: string };
        Returns: string;
      };
      create_exception: {
        Args: {
          _artifact_id: string;
          _justification: string;
          _project_id: string;
          _title: string;
        };
        Returns: string;
      };
      create_program_architecture: {
        Args: { _brief_version_id: string };
        Returns: string;
      };
      create_program_brief: {
        Args: {
          _category: Database["public"]["Enums"]["program_category"];
          _fields?: Json;
          _mode: Database["public"]["Enums"]["intake_mode"];
          _project_id: string;
          _snapshot?: Json;
          _source_file_id?: string;
        };
        Returns: string;
      };
      create_project: {
        Args: { _description?: string; _title: string };
        Returns: string;
      };
      decide_exception: {
        Args: { _approve: boolean; _comment?: string; _exception_id: string };
        Returns: undefined;
      };
      decide_review: {
        Args: {
          _comment?: string;
          _decision: Database["public"]["Enums"]["review_decision_kind"];
          _exception_id?: string;
          _request_id: string;
        };
        Returns: string;
      };
      decline_invitation: { Args: { _invitation_id: string }; Returns: string };
      edit_artifact: {
        Args: {
          _change_summary?: string;
          _content: string;
          _version_id: string;
        };
        Returns: string;
      };
      first_stage: { Args: { _project_id: string }; Returns: string };
      has_project_role: {
        Args: {
          _project_id: string;
          _roles: Database["public"]["Enums"]["project_role"][];
        };
        Returns: boolean;
      };
      invite_to_project: {
        Args: {
          _email: string;
          _project_id: string;
          _role: Database["public"]["Enums"]["project_role"];
        };
        Returns: string;
      };
      is_http_url: { Args: { _u: string }; Returns: boolean };
      is_platform_admin: { Args: never; Returns: boolean };
      is_project_member: { Args: { _project_id: string }; Returns: boolean };
      list_my_invitations: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          project_id: string;
          project_title: string;
          role: Database["public"]["Enums"]["project_role"];
        }[];
      };
      list_project_members: {
        Args: { _project_id: string };
        Returns: {
          display_name: string;
          email: string;
          role: Database["public"]["Enums"]["project_role"];
          user_id: string;
        }[];
      };
      member_role: {
        Args: { _project_id: string };
        Returns: Database["public"]["Enums"]["project_role"];
      };
      normalize_kau_email: { Args: { _email: string }; Returns: string };
      open_compliance_blockers: {
        Args: { _version_id: string };
        Returns: number;
      };
      record_source_checksum: {
        Args: { _actor: string; _computed: string; _source_id: string };
        Returns: boolean;
      };
      record_source_extraction: {
        Args: {
          _error: string;
          _fields: Json;
          _file_id: string;
          _method?: string;
          _request_id?: string;
          _status: string;
          _text: string;
        };
        Returns: undefined;
      };
      register_media_asset: {
        Args: {
          _kind: string;
          _project_id: string;
          _rights_note?: string;
          _source_url?: string;
          _title: string;
        };
        Returns: string;
      };
      register_source_file: {
        Args: {
          _file_name: string;
          _mime_type: string;
          _project_id: string;
          _size_bytes: number;
          _storage_path: string;
        };
        Returns: string;
      };
      render_architecture: { Args: { _version_id: string }; Returns: string };
      render_brief: {
        Args: {
          _category: Database["public"]["Enums"]["program_category"];
          _fields: Json;
          _mode: Database["public"]["Enums"]["intake_mode"];
        };
        Returns: string;
      };
      render_course: { Args: { _version_id: string }; Returns: string };
      request_review: {
        Args: { _assignees?: string[]; _note?: string; _version_id: string };
        Returns: string;
      };
      require_compliance_role: {
        Args: {
          _project_id: string;
          _roles: Database["public"]["Enums"]["project_role"][];
        };
        Returns: Database["public"]["Enums"]["project_role"];
      };
      require_contributor: {
        Args: { _project_id: string };
        Returns: Database["public"]["Enums"]["project_role"];
      };
      respond_to_invitation: {
        Args: { _accept: boolean; _invitation_id: string };
        Returns: string;
      };
      revise_compliance_rule: { Args: { _rule_id: string }; Returns: string };
      revise_compliance_source: {
        Args: { _fields: Json; _source_id: string };
        Returns: string;
      };
      rule_applies: {
        Args: {
          _app: Json;
          _ctx: Json;
          _from: string;
          _on: string;
          _to: string;
        };
        Returns: boolean;
      };
      run_compliance: {
        Args: { _context: Json; _ruleset_id: string; _version_id: string };
        Returns: string;
      };
      save_architecture: {
        Args: {
          _change_summary?: string;
          _elements: Json;
          _mappings: Json;
          _version_id: string;
        };
        Returns: string;
      };
      save_compliance_rule: {
        Args: {
          _evidence: Json;
          _fields: Json;
          _rule_id: string;
          _ruleset_id: string;
        };
        Returns: string;
      };
      save_compliance_ruleset: {
        Args: {
          _code: string;
          _project_id: string;
          _ruleset_id: string;
          _title_ar: string;
          _title_en: string;
        };
        Returns: string;
      };
      save_compliance_source: {
        Args: { _fields: Json; _project_id: string; _source_id: string };
        Returns: string;
      };
      save_course_content: {
        Args: { _change_summary?: string; _tree: Json; _version_id: string };
        Returns: string;
      };
      save_workflow_stages: {
        Args: { _project_id: string; _stages: Json };
        Returns: undefined;
      };
      seed_default_workflow: {
        Args: { _project_id: string };
        Returns: undefined;
      };
      set_compliance_rule_status: {
        Args: {
          _comment?: string;
          _rule_id: string;
          _to: Database["public"]["Enums"]["compliance_rule_status"];
        };
        Returns: undefined;
      };
      source_authorizes: {
        Args: {
          _effective: string;
          _expires: string;
          _on: string;
          _status: Database["public"]["Enums"]["compliance_source_status"];
        };
        Returns: boolean;
      };
      source_status_on: {
        Args: {
          _effective: string;
          _expires: string;
          _on: string;
          _status: Database["public"]["Enums"]["compliance_source_status"];
        };
        Returns: Database["public"]["Enums"]["compliance_source_status"];
      };
      storage_project_id: { Args: { _name: string }; Returns: string };
      transition_compliance_source: {
        Args: {
          _comment?: string;
          _source_id: string;
          _supersede_previous?: boolean;
          _to: Database["public"]["Enums"]["compliance_source_status"];
        };
        Returns: undefined;
      };
      transition_finding: {
        Args: {
          _comment?: string;
          _exception_id?: string;
          _finding_id: string;
          _to: Database["public"]["Enums"]["finding_status"];
          _verified_run_id?: string;
        };
        Returns: undefined;
      };
      update_program_brief: {
        Args: {
          _category: Database["public"]["Enums"]["program_category"];
          _change_summary?: string;
          _fields: Json;
          _version_id: string;
        };
        Returns: string;
      };
      validate_block_payload: {
        Args: {
          _p: Json;
          _project_id: string;
          _type: Database["public"]["Enums"]["course_block_type"];
        };
        Returns: undefined;
      };
    };
    Enums: {
      export_format: "course_spec_docx" | "program_summary_docx" | "scorm12";
      arch_element_type:
        | "program_outcome"
        | "course"
        | "course_outcome"
        | "activity"
        | "assessment"
        | "source_evidence";
      artifact_state:
        "draft" | "in_review" | "changes_requested" | "approved" | "superseded" | "archived";
      compliance_rule_status: "draft" | "active" | "superseded" | "retired";
      compliance_source_status:
        "draft" | "under_review" | "active" | "superseded" | "expired" | "rejected";
      course_block_type:
        | "rich_text"
        | "image"
        | "audio"
        | "video"
        | "embed"
        | "knowledge_check"
        | "scenario"
        | "rubric"
        | "glossary"
        | "references";
      exception_status: "pending" | "approved" | "rejected";
      finding_status:
        | "open"
        | "acknowledged"
        | "remediation_in_progress"
        | "resolved"
        | "accepted_exception"
        | "false_positive";
      intake_mode: "guided_idea" | "document_upload" | "redevelopment";
      invitation_status: "pending" | "accepted" | "declined" | "revoked";
      program_category: "micro_credential" | "academic_program" | "professional_program";
      project_role:
        | "system_administrator"
        | "program_owner"
        | "subject_matter_expert"
        | "instructional_designer"
        | "compliance_reviewer"
        | "media_reviewer"
        | "observer";
      review_decision_kind: "approve" | "request_changes" | "approve_exception";
      review_request_status: "open" | "approved" | "changes_requested" | "cancelled";
      rule_check_type: "automated" | "manual" | "hybrid";
      rule_severity: "info" | "warning" | "blocker";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      export_format: ["course_spec_docx", "program_summary_docx", "scorm12"],
      arch_element_type: [
        "program_outcome",
        "course",
        "course_outcome",
        "activity",
        "assessment",
        "source_evidence",
      ],
      artifact_state: [
        "draft",
        "in_review",
        "changes_requested",
        "approved",
        "superseded",
        "archived",
      ],
      compliance_rule_status: ["draft", "active", "superseded", "retired"],
      compliance_source_status: [
        "draft",
        "under_review",
        "active",
        "superseded",
        "expired",
        "rejected",
      ],
      course_block_type: [
        "rich_text",
        "image",
        "audio",
        "video",
        "embed",
        "knowledge_check",
        "scenario",
        "rubric",
        "glossary",
        "references",
      ],
      exception_status: ["pending", "approved", "rejected"],
      finding_status: [
        "open",
        "acknowledged",
        "remediation_in_progress",
        "resolved",
        "accepted_exception",
        "false_positive",
      ],
      intake_mode: ["guided_idea", "document_upload", "redevelopment"],
      invitation_status: ["pending", "accepted", "declined", "revoked"],
      program_category: ["micro_credential", "academic_program", "professional_program"],
      project_role: [
        "system_administrator",
        "program_owner",
        "subject_matter_expert",
        "instructional_designer",
        "compliance_reviewer",
        "media_reviewer",
        "observer",
      ],
      review_decision_kind: ["approve", "request_changes", "approve_exception"],
      review_request_status: ["open", "approved", "changes_requested", "cancelled"],
      rule_check_type: ["automated", "manual", "hybrid"],
      rule_severity: ["info", "warning", "blocker"],
    },
  },
} as const;
