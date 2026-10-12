export type OrganizationKind = "client" | "contractor" | "store";
export type MembershipRole = "owner" | "admin" | "member";

export type ConstructionJob = {
  id: string;
  client_id: string;
  title: string;
  city: string;
  address: string;
  description: string;
  building_type: "house" | "extension" | "renovation" | "other";
  area_m2: number;
  floors: number | null;
  basement: boolean | null;
  postal_code: string;
  plot_area_m2: number | null;
  rooms: string;
  existing_condition: string;
  work_category: string;
  site_access: string;
  utilities: string;
  requirements: string;
  acceptance_criteria: string;
  report_summary: string;
  roof: "pitched" | "flat" | "other";
  materials: string;
  start_date: string;
  budget_pln: number | null;
  status: "draft" | "open" | "cancelled";
  created_at: string;
};
export type BusinessProfile = {
  organization_id: string;
  city: string;
  address: string;
  postal_code: string;
  phone: string;
  industry: string;
  service_area: string;
  radius_km: number;
  description: string;
  created_at: string;
};
export type EmployeeAccount = {
  user_id: string;
  business_id: string;
  email: string;
  display_name: string;
  password_change_required: boolean;
  created_at: string;
};
export type DocumentationDraftRow = {
  job_id: string;
  revision: number;
  payload: unknown;
};

export interface Database {
  public: {
    Tables: {
      construction_documentation_drafts: {
        Row: DocumentationDraftRow;
        Insert: DocumentationDraftRow;
        Update: Partial<DocumentationDraftRow>;
        Relationships: [];
      };
      construction_jobs: {
        Row: ConstructionJob;
        Insert: Omit<ConstructionJob, "id" | "client_id" | "created_at" | "status" | "roof"> & {
          roof?: ConstructionJob["roof"];
          id?: string; client_id?: string; created_at?: string; status?: ConstructionJob["status"];
        };
        Update: Partial<ConstructionJob>;
        Relationships: [];
      };
      business_profiles: {
        Row: BusinessProfile;
        Insert: Omit<BusinessProfile, "created_at"> & { created_at?: string };
        Update: Partial<BusinessProfile>;
        Relationships: [];
      };
      employee_accounts: {
        Row: EmployeeAccount;
        Insert: Omit<EmployeeAccount, "created_at" | "password_change_required"> & {
          created_at?: string; password_change_required?: boolean;
        };
        Update: Partial<EmployeeAccount>;
        Relationships: [];
      };
      memberships: {
        Row: {
          organization_id: string;
          user_id: string;
          role: MembershipRole;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role: MembershipRole;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          user_id?: string;
          role?: MembershipRole;
          created_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          kind: OrganizationKind;
          nip: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          kind: OrganizationKind;
          nip?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          kind?: OrganizationKind;
          nip?: string | null;
          created_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          account_type: OrganizationKind | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          account_type?: OrganizationKind | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          account_type?: OrganizationKind | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_documentation_draft: {
        Args: { target_job_id: string; expected_revision: number; draft_payload: object };
        Returns: number;
      };
      attach_employee_account: {
        Args: { owner_id: string; target_business_id: string; employee_id: string; employee_email: string; employee_name: string };
        Returns: undefined;
      };
      complete_business_profile: {
        Args: {
          business_name: string; business_nip: string; business_city: string;
          business_address: string; business_postal_code: string; business_phone: string;
          business_industry: string; business_service_area: string;
          business_radius_km: number; business_description: string;
        };
        Returns: string;
      };
      employee_password_required: { Args: Record<string, never>; Returns: boolean };
      has_organization_role: {
        Args: {
          target_organization_id: string;
          allowed_roles: MembershipRole[];
        };
        Returns: boolean;
      };
      is_organization_member: {
        Args: { target_organization_id: string };
        Returns: boolean;
      };
      is_valid_polish_nip: {
        Args: { nip: string };
        Returns: boolean;
      };
    };
    Enums: {
      membership_role: MembershipRole;
      organization_kind: OrganizationKind;
    };
    CompositeTypes: Record<string, never>;
  };
}
