import { HttpException, type HttpStatus } from "@nestjs/common";

export class PublicHttpException extends HttpException {
  public constructor(
    status: HttpStatus,
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly aggregateVersion?: number,
  ) {
    super(code, status);
  }
}

