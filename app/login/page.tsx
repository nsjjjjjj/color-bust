import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeReturnPath } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnPath(single(params.returnTo));
  if (await getCurrentUser()) redirect(returnTo);

  const isRegister = single(params.mode) === "register";
  const error = single(params.error);

  return (
    <main className="auth-screen">
      <section className="auth-card pixel-panel">
        <Link href="/" className="auth-back">← 게임으로</Link>
        <span className="kicker">DECK MAYHEM CLOUD</span>
        <h1>{isRegister ? "새 파일 생성" : "런 불러오기"}</h1>
        <p>EC2 계정에 런, 랭킹, 제작 카드와 방명록을 연결합니다.</p>
        <nav className="auth-tabs" aria-label="계정 방식">
          <Link className={!isRegister ? "active" : ""} href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>로그인</Link>
          <Link className={isRegister ? "active" : ""} href={`/login?mode=register&returnTo=${encodeURIComponent(returnTo)}`}>회원가입</Link>
        </nav>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form method="post" action={isRegister ? "/api/auth/register" : "/api/auth/login"}>
          <input type="hidden" name="returnTo" value={returnTo} />
          {isRegister && (
            <label>
              <span>닉네임</span>
              <input name="displayName" minLength={2} maxLength={24} autoComplete="nickname" required />
            </label>
          )}
          <label>
            <span>이메일</span>
            <input name="email" type="email" maxLength={254} autoComplete="email" required />
          </label>
          <label>
            <span>비밀번호</span>
            <input name="password" type="password" minLength={8} maxLength={72} autoComplete={isRegister ? "new-password" : "current-password"} required />
          </label>
          <button type="submit" className="primary-button">{isRegister ? "계정 만들기" : "로그인"}</button>
        </form>
        <small>게임 플레이와 기기 저장은 로그인 없이도 오프라인에서 작동합니다.</small>
      </section>
    </main>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
