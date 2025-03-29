import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',  // Allow requests from all origins, you can limit this to specific origins
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',  // Allow these methods
    allowedHeaders: 'Content-Type, Authorization',  // Allow specific headers
  });
  
  // Enable global validation using class-validator
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Satellite Heatmap API')
    .setDescription('API for retrieving and filtering satellite data from keeptrack.space')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
}
bootstrap();
