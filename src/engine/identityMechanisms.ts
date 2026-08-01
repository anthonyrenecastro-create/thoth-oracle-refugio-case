export interface MechanismContribution {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  unknownFields: string[];
  contribution: string;
}

export function buildMechanismContributions() {
  return [
    {
      id: 'anthropology',
      title: 'Anthropological compatibility',
      summary: 'Assess demographic compatibility without asserting an identity.',
      evidenceIds: ['E_PROFILE'],
      unknownFields: ['biologicalProfile'],
      contribution: 'Supports a broad demographic comparison priority.',
    },
    {
      id: 'records',
      title: 'Records search information gain',
      summary: 'Prioritize records and outreach tasks with the highest information gain.',
      evidenceIds: ['E_CASE_FACTS'],
      unknownFields: ['candidateRecords'],
      contribution: 'Elevates records-search action priority.',
    },
  ] as MechanismContribution[];
}
