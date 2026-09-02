import { Inject, Injectable } from "@nestjs/common";

import {
  BookBuilderDraftV1Schema,
  BookBuilderResearchV1Schema,
  type BookBuilderDraftV1,
  type BookBuilderInputV1,
  type BookBuilderResearchV1,
} from "@bookseasoning/contracts/internal";

import {
  AI_GATEWAY,
  type AiGateway,
} from "../ai-provider/ai-gateway.js";
import type {
  BookBuilderStageResult,
  ClaimedBookBuilderJob,
} from "./book-builder.queue.js";
import {
  bookBuilderDraftTask,
  bookBuilderResearchTask,
} from "./book-builder.tasks.js";

export class BookBuilderApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "BookBuilderApplicationError";
  }
}

@Injectable()
export class BookBuilderService {
  public constructor(
    @Inject(AI_GATEWAY) private readonly gateway: AiGateway,
  ) {}

  public async run(
    job: ClaimedBookBuilderJob,
    input: BookBuilderInputV1,
  ): Promise<BookBuilderStageResult> {
    if (
      input.jobId !== job.jobId ||
      input.runId !== job.runId ||
      input.packVersionId !== job.packVersionId ||
      input.stage !== job.stage ||
      input.expectedRevision !== job.expectedRevision
    ) {
      throw new BookBuilderApplicationError("BOOK_BUILDER_INPUT_MISMATCH", false);
    }
    switch (job.stage) {
      case "IDENTIFY_BOOK":
        return {
          schemaVersion: "book-builder-identity.v1",
          artifact: {
            schemaVersion: "book-builder-identity.v1",
            book: input.draft.book,
          },
          providerRun: null,
        };
      case "DISCOVER_SOURCES": {
        const generated = await this.gateway.generate(bookBuilderResearchTask, {
          book: input.draft.book,
          existingDraft: input.draft,
          researchedAt: new Date().toISOString(),
        });
        const research = BookBuilderResearchV1Schema.parse(generated.output);
        this.assertResearchReferences(research);
        return {
          schemaVersion: research.schemaVersion,
          artifact: research,
          providerRun: generated.run,
        };
      }
      case "CAPTURE_SOURCE_METADATA":
      case "EXTRACT_CLAIMS":
      case "CROSS_VALIDATE": {
        const research = this.latestResearch(input);
        this.assertResearchReferences(research);
        return {
          schemaVersion: research.schemaVersion,
          artifact: research,
          providerRun: null,
        };
      }
      case "BUILD_SECTIONS": {
        const research = this.latestResearch(input);
        const generated = await this.gateway.generate(bookBuilderDraftTask, {
          research,
          existingDraft: input.draft,
          regeneration: {
            scope: input.scope,
            targetItemId: input.targetItemId,
          },
        });
        const draft = BookBuilderDraftV1Schema.parse(generated.output);
        if (input.scope === "ITEM" && input.targetItemId !== null) {
          this.assertItemRegenerationIsScoped(
            input.draft,
            draft,
            input.targetItemId,
          );
        }
        return {
          schemaVersion: draft.schemaVersion,
          artifact: draft,
          providerRun: generated.run,
        };
      }
      case "VALIDATE_DRAFT": {
        const draft = this.latestDraft(input);
        return {
          schemaVersion: draft.schemaVersion,
          artifact: draft,
          providerRun: null,
        };
      }
    }
  }

  private latestResearch(input: BookBuilderInputV1): BookBuilderResearchV1 {
    const artifact = [...input.artifacts]
      .reverse()
      .find((item) => item["schemaVersion"] === "book-builder-research.v1");
    const result = BookBuilderResearchV1Schema.safeParse(artifact);
    if (!result.success) {
      throw new BookBuilderApplicationError("BOOK_BUILDER_RESEARCH_MISSING", false);
    }
    return result.data;
  }

  private latestDraft(input: BookBuilderInputV1): BookBuilderDraftV1 {
    const artifact = [...input.artifacts]
      .reverse()
      .find((item) => item["schemaVersion"] === "book-builder-draft.v1");
    const result = BookBuilderDraftV1Schema.safeParse(artifact);
    if (!result.success) {
      throw new BookBuilderApplicationError("BOOK_BUILDER_DRAFT_INVALID", false);
    }
    return result.data;
  }

  private assertResearchReferences(research: BookBuilderResearchV1): void {
    const sourceIds = new Set(research.sources.map((source) => source.sourceId));
    if (
      research.claims.some((claim) =>
        claim.evidence.some((evidence) => !sourceIds.has(evidence.sourceId)),
      )
    ) {
      throw new BookBuilderApplicationError(
        "BOOK_BUILDER_EVIDENCE_REFERENCE_INVALID",
        true,
      );
    }
  }

  private assertItemRegenerationIsScoped(
    current: BookBuilderDraftV1,
    proposed: BookBuilderDraftV1,
    targetItemId: string,
  ): void {
    const currentItems = current.sections.flatMap((section) => section.items);
    const proposedItems = proposed.sections.flatMap((section) => section.items);
    const currentTarget = currentItems.find((item) => item.itemId === targetItemId);
    const proposedTarget = proposedItems.find((item) => item.itemId === targetItemId);
    const unchangedCurrent = currentItems.filter((item) => item.itemId !== targetItemId);
    const unchangedProposed = proposedItems.filter((item) => item.itemId !== targetItemId);
    const sectionShape = (section: BookBuilderDraftV1["sections"][number]) => ({
      sectionId: section.sectionId,
      code: section.code,
      displayOrder: section.displayOrder,
      coverage: section.coverage,
      reviewStatus: section.reviewStatus,
    });
    const currentSectionShape = current.sections.map(sectionShape);
    const proposedSectionShape = proposed.sections.map(sectionShape);
    if (
      currentTarget === undefined ||
      proposedTarget === undefined ||
      JSON.stringify(current.book) !== JSON.stringify(proposed.book) ||
      JSON.stringify(currentSectionShape) !== JSON.stringify(proposedSectionShape) ||
      JSON.stringify(unchangedCurrent) !== JSON.stringify(unchangedProposed)
    ) {
      throw new BookBuilderApplicationError(
        "BOOK_BUILDER_ITEM_SCOPE_VIOLATION",
        true,
      );
    }
  }
}
