import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";

import {
  ProfileSchema,
  UpdateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { ProfileService } from "./profile.service.js";

@Controller("v1/me/profile")
export class ProfileController {
  public constructor(
    @Inject(ProfileService)
    private readonly profileService: ProfileService,
  ) {}

  @Get()
  public async getOwnProfile(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<Profile> {
    return this.publicResponse(await this.profileService.getOwnProfile(actor));
  }

  @Patch()
  public async updateOwnProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(UpdateProfileRequestSchema))
    request: UpdateProfileRequest,
  ): Promise<Profile> {
    return this.publicResponse(
      await this.profileService.updateOwnProfile(actor, request.profileName),
    );
  }

  private publicResponse(value: unknown): Profile {
    const response = ProfileSchema.parse(value);
    assertPublicPayloadKeys(response);
    return response;
  }
}
