import * as React from "react";
import {
  BookOpen,
  ChevronDown,
  LoaderCircle,
  MoreHorizontal,
  Settings2,
} from "lucide-react";

import { AIHostIntervention } from "./components/discussion/ai-host-intervention";
import { CurrentTopic } from "./components/discussion/current-topic";
import {
  NewMessageDivider,
  ParticipantPresence,
  TypingIndicator,
} from "./components/discussion/discussion-states";
import { MessageComposer } from "./components/discussion/message-composer";
import { ParticipantMessage } from "./components/discussion/participant-message";
import { SessionTimer } from "./components/discussion/session-timer";
import { BookContextHeader } from "./components/book/book-context-header";
import { Avatar, AvatarFallback } from "./components/ui/avatar";
import { Badge } from "./components/ui/badge";
import { BrandLogo } from "./components/ui/brand-logo";
import { Button, IconButton } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Checkbox } from "./components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Divider } from "./components/ui/divider";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Input } from "./components/ui/input";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 max-w-2xl">
      <p className="text-label mb-2 text-accent-strong">{eyebrow}</p>
      <h2 className="text-page-title m-0">{title}</h2>
      <p className="text-body mt-2 mb-0 text-muted-foreground">{description}</p>
    </div>
  );
}

function FoundationShowcase() {
  const [bookAlerts, setBookAlerts] = React.useState(true);
  const [visibility, setVisibility] = React.useState("public");

  return (
    <section id="foundation" className="py-12 sm:py-16">
      <SectionHeading
        eyebrow="Foundation"
        title="조용하지만 분명한 상호작용"
        description="강한 장식 없이도 hover, focus, selected, disabled 상태를 명확하게 구분합니다."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>Accent는 한 control group의 핵심 행동 하나에만 사용합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">토론 시작</Button>
              <Button>사전 입력 저장</Button>
              <Button variant="ghost">취소</Button>
              <Button disabled>비활성</Button>
              <Button variant="secondary" aria-busy="true">
                <LoaderCircle aria-hidden="true" className="animate-spin" />
                준비 중
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton label="토론 설정" variant="secondary">
                    <Settings2 aria-hidden="true" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>토론 설정</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    메시지 옵션
                    <ChevronDown aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>인라인 답장</DropdownMenuItem>
                  <DropdownMenuItem>링크 복사</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={bookAlerts}
                    onCheckedChange={(checked) => setBookAlerts(Boolean(checked))}
                  >
                    알림 받기
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive">세션 종료</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>세션을 종료할까요?</DialogTitle>
                    <DialogDescription>
                      종료하면 공식 토론 기록이 확정되며 이후 대화로 변경되지 않습니다.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost">계속 토론하기</Button>
                    <Button variant="destructive">세션 종료</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms</CardTitle>
            <CardDescription>최소 44px 높이와 선명한 keyboard focus를 유지합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-label">이름</span>
              <Input placeholder="토론에서 사용할 이름" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-label">이야기하고 싶은 질문</span>
              <Textarea placeholder="다른 사람들과 나누고 싶은 질문을 적어주세요." />
            </label>
            <label className="grid gap-1.5">
              <span className="text-label">책 선택</span>
              <Select defaultValue="human-acts">
                <SelectTrigger>
                  <SelectValue placeholder="책을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="human-acts">소년이 온다 · 한강</SelectItem>
                  <SelectItem value="vegetarian">채식주의자 · 한강</SelectItem>
                  <SelectItem value="bright-night">밝은 밤 · 최은영</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Choice & status</CardTitle>
            <CardDescription>상태는 색뿐 아니라 label과 control state로 전달합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <label className="text-body flex items-start gap-3">
              <Checkbox
                checked={bookAlerts}
                onCheckedChange={(checked) => setBookAlerts(Boolean(checked))}
                aria-label="토론 알림 받기"
              />
              <span>
                <span className="block font-semibold">토론 알림 받기</span>
                <span className="text-metadata block text-muted-foreground">
                  세션 시작 10분 전에 알려드려요.
                </span>
              </span>
            </label>

            <RadioGroup value={visibility} onValueChange={setVisibility} aria-label="공개 범위">
              <label className="text-body flex items-start gap-3">
                <RadioGroupItem value="public" />
                <span>
                  <span className="block font-semibold">모두에게 공개</span>
                  <span className="text-metadata block text-muted-foreground">
                    다른 참가자가 내용을 볼 수 있어요.
                  </span>
                </span>
              </label>
              <label className="text-body flex items-start gap-3">
                <RadioGroupItem value="private" />
                <span>
                  <span className="block font-semibold">AI에게만 공개</span>
                  <span className="text-metadata block text-muted-foreground">
                    원문과 작성자는 다른 참가자에게 노출되지 않아요.
                  </span>
                </span>
              </label>
            </RadioGroup>

            <Divider />

            <div className="flex flex-wrap items-center gap-2">
              <Badge>준비 중</Badge>
              <Badge variant="accent">현재 의제</Badge>
              <Badge variant="outline">6명 참여</Badge>
              <Badge variant="destructive">종료 임박</Badge>
              <Avatar>
                <AvatarFallback>수</AvatarFallback>
              </Avatar>
              <ParticipantPresence name="지윤" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time states</CardTitle>
            <CardDescription>시간 상태는 숫자, icon, 문구를 함께 사용합니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <SessionTimer remainingSeconds={1122} phase="CORE" />
            <SessionTimer remainingSeconds={282} phase="SYNTHESIS" />
            <SessionTimer remainingSeconds={0} phase="ENDED" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DiscussionShowcase() {
  const [submittedMessage, setSubmittedMessage] = React.useState<string | null>(null);

  return (
    <section id="discussion" className="py-12 sm:py-16">
      <SectionHeading
        eyebrow="Discussion"
        title="대화가 화면의 주인공"
        description="현재 책과 의제를 잃지 않으면서, 사람들의 메시지를 하나의 읽기 흐름으로 유지합니다."
      />

      <div className="mx-auto max-w-[var(--layout-shell-max)] overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex h-[var(--layout-header-height)] items-center justify-between border-b border-border bg-surface px-4 sm:px-5">
          <a href="#top" className="inline-flex items-center gap-2 text-[14px] font-bold tracking-[-0.015em]">
            <BookOpen aria-hidden="true" className="size-4 text-accent-strong" />
            책은양념
          </a>
          <div className="flex items-center gap-2">
            <Badge variant="outline">토론 중</Badge>
            <IconButton label="세션 메뉴" variant="ghost">
              <MoreHorizontal aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        <div className="mx-auto max-w-[var(--layout-conversation-max)] border-x border-border/70 bg-background max-sm:border-x-0">
          <BookContextHeader
            title="소년이 온다"
            author="한강"
            remainingSeconds={1122}
            phase="CORE"
            participantCount={6}
          />
          <CurrentTopic topic="이 장면에서 침묵은 방관일까요, 살아남기 위한 선택일까요?" />

          <div className="min-h-[540px] px-4 py-7 sm:px-6 sm:py-8">
            <ParticipantMessage author="민수" initials="민" timestamp="20:08">
              저는 침묵이 결국 폭력을 가능하게 했다는 점에서 방관에 가깝다고 생각했어요. 말하지 않는
              선택도 결과에 책임이 있으니까요.
            </ParticipantMessage>

            <ParticipantMessage
              author="수진"
              initials="수"
              timestamp="20:10"
              reply={{ author: "민수", quote: "침묵도 결과에 책임이 있다" }}
            >
              그런데 그 상황에서는 말하는 순간 살아남을 수 없었잖아요. 저는 도덕적인 판단보다 먼저
              생존의 조건을 봐야 한다고 느꼈어요.
            </ParticipantMessage>

            <ParticipantMessage
              author="수진"
              initials="수"
              timestamp="20:11"
              consecutive
            >
              특히 인물이 가족을 떠올리는 부분 때문에 더 그렇게 읽혔고요.
            </ParticipantMessage>

            <AIHostIntervention>
              두 분은 같은 침묵을 각각 책임과 생존의 문제로 보고 있네요. 판단이 갈리는 기준은 행동의
              결과일까요, 그 사람이 놓인 조건일까요?
            </AIHostIntervention>

            <NewMessageDivider />

            <ParticipantMessage author="지윤" initials="지" timestamp="20:13">
              저는 둘을 완전히 나눌 수 없다고 봐요. 살아남기 위한 침묵이었더라도, 나중에 그 선택을
              어떻게 기억하고 행동하는지가 책임과 연결될 수 있을 것 같아요.
            </ParticipantMessage>

            {submittedMessage && (
              <ParticipantMessage
                author="나"
                initials="나"
                timestamp="방금"
                className="animate-message-arrival"
              >
                {submittedMessage}
              </ParticipantMessage>
            )}

            <TypingIndicator names={["현우"]} className="mt-5" />
          </div>

          <MessageComposer
            onSubmit={(message) => setSubmittedMessage(message)}
            aria-label="토론 메시지 작성"
          />
        </div>
      </div>
    </section>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <div id="top">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex min-h-16 max-w-[var(--layout-shell-max)] items-center justify-between gap-4 px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <BrandLogo />
              <div className="hidden border-l border-border pl-3 sm:block">
                <div className="text-caption text-muted-foreground">Design System v0.2</div>
                <h1 className="text-label m-0">Bright Reading</h1>
              </div>
            </div>
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Showcase sections">
              <Button asChild variant="ghost" size="sm">
                <a href="#foundation">Foundation</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#discussion">Discussion</a>
              </Button>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-[var(--layout-shell-max)] px-4 sm:px-8">
          <section className="max-w-3xl pt-12 pb-4 sm:pt-16">
            <p className="text-label mb-3 text-accent-strong">Book as Seasoning</p>
            <h2 className="text-display m-0 break-keep">
              책보다 앞에 나서지 않고,
              <br />
              대화를 조용히 돕는 화면
            </h2>
            <p className="text-body mt-5 mb-0 max-w-2xl text-muted-foreground">
              책은 생각을 여는 양념이고, 화면의 주인공은 사람들의 말입니다. 선명한 흑백 대비와
              꼭 필요한 순간에만 쓰는 노란 강조색으로 더 가볍고 명료하게 구성했습니다.
            </p>
          </section>

          <FoundationShowcase />
          <DiscussionShowcase />
        </main>

        <footer className="mt-8 border-t border-border bg-surface">
          <div className="text-caption mx-auto max-w-[var(--layout-shell-max)] px-4 py-6 text-muted-foreground sm:px-8">
            책은양념 Design System v0.2 · Bright Reading baseline
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
