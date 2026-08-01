export type EvidenceGrade =
  | 'confirmed'
  | 'potential'
  | 'unverified'
  | 'unknown'
  | 'context'
  | 'model_assumption';

export type EvidenceSourceType =
  | 'rcmp'
  | 'court_record'
  | 'news_report'
  | 'witness'
  | 'school_record'
  | 'advocacy_claim'
  | 'model'
  | 'unknown';

export interface GeoPoint {
  lat: number;
  lng: number;
  uncertaintyMeters?: number;
  isApproximate?: boolean;
}

export interface GeoPolygon {
  id: string;
  name: string;
  coordinates: Array<[number, number]>;
  source: EvidenceSourceType;
  grade: EvidenceGrade;
  description: string;
  isApproximate?: boolean;
}
