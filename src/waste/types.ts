export type WasteAddress = {
  property_id: string;
  display_address: string;
  source: "Cardiff Council";
  retrieved_at: string;
};

export type FindWasteAddressesResult = {
  matches: WasteAddress[];
  match_count: number;
  truncated: boolean;
  status: "ok" | "no_matches";
  source_url: string;
  retrieved_at: string;
  cache_status: "hit" | "miss";
};

export type WasteCollection = {
  date: string;
  waste_type: string;
  schedule_status_raw: string | null;
  schedule_status: "scheduled" | "rescheduled" | "unknown";
};

export type WasteCollectionsResult = {
  property_id: string;
  collections: WasteCollection[];
  status: "ok" | "no_collections";
  schedule_window_start: string | null;
  schedule_window_end: string | null;
  source_url: string;
  collection_updates_url: string;
  retrieved_at: string;
  cache_status: "hit" | "miss";
  data_age_seconds: number;
  notice: string;
};
