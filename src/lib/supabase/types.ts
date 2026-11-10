export type UserRole = "admin" | "personal" | "vendedor" | "cajero" | "dueno";

export type ImageType = "almacen" | "catalogo";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          is_active: boolean | null;
          username: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          is_active?: boolean | null;
          username?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          is_active?: boolean | null;
          username?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
          audiences: string[];
          unit_price: number;
          promo_price: number | null;
          wholesale_price: number | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category?: string | null;
          audiences?: string[];
          unit_price: number;
          promo_price?: number | null;
          wholesale_price?: number | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          audiences?: string[];
          unit_price?: number;
          promo_price?: number | null;
          wholesale_price?: number | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          size: string;
          color: string;
          sku: string | null;
          stock: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          size: string;
          color: string;
          sku?: string | null;
          stock?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          size?: string;
          color?: string;
          sku?: string | null;
          stock?: number;
          created_at?: string;
        };
        Relationships: [{
          foreignKeyName: "product_variants_product_id_fkey";
          columns: ["product_id"];
          isOneToOne: false;
          referencedRelation: "products";
          referencedColumns: ["id"];
        }];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          image_url: string;
          image_type: ImageType;
          display_order: number | null;
          is_primary: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          image_url: string;
          image_type?: ImageType;
          display_order?: number | null;
          is_primary?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          image_url?: string;
          image_type?: ImageType;
          display_order?: number | null;
          is_primary?: boolean | null;
          created_at?: string;
        };
        Relationships: [{
          foreignKeyName: "product_images_product_id_fkey";
          columns: ["product_id"];
          isOneToOne: false;
          referencedRelation: "products";
          referencedColumns: ["id"];
        }];
      };
      inventory_movements: {
        Row: {
          id: string;
          product_id: string | null;
          variant_id: string | null;
          user_id: string;
          action_type: string;
          quantity_change: number | null;
          comment: string | null;
          product_snapshot: string | null;
          variant_snapshot: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          user_id: string;
          action_type: string;
          quantity_change?: number | null;
          comment?: string | null;
          product_snapshot?: string | null;
          variant_snapshot?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string | null;
          variant_id?: string | null;
          user_id?: string;
          action_type?: string;
          quantity_change?: number | null;
          comment?: string | null;
          product_snapshot?: string | null;
          variant_snapshot?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_movements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      catalog_current_rate: {
        Args: Record<string, never>;
        Returns: { rate: string; effective_date: string }[];
      };
      catalog_product_images: {
        Args: { p_product_ids: string[] };
        Returns: { product_id: string; image_url: string; display_order: number | null; is_primary: boolean | null }[];
      };
      catalog_manage_images: {
        Args: { p_product_id: string };
        Returns: { id: string; image_url: string; display_order: number | null; is_primary: boolean | null }[];
      };
      catalog_add_image: {
        Args: { p_product_id: string; p_path: string; p_comment: string };
        Returns: undefined;
      };
      catalog_remove_image: {
        Args: { p_product_id: string; p_image_id: string; p_comment: string };
        Returns: string;
      };
      catalog_delete_product: {
        Args: { p_product_id: string; p_comment: string };
        Returns: { warehouse_paths: string[]; catalog_paths: string[] }[];
      };
      catalog_list_products: {
        Args: { p_search: string; p_offset: number };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
          unit_price: number;
          promo_price: number | null;
          wholesale_price: number | null;
          variants: Json;
        }[];
      };
      inventory_exchange_rate_context: {
        Args: Record<string, never>;
        Returns: { rate: string; effective_date: string; updated_at: string; actor_name: string; comment: string | null; is_today: boolean }[];
      };
      inventory_exchange_rate_history: {
        Args: { p_offset: number };
        Returns: { rate_id: number; rate: string; effective_date: string; updated_at: string; actor_name: string; comment: string | null; total_count: number }[];
      };
      inventory_set_exchange_rate_for_date: {
        Args: { p_rate: string; p_comment: string; p_effective_date: string };
        Returns: undefined;
      };
      inventory_edit_exchange_rate: {
        Args: { p_id: number; p_expected_updated_at: string; p_rate: string; p_comment: string; p_effective_date: string };
        Returns: undefined;
      };
      inventory_delete_exchange_rate: {
        Args: { p_id: number; p_expected_updated_at: string; p_reason: string };
        Returns: undefined;
      };
      inventory_exchange_rate_movements: {
        Args: { p_offset: number };
        Returns: { id: number; action: string; actor_name: string; occurred_at: string; old_date: string | null; old_rate: string | null; old_comment: string | null; new_date: string | null; new_rate: string | null; new_comment: string | null; reason: string; total_count: number }[];
      };
      inventory_create_product_v2: {
        Args: {
          p_product_id: string;
          p_name: string;
          p_description: string;
          p_category: string;
          p_unit_price: number;
          p_promo_price: number;
          p_wholesale_price: number;
          p_variants: Json;
          p_image_paths: string[];
          p_comment: string;
        };
        Returns: string;
      };
      inventory_list_categories: { Args: Record<string, never>; Returns: string[] };
      inventory_create_product_v3: {
        Args: Database["public"]["Functions"]["inventory_create_product_v2"]["Args"] & { p_audiences: string[] };
        Returns: string;
      };
      inventory_update_product_v2: {
        Args: Database["public"]["Functions"]["inventory_update_product"]["Args"] & { p_audiences: string[] };
        Returns: string[];
      };
      inventory_update_product: {
        Args: {
          p_product_id: string;
          p_name: string;
          p_description: string;
          p_category: string;
          p_unit_price: number;
          p_promo_price: number;
          p_wholesale_price: number;
          p_variants: Json;
          p_add_image_paths: string[];
          p_remove_image_ids: string[];
          p_comment: string;
        };
        Returns: string[];
      };
      inventory_set_product_status: {
        Args: { p_product_id: string; p_status: string; p_comment: string };
        Returns: undefined;
      };
      inventory_delete_product: {
        Args: { p_product_id: string; p_comment: string };
        Returns: string[];
      };
      inventory_audit_list: {
        Args: { p_offset?: number };
        Returns: {
          id: string;
          action_type: string;
          comment: string | null;
          quantity_change: number | null;
          created_at: string;
          actor_name: string;
          product_name: string | null;
          variant_size: string | null;
          variant_color: string | null;
          total_count: number;
        }[];
      };
      inventory_create_product: {
        Args: {
          p_name: string;
          p_description: string;
          p_category: string;
          p_unit_price: number;
          p_promo_price: number;
          p_wholesale_price: number;
          p_variants: Json;
          p_comment: string;
        };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      image_type: ImageType;
    };
    CompositeTypes: Record<string, never>;
  };
};
