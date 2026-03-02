import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import phash from 'sharp-phash';
import { AuditLabel, EasyChecks, FullImageAuditResponse, TextureAnalysisResult } from './image-verification.types';

interface FinalDecision {
  totalScore: number;
  label: AuditLabel;
  isRejected: boolean;
  reasons: string[];
}

@Injectable()
export class UnifiedSecurityService {
  private readonly logger = new Logger(UnifiedSecurityService.name);

  async fullImageAudit(file: Express.Multer.File): Promise<FullImageAuditResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing image buffer');
    }

    const buffer = file.buffer;
    const metadata = await sharp(buffer).metadata();

    // 1) Easy checks (metadata + geometry)
    const easyChecks = this.runEasyChecks(metadata);

    // ✅ Business rule:
    // If EXIF exists -> treat as non-AI and stop immediately
    if (easyChecks.hasExif) {
      return {
        riskScore: 0,
        label: 'likely_real',
        isRejected: false,
        pHash: null, // אם תרצי dedup גם פה, אפשר לחשב
        details: {
          metadata: {
            flags: easyChecks,
            format: metadata.format ?? null,
            size:
              metadata.width && metadata.height
                ? `${metadata.width}x${metadata.height}`
                : null,
            hasExif: !!metadata.exif,
            hasXmp: !!metadata.xmp,
          },
          texture: this.createSkippedTextureResult(
            'EXIF metadata exists → skipped AI heuristic analysis',
          ),
        },
        reasons: ['EXIF metadata exists (business rule: treat as non-AI)'],
      };
    }

    // 2) pHash (only if no EXIF and we continue)
    let imageHash: string | null = null;
    try {
      imageHash = (await phash(buffer)) as unknown as string;
    } catch (e) {
      this.logger.warn(`pHash failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3) Texture / edge analysis
    const texture = await this.analyzeTextureAndEdges(buffer);

    // 4) Decision engine (EXIF is NOT part of score)
    const finalReport = this.weighResults(easyChecks, texture);

    return {
      riskScore: finalReport.totalScore,
      label: finalReport.label,
      isRejected: finalReport.isRejected,
      pHash: imageHash,
      details: {
        metadata: {
          flags: easyChecks,
          format: metadata.format ?? null,
          size:
            metadata.width && metadata.height
              ? `${metadata.width}x${metadata.height}`
              : null,
          hasExif: !!metadata.exif,
          hasXmp: !!metadata.xmp,
        },
        texture,
      },
      reasons: finalReport.reasons,
    };
  }

  // --- Stage 1: Metadata & Geometry ---
  private runEasyChecks(meta: sharp.Metadata): EasyChecks {
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;

    const suspectSizes = new Set([512, 768, 1024, 1536, 2048]);

    const flags: EasyChecks = {
      hasExif: !!meta.exif,
      hasXmp: !!meta.xmp,
      aiSoftwareSignature: false,
      isPerfectSquare: width > 0 && height > 0 && width === height,
      suspectResolution:
        (width > 0 && suspectSizes.has(width)) ||
        (height > 0 && suspectSizes.has(height)),
      verySmallImage: width > 0 && height > 0 && (width < 256 || height < 256),
    };

    if (meta.xmp || meta.exif) {
      const dataString =
        `${meta.xmp?.toString('utf8') || ''} ${meta.exif?.toString('utf8') || ''}`.toLowerCase();

      const aiTerms = [
        'midjourney',
        'stable diffusion',
        'stable-diffusion',
        'sdxl',
        'dall-e',
        'dalle',
        'adobe firefly',
        'firefly',
        'comfyui',
        'automatic1111',
        'invokeai',
        'leonardo.ai',
        'ideogram',
      ];

      flags.aiSoftwareSignature = aiTerms.some((term) => dataString.includes(term));
    }

    return flags;
  }

  private createSkippedTextureResult(reason: string): TextureAnalysisResult {
    return {
      score: 0,
      metrics: {
        laplacianVariance: 0,
        edgeMean: 0,
        edgeStd: 0,
        entropy: 0,
        width: 0,
        height: 0,
      },
      signals: [reason],
    };
  }

  // --- Stage 2: Texture + Edge analysis (heuristic) ---
  private async analyzeTextureAndEdges(buffer: Buffer): Promise<TextureAnalysisResult> {
    try {
      const { data, info } = await sharp(buffer)
        .rotate()
        .removeAlpha()
        .resize(256, 256, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const width = info.width;
      const height = info.height;

      const img = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) {
        img[i] = data[i] / 255;
      }

      const idx = (x: number, y: number) => y * width + x;

      let lapSum = 0;
      let lapSumSq = 0;
      let lapCount = 0;

      let edgeSum = 0;
      let edgeSumSq = 0;
      let edgeCount = 0;

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const c = img[idx(x, y)];

          // Laplacian (4-neighbor)
          const lap =
            4 * c -
            img[idx(x - 1, y)] -
            img[idx(x + 1, y)] -
            img[idx(x, y - 1)] -
            img[idx(x, y + 1)];

          lapSum += lap;
          lapSumSq += lap * lap;
          lapCount++;

          // Sobel
          const gx =
            -img[idx(x - 1, y - 1)] + img[idx(x + 1, y - 1)] +
            -2 * img[idx(x - 1, y)] + 2 * img[idx(x + 1, y)] +
            -img[idx(x - 1, y + 1)] + img[idx(x + 1, y + 1)];

          const gy =
            -img[idx(x - 1, y - 1)] - 2 * img[idx(x, y - 1)] - img[idx(x + 1, y - 1)] +
             img[idx(x - 1, y + 1)] + 2 * img[idx(x, y + 1)] + img[idx(x + 1, y + 1)];

          const edge = Math.hypot(gx, gy);

          edgeSum += edge;
          edgeSumSq += edge * edge;
          edgeCount++;
        }
      }

      const lapMean = lapCount ? lapSum / lapCount : 0;
      const lapVar = lapCount ? (lapSumSq / lapCount) - lapMean * lapMean : 0;

      const edgeMean = edgeCount ? edgeSum / edgeCount : 0;
      const edgeVar = edgeCount ? (edgeSumSq / edgeCount) - edgeMean * edgeMean : 0;
      const edgeStd = Math.sqrt(Math.max(edgeVar, 0));

      // Entropy
      const hist = new Uint32Array(256);
      for (let i = 0; i < data.length; i++) hist[data[i]]++;

      let entropy = 0;
      const total = data.length;
      for (let i = 0; i < 256; i++) {
        const count = hist[i];
        if (!count) continue;
        const p = count / total;
        entropy -= p * Math.log2(p);
      }

      // Aggressive heuristic scoring (tuned to flag more candidates)
      let score = 0;
      const signals: string[] = [];

      if (lapVar < 0.003) {
        score += 25;
        signals.push('Low texture variance (smooth synthetic-like surfaces)');
      }

      if (lapVar > 0.018) {
        score += 20;
        signals.push('High texture variance (possible synthetic artifacts)');
      }

      if (edgeMean < 0.11) {
        score += 18;
        signals.push('Low average edge strength');
      }

      if (edgeMean > 0.28) {
        score += 16;
        signals.push('High average edge strength / oversharpening');
      }

      if (edgeStd > 0.3) {
        score += 12;
        signals.push('High edge variability');
      }

      if (entropy < 5.0) {
        score += 10;
        signals.push('Low grayscale entropy');
      } else if (entropy > 7.5) {
        score += 10;
        signals.push('Very high grayscale entropy');
      }

      return {
        score: Math.min(Math.round(score), 85),
        metrics: {
          laplacianVariance: Number(lapVar.toFixed(6)),
          edgeMean: Number(edgeMean.toFixed(6)),
          edgeStd: Number(edgeStd.toFixed(6)),
          entropy: Number(entropy.toFixed(4)),
          width,
          height,
        },
        signals,
      };
    } catch (e) {
      this.logger.warn(
        `Texture/edge analysis failed: ${e instanceof Error ? e.message : String(e)}`,
      );

      return {
        score: 50, // neutral-ish fallback
        metrics: {
          laplacianVariance: 0,
          edgeMean: 0,
          edgeStd: 0,
          entropy: 0,
          width: 0,
          height: 0,
        },
        signals: ['Texture analysis failed (fallback score applied)'],
      };
    }
  }

  // --- Stage 3: Decision Engine (EXIF is NOT part of score) ---
  private weighResults(easy: EasyChecks, texture: TextureAnalysisResult): FinalDecision {
    let score = 0;
    const reasons: string[] = [];

    // Strong metadata signal (XMP/EXIF strings may contain generator names)
    if (easy.aiSoftwareSignature) {
      score += 90;
      reasons.push('AI-related metadata signature detected');
    }

    // Geometry hints (weak/medium)
    if (easy.isPerfectSquare && easy.suspectResolution) {
      score += 15;
      reasons.push('Square image with common generated-like resolution');
    } else if (easy.suspectResolution) {
      score += 8;
      reasons.push('Common generation-like resolution');
    }

    if (easy.verySmallImage) {
      score += 6;
      reasons.push('Very small image size reduces confidence');
    }

    // Main content signal
    score += texture.score;

    if (texture.signals.length) {
      reasons.push(...texture.signals);
    }

    const totalScore = Math.min(Math.round(score), 100);

    let label: AuditLabel;
    if (totalScore >= 50) label = 'likely_ai';
    else if (totalScore >= 25) label = 'uncertain';
    else label = 'likely_real';

    return {
      totalScore,
      label,
      isRejected: totalScore >= 55,
      reasons,
    };
  }

  async checkExifOnly(file: Express.Multer.File): Promise<{
    hasExif: boolean;
    format: string | null;
    size: string | null;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing image buffer');
    }

    const metadata = await sharp(file.buffer).metadata();

    return {
      hasExif: !!metadata.exif,
      format: metadata.format ?? null,
      size:
        metadata.width && metadata.height
          ? `${metadata.width}x${metadata.height}`
          : null,
    };
  }
}