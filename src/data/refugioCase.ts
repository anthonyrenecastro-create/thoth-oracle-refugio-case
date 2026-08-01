import type { AccessMode, IdentityCandidate, IdentityEvidenceItem, IdentitySearchProfile, IdentificationAction, RecordsSearchAction, OutreachAction, BoundedReconstructionQuestion, UnknownRegistryItem, SourceProvenance, InformationGainAssessment, ResidualCandidateSetAssessment, CriticalUnknown, CandidateCoverageMetrics, RecordSearchCoverage, HumanReviewDecision } from '../types/identityForensics';

export interface IdentityCase {
  id: string;
  title: string;
  accessMode: AccessMode;
  jurisdiction: string;
  discovery: {
    discoveredOn: string;
    locationDescription: string;
    recoveryContext: string;
  };
  biologicalProfile: {
    sex: string;
    estimatedAge: string;
    estimatedHeight: string;
    ancestryEstimate: string;
  };
  deathContext: {
    causeOfDeath: string;
    approximateDeathInterval: string;
    discoveredRemains: string;
  };
  clothingItems: Array<{ item: string; notes?: string }>;
  reconstruction: {
    updatedIn: string;
    hairstyleUncertain: boolean;
    hairColorUncertain: boolean;
    eyeColorUncertain: boolean;
    note: string;
  };
  evidence: IdentityEvidenceItem[];
  candidateRecords: IdentityCandidate[];
  searchProfiles: IdentitySearchProfile[];
  forensicActions: IdentificationAction[];
  recordsActions: RecordsSearchAction[];
  outreachActions: OutreachAction[];
  reconstructionQuestions: BoundedReconstructionQuestion[];
  unknowns: UnknownRegistryItem[];
  guardrails: string[];
  outsideCurrentCandidateSet: {
    preserved: boolean;
    analyticalWeight: number;
    weightInterval: [number, number];
    reasons: string[];
  };
  provenance: SourceProvenance[];
  criticalUnknowns?: CriticalUnknown[];
  coverageMetrics?: CandidateCoverageMetrics;
  recordSearchCoverage?: RecordSearchCoverage[];
  humanReviewDecisions?: HumanReviewDecision[];
}

const provenance: SourceProvenance[] = [
  {
    type: 'official_release',
    citationOrRecordId: 'TX_REFUGIO_PUBLIC_1992',
    sourceLabel: 'Refugio County unidentified woman public case facts',
    accessLevel: 'public',
    reliability: 'high',
    notes: 'Seeded from the supplied public facts only.',
  },
];

const evidence: IdentityEvidenceItem[] = [
  {
    id: 'E_CASE_FACTS',
    title: 'Official case facts',
    description: 'Remains discovered March 2, 1992 on a ranch along FM 2678 approximately four miles east of Refugio, covered or concealed by dense brush.',
    category: 'context',
    provenance,
    accessLevel: 'public',
  },
  {
    id: 'E_PROFILE',
    title: 'Biological profile estimate',
    description: 'Estimated female, between 20 and 35 years old, approximately 5 feet 3 inches, broad ancestry estimate white or Hispanic.',
    category: 'context',
    provenance,
    accessLevel: 'public',
  },
  {
    id: 'E_CLOTHING',
    title: 'Reported clothing',
    description: 'Long coat, black leotards, short black dress, red belt, white knee-high boots, and one red earring.',
    category: 'clothing',
    provenance,
    accessLevel: 'public',
  },
];

const searchProfiles: IdentitySearchProfile[] = [
  {
    profileId: 'P_LOCAL',
    title: 'Local or regional resident',
    profileClass: 'local_or_regional_resident',
    description: 'The recovery site and timeframe make local or regional records relevant.',
    analyticalWeight: 0.7,
    weightInterval: [0.55, 0.84],
    supportingEvidenceIds: ['E_CASE_FACTS', 'E_PROFILE'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: ['U_DNA'],
    requiredAssumptions: ['The remains were not moved far from the recovery site before concealment.'],
    recordsNeeded: ['Refugio County missing-person records', 'Adjacent South Texas county records'],
    jurisdictionsToSearch: ['Refugio County', 'adjacent South Texas counties'],
    expectedInformationGain: 'high',
    internalInformationGainScore: 0.72,
    evidenceThatWouldWeakenProfile: ['No local or regional record is found after review'],
    limitations: ['No named candidate records have been entered.'],
  },
  {
    profileId: 'P_TRANSIENT',
    title: 'Transient or traveler',
    profileClass: 'transient_or_traveler',
    description: 'A transient or traveler may be outside local coverage.',
    analyticalWeight: 0.45,
    weightInterval: [0.3, 0.6],
    supportingEvidenceIds: ['E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknownEvidenceIds: ['U_DNA', 'U_DENTAL'],
    requiredAssumptions: ['The person may have traveled or remained outside local databases.'],
    recordsNeeded: ['Statewide Texas missing-person repositories', 'National or cross-border databases where legally authorized'],
    jurisdictionsToSearch: ['Texas statewide', 'neighboring states', 'international cross-border records'],
    expectedInformationGain: 'moderate',
    internalInformationGainScore: 0.68,
    evidenceThatWouldWeakenProfile: ['No plausible travel record exists'],
    limitations: ['No public evidence confirms travel.'],
  },
];

const informationGain: InformationGainAssessment = {
  qualitative: 'very_high',
  internalScore: 0.95,
  scoreInterval: [0.79, 0.97],
  scoringVersion: 'identity-v1',
  basis: [
    {
      factor: 'evidence availability',
      contribution: 0.35,
      explanation: 'A usable biological specimen could materially differentiate identity candidates.',
      evidenceIds: ['E_CASE_FACTS'],
      assumptions: ['The remains have retained usable material.'],
    },
  ],
  sensitivity: [],
  limitations: ['The current case facts do not confirm specimen availability.'],
};

const forensicActions: IdentificationAction[] = [
  {
    id: 'A_DNA',
    title: 'Confirm whether a usable DNA profile exists',
    category: 'dna',
    purpose: 'Establish whether a biological comparison can discriminate among candidate records.',
    whyItMatters: ['DNA can materially reduce uncertainty without asserting identity.'],
    expectedInformationGain: 0.95,
    candidateDiscrimination: 0.9,
    prerequisites: ['Archived biological material', 'Authorized access'],
    availability: 'unknown',
    alreadyAttemptedStatus: 'Not entered',
    costClass: 'high',
    timeClass: 'months',
    authorizationRequired: ['Authorized investigator'],
    limitations: ['Evidence condition is unknown.'],
    uncertainty: ['DNA profile status is unknown.'],
    actionType: 'forensic',
    informationGain,
    canIdentifyOrPrioritize: ['Provide a high-value comparison route if a profile exists.'],
    canExclude: ['Eliminate some candidates if the profile is available.'],
    cannotEstablish: ['A DNA result alone does not establish identity without context.'],
    positiveResultNextSteps: ['Move to direct candidate comparison and investigator review.'],
    negativeResultNextSteps: ['Preserve the residual candidate-set posture and pursue other comparators.'],
    unknownAvailabilityNextSteps: ['Request specimen review and chain-of-custody confirmation.'],
    supportingEvidenceIds: ['E_CASE_FACTS', 'E_PROFILE'],
    assumptions: ['A suitable biological sample exists or can be recovered.'],
  },
  {
    id: 'A_DENTAL',
    title: 'Review dental-chart comparison',
    category: 'dental',
    purpose: 'Test whether available dental records can be compared with the remains.',
    whyItMatters: ['Dental records can provide a strong comparative route.'],
    expectedInformationGain: 0.83,
    candidateDiscrimination: 0.8,
    prerequisites: ['Dental records or radiographs'],
    availability: 'unknown',
    alreadyAttemptedStatus: 'Not entered',
    costClass: 'moderate',
    timeClass: 'weeks',
    authorizationRequired: ['Authorized investigator'],
    limitations: ['Availability is unknown.'],
    uncertainty: ['Dental record availability is unknown.'],
    actionType: 'forensic',
    informationGain: {
      ...informationGain,
      qualitative: 'high',
      internalScore: 0.83,
      scoreInterval: [0.62, 0.9],
      basis: [
        {
          factor: 'record availability',
          contribution: 0.55,
          explanation: 'Dental records are useful if they can be located and compared.',
          evidenceIds: ['E_CASE_FACTS'],
          assumptions: ['Records may exist in the jurisdiction or in private practices.'],
        },
      ],
      limitations: ['The public dataset does not confirm dental record availability.'],
    },
    canIdentifyOrPrioritize: ['Prioritize candidates with matching dental anatomy.'],
    canExclude: ['Exclude candidates whose records conflict.'],
    cannotEstablish: ['A dental comparison alone does not prove identity.'],
    positiveResultNextSteps: ['Continue focused candidate review.'],
    negativeResultNextSteps: ['Hold the profile but continue record reconciliation.'],
    unknownAvailabilityNextSteps: ['Request records searches from local and regional providers.'],
    supportingEvidenceIds: ['E_CASE_FACTS'],
    assumptions: ['Dental records exist or are accessible.'],
  },
];

const recordsActions: RecordsSearchAction[] = [
  {
    id: 'R_NAMUS',
    title: 'Reconcile NamUs and agency records',
    category: 'records',
    purpose: 'Reconcile candidate records across agency repositories and public databases.',
    whyItMatters: ['Record reconciliation can find aliases, duplicates, or missing candidate classes.'],
    expectedInformationGain: 0.78,
    candidateDiscrimination: 0.7,
    prerequisites: ['Candidate records and aliases'],
    availability: 'possibly_available',
    alreadyAttemptedStatus: 'Not entered',
    costClass: 'low',
    timeClass: 'weeks',
    authorizationRequired: ['Authorized investigator'],
    limitations: ['Access depends on agency permissions.'],
    uncertainty: ['Record scope is not yet known.'],
    sourceSystem: 'NamUs',
    informationGain: {
      ...informationGain,
      qualitative: 'high',
      internalScore: 0.78,
      scoreInterval: [0.62, 0.9],
      basis: [{ factor: 'record coverage', contribution: 0.6, explanation: 'Broader record coverage can reduce residual candidate-set weight.', evidenceIds: ['E_CASE_FACTS'], assumptions: ['Records are available across the relevant jurisdictions.'] }],
      limitations: ['The public build cannot verify agency-level access.'],
    },
    canIdentifyOrPrioritize: ['Prioritize a record that fits the profile.'],
    canExclude: ['Exclude duplicates or implausible records.'],
    cannotEstablish: ['Records alone cannot prove identity.'],
    positiveResultNextSteps: ['Continue to forensic comparison if the candidate remains viable.'],
    negativeResultNextSteps: ['Preserve outside-candidate-set reasoning.'],
    unknownAvailabilityNextSteps: ['Request repository access and verify coverage.'],
    supportingEvidenceIds: ['E_CASE_FACTS'],
    assumptions: ['The relevant repositories can be queried.'],
  },
];

const outreachActions: OutreachAction[] = [
  {
    id: 'O_PUBLIC_BRIEF',
    title: 'Publish a public lead brief with guarded wording',
    category: 'public_outreach',
    purpose: 'Solicit leads while protecting the case from unsupported identification claims.',
    whyItMatters: ['A guarded brief can surface leads without over-asserting identity.'],
    expectedInformationGain: 0.64,
    candidateDiscrimination: 0.35,
    prerequisites: ['Approved summary'],
    availability: 'confirmed_available',
    alreadyAttemptedStatus: 'Not entered',
    costClass: 'moderate',
    timeClass: 'weeks',
    authorizationRequired: ['Agency public information review'],
    limitations: ['No names or speculative identities should be published.'],
    uncertainty: ['Public response is unknown.'],
    audience: 'general public',
    informationGain: {
      ...informationGain,
      qualitative: 'moderate',
      internalScore: 0.64,
      scoreInterval: [0.4, 0.7],
      basis: [{ factor: 'community response', contribution: 0.45, explanation: 'Public response can generate leads if the brief is appropriately scoped.', evidenceIds: ['E_CASE_FACTS'], assumptions: ['The public can understand the summary and respond.'] }],
      limitations: ['Response volume and quality are uncertain.'],
    },
    canIdentifyOrPrioritize: ['Surface new information for review.'],
    canExclude: ['Rule out duplicate or unhelpful leads after review.'],
    cannotEstablish: ['Public tips do not establish identity.'],
    positiveResultNextSteps: ['Route quality leads to investigator review.'],
    negativeResultNextSteps: ['Continue with records and forensic follow-up.'],
    unknownAvailabilityNextSteps: ['Coordinate public information review and public release.'],
    supportingEvidenceIds: ['E_CASE_FACTS'],
    assumptions: ['The brief is approved and legally appropriate.'],
  },
];

const reconstructionQuestions: BoundedReconstructionQuestion[] = [
  {
    id: 'Q_DEATH_LOCATION',
    prompt: 'Did death occur at the recovery site or elsewhere?',
    facts: ['Remains were discovered on a ranch near FM 2678.'],
    supportingEvidenceIds: ['E_CASE_FACTS'],
    contradictingEvidenceIds: [],
    unknowns: ['The scene documentation is not supplied in this public build.'],
    assumptions: ['Public facts remain incomplete.'],
    requiredEvidence: ['Recovery-scene documentation', 'Anthropological findings'],
    currentAnswerability: 'currently_unanswerable',
    limitations: ['The public facts remain limited.'],
  },
];

const unknowns: UnknownRegistryItem[] = [
  {
    id: 'U_DNA',
    title: 'DNA profile status',
    detail: 'The system does not presently contain a confirmed DNA profile status.',
    impact: 'high',
  },
  {
    id: 'U_DENTAL',
    title: 'Dental record availability',
    detail: 'Dental chart availability is unknown.',
    impact: 'high',
  },
];

const criticalUnknowns: CriticalUnknown[] = [
  {
    id: 'U_CRITICAL_DNA',
    title: 'DNA profile status',
    whyItMatters: 'A usable DNA profile would materially improve the ability to discriminate among candidates.',
    currentStatus: 'unknown',
    expectedInformationGain: 'very_high',
    blocksConclusions: ['Candidate prioritization', 'Exclusion of records that are otherwise plausible'],
    actionToResolve: 'Confirm whether archived biological material exists and can be assessed.',
    responsibleSource: 'forensic_laboratory',
    accessLevel: 'restricted',
    evidenceIds: ['E_CASE_FACTS'],
  },
];

const coverageMetrics: CandidateCoverageMetrics = {
  namedCandidatesEntered: 0,
  publicRecordsReviewed: 0,
  investigatorCandidatesEntered: 0,
  verifiedExclusions: 0,
  possibleDuplicates: 0,
  jurisdictionsSearched: 2,
  databasesSearched: 1,
  recordCoverageStatus: 'partial',
};

const recordSearchCoverage: RecordSearchCoverage[] = [
  {
    scopeId: 'R_SCOPE_REFUGIO',
    scopeName: 'Refugio County and adjacent South Texas counties',
    status: 'partial',
    systemsOrRepositories: ['NamUs', 'agency records repositories'],
    dateRange: { start: '1989-01-01', end: '1992-03-02' },
    searchTermsOrConstraints: ['female', 'missing person', 'unidentified remains', 'Refugio County'],
    candidateCountReturned: 0,
    recordsReviewed: 0,
    limitations: ['No public evidence confirms the full scope of historical record review.'],
    provenance,
  },
];

const humanReviewDecisions: HumanReviewDecision[] = [
  {
    id: 'HR_DEFAULT',
    reviewerRole: 'case analyst',
    timestamp: '2024-01-01',
    subjectType: 'action',
    subjectId: 'A_DNA',
    decision: 'accepted_for_followup',
    rationale: 'DNA review remains the highest-value next action but requires human review before any conclusion.',
    evidenceIds: ['E_CASE_FACTS'],
  },
];

export const REFUGIO_CASE: IdentityCase = {
  id: 'TX_REFUGIO_UNIDENTIFIED_WOMAN_1992',
  title: 'Refugio County Unidentified Woman',
  accessMode: 'public_analysis',
  jurisdiction: 'Refugio County / Texas law-enforcement and medical examiner channels',
  discovery: {
    discoveredOn: 'March 2, 1992',
    locationDescription: 'Ranch along FM 2678, approximately four miles east of Refugio',
    recoveryContext: 'Remains reportedly covered or concealed by dense brush.',
  },
  biologicalProfile: {
    sex: 'female',
    estimatedAge: '20–35',
    estimatedHeight: 'approximately 5 feet 3 inches',
    ancestryEstimate: 'white or Hispanic',
  },
  deathContext: {
    causeOfDeath: 'gunshot wound',
    approximateDeathInterval: 'approximately 1989–1991',
    discoveredRemains: 'believed to have been present approximately one to three years before discovery',
  },
  clothingItems: [
    { item: 'long coat' },
    { item: 'black leotards' },
    { item: 'short black dress' },
    { item: 'red belt' },
    { item: 'white knee-high boots' },
    { item: 'one red earring' },
  ],
  reconstruction: {
    updatedIn: '2020',
    hairstyleUncertain: true,
    hairColorUncertain: true,
    eyeColorUncertain: true,
    note: 'Soft-tissue reconstruction is approximate and does not establish identity.',
  },
  evidence,
  candidateRecords: [],
  searchProfiles,
  forensicActions,
  recordsActions,
  outreachActions,
  reconstructionQuestions,
  unknowns,
  guardrails: [
    'This system does not independently identify the woman.',
    'Visual resemblance is not identification.',
    'Demographic compatibility is not identification.',
    'Clothing similarity is not identification.',
    'A model score is not forensic evidence.',
    'All conclusions require qualified human review.',
  ],
  outsideCurrentCandidateSet: {
    preserved: true,
    analyticalWeight: 0.55,
    weightInterval: [0.4, 0.7],
    reasons: ['The correct identity may be outside the current candidate set.'],
  },
  provenance,
  criticalUnknowns,
  coverageMetrics,
  recordSearchCoverage,
  humanReviewDecisions,
};

export const REFUGIO_CASE_RECORD = {
  ...REFUGIO_CASE,
  identityCase: REFUGIO_CASE,
};
