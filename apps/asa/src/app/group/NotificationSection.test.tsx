// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationSection } from "./NotificationSection";
import type { NotificationSettingsAdmin } from "./useNotificationSettings";

function makeAdmin(overrides: Partial<NotificationSettingsAdmin> = {}): NotificationSettingsAdmin {
  return {
    supported: true,
    loading: false,
    saving: false,
    reminderTime: "21:00",
    enabled: false,
    notifyPartnerRecord: false,
    notifyPartnerComment: false,
    setReminderTime: vi.fn(),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    setNotifyPartnerRecord: vi.fn().mockResolvedValue(undefined),
    setNotifyPartnerComment: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("NotificationSection", () => {
  afterEach(cleanup);

  it("非対応ブラウザでは案内だけを表示し、スイッチは出さない", () => {
    render(<NotificationSection admin={makeAdmin({ supported: false })} />);
    expect(screen.getByText(/プッシュ通知に対応していません/)).toBeTruthy();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("現在の設定値を反映して表示する", () => {
    render(
      <NotificationSection admin={makeAdmin({ enabled: true, notifyPartnerRecord: false, reminderTime: "07:30" })} />
    );
    const [reminder, partner, comment] = screen.getAllByRole("switch") as HTMLInputElement[];
    expect(reminder?.checked).toBe(true);
    expect(partner?.checked).toBe(false);
    expect(comment?.checked).toBe(false);
    expect((screen.getByLabelText("通知時刻") as HTMLInputElement).value).toBe("07:30");
  });

  it("リマインドのスイッチ操作でsetEnabledを呼ぶ", () => {
    const admin = makeAdmin();
    render(<NotificationSection admin={admin} />);
    fireEvent.click(screen.getByLabelText("未入力日のリマインド通知"));
    expect(admin.setEnabled).toHaveBeenCalledWith(true);
  });

  it("パートナー通知のスイッチ操作でsetNotifyPartnerRecordを呼ぶ", () => {
    const admin = makeAdmin();
    render(<NotificationSection admin={admin} />);
    fireEvent.click(screen.getByLabelText("パートナーがきろくを追加したとき"));
    expect(admin.setNotifyPartnerRecord).toHaveBeenCalledWith(true);
  });

  it("コメント通知のスイッチ操作でsetNotifyPartnerCommentを呼ぶ", () => {
    const admin = makeAdmin();
    render(<NotificationSection admin={admin} />);
    fireEvent.click(screen.getByLabelText("パートナーがコメントしたとき"));
    expect(admin.setNotifyPartnerComment).toHaveBeenCalledWith(true);
  });

  it("通知時刻の変更でsetReminderTimeを呼ぶ", () => {
    const admin = makeAdmin();
    render(<NotificationSection admin={admin} />);
    fireEvent.change(screen.getByLabelText("通知時刻"), { target: { value: "08:00" } });
    expect(admin.setReminderTime).toHaveBeenCalledWith("08:00");
  });

  it.each([{ loading: true }, { saving: true }])("%o の間は操作を無効にする", (state) => {
    render(<NotificationSection admin={makeAdmin(state)} />);
    for (const el of screen.getAllByRole("switch")) expect((el as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("通知時刻") as HTMLInputElement).disabled).toBe(true);
  });
});
