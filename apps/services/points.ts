export interface GradePoints {
  grade: string;
  points: number;
}

export interface ExamScoreRule {
  min: number;
  max: number;
  points: number;
}

export interface ExchangeRate {
  points: number;
  ratio: number;
  unit: string;
  /** @deprecated Use ratio + unit instead */
  minutes?: number;
  /** @deprecated Use ratio + unit instead */
  yuan?: number;
}

export interface CustomRule {
  id: string;
  name: string;
  type: 'earn' | 'deduct';
  points: number;
  description: string;
}

export interface Rules {
  monthlyBasePoints: number;
  minimumPointsForPrivileges: number;
  gradingScale: {
    homework: GradePoints[];
  };
  examScoreRules: ExamScoreRule[];
  exchangeRates: Record<string, ExchangeRate>;
  customRules: CustomRule[];
}

function getPointsForHomeworkGrade(rules: Rules, grade: string): number {
  const rule: GradePoints | undefined = rules.gradingScale.homework.find((g: GradePoints) => g.grade === grade);
  return rule ? rule.points : 0;
}

export function getPointsForGrade(rules: Rules, grade: string): number {
  return getPointsForHomeworkGrade(rules, grade);
}
