export const BUSINESS_TYPES = {
  restaurant_cafe_canteen: 1,
  takeaway_sandwich_shop: 7844,
  pub_bar_nightclub: 7843,
  hotel_bed_breakfast_guest_house: 7842,
  mobile_caterer: 7846,
  other_catering_premises: 7841,
  school_college_university: 7845,
  retailer_other: 4613,
  supermarket_hypermarket: 7840,
} as const;

export type BusinessType = keyof typeof BUSINESS_TYPES;

export interface FindBusinessesInput {
  ward?: string;
  name?: string;
  business_type?: BusinessType;
  minimum_rating?: 0 | 1 | 2 | 3 | 4 | 5;
  sort_by?: "name" | "rating";
  sort_order?: "asc" | "desc";
  page: number;
  limit: number;
}

export interface FoodBusiness {
  establishment_id: number;
  business_name: string;
  address: string;
  business_type: string;
  rating: number | "AwaitingInspection" | "AwaitingPublication" | "Exempt" | "Other";
  rating_label: string;
  inspection_date: string | null;
  new_rating_pending: boolean;
  source_url: string;
  source_retrieved_at: string;
}

export interface FindBusinessesResult {
  businesses: FoodBusiness[];
  total_count: number;
  page: number;
  has_more: boolean;
  source_extract_time: string | null;
  source_retrieved_at: string;
  note?: string;
  attribution: string;
}
