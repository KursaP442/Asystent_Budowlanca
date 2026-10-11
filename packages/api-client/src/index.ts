export type OrganizationKind = "client" | "contractor" | "store";
export type MembershipRole = "owner" | "admin" | "member";

export interface Database {
  public: {
    Tables: {
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
