import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Casino Security API')
    .setDescription('מערכת לזיהוי פיוקטיביים ואימות תמונות AI')
    .setVersion('1.0')
    .addTag('Security')
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // התיעוד יהיה זמין בכתובת /api

  await app.listen(3000);
}
bootstrap();