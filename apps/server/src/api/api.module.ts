import { Module, type DynamicModule } from "@nestjs/common";

import type { RuntimeEnvironment } from "../config/environment.js";
import { RuntimeConfigModule } from "../config/runtime-config.module.js";
import { AuthModule } from "../modules/auth/auth.module.js";
import { BookModule } from "../modules/book/book.module.js";
import { HealthModule } from "../modules/health/health.module.js";
import { ProfileModule } from "../modules/profile/profile.module.js";
import { RoomModule } from "../modules/room/room.module.js";
import { SessionModule } from "../modules/session/session.module.js";
import { DiscussionResultApiModule } from "../modules/discussion-result/discussion-result-api.module.js";
import { BookBuilderAdminModule } from "../modules/book-builder-admin/book-builder-admin.module.js";
import { AccountModule } from "../modules/account/account.module.js";

@Module({})
export class ApiModule {
  public static register(environment: RuntimeEnvironment): DynamicModule {
    return {
      module: ApiModule,
      imports: [
        RuntimeConfigModule.forRoot(environment),
        AuthModule,
        BookModule,
        HealthModule,
        ProfileModule,
        RoomModule,
        SessionModule,
        DiscussionResultApiModule,
        BookBuilderAdminModule,
        AccountModule,
      ],
    };
  }
}
