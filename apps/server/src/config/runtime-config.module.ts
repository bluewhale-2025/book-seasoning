import { Global, Module, type DynamicModule } from "@nestjs/common";

import type { RuntimeEnvironment } from "./environment.js";

export const RUNTIME_ENVIRONMENT = Symbol("RUNTIME_ENVIRONMENT");

@Global()
@Module({})
export class RuntimeConfigModule {
  public static forRoot(environment: RuntimeEnvironment): DynamicModule {
    return {
      module: RuntimeConfigModule,
      providers: [{ provide: RUNTIME_ENVIRONMENT, useValue: environment }],
      exports: [RUNTIME_ENVIRONMENT],
    };
  }
}
