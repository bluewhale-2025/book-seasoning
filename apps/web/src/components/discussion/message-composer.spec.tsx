import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MessageComposer } from "./message-composer";

describe("MessageComposer", () => {
  it("does not submit while a Korean IME composition is being confirmed", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: "토론 메시지" });

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: "안녕하세요" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter", isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("안녕하세요");

    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith("안녕하세요");
    expect(textarea).toHaveValue("");
  });

  it("ignores the IME confirmation key reported with keyCode 229", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer onSubmit={onSubmit} />);
    const textarea = screen.getByRole("textbox", { name: "토론 메시지" });

    fireEvent.change(textarea, { target: { value: "토론을 시작해볼까요" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter", keyCode: 229 });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("토론을 시작해볼까요");
  });

  it("focuses the draft for a reply and lets Escape cancel it", () => {
    const onCancelReply = vi.fn();
    render(
      <MessageComposer
        replyingTo="수진"
        replyingQuote="침묵도 하나의 선택일까요?"
        onCancelReply={onCancelReply}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "토론 메시지" });

    expect(textarea).toHaveFocus();
    expect(screen.getByText("침묵도 하나의 선택일까요?")).toBeInTheDocument();
    fireEvent.keyDown(textarea, { key: "Escape", code: "Escape" });

    expect(onCancelReply).toHaveBeenCalledOnce();
  });
});
