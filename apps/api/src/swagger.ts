import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Personal Expenses & Inflation Tracker API')
    .setDescription(
      'REST API for logging purchases and tracking spend and per-product inflation over time.',
    )
    .setVersion('0.1.0')
    .addCookieAuth('token', { type: 'apiKey', in: 'cookie', name: 'token' })
    .build();

  return SwaggerModule.createDocument(app, config);
}
