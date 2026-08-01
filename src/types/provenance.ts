export interface ProvenanceNote {
  source: string;
  citation: string;
  accessLevel: 'public' | 'restricted';
  reliability: 'high' | 'moderate' | 'low' | 'unknown';
}
