import { CircleAlert, RotateCcw } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";

import { BrandLogo } from "../components/ui/brand-logo";
import { Button } from "../components/ui/button";

export function AppRouteErrorBoundary() {
  useRouteError();
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-5 py-10">
      <section className="grid w-full max-w-md justify-items-start gap-5 rounded-xl border border-border bg-surface-elevated p-6 shadow-[var(--shadow-low)] sm:p-8">
        <BrandLogo />
        <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive"><CircleAlert aria-hidden="true" /></span>
        <div>
          <h1 className="text-page-title m-0">화면을 열지 못했습니다</h1>
          <p className="text-body mb-0 mt-2 text-muted-foreground">입력한 내용은 다시 확인해 주세요. 문제가 계속되면 잠시 후 다시 시도해 주세요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => window.location.reload()}><RotateCcw aria-hidden="true" />다시 불러오기</Button>
          <Button asChild><Link to="/">홈으로</Link></Button>
        </div>
      </section>
    </main>
  );
}
