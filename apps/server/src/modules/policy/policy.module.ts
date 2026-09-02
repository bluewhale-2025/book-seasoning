import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { DeterministicPolicyEngine } from "./deterministic-policy.engine.js";
import { PolicyApplicationService } from "./policy-application.service.js";
import { POLICY_REPOSITORY } from "./policy.repository.js";
import { PostgresPolicyRepository } from "./postgres-policy.repository.js";

@Module({
  imports: [WorkerPostgresModule],
  providers: [
    DeterministicPolicyEngine,
    PostgresPolicyRepository,
    { provide: POLICY_REPOSITORY, useExisting: PostgresPolicyRepository },
    PolicyApplicationService,
  ],
  exports: [DeterministicPolicyEngine, PolicyApplicationService],
})
export class PolicyModule {}
