import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { BookContextModule } from "../book-context/book-context.module.js";
import { PostgresPublicContextRepository } from "./postgres-public-context.repository.js";
import { OpeningContextBuilder } from "./opening-context.builder.js";
import { PublicContextBuilder } from "./public-context.builder.js";
import { PUBLIC_CONTEXT_REPOSITORY } from "./public-context.repository.js";
import {
  PUBLIC_EVIDENCE_RESOLVER,
  PublicEvidenceReferenceResolver,
} from "./public-evidence-reference.resolver.js";

@Module({
  imports: [WorkerPostgresModule, BookContextModule],
  providers: [
    PostgresPublicContextRepository,
    {
      provide: PUBLIC_CONTEXT_REPOSITORY,
      useExisting: PostgresPublicContextRepository,
    },
    PublicContextBuilder,
    OpeningContextBuilder,
    PublicEvidenceReferenceResolver,
    {
      provide: PUBLIC_EVIDENCE_RESOLVER,
      useExisting: PublicEvidenceReferenceResolver,
    },
  ],
  exports: [
    PublicContextBuilder,
    OpeningContextBuilder,
    PublicEvidenceReferenceResolver,
    PUBLIC_EVIDENCE_RESOLVER,
  ],
})
export class AiContextModule {}
