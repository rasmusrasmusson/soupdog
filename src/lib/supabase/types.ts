// Auto-generated types matching the Supabase schema.
// Run `npx supabase gen types typescript --project-id <your-id>` to regenerate.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type DifficultyLevel = 'trivial' | 'easy' | 'medium' | 'hard' | 'expert';
export type FoodState = 'frozen' | 'refrigerated' | 'room_temp' | 'hot' | 'thawed_partial';
export type StepType = 'human' | 'machine' | 'passive';
export type UnitSystem = 'si' | 'imperial' | 'us';
export type EquipmentCategory = 'oven' | 'knife' | 'pan' | 'scale' | 'mixer' | 'appliance' | 'other';

export interface Database {
  public: {
    Tables: {
      // ── Recipes ────────────────────────────────
      recipes: {
        Row: {
          id: string;
          slug: string;
          version: number;
          parent_version_id: string | null;
          canonical_id: string | null;
          title: string;
          description: string | null;
          cuisine: string | null;
          tags: string[] | null;
          servings: number;
          difficulty: DifficultyLevel;
          total_time_seconds: number;
          active_time_seconds: number | null;
          passive_time_seconds: number | null;
          yield_description: string | null;
          nutrition: Json | null;
          required_food_state: FoodState | null;
          author_id: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recipes']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recipes']['Insert']>;
      };

      // ── Recipe Steps ───────────────────────────
      recipe_steps: {
        Row: {
          id: string;
          recipe_id: string;
          order_index: number;
          step_type: StepType;
          instruction: string;
          duration_seconds: number | null;
          temperature_celsius: number | null;
          equipment_ids: string[] | null;
          notes: string | null;
        };
        Insert: Omit<Database['public']['Tables']['recipe_steps']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recipe_steps']['Insert']>;
      };

      // ── Recipe Ingredients ─────────────────────
      recipe_ingredients: {
        Row: {
          id: string;
          recipe_id: string;
          ingredient_id: string;
          quantity_value: number;
          quantity_unit: string;
          food_state: FoodState | null;
          prep_note: string | null;
          optional: boolean;
          order_index: number;
        };
        Insert: Omit<Database['public']['Tables']['recipe_ingredients']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recipe_ingredients']['Insert']>;
      };

      // ── Sub-Recipe Links ───────────────────────
      recipe_sub_recipes: {
        Row: {
          id: string;
          parent_recipe_id: string;
          child_recipe_id: string;
          used_as_ingredient: string | null;
          optional: boolean;
        };
        Insert: Omit<Database['public']['Tables']['recipe_sub_recipes']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recipe_sub_recipes']['Insert']>;
      };

      // ── Recipe Equipment ───────────────────────
      recipe_equipment: {
        Row: {
          id: string;
          recipe_id: string;
          equipment_id: string;
          required: boolean;
          alternatives: string[] | null;
        };
        Insert: Omit<Database['public']['Tables']['recipe_equipment']['Row'], 'id'> & { id?: string };
        Update: Partial<Database['public']['Tables']['recipe_equipment']['Insert']>;
      };

      // ── Ingredients ────────────────────────────
      ingredients: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          nutrition: Json | null;
          allergens: string[] | null;
          transformed_from_id: string | null;
          transformation_recipe_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['ingredients']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['ingredients']['Insert']>;
      };

      // ── Equipment ──────────────────────────────
      equipment: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: EquipmentCategory;
          description: string | null;
          connected: boolean;
          capabilities: Json | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['equipment']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['equipment']['Insert']>;
      };

      // ── User Profiles ──────────────────────────
      user_profiles: {
        Row: {
          id: string; // matches auth.users.id
          display_name: string | null;
          unit_system: UnitSystem;
          language: string;
          skill_level: DifficultyLevel | null;
          allergies: string[] | null;
          dietary_restrictions: string[] | null;
          preferred_cuisines: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_profiles']['Row'], 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['user_profiles']['Insert']>;
      };

      // ── Group Members ──────────────────────
      group_members: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          age: number | null;
          allergies: string[] | null;
          restrictions: string[] | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['group_members']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['group_members']['Insert']>;
      };

      // ── Saved Recipes ──────────────────────────
      saved_recipes: {
        Row: {
          id: string;
          user_id: string;
          recipe_id: string;
          collection: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['saved_recipes']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['saved_recipes']['Insert']>;
      };

      // ── Ratings ────────────────────────────────
      ratings: {
        Row: {
          id: string;
          recipe_id: string;
          user_id: string;
          score: number; // 1-5
          skill_level: DifficultyLevel | null;
          appliance_id: string | null;
          country: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['ratings']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['ratings']['Insert']>;
      };

      // ── User Equipment ─────────────────────────
      user_equipment: {
        Row: {
          id: string;
          user_id: string;
          equipment_id: string;
          nickname: string | null;
          registered_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_equipment']['Row'], 'id' | 'registered_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['user_equipment']['Insert']>;
      };
    };

    Views: {
      recipe_rating_summary: {
        Row: {
          recipe_id: string;
          average_score: number;
          total_ratings: number;
        };
      };
    };

    Functions: {};
    Enums: {};
  };
}
