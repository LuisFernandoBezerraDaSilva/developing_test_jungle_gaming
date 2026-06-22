import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { IoAdapter } from "@nestjs/platform-socket.io";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const port = process.env.PORT ?? "4001";
  await app.listen(port, "0.0.0.0");
  console.log(`Games service running on port ${port}`);
}

bootstrap();
