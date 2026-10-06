import { NotFoundView } from "@note/core/components/NotFoundView";

// 存在しないURLと、notFound() が投げられたときの404画面。画面は @note/core。
export default function NotFound() {
  return <NotFoundView />;
}
