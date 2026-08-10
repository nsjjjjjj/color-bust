# DECK MAYHEM

네 가지 색의 숫자 카드로 포커 족보를 만들고, 플레이어가 제작한 1회성 UNO 카드가 다른 플레이어의 런에 등장하는 오프라인 우선 로그라이크 카드 게임입니다.

현재 코드는 게임 규칙, 5 앤티·무한 모드, 상점, 조커 20종, 커뮤니티 UNO 제작, 로그인 기반 클라우드 저장, 랭킹, 평가용 방명록, PWA 오프라인 실행까지 연결되어 있습니다. 이후 작업은 그래픽과 오디오 파일 교체가 중심입니다.

## 실행

필수 환경은 Node.js 22.13 이상입니다.

```bash
npm install
npm run dev
```

- 개발 서버: `http://localhost:3000`
- 프로덕션 빌드: `npm run build`
- 전체 자동 테스트: `npm test`
- 정적 검사: `npm run lint`
- DB 마이그레이션 생성: `npm run db:generate`

## 완성된 기능

- 0~9 × 빨강·파랑·초록·노랑의 40장 덱
- 8장 드로우, 최대 5장 제출, 핸드 4회, 버리기 2회
- 하이카드부터 스트레이트 플러시까지 9개 족보
- `(족보 Chips + 실제 기여 카드 Chips) × Mult` 점수 계산
- 0은 10 Chips이며 스트레이트에서는 가장 낮은 수
- Small, Big, Boss로 구성된 5 Antes
- Ante 6부터 계속 증가하는 무한 모드
- 공식 조커 20종, 조커 슬롯 4칸
- 조커 구매·판매, 상점 리롤, 족보 레벨 강화
- 앤티당 한 번 사용하는 커뮤니티 UNO
- Color Call과 긍정·부정 모듈 합계 0 검증
- UNO 적용 점수 최대 ×1.60 안전 상한
- 커뮤니티 카드 제작·좋아요·평가 API
- 로그인 사용자의 런 리비전 저장과 다른 기기 이어하기
- standard/endless 공식 랭킹
- 별점이 포함된 평가용 방명록
- IndexedDB 로컬 저장 및 오프라인 전송 대기열
- 홈 화면 설치용 PWA와 서비스 워커

## 코드 구조

```text
app/
  game-app.tsx                 전체 앱과 게임 화면
  components/                  카드, 로비, 커뮤니티, 랭킹, 방명록 UI
  api/                         클라우드 저장·UNO·평가·랭킹 API
  globals.css                  현재 임시 디자인과 반응형 스타일

lib/game/                      UI와 분리된 결정론적 게임 엔진
lib/offline/                   IndexedDB 저장과 동기화 대기열
lib/server/                    API 계약, 검증, D1 쿼리

db/schema.ts                   Drizzle DB 스키마
drizzle/0000_color_bust.sql    초기 마이그레이션
public/audio/                  교체할 음악·효과음
public/icons/                  PWA 아이콘
public/og.png                  링크 공유 이미지
tests/                         렌더링·게임 규칙 테스트
```

게임 규칙은 `lib/game`의 순수 TypeScript 함수로 분리되어 있습니다. UI에서 계산한 결과와 저장·검증할 결과가 어긋나지 않도록 카드 드로우도 시드 기반으로 결정됩니다.

## 디자인 교체

전체 색상은 `app/globals.css` 상단의 CSS 변수로 관리합니다.

화면 전체 글꼴은 OFL-1.1 라이선스의 한글 픽셀 글꼴 Galmuri11을 로컬 파일로 포함해 사용하므로, 온라인과 오프라인에서 같은 도트 타이포그래피가 유지됩니다.

```css
:root {
  --red: #ff4f3a;
  --blue: #4388ff;
  --green: #3fd27b;
  --yellow: #ffd447;
}
```

카드 그림을 이미지로 변경하려면 다음 컴포넌트의 마크업만 교체하면 됩니다.

- 숫자 카드: `app/components/color-card.tsx`
- 조커 카드: `app/components/joker-card.tsx`
- 커뮤니티 UNO: `app/components/uno-card.tsx`
- 로비 메인 연출: `app/components/lobby.tsx`

PWA 아이콘은 `public/icons/`, 링크 공유 이미지는 `public/og.png`를 같은 이름으로 교체합니다.

## 음악 교체

`public/audio/`의 아래 파일을 같은 이름으로 교체하면 코드 수정 없이 재생됩니다.

```text
bgm-menu.m4a
bgm-run.m4a
bgm-shop.mp3
bgm-boss.mp3
bgm-final-boss.mp3
deck-setup.mp3
card-draw.mp3
card-play.mp3
score.mp3
```

일반전, 앤티 1~4 보스, 앤티 5 최종 보스는 서로 다른 BGM을 사용하고 장면 전환 시 교차 페이드됩니다. 새 런의 덱 세팅, 카드 보충, 제출·버리기, 카드별 점수 계산에는 각각 효과음이 연결되어 있습니다. 게임 설정에서 배경 음악과 효과음 볼륨을 따로 조절할 수 있습니다. 자세한 매핑과 인코딩 안내는 `public/audio/README.md`를 참고하세요.

## 로그인과 저장

배포 환경에서는 Sign in with ChatGPT가 사용자를 식별합니다. 로그인하지 않아도 게스트로 오프라인 플레이할 수 있습니다.

- 게스트: IndexedDB에 기기 로컬 저장
- 로그인: 로컬 저장 + D1 클라우드 저장
- 네트워크 끊김: 런과 작성 내용을 기기에 저장
- 재연결: 대기 중인 커뮤니티 카드·방명록 요청 자동 전송
- 다른 기기 로그인: 서버의 최신 런 불러오기

클라우드 런은 `revision`과 `operationId`로 중복 저장 및 오래된 덮어쓰기를 막습니다.

## 데이터베이스

`.openai/hosting.json`의 D1 binding 이름은 `DB`입니다. 서버는 첫 요청 시 테이블과 실제 조회에 필요한 인덱스를 안전하게 초기화합니다. 저장된 마이그레이션은 `drizzle/0000_color_bust.sql`에 있습니다.

핵심 테이블은 사용자, 런, 처리된 작업, 커뮤니티 카드와 버전, 좋아요, 평가, 방명록, 랭킹으로 구성됩니다.
