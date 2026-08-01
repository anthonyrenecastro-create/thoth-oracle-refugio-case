export type AccessMode = 'public_analysis' | 'authorized_investigator';

export type SourceProvenanceType =
  | 'official_release'
  | 'investigator_entry'
  | 'public_database'
  | 'forensic_report'
  | 'news_report'
  | 'family_submission'
  | 'public_tip'
  | 'model_inference'
  | 'unknown';

export interface SourceProvenance {
  type: SourceProvenanceType;
  citationOrRecordId: string;
  sourceLabel: string;
  accessLevel: 'public' | 'restricted';
  reliability: 'high' | 'moderate' | 'low' | 'unknown';
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export type SearchProfileClass =
  | 'local_or_regional_resident'
  | 'transient_or_traveler'
  | 'unreported_missing_person'
  | 'reported_outside_texas'
  | 'international_or_cross_border_record'
  | 'recorded_under_alias'
  | 'duplicate_or_fragmented_record'
  | 'report_created_later'
  | 'never_formally_reported_missing'
  | 'outside_current_database_coverage';

export type CandidateRecordClass =
  | 'public_missing_person_record'
  | 'investigator_supplied_record'
  | 'outside_current_candidate_set';

export interface InformationGainAssessment {
  qualitative: 'very_high' | 'high' | 'moderate' | 'low';
  internalScore: number;
  scoreInterval: [number, number];
  scoringVersion: string;
  basis: Array<{
    factor: string;
    contribution: number;
    explanation: string;
    evidenceIds: string[];
    assumptions: string[];
  }>;
  sensitivity: Array<{
    changedInput: string;
    originalValue: string | number;
    alternateValue: string | number;
    resultingScore: number;
  }>;
  limitations: string[];
}

export interface ResidualCandidateSetAssessment {
  preserved: true;
  residualWeight: number | null;
  uncertainty: [number, number];
  interpretation: 'comparative_analytical_weight_not_probability';
  reasons: string[];
  increasesWhen: string[];
  decreasesWhen: string[];
  calculationInputs: Array<{
    inputId: string;
    label: string;
    value: number | string;
    provenance: string;
  }>;
  assumptions: string[];
  limitations: string[];
}

export interface CriticalUnknown {
  id: string;
  title: string;
  whyItMatters: string;
  currentStatus: 'unknown' | 'partially_known' | 'restricted' | 'resolved';
  expectedInformationGain: 'very_high' | 'high' | 'moderate' | 'low';
  blocksConclusions: string[];
  actionToResolve: string;
  responsibleSource: 'law_enforcement' | 'medical_examiner' | 'forensic_laboratory' | 'records_repository' | 'family_or_public' | 'unknown';
  accessLevel: 'public' | 'restricted';
  evidenceIds: string[];
}

export interface CandidateCoverageMetrics {
  namedCandidatesEntered: number;
  publicRecordsReviewed: number;
  investigatorCandidatesEntered: number;
  verifiedExclusions: number;
  possibleDuplicates: number;
  jurisdictionsSearched: number;
  databasesSearched: number;
  recordCoverageStatus: 'minimal' | 'partial' | 'substantial' | 'unknown';
}

export interface RecordSearchCoverage {
  scopeId: string;
  scopeName: string;
  status: 'not_started' | 'partial' | 'completed' | 'unknown';
  systemsOrRepositories: string[];
  dateRange: { start?: string; end?: string };
  searchTermsOrConstraints: string[];
  candidateCountReturned?: number;
  recordsReviewed?: number;
  limitations: string[];
  provenance: SourceProvenance[];
}

export interface HumanReviewDecision {
  id: string;
  reviewerRole: string;
  timestamp: string;
  subjectType: 'profile' | 'candidate' | 'action' | 'unknown' | 'reconstruction_question';
  subjectId: string;
  decision: 'accepted_for_followup' | 'deferred' | 'rejected' | 'needs_more_information' | 'completed';
  rationale: string;
  evidenceIds: string[];
}

export interface EvidenceSourceDisplay {
  id: string;
  title: string;
  sourceType: SourceProvenanceType;
  accessLevel: 'public' | 'restricted';
  citationOrRecordId: string;
  dateEntered?: string;
  dateAccessed?: string;
  reliability: 'high' | 'moderate' | 'low' | 'unknown';
  sourceTier: 'primary' | 'secondary' | 'derived';
  independenceGroup?: string;
  supportedEvidenceIds: string[];
  notes: string[];
}

export interface IdentityCandidate {
  id: string;
  identityStatus: 'unnamed_profile' | 'public_missing_person_record' | 'investigator_supplied_record' | 'outside_current_candidate_set';
  candidateClass?: CandidateRecordClass;
  displayName?: string;
  sourceReference?: string;
  provenance: SourceProvenance[];
  demographics: {
    sexCompatibility: 'compatible' | 'incompatible' | 'unknown';
    ageCompatibility: 'strong' | 'moderate' | 'weak' | 'incompatible' | 'unknown';
    heightCompatibility: 'strong' | 'moderate' | 'weak' | 'incompatible' | 'unknown';
    ancestryCompatibility: 'broadly_compatible' | 'uncertain' | 'broadly_incompatible' | 'unknown';
    limitations: string[];
  };
  timeline: {
    disappearanceDate?: string;
    dateQuality: 'exact' | 'approximate' | 'conflicting' | 'unknown';
    compatibility: 'strongly_compatible' | 'compatible' | 'uncertain' | 'weak' | 'incompatible';
    conflicts: string[];
    limitations: string[];
  };
  geography: {
    lastKnownLocation?: { lat: number; lng: number; label?: string };
    locationQuality: 'exact' | 'approximate' | 'jurisdiction_only' | 'unknown';
    distanceToRefugioKm?: number;
    travelFeasibility: 'plausible' | 'uncertain' | 'weak' | 'not_assessed';
    limitations: string[];
  };
  facialReview?: {
    status: 'not_reviewed' | 'broadly_consistent' | 'inconclusive' | 'broadly_inconsistent';
    reviewerType: 'investigator' | 'forensic_artist' | 'anthropologist' | 'other';
    limitations: string[];
  };
  forensicComparison: {
    dna: 'unknown' | 'not_available' | 'not_compared' | 'pending' | 'excluded' | 'consistent' | 'confirmed';
    dental: 'unknown' | 'not_available' | 'not_compared' | 'pending' | 'excluded' | 'consistent' | 'confirmed';
    fingerprint: 'unknown' | 'not_available' | 'not_compared' | 'pending' | 'excluded' | 'consistent' | 'confirmed';
    anthropological: 'not_compared' | 'broadly_compatible' | 'inconclusive' | 'incompatible';
    notes: string[];
  };
  clothingContext: {
    comparisonStatus: 'not_compared' | 'general_style_similarity' | 'specific_item_similarity' | 'photographically_documented_similarity' | 'manufacturer_or_label_similarity' | 'inconclusive';
    supportingObservations: string[];
    limitations: string[];
  };
  assessment: {
    compatibilityScore: number;
    evidenceCompletenessScore: number;
    contradictionScore: number;
    informationGainScore: number;
    overallComparisonPriority: number;
    uncertainty: [number, number];
  };
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  requiredAssumptions: string[];
  decisiveTests: string[];
  disposition: 'unreviewed' | 'low_priority' | 'needs_records' | 'needs_forensic_comparison' | 'priority_for_forensic_comparison' | 'excluded_by_timeline' | 'excluded_by_dental' | 'excluded_by_dna' | 'excluded_by_fingerprint' | 'excluded_by_verified_evidence' | 'confirmed_identification';
  humanReviewRequired: true;
}

export interface CandidateRecordLink {
  sourceSystem: string;
  sourceRecordId: string;
  recordName: string;
  aliasNames: string[];
  alternateSpellings: string[];
  possibleDuplicateOf?: string;
  dateQuality: 'exact' | 'approximate' | 'conflicting' | 'unknown';
  locationQuality: 'exact' | 'approximate' | 'jurisdiction_only' | 'unknown';
  sourceProvenance: SourceProvenance;
}

export interface IdentitySearchProfile {
  profileId: string;
  title: string;
  profileClass?: SearchProfileClass;
  description: string;
  analyticalWeight: number | null;
  weightInterval: [number, number];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknownEvidenceIds: string[];
  requiredAssumptions: string[];
  recordsNeeded: string[];
  jurisdictionsToSearch: string[];
  expectedInformationGain: 'very_high' | 'high' | 'moderate' | 'low' | null;
  internalInformationGainScore?: number | null;
  evidenceThatWouldWeakenProfile: string[];
  limitations: string[];
}

export interface IdentityEvidenceItem {
  id: string;
  title: string;
  description: string;
  category: 'context' | 'timeline' | 'clothing' | 'reconstruction' | 'forensic' | 'records' | 'outreach';
  provenance: SourceProvenance[];
  accessLevel?: 'public' | 'restricted';
  independenceGroup?: string;
  notes?: string[];
}

export interface IdentityAction {
  id: string;
  title: string;
  category?: 'dna' | 'dental' | 'fingerprint' | 'anthropology' | 'isotope' | 'records' | 'clothing' | 'facial_reconstruction' | 'public_outreach';
  purpose: string;
  whyItMatters: string[];
  expectedInformationGain: number | null;
  candidateDiscrimination: number;
  prerequisites: string[];
  availability: 'confirmed_available' | 'possibly_available' | 'unknown' | 'already_completed' | 'not_viable' | 'restricted_information';
  alreadyAttemptedStatus: string;
  costClass: 'low' | 'moderate' | 'high' | 'unknown';
  timeClass: 'days' | 'weeks' | 'months' | 'unknown';
  authorizationRequired: string[];
  limitations: string[];
  uncertainty: string[];
  informationGain: InformationGainAssessment;
  canIdentifyOrPrioritize: string[];
  canExclude: string[];
  cannotEstablish: string[];
  positiveResultNextSteps: string[];
  negativeResultNextSteps: string[];
  unknownAvailabilityNextSteps: string[];
  supportingEvidenceIds: string[];
  assumptions: string[];
}

export interface IdentificationAction extends IdentityAction {
  actionType?: 'forensic' | 'records' | 'outreach' | 'reconstruction';
}

export interface RecordsSearchAction extends IdentityAction {
  sourceSystem: string;
}

export interface OutreachAction extends IdentityAction {
  audience: string;
}

export interface BoundedReconstructionQuestion {
  id: string;
  prompt: string;
  facts: string[];
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknowns: string[];
  assumptions: string[];
  requiredEvidence: string[];
  currentAnswerability: 'answerable' | 'partially_answerable' | 'currently_unanswerable';
  limitations: string[];
}

export interface UnknownRegistryItem {
  id: string;
  title: string;
  detail: string;
  impact: 'low' | 'medium' | 'high';
}
