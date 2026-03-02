export type AuditLabel = 'likely_real' | 'uncertain' | 'likely_ai';

export interface EasyChecks {
  hasExif: boolean;
  hasXmp: boolean;
  aiSoftwareSignature: boolean;
  isPerfectSquare: boolean;
  suspectResolution: boolean;
  verySmallImage: boolean;
}

export interface TextureAnalysisResult {
  score: number; // 0..85 (heuristic)
  metrics: {
    laplacianVariance: number;
    edgeMean: number;
    edgeStd: number;
    entropy: number;
    width: number;
    height: number;
  };
  signals: string[];
}

export interface FullImageAuditResponse {
  riskScore: number; // 0..100
  label: AuditLabel;
  isRejected: boolean;
  pHash: string | null;
  details: {
    metadata: {
      flags: EasyChecks;
      format: string | null;
      size: string | null;
      hasExif: boolean;
      hasXmp: boolean;
    };
    texture: TextureAnalysisResult;
  };
  reasons: string[];
}