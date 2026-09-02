import * as React from "react";
import { ProfileNameSchema } from "@bookseasoning/contracts/public";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../../app/auth-provider";
import { BrandLogo } from "../../components/ui/brand-logo";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AuthClientError } from "../../data/auth-api";

function AuthPage({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-dvh bg-surface px-5 py-8 sm:py-12">
      <div className="mx-auto grid w-full max-w-[420px] gap-8">
        <Link to="/" className="mx-auto no-underline" aria-label="책은양념 홈">
          <BrandLogo />
        </Link>
        <section className="rounded-xl border border-border bg-surface-elevated p-6 shadow-[var(--shadow-low)] sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<typeof Input> & Readonly<{ label: string; error?: string }>) {
  const errorId = `${id}-error`;
  return (
    <label htmlFor={id} className="grid gap-2 text-label">
      <span>{label}</span>
      <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />
      {error && <span id={errorId} role="alert" className="text-caption text-destructive">{error}</span>}
    </label>
  );
}

function Heading({ title, description }: Readonly<{ title: string; description?: string }>) {
  return (
    <header className="mb-7 grid gap-2">
      <h1 className="text-page-title m-0">{title}</h1>
      {description && <p className="text-body m-0 text-muted-foreground">{description}</p>}
    </header>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);
  const accountDeleted = new URLSearchParams(location.search).get("deleted") === "1";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await auth.signIn(String(data.get("email")), String(data.get("password")));
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(typeof from === "string" && from.startsWith("/") ? from : "/discussions", {
        replace: true,
      });
    } catch {
      setError("이메일 또는 비밀번호를 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage>
      <Heading title="로그인" description="책을 읽고 나눈 생각을 다시 이어가세요." />
      {accountDeleted && <p role="status" className="mb-5 rounded-lg border border-topic-border bg-topic-background p-4 text-body text-accent-strong">계정 탈퇴가 완료되었습니다.</p>}
      <form className="grid gap-5" onSubmit={submit}>
        <Field id="login-email" name="email" label="이메일" type="email" autoComplete="email" required />
        <Field id="login-password" name="password" label="비밀번호" type="password" autoComplete="current-password" required />
        {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
        <Button variant="primary" size="lg" type="submit" disabled={submitting} className="w-full">
          {submitting ? "로그인 중" : "로그인"}
        </Button>
      </form>
      <div className="mt-6 flex items-center justify-between gap-4 text-[14px]">
        <Link to="/auth/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">비밀번호 재설정</Link>
        <Link to="/auth/signup" className="font-semibold text-foreground underline-offset-4 hover:underline">회원가입</Link>
      </div>
    </AuthPage>
  );
}

export function SignUpPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = React.useState<string>();
  const [nameError, setNameError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNameError(undefined);
    const data = new FormData(event.currentTarget);
    const profileName = ProfileNameSchema.safeParse(String(data.get("profileName")));
    if (!profileName.success) {
      setNameError("프로필 이름을 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await auth.signUp({
        email: String(data.get("email")),
        password: String(data.get("password")),
        profileName: profileName.data,
      });
      navigate("/discussions", { replace: true });
    } catch (caught) {
      if (caught instanceof AuthClientError && caught.code === "EMAIL_ALREADY_EXISTS") {
        setError("이미 가입된 이메일입니다.");
      } else if (caught instanceof AuthClientError && caught.code === "WEAK_PASSWORD") {
        setError("더 안전한 비밀번호를 입력해 주세요.");
      } else {
        setError("회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage>
      <Heading title="회원가입" description="토론에서 사용할 이름으로 시작하세요." />
      <form className="grid gap-5" onSubmit={submit}>
        <Field id="signup-name" name="profileName" label="프로필 이름" autoComplete="name" required error={nameError} />
        <Field id="signup-email" name="email" label="이메일" type="email" autoComplete="email" required />
        <Field id="signup-password" name="password" label="비밀번호" type="password" autoComplete="new-password" required />
        {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
        <Button variant="primary" size="lg" type="submit" disabled={submitting} className="w-full">
          {submitting ? "계정 만드는 중" : "회원가입"}
        </Button>
      </form>
      <p className="text-body mb-0 mt-6 text-center text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link to="/auth/login" className="font-semibold text-foreground underline-offset-4 hover:underline">로그인</Link>
      </p>
    </AuthPage>
  );
}

export function ForgotPasswordPage() {
  const auth = useAuth();
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      await auth.requestPasswordReset(String(data.get("email")));
      setSent(true);
    } catch {
      setError("재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthPage>
        <div className="grid justify-items-center gap-4 py-3 text-center">
          <CheckCircle2 aria-hidden="true" className="size-8 text-accent-strong" />
          <Heading title="메일을 확인해 주세요" description="가입 여부와 관계없이 입력한 주소로 재설정 메일 전송을 요청했습니다." />
          <Button asChild variant="primary"><Link to="/auth/login">로그인으로 돌아가기</Link></Button>
        </div>
      </AuthPage>
    );
  }

  return (
    <AuthPage>
      <Link to="/auth/login" className="mb-5 inline-flex items-center gap-2 text-[14px] text-muted-foreground no-underline hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />로그인</Link>
      <Heading title="비밀번호 재설정" description="가입한 이메일로 비밀번호를 바꿀 수 있는 링크를 보내드려요." />
      <form className="grid gap-5" onSubmit={submit}>
        <Field id="reset-email" name="email" label="이메일" type="email" autoComplete="email" required />
        {error && <p role="alert" className="text-caption m-0 text-destructive">{error}</p>}
        <Button variant="primary" size="lg" type="submit" disabled={submitting} className="w-full">
          {submitting ? "보내는 중" : "재설정 메일 받기"}
        </Button>
      </form>
    </AuthPage>
  );
}

export function ResetPasswordPage() {
  const auth = useAuth();
  const exchangePasswordResetCode = auth.exchangePasswordResetCode;
  const [ready, setReady] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    window.history.replaceState(window.history.state, "", "/auth/reset");
    if (!code) {
      setError("재설정 링크가 유효하지 않습니다. 새 링크를 요청해 주세요.");
      return;
    }
    void exchangePasswordResetCode(code)
      .then(() => setReady(true))
      .catch(() => setError("재설정 링크가 만료되었거나 이미 사용되었습니다."));
  }, [exchangePasswordResetCode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== String(data.get("passwordConfirmation"))) {
      setError("비밀번호가 서로 같지 않습니다.");
      return;
    }
    setSubmitting(true);
    try {
      await auth.updatePassword(password);
      setCompleted(true);
    } catch {
      setError("비밀번호를 변경하지 못했습니다. 입력 조건을 확인해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPage>
      {completed ? (
        <div className="grid justify-items-center gap-4 py-3 text-center">
          <CheckCircle2 aria-hidden="true" className="size-8 text-accent-strong" />
          <Heading title="비밀번호를 변경했습니다" description="새 비밀번호로 계속 이용할 수 있습니다." />
          <Button asChild variant="primary"><Link to="/profile">계속하기</Link></Button>
        </div>
      ) : (
        <>
          <Heading title="새 비밀번호 설정" />
          {!ready && !error && <p role="status" className="text-body text-muted-foreground">재설정 링크를 확인하고 있습니다.</p>}
          {ready && (
            <form className="grid gap-5" onSubmit={submit}>
              <Field id="new-password" name="password" label="새 비밀번호" type="password" autoComplete="new-password" required />
              <Field id="new-password-confirmation" name="passwordConfirmation" label="새 비밀번호 확인" type="password" autoComplete="new-password" required />
              <Button variant="primary" size="lg" type="submit" disabled={submitting} className="w-full">
                {submitting ? "변경 중" : "비밀번호 변경"}
              </Button>
            </form>
          )}
          {error && (
            <div className="grid gap-4">
              <p role="alert" className="text-body m-0 text-destructive">{error}</p>
              {!ready && <Button asChild><Link to="/auth/forgot-password">새 링크 요청하기</Link></Button>}
            </div>
          )}
        </>
      )}
    </AuthPage>
  );
}
