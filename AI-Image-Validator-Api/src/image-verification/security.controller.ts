import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UnifiedSecurityService } from './unified-security.service';
import { FullImageAuditResponse } from './image-verification.types';

@ApiTags('UnifiedSecurity')
@Controller('unified-security')
export class UnifiedSecurityController {
  constructor(
    private readonly unifiedSecurityService: UnifiedSecurityService,
  ) {}

  @Post('audit-image')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = new Set([
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/tiff',
          'image/gif',
        ]);

        if (!allowedMimeTypes.has(file.mimetype)) {
          return cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`) as any,
            false,
          );
        }

        cb(null, true);
      },
    }),
  )
  async auditImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<FullImageAuditResponse> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Send multipart/form-data with field name "file".',
      );
    }

    return this.unifiedSecurityService.fullImageAudit(file);
  }

  @Post('check-exif')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = new Set([
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/tiff',
          'image/gif',
        ]);

        if (!allowedMimeTypes.has(file.mimetype)) {
          return cb(
            new BadRequestException(`Unsupported file type: ${file.mimetype}`) as any,
            false,
          );
        }

        cb(null, true);
      },
    }),
  )
  async checkExifOnly(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Send multipart/form-data with field name "file".',
      );
    }

    return this.unifiedSecurityService.checkExifOnly(file);
  }
}