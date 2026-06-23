import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { MetricsService } from "./infrastructure/metrics.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.get(MetricsService).enableDefaultMetrics();
  const port = process.env.PORT ?? "4002";
  await app.listen(port, "0.0.0.0");
  console.log(`Wallets service running on port ${port}`);
}

bootstrap();
